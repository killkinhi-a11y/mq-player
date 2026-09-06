package com.mq1.player.player

import android.content.ComponentName
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.MoreExecutors
import com.mq1.player.data.api.Track
import com.mq1.player.di.ServiceLocator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

/**
 * App-process facade over the MediaController bound to [MqPlaybackService].
 * UI and ViewModels talk ONLY to this class — never to the player directly.
 *
 * Responsibilities:
 *  - queue state (tracks + index) mirrored as StateFlows for Compose
 *  - stream URL pre-resolution for the current and next item (TTL cache in
 *    MusicRepository; wave prefetch costs no extra backend hits)
 *  - automatic Wave extension when the queue nears its end
 *  - now-playing report + history push on track transitions
 *  - network-loss recovery: player errors of IO kind trigger a wait-for-
 *    connectivity then prepare() retry (max 3), preserving position
 */
class PlaybackController(private val context: Context) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val tag = "PlaybackController"

    private var controller: MediaController? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private val _queue = MutableStateFlow<List<Track>>(emptyList())
    val queue: StateFlow<List<Track>> = _queue.asStateFlow()

    private val _currentIndex = MutableStateFlow(-1)
    val currentIndex: StateFlow<Int> = _currentIndex.asStateFlow()

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _isBuffering = MutableStateFlow(false)
    val isBuffering: StateFlow<Boolean> = _isBuffering.asStateFlow()

    private val _positionMs = MutableStateFlow(0L)
    val positionMs: StateFlow<Long> = _positionMs.asStateFlow()

    private val _durationMs = MutableStateFlow(0L)
    val durationMs: StateFlow<Long> = _durationMs.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _waveMode = MutableStateFlow(false)
    val waveMode: StateFlow<Boolean> = _waveMode.asStateFlow()

    private val _networkWaiting = MutableStateFlow(false)
    val networkWaiting: StateFlow<Boolean> = _networkWaiting.asStateFlow()

    @Volatile var resumePositionMs: Long = 0L
        private set

    private var waveExtending = AtomicBoolean(false)
    private var pendingMediaItems: List<MediaItem>? = null
    private var pendingStartIndex: Int = 0
    private var pendingStartPositionMs: Long = 0

    // ── Connection ──────────────────────────────────────────────────────────

    fun connect() {
        if (controller != null) return
        val token = SessionToken(context, ComponentName(context, MqPlaybackService::class.java))
        val future = MediaController.Builder(context, token).buildAsync()
        future.addListener({
            runCatching { future.get() }.onSuccess { mediaController ->
                controller = mediaController
                mediaController.addListener(playerListener)
                startPositionTicker()
                if (pendingMediaItems != null) {
                    val items = pendingMediaItems!!
                    applyMediaItems(items, pendingStartIndex, pendingStartPositionMs)
                    pendingMediaItems = null
                }
            }.onFailure { Log.e(tag, "controller connect failed: ${it.message}") }
        }, MoreExecutors.directExecutor())
    }

    fun release() {
        controller?.release()
        controller = null
    }

    private fun requireController(): MediaController? = controller

    // ── Public API ──────────────────────────────────────────────────────────

    val nowPlaying: Track?
        get() = _queue.value.getOrNull(_currentIndex.value)

    val currentQueue: List<Track> get() = _queue.value

    fun playQueue(tracks: List<Track>, startIndex: Int = 0) {
        if (tracks.isEmpty()) return
        _waveMode.value = false
        scope.launch { startQueue(tracks, startIndex, wave = false) }
    }

    fun startWave(tracks: List<Track>) {
        if (tracks.isEmpty()) return
        scope.launch { startQueue(tracks, 0, wave = true) }
    }

    private suspend fun startQueue(tracks: List<Track>, startIndex: Int, wave: Boolean) {
        val safeIndex = startIndex.coerceIn(0, tracks.size - 1)
        _queue.value = tracks
        _currentIndex.value = safeIndex
        _waveMode.value = wave
        _error.value = null

        val items = tracks.mapIndexed { i, t -> t.buildMediaItem(preferredIndex = i == safeIndex) }
        applyOrDefer(items, safeIndex, 0L)

        // Pre-resolve the active stream so playback starts instantly.
        preResolve(tracks.getOrNull(safeIndex))
        preResolve(tracks.getOrNull(safeIndex + 1))
    }

    private fun applyOrDefer(items: List<MediaItem>, startIndex: Int, positionMs: Long) {
        val c = requireController()
        if (c == null) {
            pendingMediaItems = items
            pendingStartIndex = startIndex
            pendingStartPositionMs = positionMs
            connect()
            return
        }
        applyMediaItems(items, startIndex, positionMs)
    }

    private fun applyMediaItems(items: List<MediaItem>, startIndex: Int, positionMs: Long) {
        val c = controller ?: return
        c.setMediaItems(items, startIndex, positionMs)
        c.prepare()
        c.play()
    }

    fun addToQueue(tracks: List<Track>) {
        if (tracks.isEmpty()) return
        val c = controller ?: return
        _queue.value = _queue.value + tracks
        c.addMediaItems(tracks.map { it.buildMediaItem(preferredIndex = false) })
        scope.launch { preResolve(tracks.firstOrNull()) }
    }

    fun playNext(track: Track) {
        val c = controller ?: return
        _queue.value = _queue.value.toMutableList().apply {
            add((_currentIndex.value + 1).coerceAtLeast(0), track)
        }
        c.addMediaItems(
            (_currentIndex.value + 1).coerceAtLeast(0),
            listOf(track.buildMediaItem(preferredIndex = false))
        )
        scope.launch { preResolve(track) }
    }

    fun togglePlayPause() {
        val c = controller ?: return
        if (c.isPlaying) c.pause() else c.play()
    }

    fun next() { controller?.seekToNextMediaItem() }

    fun previous() {
        val c = controller ?: return
        if (c.currentPosition > 3000) c.seekTo(0) else c.seekToPreviousMediaItem()
    }

    fun seekTo(positionMs: Long) {
        controller?.seekTo(positionMs.coerceIn(0, _durationMs.value.coerceAtLeast(1)))
    }

    fun seekToIndex(index: Int) {
        val c = controller ?: return
        if (index in _queue.value.indices) c.seekTo(index, 0)
    }

    fun setShuffle(enabled: Boolean) { controller?.shuffleModeEnabled = enabled }

    fun setRepeatMode(mode: Int) { controller?.repeatMode = mode }

    fun shuffleEnabled(): Boolean = controller?.shuffleModeEnabled ?: false

    fun repeatMode(): Int = controller?.repeatMode ?: Player.REPEAT_MODE_OFF

    fun stop() {
        controller?.run {
            stop()
            clearMediaItems()
        }
        _queue.value = emptyList()
        _currentIndex.value = -1
        _waveMode.value = false
    }

    // ── Wave integration ────────────────────────────────────────────────────

    fun waveNextFromNotification() {
        scope.launch {
            val c = controller ?: return@launch
            if (c.hasNextMediaItem()) {
                c.seekToNextMediaItem()
            } else {
                extendWave()
            }
        }
    }

    fun skipWave() { waveNextFromNotification() }

    private suspend fun extendWave() {
        if (!waveExtending.compareAndSet(false, true)) return
        try {
            val batch = ServiceLocator.waveRepository.nextBatch(15)
            if (batch.isNotEmpty()) {
                addToQueue(batch)
            } else {
                _error.value = "Волна: не удалось получить следующие треки"
            }
        } finally {
            waveExtending.set(false)
        }
    }

    // ── Favorites / now playing ─────────────────────────────────────────────

    fun toggleFavoriteForCurrent() {
        val track = nowPlaying ?: return
        ioScope.launch {
            ServiceLocator.localStore.toggleFavorite(track)
            // Taste feedback to the recommendation engine (best-effort).
            track.scTrackId?.let { id ->
                runCatching {
                    ServiceLocator.api.recommendationFeedback(
                        mapOf("scTrackId" to id.toString(), "action" to "like")
                    )
                }
            }
        }
    }

    private fun reportTrackStarted(track: Track) {
        ioScope.launch {
            ServiceLocator.musicRepository.reportNowPlaying(track)
            ServiceLocator.localStore.pushHistory(track)
        }
    }

    // ── Stream pre-resolution ───────────────────────────────────────────────

    /**
     * Resolve the real CDN URL for a track and swap the lazy URI in the
     * player's media item (if it is the current/next item). The TTL cache in
     * MusicRepository makes this free for repeated plays.
     */
    private suspend fun preResolve(track: Track?) {
        if (track == null) return
        val id = track.scTrackId ?: return
        val resolved = ServiceLocator.musicRepository.resolveStreamById(id) ?: return
        val url = ServiceLocator.musicRepository.playableUrl(resolved) ?: return

        val c = controller ?: return
        val itemIndex = c.currentMediaItemIndex
        val nextIndex = itemIndex + 1

        for (i in listOf(itemIndex, nextIndex)) {
            if (i >= c.mediaItemCount) continue
            val item = c.getMediaItemAt(i)
            val key = track.scTrackId?.toString() ?: track.id
            if (item.mediaId == key && item.localConfiguration?.uri?.scheme == MqStreamDataSource.SCHEME) {
                val rebuilt = item.buildUpon()
                    .setUri(android.net.Uri.parse(url))
                    .setMimeType(
                        if (resolved.isHls) androidx.media3.common.MimeTypes.APPLICATION_M3U8 else null
                    )
                    .build()
                // Replace in place: only safe when player not currently reading it
                if (i != itemIndex || !c.isPlaying) {
                    c.replaceMediaItem(i, rebuilt)
                }
            }
        }
    }

    // ── Player events ───────────────────────────────────────────────────────

    private val playerListener = object : Player.Listener {

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            val c = controller ?: return
            _currentIndex.value = c.currentMediaItemIndex
            resumePositionMs = 0
            val track = nowPlaying
            if (track != null && reason != Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT) {
                reportTrackStarted(track)
            }
            // Pre-resolve the upcoming item.
            scope.launch { preResolve(_queue.value.getOrNull(_currentIndex.value + 1)) }
            // Auto-extend wave queue.
            if (_waveMode.value) {
                val remaining = _queue.value.size - _currentIndex.value - 1
                if (remaining <= 2) scope.launch { extendWave() }
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _isPlaying.value = isPlaying
            _isBuffering.value = controller?.playbackState == Player.STATE_BUFFERING
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            _isBuffering.value = playbackState == Player.STATE_BUFFERING
            _durationMs.value = controller?.duration?.takeIf { it > 0 } ?: 0L
        }

        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
            val isNetwork = error.errorCode in
                androidx.media3.common.PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED..
                androidx.media3.common.PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ||
                error.errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_IO_UNSPECIFIED
            Log.e(tag, "player error ${error.errorCode}: ${error.message}")
            if (isNetwork) {
                scheduleNetworkRecovery()
            } else {
                _error.value = "Ошибка воспроизведения: ${error.errorCodeName.substringAfterLast('.')}"
                // Skip to next track for codec/source-level failures.
                val c = controller
                if (c != null && c.hasNextMediaItem()) {
                    c.seekToNextMediaItem()
                } else if (_waveMode.value) {
                    scope.launch { extendWave() }
                }
            }
        }
    }

    // ── Network recovery (P20.8) ────────────────────────────────────────────

    private var recoveryAttempts = 0
    private var connectivityCallback: ConnectivityManager.NetworkCallback? = null

    private fun scheduleNetworkRecovery() {
        if (recoveryAttempts >= 3) {
            _error.value = "Сеть недоступна. Проверьте подключение и нажмите «Играть»."
            recoveryAttempts = 0
            return
        }
        _networkWaiting.value = true
        _error.value = null
        recoveryAttempts++

        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        if (connectivityCallback != null) return // already waiting

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                mainHandler.post {
                    _networkWaiting.value = false
                    unregisterRecovery()
                    val c = controller
                    if (c != null) {
                        val pos = c.currentPosition.coerceAtLeast(0)
                        c.seekTo(pos)
                        c.prepare()
                        c.play()
                    }
                }
            }
        }
        connectivityCallback = callback
        runCatching { cm.registerNetworkCallback(request, callback) }
    }

    private fun unregisterRecovery() {
        connectivityCallback?.let { cb ->
            runCatching {
                (context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager)
                    ?.unregisterNetworkCallback(cb)
            }
        }
        connectivityCallback = null
    }

    // ── Position ticker ─────────────────────────────────────────────────────

    private fun startPositionTicker() {
        scope.launch {
            while (true) {
                val c = controller
                if (c != null && c.isPlaying) {
                    _positionMs.value = c.currentPosition.coerceAtLeast(0)
                    resumePositionMs = _positionMs.value
                    if (c.duration > 0) _durationMs.value = c.duration
                }
                delay(500)
            }
        }
    }
}

// MediaItem construction lives here so the service stays declarative.
private fun Track.buildMediaItem(preferredIndex: Boolean): MediaItem {
    val key = scTrackId?.toString() ?: id
    return MediaItem.Builder()
        .setMediaId(key)
        .setUri(MqStreamDataSource.lazyUri(scTrackId ?: 0L))
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setAlbumTitle(album.takeIf { it.isNotBlank() })
                .setGenre(genre.takeIf { it.isNotBlank() })
                .setDurationMs((duration * 1000).toLong())
                .setArtworkUri(cover.takeIf { it.isNotBlank() }?.let { android.net.Uri.parse(it) })
                .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                .build()
        )
        .build()
}
