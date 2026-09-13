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
        val error: String? = null
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
            _ui.value = _ui.value.copy(
                results = results, loading = false, searched = true, error = null
            )
        }
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
            val playlist = repo.playlist(id)
            _ui.value = _ui.value.copy(current = playlist, loading = false)
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

class ChatsViewModel : ViewModel() {
    data class ChatsUi(
        val friends: List<com.mq1.player.data.api.Friend> = emptyList(),
        val unreadCounts: Map<String, Int> = emptyMap(),
        val requestCount: Int = 0,
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
                    requestCount = s.requestCount
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
