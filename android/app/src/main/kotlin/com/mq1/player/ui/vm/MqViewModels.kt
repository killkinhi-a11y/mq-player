package com.mq1.player.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mq1.player.data.api.Track
import com.mq1.player.data.repo.WaveRepository
import com.mq1.player.di.ServiceLocator
import com.mq1.player.player.PlaybackController
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch

// ─────────────────────────────────────────────────────────────────────────────
// Lean ViewModels — one per screen family. All dependencies come from the
// ServiceLocator (single-process app, static graph).
// ─────────────────────────────────────────────────────────────────────────────

class HomeViewModel : ViewModel() {
    data class HomeUi(
        val history: List<Track> = emptyList(),
        val wavePreview: List<Track> = emptyList(),
        val publicPlaylists: List<com.mq1.player.data.api.PlaylistDto> = emptyList(),
        val loading: Boolean = true,
        val error: String? = null
    )

    private val music = ServiceLocator.musicRepository
    private val wave: WaveRepository = ServiceLocator.waveRepository
    private val playlists = ServiceLocator.playlistRepository

    private val _ui = MutableStateFlow(HomeUi())
    val ui: StateFlow<HomeUi> = _ui

    init {
        viewModelScope.launch {
            ServiceLocator.localStore.history.collect { history ->
                _ui.value = _ui.value.copy(history = history.take(10))
            }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null)
            val preview = runCatching { wave.nextBatch(10) }.getOrElse {
                _ui.value = _ui.value.copy(error = "Не удалось загрузить рекомендации")
                emptyList()
            }
            val pub = runCatching { playlists.publicPlaylists() }.getOrElse { emptyList() }
            _ui.value = _ui.value.copy(
                wavePreview = preview, publicPlaylists = pub, loading = false
            )
        }
    }

    fun startWave(onStarted: (List<Track>) -> Unit) {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true)
            val batch = wave.start(15)
            _ui.value = _ui.value.copy(loading = false)
            onStarted(batch)
        }
    }
}

@OptIn(FlowPreview::class)
class SearchViewModel : ViewModel() {
    data class SearchUi(
        val query: String = "",
        val results: List<Track> = emptyList(),
        val loading: Boolean = false,
        val searched: Boolean = false,
        val error: String? = null,
        // web SEARCH_HISTORY_KEY — recent queries for the «Недавние запросы»
        // chips (in-memory parity of the web localStorage list, max 15)
        val history: List<String> = emptyList()
    )

    private val music = ServiceLocator.musicRepository
    private val _ui = MutableStateFlow(SearchUi())
    val ui: StateFlow<SearchUi> = _ui
    private var searchJob: Job? = null

    fun onQueryChange(query: String) {
        _ui.value = _ui.value.copy(query = query)
        searchJob?.cancel()
        if (query.isBlank()) {
            _ui.value = _ui.value.copy(results = emptyList(), searched = false, loading = false)
            return
        }
        searchJob = viewModelScope.launch {
            delay(300) // debounce — dedupes typing bursts (P20.7)
            _ui.value = _ui.value.copy(loading = true)
            val results = runCatching { music.search(query) }.getOrElse {
                _ui.value = _ui.value.copy(error = "Поиск недоступен, проверьте сеть")
                emptyList()
            }
            val trimmed = query.trim()
            val history = if (results.isNotEmpty() && trimmed.isNotBlank()) {
                listOf(trimmed) + _ui.value.history.filter {
                    it.lowercase() != trimmed.lowercase()
                }.take(14)
            } else _ui.value.history
            _ui.value = _ui.value.copy(
                results = results, loading = false, searched = true,
                error = null, history = history
            )
        }
    }

    /** Web handleClearHistory — clears the recent-query chips. */
    fun clearHistory() {
        _ui.value = _ui.value.copy(history = emptyList())
    }

    /** Web handleRemoveHistoryItem — drops one chip. */
    fun removeHistoryItem(query: String) {
        _ui.value = _ui.value.copy(
            history = _ui.value.history.filter { it.lowercase() != query.lowercase() }
        )
    }
}

