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
        val aiMessages: List<com.mq1.player.data.api.AiChatMessage> = emptyList(),
        val aiTyping: Boolean = false,
        val aiSuggested: List<Track> = emptyList()
    )

    private val social = ServiceLocator.socialRepository
    private val chat = ServiceLocator.chatRepository
    private val _ui = MutableStateFlow(ChatsUi())
    val ui: StateFlow<ChatsUi> = _ui

    fun refresh() {
        viewModelScope.launch {
            val friends = social.friends()?.friends ?: emptyList()
            _ui.value = _ui.value.copy(friends = friends)
        }
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
        val messages: List<com.mq1.player.data.api.MessageDto> = emptyList(),
        val loading: Boolean = true,
        val error: String? = null
    )

    private val social = ServiceLocator.socialRepository
    private val _ui = MutableStateFlow(ChatDetailUi())
    val ui: StateFlow<ChatDetailUi> = _ui
    private var pollJob: Job? = null

    fun load(peerId: String, peerName: String) {
        _ui.value = ChatDetailUi(peerId = peerId, peerName = peerName)
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
            _ui.value = _ui.value.copy(messages = messages, loading = false)
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
        val pending: List<com.mq1.player.data.api.PendingRequest> = emptyList(),
        val found: List<com.mq1.player.data.api.UserDto> = emptyList(),
        val query: String = "",
        val loading: Boolean = true,
        val message: String? = null
    )

    private val social = ServiceLocator.socialRepository
    private val _ui = MutableStateFlow(FriendsUi())
    val ui: StateFlow<FriendsUi> = _ui

    fun refresh() {
        viewModelScope.launch {
            val response = social.friends()
            _ui.value = _ui.value.copy(
                friends = response?.friends ?: emptyList(),
                pending = response?.pendingRequests ?: emptyList(),
                loading = false
            )
        }
    }

    fun search(query: String) {
        _ui.value = _ui.value.copy(query = query)
        if (query.length < 2) {
            _ui.value = _ui.value.copy(found = emptyList())
            return
        }
        viewModelScope.launch {
            delay(250)
            _ui.value = _ui.value.copy(found = social.searchUsers(query))
        }
    }

    fun add(user: com.mq1.player.data.api.UserDto) {
        viewModelScope.launch {
            social.addFriend(user.id)
                .onSuccess { _ui.value = _ui.value.copy(message = "Запрос отправлен ${user.username}") }
                .onFailure { _ui.value = _ui.value.copy(message = it.message ?: "Ошибка") }
        }
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
