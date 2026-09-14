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
import com.mq1.player.data.repo.PlayableStream
import com.mq1.player.data.repo.playableStream
import com.mq1.player.di.ServiceLocator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
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

    // Reactive playback modes (UI tint updates immediately, not on next tick)
    private val _shuffleEnabled = MutableStateFlow(false)
    val shuffleEnabled: StateFlow<Boolean> = _shuffleEnabled.asStateFlow()

    private val _repeatMode = MutableStateFlow(Player.REPEAT_MODE_OFF)
    val repeatMode: StateFlow<Int> = _repeatMode.asStateFlow()

    // F8: playback speed — 0.5 / 0.75 / 1.0 / 1.25 / 1.5 / 2.0, player-wide
    // (ExoPlayer PlaybackParameters; audio pitch stays natural)
    private val _speed = MutableStateFlow(1.0f)
    val speed: StateFlow<Float> = _speed.asStateFlow()

    // P1 (web parity): player volume in percent 0..100 — the web applies the
    // quadratic curve audio.volume = (pct/100)^2; we replicate exactly.
    private val _volumePercent = MutableStateFlow(100f)
    val volumePercent: StateFlow<Float> = _volumePercent.asStateFlow()

    // P1 (web parity): REAL sleep timer. TIME mode = absolute epoch deadline
    // (drift-free, survives navigation — the controller is app-process-wide);
    // END_OF_TRACK = Media3 pauseAtEndOfMediaItem (exact, player-level).
    // Web expiry semantics: linear fade over the last 30 s, then pause and
    // restore the original volume.
    enum class SleepKind { NONE, TIME, END_OF_TRACK }

    private val _sleepKind = MutableStateFlow(SleepKind.NONE)
    val sleepKind: StateFlow<SleepKind> = _sleepKind.asStateFlow()

    private val _sleepRemainingMs = MutableStateFlow(0L)
    val sleepRemainingMs: StateFlow<Long> = _sleepRemainingMs.asStateFlow()

    @Volatile private var sleepEndMs: Long = 0L
    @Volatile private var sleepOriginalVolumePercent: Float = 100f
    @Volatile private var sleepTargetTrackId: String? = null

    fun startSleepTimer(minutes: Int) {
        sleepOriginalVolumePercent = _volumePercent.value
        sleepEndMs = System.currentTimeMillis() + minutes * 60_000L
        sleepTargetTrackId = nowPlaying?.id
        _sleepKind.value = SleepKind.TIME
        _sleepRemainingMs.value = minutes * 60_000L
    }

    fun startSleepEndOfTrack() {
        if (nowPlaying == null) return
        sleepEndMs = 0L
        sleepTargetTrackId = nowPlaying?.id
        _sleepKind.value = SleepKind.END_OF_TRACK
        _sleepRemainingMs.value = 0L
        // media3 1.4.1 has no pauseAtEndOfMediaItem (added in 1.5) — the
        // ticker pauses ~300 ms before the natural end (imperceptible for a
        // sleep-stop) and the transition listener guards against any race.
    }

    fun cancelSleepTimer() {
        sleepEndMs = 0L
        sleepTargetTrackId = null
        _sleepKind.value = SleepKind.NONE
        _sleepRemainingMs.value = 0L
        // Volume may have been mid-fade — restore honestly.
        applyVolume(sleepOriginalVolumePercent)
    }

    private fun finishSleepTimer() {
        controller?.pause()
        applyVolume(sleepOriginalVolumePercent)
        sleepEndMs = 0L
        sleepTargetTrackId = null
        _sleepKind.value = SleepKind.NONE
        _sleepRemainingMs.value = 0L
    }

    private fun tickSleepTimer() {
        when (_sleepKind.value) {
            SleepKind.NONE -> { if (_sleepRemainingMs.value != 0L) _sleepRemainingMs.value = 0L }
            SleepKind.END_OF_TRACK -> {
                val c = controller
                // Pause ~300 ms before the natural end (no pauseAtEndOfMediaItem
                // in media3 1.4.1 — honest near-exact stop for sleep purposes).
                if (c != null && c.isPlaying && _durationMs.value > 0) {
                    val remain = _durationMs.value - c.currentPosition
                    if (remain <= 300L) {
                        finishSleepTimer()
                        return
                    }
                }
                // The user moved to another track manually — timer consumed.
                if (sleepTargetTrackId != null && sleepTargetTrackId != nowPlaying?.id) {
                    sleepTargetTrackId = null
                    _sleepKind.value = SleepKind.NONE
                    _sleepRemainingMs.value = 0L
                }
            }
            SleepKind.TIME -> {
                val remaining = sleepEndMs - System.currentTimeMillis()
                _sleepRemainingMs.value = remaining.coerceAtLeast(0L)
                if (remaining <= 30_000L && remaining > 0L) {
                    // web parity: linear fade over the final 30 s
                    val faded = sleepOriginalVolumePercent * (remaining / 30_000f)
                    applyVolume(faded)
                }
                if (remaining <= 0L) finishSleepTimer()
            }
        }
    }

    /** Web parity volume curve: player.volume = (pct/100)^2. */
    fun setVolume(percent: Float) {
        val p = percent.coerceIn(0f, 100f)
        _volumePercent.value = p
        // A manual volume change during a TIME fade re-baselines the origin
        // (like the web: user stays in control).
        if (_sleepKind.value == SleepKind.TIME && sleepRemainingMs.value > 30_000L) {
            sleepOriginalVolumePercent = p
        }
        applyVolume(p)
    }

    private fun applyVolume(percent: Float) {
        val p = percent.coerceIn(0f, 100f) / 100f
        controller?.volume = p * p
    }

    // Deep links (mq://player): monotonically increasing request counter;
    // the NavHost observes it and opens the Full Player once per request.
    private val _openPlayerRequest = MutableStateFlow(0)
    val openPlayerRequest: StateFlow<Int> = _openPlayerRequest.asStateFlow()

    fun requestOpenPlayer() {
        _openPlayerRequest.value += 1
    }

    @Volatile var resumePositionMs: Long = 0L
        private set

    private var waveExtending = AtomicBoolean(false)
    private var pendingMediaItems: List<MediaItem>? = null
    private var pendingStartIndex: Int = 0
    private var pendingStartPositionMs: Long = 0
    private var pendingAutoplay: Boolean = true

    // ── Connection ──────────────────────────────────────────────────────────

    fun connect() {
        if (controller != null) return
        val token = SessionToken(context, ComponentName(context, MqPlaybackService::class.java))
        val future = MediaController.Builder(context, token).buildAsync()
        future.addListener({
            runCatching { future.get() }.onSuccess { mediaController ->
                controller = mediaController
                mediaController.addListener(playerListener)
                // re-apply persisted volume after (re)connect — the player
                // instance resets to 1.0 on service recreation
                applyVolume(_volumePercent.value)
                startPositionTicker()
                if (pendingMediaItems != null) {
                    val items = pendingMediaItems!!
                    applyMediaItems(items, pendingStartIndex, pendingStartPositionMs, pendingAutoplay)
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

    fun playQueue(tracks: List<Track>, startIndex: Int = 0, autoplay: Boolean = true) {
        if (tracks.isEmpty()) return
        _waveMode.value = false
        scope.launch { startQueue(tracks, startIndex, wave = false, autoplay = autoplay) }
    }

    fun startWave(tracks: List<Track>) {
        if (tracks.isEmpty()) return
        scope.launch { startQueue(tracks, 0, wave = true) }
    }

    private suspend fun startQueue(tracks: List<Track>, startIndex: Int, wave: Boolean, autoplay: Boolean = true) {
        val safeIndex = startIndex.coerceIn(0, tracks.size - 1)
        _queue.value = tracks
        _currentIndex.value = safeIndex
        _waveMode.value = wave
        _error.value = null

        // F8: resolve the FIRST track before building its MediaItem so HLS
        // gets the right mime type and encrypted streams get their DRM
        // configuration up front (the lazy DataSource path cannot attach
        // either — same reason the web resolves before feeding HLS.js).
        // TTL cache + single-flight make this free for repeats.
        val firstStream = tracks.getOrNull(safeIndex)?.let { t ->
            t.scTrackId?.let { ServiceLocator.musicRepository.resolveStreamById(it) }
        }?.let { playableStream(it, com.mq1.player.BuildConfig.API_BASE) }

        val items = tracks.mapIndexed { i, t ->
            if (i == safeIndex && firstStream != null) {
                t.buildMediaItem(resolved = firstStream)
            } else {
                t.buildMediaItem(resolved = null)
            }
        }
        applyOrDefer(items, safeIndex, 0L, autoplay)

        // Pre-resolve the active stream so playback starts instantly.
        preResolve(tracks.getOrNull(safeIndex + 1))
    }

    private fun applyOrDefer(items: List<MediaItem>, startIndex: Int, positionMs: Long, autoplay: Boolean = true) {
        val c = requireController()
        if (c == null) {
            pendingMediaItems = items
            pendingStartIndex = startIndex
            pendingStartPositionMs = positionMs
            pendingAutoplay = autoplay
            connect()
            return
        }
        applyMediaItems(items, startIndex, positionMs, autoplay)
    }

    private fun applyMediaItems(items: List<MediaItem>, startIndex: Int, positionMs: Long, autoplay: Boolean = true) {
        val c = controller ?: return
        c.setMediaItems(items, startIndex, positionMs)
        c.prepare()
        // autoplay=false (demo login — web parity: queue loaded, isPlaying=false):
        // items are prepared/paused; the first play tap resumes from position 0.
        if (autoplay) c.play()
    }

    fun addToQueue(tracks: List<Track>) {
        if (tracks.isEmpty()) return
        val c = controller ?: return
        _queue.value = _queue.value + tracks
        c.addMediaItems(tracks.map { it.buildMediaItem(resolved = null) })
        scope.launch { preResolve(tracks.firstOrNull()) }
    }

    fun playNext(track: Track) {
        val c = controller ?: return
        _queue.value = _queue.value.toMutableList().apply {
            add((_currentIndex.value + 1).coerceAtLeast(0), track)
        }
        c.addMediaItems(
            (_currentIndex.value + 1).coerceAtLeast(0),
            listOf(track.buildMediaItem(resolved = null))
        )
        scope.launch { preResolve(track) }
    }

    // ── REAL queue editing (web QueueView parity) ──────────────

    /**
     * REAL removal — replaces the old fake `next()` "removal".
     * Removing the current item lets ExoPlayer auto-transition to the next
     * (the transition listener mirrors the new index); removing the last
     * item empties the queue.
     */
    fun removeQueueItem(index: Int) {
        val c = controller ?: return
        val queue = _queue.value
        if (index !in queue.indices) return
        val wasCurrent = index == _currentIndex.value
        c.removeMediaItem(index)
        _queue.value = queue.filterIndexed { i, _ -> i != index }
        when {
            _queue.value.isEmpty() -> {
                _currentIndex.value = -1
                _isPlaying.value = false
            }
            wasCurrent -> {
                // player auto-advanced; the transition listener refreshes,
                // but mirror immediately for responsive UI
                _currentIndex.value = c.currentMediaItemIndex.coerceIn(0, _queue.value.size - 1)
                if (index >= _queue.value.size && _waveMode.value) {
                    scope.launch { extendWave() }
                }
            }
            index < _currentIndex.value -> _currentIndex.value -= 1
        }
    }

    fun moveQueueItem(from: Int, to: Int) {
        val c = controller ?: return
        val queue = _queue.value.toMutableList()
        if (from !in queue.indices || to !in queue.indices || from == to) return
        c.moveMediaItem(from, to)
        queue.add(to, queue.removeAt(from))
        _queue.value = queue
        val cur = _currentIndex.value
        _currentIndex.value = when (cur) {
            from -> to
            else -> if (from < cur && to >= cur) cur - 1
                    else if (from > cur && to <= cur) cur + 1
                    else cur
        }
    }

    fun togglePlayPause() {
        val c = controller ?: return
        if (c.isPlaying) c.pause() else c.play()
    }

    /** Toggle favorite for an EXPLICIT track (list rows favorite their own
     *  track — previously every row hearted the *currently playing* track). */
    fun toggleFavorite(track: Track) {
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

    // ── Dislikes / artist subscriptions / similar tracks (web parity) ───

    private val _subscribedArtists = MutableStateFlow<Set<String>>(emptySet())
    val subscribedArtists: StateFlow<Set<String>> = _subscribedArtists.asStateFlow()

    private val _dislikedIds = MutableStateFlow<Set<String>>(emptySet())
    val dislikedIds: StateFlow<Set<String>> = _dislikedIds.asStateFlow()

    init {
        // Mirror the persisted library lists for instant UI labels.
        scope.launch {
            ServiceLocator.localStore.favoriteArtists.collect { _subscribedArtists.value = it.toSet() }
        }
        scope.launch {
            ServiceLocator.localStore.dislikedScIds.collect { _dislikedIds.value = it }
        }
    }

    /** Web «Не нравится» — persists locally + taste feedback. */
    fun dislike(track: Track) {
        ioScope.launch {
            val added = ServiceLocator.localStore.toggleDisliked(track)
            if (added) {
                track.scTrackId?.let { id ->
                    runCatching {
                        ServiceLocator.api.recommendationFeedback(
                            mapOf("scTrackId" to id.toString(), "action" to "dislike")
                        )
                    }
                }
            }
        }
    }

    /** Web «Подписаться на артиста» — local + server sync. */
    fun toggleArtistSubscription(artist: String) {
        ioScope.launch {
            ServiceLocator.localStore.toggleFavoriteArtist(artist)
            runCatching {
                val artists = ServiceLocator.localStore.favoriteArtists.first()
                ServiceLocator.api.saveFavoriteArtists(
                    com.mq1.player.data.api.SaveFavoriteArtistsBody(artists = artists)
                )
            }
        }
    }

    /** Web «Похожие треки» — seed track + /api/music/radio batch, radio
     *  continuation on (auto-extends like Wave when the batch runs out). */
    fun startSimilar(seed: Track) {
        scope.launch {
            val similar = ServiceLocator.musicRepository.similarTracks(seed)
            if (similar.isEmpty()) {
                _error.value = "Похожие треки не найдены"
                return@launch
            }
            _error.value = null
            startQueue(listOf(seed) + similar, 0, wave = true)
            requestOpenPlayer()
        }
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

    /** F8: set playback speed (clamped to the supported ladder). */
    fun setPlaybackSpeed(speed: Float) {
        val clamped = when {
            speed < 0.5f -> 0.5f
            speed > 2f -> 2f
            else -> speed
        }
        _speed.value = clamped
        controller?.setPlaybackSpeed(clamped)
    }

    fun stop() {
        controller?.run {
            stop()
            clearMediaItems()
        }
        cancelSleepTimer()
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
     * F8: the rebuilt item now carries the HLS mime AND the Widevine DRM
     * configuration for encrypted streams (license proxy = backend route).
     */
    private suspend fun preResolve(track: Track?) {
        if (track == null) return
        val id = track.scTrackId ?: return
        val resolved = ServiceLocator.musicRepository.resolveStreamById(id) ?: return
        val playable = playableStream(
            resolved, com.mq1.player.BuildConfig.API_BASE
        ) ?: return

        val c = controller ?: return
        val itemIndex = c.currentMediaItemIndex
        val nextIndex = itemIndex + 1

        for (i in listOf(itemIndex, nextIndex)) {
            if (i >= c.mediaItemCount) continue
            val item = c.getMediaItemAt(i)
            val key = track.scTrackId?.toString() ?: track.id
            if (item.mediaId == key && item.localConfiguration?.uri?.scheme == MqStreamDataSource.SCHEME) {
                val rebuilt = item.buildUpon()
                    .setUri(android.net.Uri.parse(playable.url))
                    .setMimeType(
                        if (playable.isHls) androidx.media3.common.MimeTypes.APPLICATION_M3U8 else null
                    )
                    .apply {
                        if (playable.isEncrypted && playable.licenseProxyUrl != null) {
                            setDrmConfiguration(
                                MediaItem.DrmConfiguration.Builder(androidx.media3.common.C.WIDEVINE_UUID)
                                    .setLicenseUri(android.net.Uri.parse(playable.licenseProxyUrl))
                                    .build()
                            )
                        }
                    }
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
            if (isPlaying) recoveryAttempts = 0 // healthy again — future blips get full retries
        }

        override fun onShuffleModeEnabledChanged(shuffleModeEnabled: Boolean) {
            _shuffleEnabled.value = shuffleModeEnabled
        }

        override fun onRepeatModeChanged(repeatMode: Int) {
            _repeatMode.value = repeatMode
        }

        override fun onPlaybackParametersChanged(playbackParameters: androidx.media3.common.PlaybackParameters) {
            _speed.value = playbackParameters.speed
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
                tickSleepTimer()
                delay(500)
            }
        }
    }
}

// MediaItem construction lives here so the service stays declarative.
// F8: `resolved` (when known) attaches the HLS mime type and, for encrypted
// streams, the Widevine license-proxy configuration — without it ExoPlayer
// cannot pick an HLS media source or run the DRM handshake.
// Tracks WITHOUT a SoundCloud id (demo/public files) carry their own playable
// http(s) URL — previously they all collapsed onto the synthetic
// mq-stream://0 URI and failed with "stream unresolved for track 0".
private fun Track.buildMediaItem(resolved: PlayableStream?): MediaItem {
    val key = scTrackId?.toString() ?: id
    val uri = when {
        resolved != null -> android.net.Uri.parse(resolved.url)
        scTrackId != null -> MqStreamDataSource.lazyUri(scTrackId)
        else -> audioUrl.takeIf { it.isNotBlank() }?.let { android.net.Uri.parse(it) }
            ?: MqStreamDataSource.lazyUri(0L)
    }
    return MediaItem.Builder()
        .setMediaId(key)
        .setUri(uri)
        .setMimeType(
            if (resolved?.isHls == true) androidx.media3.common.MimeTypes.APPLICATION_M3U8 else null
        )
        .apply {
            if (resolved?.isEncrypted == true && resolved.licenseProxyUrl != null) {
                setDrmConfiguration(
                    MediaItem.DrmConfiguration.Builder(androidx.media3.common.C.WIDEVINE_UUID)
                        .setLicenseUri(android.net.Uri.parse(resolved.licenseProxyUrl))
                        .build()
                )
            }
        }
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setAlbumTitle(album.takeIf { it.isNotBlank() })
                .setGenre(genre.takeIf { it.isNotBlank() })
                .setDurationMs((duration * 1000).toLong())
                // P0: covers are origin-relative — resolve so notification /
                // lock-screen artwork actually loads (web browser does this
                // implicitly; Coil / MediaMetadata do not).
                .setArtworkUri(
                    com.mq1.player.data.MqUrls.absolute(cover)?.let { android.net.Uri.parse(it) }
                )
                .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                .build()
        )
        .build()
}