class ArtistViewModel : ViewModel() {
    data class ArtistUi(
        val name: String = "",
        val avatarTrack: Track? = null,
        val tracks: List<Track> = emptyList(),
        val loading: Boolean = true,
        val error: String? = null
    )

    private val music = ServiceLocator.musicRepository
    private val _ui = MutableStateFlow(ArtistUi())
    val ui: StateFlow<ArtistUi> = _ui

    fun load(name: String) {
        viewModelScope.launch {
            _ui.value = ArtistUi(name = name, loading = true)
            val (header, tracks) = runCatching { music.artistTracks(name) }
                .getOrElse { null to emptyList() }
            if (tracks.isEmpty()) {
                _ui.value = _ui.value.copy(loading = false, error = "Треки исполнителя не найдены")
            } else {
                _ui.value = ArtistUi(name = name, avatarTrack = header, tracks = tracks, loading = false)
            }
        }
    }
}

class PlaylistViewModel : ViewModel() {
    data class PlaylistUi(
        val mine: List<com.mq1.player.data.api.PlaylistDto> = emptyList(),
        val public: List<com.mq1.player.data.api.PlaylistDto> = emptyList(),
        val current: com.mq1.player.data.api.PlaylistDto? = null,
        val loading: Boolean = true,
        val error: String? = null
    )

    private val repo = ServiceLocator.playlistRepository
    private val _ui = MutableStateFlow(PlaylistUi())
    val ui: StateFlow<PlaylistUi> = _ui

    fun refresh() {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true)
            val mine = runCatching { repo.myPlaylists() }.getOrElse { emptyList() }
            val pub = runCatching { repo.publicPlaylists() }.getOrElse { emptyList() }
            _ui.value = _ui.value.copy(mine = mine, public = pub, loading = false)
        }
    }

    fun loadById(id: String) {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true)
            // F11: deep links point at ARBITRARY playlists (public or own) —
            // resolve by id directly, not via the list endpoints
            val playlist = repo.playlistById(id) ?: repo.playlist(id)
            _ui.value = _ui.value.copy(
                current = playlist,
                loading = false,
                error = if (playlist == null) "Плейлист недоступен" else null
            )
        }
    }

    fun create(name: String, onDone: () -> Unit) {
        viewModelScope.launch {
            repo.create(name)
            refresh()
            onDone()
        }
    }

    fun addTrack(track: Track, onDone: (Boolean) -> Unit) {
        val current = _ui.value.current ?: return
        viewModelScope.launch {
            val updated = repo.addTrack(current, track)
            _ui.value = _ui.value.copy(current = updated)
            onDone(updated != null)
        }
    }

    fun removeTrack(trackId: String) {
        val current = _ui.value.current ?: return
        viewModelScope.launch {
            val updated = repo.removeTrack(current, trackId)
            _ui.value = _ui.value.copy(current = updated)
        }
    }
}

class WaveViewModel : ViewModel() {
    data class WaveUi(
        val upcoming: List<Track> = emptyList(),
        val loading: Boolean = false,
        val error: String? = null
    )

    private val wave: WaveRepository = ServiceLocator.waveRepository
    private val controller = ServiceLocator.playbackController
    private val _ui = MutableStateFlow(WaveUi())
    val ui: StateFlow<WaveUi> = _ui

    init {
        viewModelScope.launch {
            controller.queue.collect { queue ->
                val index = controller.currentIndex.value
                _ui.value = _ui.value.copy(upcoming = queue.drop(index + 1))
            }
        }
    }

    fun start() {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null)
            val batch = wave.start(15)
            if (batch.isEmpty()) {
                _ui.value = WaveUi(error = "Волна не смогла подобрать треки — попробуйте позже")
            } else {
                controller.startWave(batch)
                _ui.value = WaveUi(upcoming = batch.drop(1))
            }
        }
    }

    fun next() {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true)
            controller.skipWave()
            delay(400)
            _ui.value = _ui.value.copy(loading = false)
        }
    }
}

/**
 * One row of the chats hub — the web MessengerView `sortedChats` item.
 * The wired VM fills id/name/avatar/online/unread (real hub data); the
 * last-message fields stay null until per-chat history is loaded, so the
 * row falls back to the web texts («в сети» / «был(а) недавно»).
 */
