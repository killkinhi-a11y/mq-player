package com.mq1.player.data

import com.mq1.player.data.api.Friend
import com.mq1.player.data.api.GroupChatDto
import com.mq1.player.data.api.LatestMessage
import com.mq1.player.data.api.OutgoingRequest
import com.mq1.player.data.api.PendingRequest
import com.mq1.player.data.repo.SocialRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * SocialHub (F7) — single source of truth for friends / requests / unread
 * badges, shared by every surface (bottom bar, Chats, Friends, Chat detail).
 *
 * Mirrors the web app's model exactly (no invented server semantics):
 *  - `GET /api/friends` every 30 s → friends + incoming + outgoing requests
 *  - `GET /api/messages/unread-count` → latest incoming message id; unread is
 *    tracked CLIENT-side (web parity: unreadCounts store) and reset on read
 *  - `GET /api/users/status` → online dots (not persisted — transient)
 *
 * Polling runs only while the app is foregrounded AND a session exists
 * (MainActivity.onStart/onStop + sessionUser gate — web pauses polling on
 * document.hidden the same way). State is persisted to DataStore so a cold
 * restart renders the last snapshot instantly, then re-syncs.
 */
class SocialHub(
    private val social: SocialRepository,
    private val local: LocalStore,
    private val scope: CoroutineScope
) {

    data class SocialState(
        val friends: List<Friend> = emptyList(),
        val incoming: List<PendingRequest> = emptyList(),
        val outgoing: List<OutgoingRequest> = emptyList(),
        val unreadCounts: Map<String, Int> = emptyMap(),
        val online: Map<String, Boolean> = emptyMap(),
        /** web MessengerView group chats (GET /api/group-chats, 30s poll) */
        val groups: List<GroupChatDto> = emptyList(),
        /** true after at least one successful server sync in this process. */
        val synced: Boolean = false,
        /** true when the latest sync attempt failed (drives error+retry UI). */
        val syncError: Boolean = false
    ) {
        val totalUnread: Int get() = unreadCounts.values.sum()
        val requestCount: Int get() = incoming.size
    }

    private val _state = MutableStateFlow(SocialState())
    val state: StateFlow<SocialState> = _state

    private var lastMessageId: String? = null
    private var pollJob: Job? = null
    private var restoreJob: Job? = null

    private val sessionActive = local.sessionUser
        .stateIn(scope, SharingStarted.Eagerly, null)

    init {
        // Cold restart: render the persisted snapshot immediately (real data
        // from the previous sync), then the first poll refreshes it.
        restoreJob = scope.launch {
            val snapshot = local.socialSnapshot.firstOrNull()
            if (snapshot != null && !_state.value.synced) {
                lastMessageId = snapshot.lastMessageId
                _state.value = _state.value.copy(
                    friends = snapshot.friends,
                    incoming = snapshot.incoming,
                    outgoing = snapshot.outgoing,
                    unreadCounts = snapshot.unreadCounts
                )
            }
        }
    }

    /** Resume polling (MainActivity.onStart / after login). Idempotent. */
    fun start() {
        if (pollJob?.isActive == true) return
        pollJob = scope.launch {
            tick() // immediate first sync on foreground
            while (isActive) {
                delay(POLL_INTERVAL_MS)
                tick()
            }
        }
    }

    /** Pause polling (MainActivity.onStop — app backgrounded). */
    fun stop() {
        pollJob?.cancel()
        pollJob = null
    }

    /** Immediate re-sync (pull-to-refresh, after actions, retry button). */
    fun refreshNow() {
        scope.launch { tick() }
    }

    /** Opened a chat → clear that peer's unread badge. */
    fun markPeerRead(peerId: String) {
        if (_state.value.unreadCounts[peerId] == null) return
        val counts = _state.value.unreadCounts - peerId
        _state.value = _state.value.copy(unreadCounts = counts)
        scope.launch { persist() }
    }

    /** Logout → wipe in-memory + persisted social state. */
    fun clear() {
        stop()
        lastMessageId = null
        _state.value = SocialState()
        scope.launch { local.setSocialSnapshot(null) }
    }

    private suspend fun tick() {
        val session = sessionActive.value ?: local.sessionUser.firstOrNull()
        if (session == null) return

        val friendsResponse = social.friends()
        val latest = social.latestIncomingMessage()?.latestMessage

        if (friendsResponse == null && latest == null) {
            // Both calls failed — network/auth trouble. Keep showing the last
            // good snapshot (no fake data), flag for retry UI.
            if (_state.value.synced) _state.value = _state.value.copy(syncError = true)
            return
        }

        val selfId = session.userId
        val (newCounts, newLastId) = advanceUnread(
            _state.value.unreadCounts, lastMessageId, latest, selfId
        )
        lastMessageId = newLastId

        val friends = friendsResponse?.friends ?: _state.value.friends
        val incoming = friendsResponse?.pendingRequests ?: _state.value.incoming
        val outgoing = friendsResponse?.outgoingRequests ?: _state.value.outgoing

        // Group chats (web parity; demo header serves demo groups when the
        // session is demo — real sessions use the session cookie).
        val groups = social.groupChats() ?: _state.value.groups

        // Online presence for friends (best-effort; never blocks the sync)
        val online = if (friends.isNotEmpty()) {
            social.userStatuses(friends.map { it.id }).mapValues { it.value.online }
        } else emptyMap()

        _state.value = SocialState(
            friends = friends,
            incoming = incoming,
            outgoing = outgoing,
            unreadCounts = newCounts,
            online = online,
            groups = groups,
            synced = true,
            syncError = false
        )
        persist()
    }

    private suspend fun persist() {
        local.setSocialSnapshot(
            LocalStore.SocialSnapshot(
                friends = _state.value.friends,
                incoming = _state.value.incoming,
                outgoing = _state.value.outgoing,
                unreadCounts = _state.value.unreadCounts,
                lastMessageId = lastMessageId
            )
        )
    }

    companion object {
        const val POLL_INTERVAL_MS = 30_000L

        /**
         * Pure unread reducer — extracted for unit tests. Web parity:
         *  - first observation only records the id (no increment)
         *  - each id change ⇒ +1 for the sender (not per message missed)
         *  - self-messages never count
         */
        fun advanceUnread(
            counts: Map<String, Int>,
            previousId: String?,
            latest: LatestMessage?,
            selfId: String
        ): Pair<Map<String, Int>, String?> {
            if (latest == null || latest.id.isBlank()) return counts to previousId
            if (previousId == null) return counts to latest.id
            if (latest.id == previousId) return counts to previousId
            val sender = latest.senderId
            if (sender.isBlank() || sender == selfId) return counts to latest.id
            return (counts + (sender to ((counts[sender] ?: 0) + 1))) to latest.id
        }
    }
}