data class ChatRowUi(
    val id: String = "",
    val name: String = "",
    val avatar: String? = null,
    val isGroup: Boolean = false,
    val online: Boolean = false,
    val unread: Int = 0,
    val lastText: String? = null,
    val lastTime: String? = null,
    val lastTimeMillis: Long = 0L,
    val pinned: Boolean = false,
    val memberCount: Int = 0,
)

class ChatsViewModel : ViewModel() {
    data class ChatsUi(
        val friends: List<com.mq1.player.data.api.Friend> = emptyList(),
        val unreadCounts: Map<String, Int> = emptyMap(),
        val rows: List<ChatRowUi> = emptyList(),
        val requestCount: Int = 0,
        /** true until the first successful hub sync (web isLoadingFriends). */
        val loading: Boolean = true,
        /** sync failed and we have nothing to show → full-card error+retry. */
        val error: Boolean = false,
        val aiMessages: List<com.mq1.player.data.api.AiChatMessage> = emptyList(),
        val aiTyping: Boolean = false,
        val aiSuggested: List<Track> = emptyList()
    )

    private val social = ServiceLocator.socialRepository
    private val chat = ServiceLocator.chatRepository
    private val hub = ServiceLocator.socialHub
    private val _ui = MutableStateFlow(ChatsUi())
    val ui: StateFlow<ChatsUi> = _ui

    init {
        // F7: friends list + per-peer unread badges + request badge from the hub
        viewModelScope.launch {
            hub.state.collect { s ->
                _ui.value = _ui.value.copy(
                    friends = s.friends,
                    unreadCounts = s.unreadCounts,
                    rows = s.friends.map { f ->
                        ChatRowUi(
                            id = f.id,
                            name = f.username,
                            avatar = f.avatar.ifBlank { null },
                            online = s.online[f.id] == true,
                            unread = s.unreadCounts[f.id] ?: 0,
                        )
                    },
                    requestCount = s.requestCount,
                    loading = !s.synced,
                    error = s.syncError && s.friends.isEmpty()
                )
            }
        }
    }

    fun refresh() {
        hub.refreshNow()
    }

    fun askAi(message: String) {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(aiTyping = true)
            val result = chat.ask(message)
            _ui.value = _ui.value.copy(
                aiMessages = chat.messages,
                aiTyping = false,
                aiSuggested = result?.second ?: emptyList()
            )
        }
    }
}

class ChatDetailViewModel : ViewModel() {
    data class ChatDetailUi(
        val peerId: String = "",
        val peerName: String = "",
        val peerAvatar: String? = null,
        val messages: List<com.mq1.player.data.api.MessageDto> = emptyList(),
        val loading: Boolean = true,
        val error: String? = null
    )

    private val social = ServiceLocator.socialRepository
    private val hub = ServiceLocator.socialHub
    private val _ui = MutableStateFlow(ChatDetailUi())
    val ui: StateFlow<ChatDetailUi> = _ui
    private var pollJob: Job? = null

    fun load(peerId: String, peerName: String) {
        _ui.value = ChatDetailUi(
            peerId = peerId,
            peerName = peerName,
            peerAvatar = hub.state.value.friends.firstOrNull { it.id == peerId }?.avatar
        )
        // F7: opening the chat clears that peer's unread badge
        hub.markPeerRead(peerId)
        fetch()
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (true) {
                delay(5000)
                fetch()
            }
        }
    }

    private fun fetch() {
        viewModelScope.launch {
            val messages = social.messages(_ui.value.peerId)
            if (messages.isEmpty() && _ui.value.messages.isEmpty() && _ui.value.loading) {
                // Distinguish "no messages yet" from a failed fetch: poll keeps
                // retrying silently either way (5s cadence, real data only).
                _ui.value = _ui.value.copy(loading = false)
            } else {
                _ui.value = _ui.value.copy(messages = messages, loading = false)
                hub.markPeerRead(_ui.value.peerId)
            }
        }
    }

    fun send(text: String) {
        val peerId = _ui.value.peerId
        if (text.isBlank() || peerId.isBlank()) return
        viewModelScope.launch {
            val sent = social.send(peerId, text.trim())
            if (sent != null) fetch()
            else _ui.value = _ui.value.copy(error = "Сообщение не отправлено")
        }
    }

    override fun onCleared() {
        pollJob?.cancel()
        super.onCleared()
    }
}

class FriendsViewModel : ViewModel() {
    data class FriendsUi(
        val friends: List<com.mq1.player.data.api.Friend> = emptyList(),
        val incoming: List<com.mq1.player.data.api.PendingRequest> = emptyList(),
        val outgoing: List<com.mq1.player.data.api.OutgoingRequest> = emptyList(),
        val online: Map<String, Boolean> = emptyMap(),
        val unreadCounts: Map<String, Int> = emptyMap(),
        val found: List<com.mq1.player.data.api.UserDto> = emptyList(),
        val query: String = "",
        val searching: Boolean = false,
        /** Initial sync in flight (first poll after foreground/login). */
        val loading: Boolean = true,
        /** Last sync failed and we have no data yet → full-screen error+retry. */
        val error: Boolean = false,
        /** Result snackbar (action outcomes). */
        val message: String? = null,
        /** Row ids with an in-flight action (disable buttons, show progress). */
        val busyIds: Set<String> = emptySet()
    )

    private val social = ServiceLocator.socialRepository
    private val hub = ServiceLocator.socialHub
    private val _ui = MutableStateFlow(FriendsUi())
    val ui: StateFlow<FriendsUi> = _ui
    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            hub.state.collect { s ->
                _ui.value = _ui.value.copy(
                    friends = s.friends,
                    incoming = s.incoming,
                    outgoing = s.outgoing,
                    online = s.online,
                    unreadCounts = s.unreadCounts,
                    loading = !s.synced,
                    error = s.syncError && !s.synced
                )
            }
        }
    }

    fun retry() = hub.refreshNow()

    fun search(query: String) {
        _ui.value = _ui.value.copy(query = query)
        searchJob?.cancel()
        if (query.length < 2) {
            _ui.value = _ui.value.copy(found = emptyList(), searching = false)
            return
        }
        searchJob = viewModelScope.launch {
            delay(300) // debounce — same as web
            _ui.value = _ui.value.copy(searching = true)
            val results = social.searchUsers(query)
            // Only current query's results survive (stale-response guard)
            if (query == _ui.value.query) {
                _ui.value = _ui.value.copy(found = results, searching = false)
            }
        }
    }

    private fun runAction(rowKey: String, action: suspend () -> Result<Unit>, onSuccess: String) {
        if (rowKey in _ui.value.busyIds) return
        _ui.value = _ui.value.copy(busyIds = _ui.value.busyIds + rowKey)
        viewModelScope.launch {
            action()
                .onSuccess {
                    _ui.value = _ui.value.copy(message = onSuccess)
                    hub.refreshNow()
                }
                .onFailure { _ui.value = _ui.value.copy(message = it.message ?: "Ошибка") }
            _ui.value = _ui.value.copy(busyIds = _ui.value.busyIds - rowKey)
        }
    }

    fun add(user: com.mq1.player.data.api.UserDto) =
        runAction("u" + user.id, { social.addFriend(user.id) }, "Запрос отправлен ${user.username}")

    fun accept(request: com.mq1.player.data.api.PendingRequest) =
        runAction("r" + request.requestId, { social.respondToRequest(request.requestId, accept = true) }, "${request.username} теперь в друзьях")

    fun reject(request: com.mq1.player.data.api.PendingRequest) =
        runAction("r" + request.requestId, { social.respondToRequest(request.requestId, accept = false) }, "Заявка отклонена")

    fun cancel(request: com.mq1.player.data.api.OutgoingRequest) =
        runAction("r" + request.requestId, { social.deleteFriend(request.requestId) }, "Запрос отменён")

    fun remove(friend: com.mq1.player.data.api.Friend) =
        runAction("f" + friend.id, { social.deleteFriend(friend.friendshipId) }, "${friend.username} удалён из друзей")

    fun consumeMessage() {
        _ui.value = _ui.value.copy(message = null)
    }
}

/** F7: public user profile — data + friendship-state actions. */
class UserProfileViewModel : ViewModel() {
    data class ProfileUi(
        val userId: String = "",
        val user: com.mq1.player.data.api.UserDto = com.mq1.player.data.api.UserDto(),
        val online: Boolean = false,
        val lastSeen: String? = null,
        val friendship: com.mq1.player.data.api.FriendshipState = com.mq1.player.data.api.FriendshipState(),
        val loading: Boolean = true,
        val error: String? = null,
        val busy: Boolean = false,
        val message: String? = null
    )

    private val social = ServiceLocator.socialRepository
    private val hub = ServiceLocator.socialHub
    private val _ui = MutableStateFlow(ProfileUi())
    val ui: StateFlow<ProfileUi> = _ui

    fun load(userId: String) {
        if (_ui.value.userId == userId && !_ui.value.loading) return
        _ui.value = ProfileUi(userId = userId)
        fetch()
    }

    fun refresh() = fetch()

    private fun fetch() {
        val id = _ui.value.userId
        if (id.isBlank()) return
        viewModelScope.launch {
            social.userProfile(id)
                .onSuccess { p ->
                    _ui.value = _ui.value.copy(
                        user = p.user,
                        online = p.online,
                        lastSeen = p.lastSeen,
                        friendship = p.friendship,
                        loading = false,
                        error = null
                    )
                }
                .onFailure {
                    _ui.value = _ui.value.copy(loading = false, error = it.message ?: "Профиль недоступен")
                }
        }
    }

    private fun runAction(action: suspend () -> Result<Unit>, onSuccess: String) {
        if (_ui.value.busy) return
        _ui.value = _ui.value.copy(busy = true)
        viewModelScope.launch {
            action()
                .onSuccess {
                    _ui.value = _ui.value.copy(message = onSuccess)
                    fetch() // re-read server state (friendship status changed)
                    hub.refreshNow()
                }
                .onFailure { _ui.value = _ui.value.copy(message = it.message ?: "Ошибка") }
            _ui.value = _ui.value.copy(busy = false)
        }
    }

    fun addFriend() = runAction(
        { social.addFriend(_ui.value.user.id) },
        "Запрос отправлен ${_ui.value.user.username}"
    )

    fun cancelRequest() = runAction(
        { social.deleteFriend(_ui.value.friendship.requestId ?: "") },
        "Запрос отменён"
    )

    fun acceptRequest() = runAction(
        { social.respondToRequest(_ui.value.friendship.requestId ?: "", accept = true) },
        "${_ui.value.user.username} теперь в друзьях"
    )

    fun removeFriend() = runAction(
        { social.deleteFriend(_ui.value.friendship.friendshipId ?: "") },
        "${_ui.value.user.username} удалён из друзей"
    )

    fun consumeMessage() {
        _ui.value = _ui.value.copy(message = null)
    }
}

class SettingsViewModel : ViewModel() {
    val appearance = ServiceLocator.localStore.appearance
    val favorites = ServiceLocator.localStore.favorites
    val sessionUser = ServiceLocator.localStore.sessionUser

    fun setTheme(id: String) {
        viewModelScope.launch { ServiceLocator.localStore.setThemeId(id) }
    }

    fun setDarkMode(mode: String) {
        viewModelScope.launch { ServiceLocator.localStore.setDarkMode(mode) }
    }

    fun saveTaste(genres: Set<String>) {
        viewModelScope.launch {
            ServiceLocator.localStore.setTasteGenres(genres)
            runCatching {
                ServiceLocator.api.saveFavoriteArtists(
                    com.mq1.player.data.api.SaveFavoriteArtistsBody(artists = genres.toList())
                )
            }
        }
    }
}

class PlayerViewModel : ViewModel() {
    val controller: PlaybackController = ServiceLocator.playbackController
    val favorites = ServiceLocator.localStore.favorites
}

/**
 * F8 Lyrics — real data only: /api/music/lyrics (lrclib-backed, 10-min cache
 * in MusicRepository). States: loading / synced / plain / unavailable.
 */
class LyricsViewModel : ViewModel() {

    data class LyricsUi(
        val trackKey: String = "",
        val lines: List<com.mq1.player.data.api.LyricLine> = emptyList(),
        val plainText: String = "",
        val synced: Boolean = false,
        val loading: Boolean = false,
        /** true when the fetch completed but nothing was found. */
        val unavailable: Boolean = false
    )

    private val music = ServiceLocator.musicRepository
    private val _ui = MutableStateFlow(LyricsUi())
    val ui: StateFlow<LyricsUi> = _ui

    /** Load (once per track) when the lyrics panel opens. */
    fun loadIfNeeded(track: com.mq1.player.data.api.Track) {
        val key = track.scTrackId?.toString() ?: track.id
        if (_ui.value.trackKey == key && (_ui.value.loading || _ui.value.synced ||
                _ui.value.plainText.isNotBlank() || _ui.value.unavailable)) return
        _ui.value = LyricsUi(trackKey = key, loading = true)
        viewModelScope.launch {
            val result = music.lyrics(track.artist, track.title)
            _ui.value = if (result == null) {
                _ui.value.copy(loading = false, unavailable = true)
            } else if (result.synced && result.lyrics.isNotEmpty()) {
                // Server-side LRC parse occasionally leaves an embedded
                // [mm:ss.xx] prefix in the text — strip it for display.
                val embeddedTs = Regex("^\\[\\d{2}:\\d{2}(?:[.:]\\d{2,3})?]\\s*")
                _ui.value.copy(
                    loading = false,
                    lines = result.lyrics.map { it.copy(text = it.text.replace(embeddedTs, "")) },
                    synced = true
                )
            } else if (result.plainText.isNotBlank()) {
                _ui.value.copy(loading = false, plainText = result.plainText)
            } else {
                _ui.value.copy(loading = false, unavailable = true)
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// F9 — own profile: account (server) + local content + friends (hub) + editing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Own profile. Data sources (all REAL, no invented state):
 *  - GET /api/user/profile   → account: username, email, avatar, role, createdAt
 *  - GET /api/auth/me        → account state: confirmed, telegramUsername
 *  - GET /api/playlists?myOnly=true → my playlists
 *  - LocalStore favorites    → likes (web parity: per-device, documented)
 *  - LocalStore history      → recent activity
 *  - SocialHub               → friends + online (shared F7 state)
 * Editing: POST /api/user/avatar + POST /api/auth/update-username (web contract);
 * the session cache is updated so every surface sees the new identity.
 */
class MyProfileViewModel : ViewModel() {

    data class ProfileUi(
        // ── Account (server) ──
        val userId: String = "",
        val username: String = "",
        val email: String? = null,
        val avatar: String? = null,
        val role: String = "user",
        val createdAt: String? = null,
        val telegramUsername: String? = null,
        val confirmed: Boolean? = null,
        // ── Content ──
        val playlists: List<com.mq1.player.data.api.PlaylistDto> = emptyList(),
        val likes: List<Track> = emptyList(),
        val history: List<Track> = emptyList(),
        val friends: List<com.mq1.player.data.api.Friend> = emptyList(),
        val online: Map<String, Boolean> = emptyMap(),
        // ── States ──
        val loading: Boolean = true,
        val error: String? = null,
        val savingUsername: Boolean = false,
        val savingAvatar: Boolean = false,
        /** Snackbar result messages (edit outcomes). */
        val message: String? = null
    ) {
        /** Top artists derived from likes — tap → artist screen. */
        val topArtists: List<String>
            get() = likes.groupBy { it.artist }
                .filterKeys { it.isNotBlank() }
                .map { (artist, tracks) -> artist to tracks.size }
                .sortedByDescending { it.second }
                .take(8)
                .map { it.first }
    }

    private val profileRepo = ServiceLocator.profileRepository
    private val playlistsRepo = ServiceLocator.playlistRepository
    private val local = ServiceLocator.localStore
    private val hub = ServiceLocator.socialHub

    private val _ui = MutableStateFlow(ProfileUi())
    val ui: StateFlow<ProfileUi> = _ui

    init {
        // Local content (favorites/history) and social state — live flows.
        viewModelScope.launch {
            local.favorites.collect { likes ->
                _ui.value = _ui.value.copy(likes = likes)
            }
        }
        viewModelScope.launch {
            local.history.collect { history ->
                _ui.value = _ui.value.copy(history = history.take(20))
            }
        }
        viewModelScope.launch {
            hub.state.collect { s ->
                _ui.value = _ui.value.copy(friends = s.friends, online = s.online)
            }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null)

            val account = profileRepo.myProfile()
            if (account.isFailure) {
                _ui.value = _ui.value.copy(
                    loading = false,
                    error = account.exceptionOrNull()?.message ?: "Профиль недоступен"
                )
                return@launch
            }
            val me = runCatching {
                ServiceLocator.api.me().body()
            }.getOrNull()

            val myPlaylists = runCatching { playlistsRepo.myPlaylists() }.getOrElse { emptyList() }

            _ui.value = _ui.value.copy(
                userId = account.getOrThrow().id,
                username = account.getOrThrow().username,
                email = account.getOrThrow().email,
                avatar = account.getOrThrow().avatar,
                role = account.getOrThrow().role,
                createdAt = account.getOrThrow().createdAt,
                telegramUsername = me?.telegramUsername,
                confirmed = me?.confirmed,
                playlists = myPlaylists,
                loading = false
            )
        }
    }

    /** Username availability (used with debounce by the edit dialog). */
    suspend fun checkUsername(name: String): com.mq1.player.data.api.UsernameCheckResponse? =
        profileRepo.checkUsername(name, _ui.value.userId).getOrNull()

    fun saveUsername(newUsername: String) {
        if (_ui.value.savingUsername) return
        val localError = com.mq1.player.data.repo.ProfileRepository.validateUsername(newUsername)
        if (localError != null || newUsername == _ui.value.username) {
            _ui.value = _ui.value.copy(message = localError ?: "Имя не изменилось")
            return
        }
        viewModelScope.launch {
            _ui.value = _ui.value.copy(savingUsername = true)
            profileRepo.updateUsername(newUsername)
                .onSuccess { response ->
                    _ui.value = _ui.value.copy(
                        username = response.username ?: newUsername,
                        savingUsername = false,
                        message = response.message ?: "Имя обновлено"
                    )
                    // Session cache → all surfaces (Settings, chats, hub gate).
                    local.sessionUser.firstOrNull()?.let { cached ->
                        local.setSessionUser(cached.copy(username = response.username ?: newUsername))
                    }
                }
                .onFailure {
                    _ui.value = _ui.value.copy(
                        savingUsername = false,
                        message = it.message ?: "Ошибка сохранения имени"
                    )
                }
        }
    }

    fun saveAvatar(imageBytes: ByteArray) {
        if (_ui.value.savingAvatar) return
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            val dataUrl = com.mq1.player.data.repo.ProfileRepository.bitmapToAvatarDataUrl(imageBytes)
            if (dataUrl == null) {
                _ui.value = _ui.value.copy(message = "Не удалось прочитать изображение")
                return@launch
            }
            _ui.value = _ui.value.copy(savingAvatar = true, avatar = dataUrl) // optimistic
            profileRepo.uploadAvatar(dataUrl)
                .onSuccess { response ->
                    _ui.value = _ui.value.copy(
                        avatar = response.avatar ?: dataUrl,
                        savingAvatar = false,
                        message = response.message ?: "Аватарка обновлена"
                    )
                    local.sessionUser.firstOrNull()?.let { cached ->
                        local.setSessionUser(cached.copy(avatar = dataUrl))
                    }
                }
                .onFailure {
                    _ui.value = _ui.value.copy(
                        // rollback to the server value we still have in profile
                        avatar = runCatching {
                            profileRepo.myProfile().getOrNull()?.avatar
                        }.getOrNull() ?: _ui.value.avatar,
                        savingAvatar = false,
                        message = it.message ?: "Ошибка загрузки аватара"
                    )
                }
        }
    }

    fun consumeMessage() {
        _ui.value = _ui.value.copy(message = null)
    }
}
