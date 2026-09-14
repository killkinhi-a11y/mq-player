package com.mq1.player.ui.components

import android.app.DownloadManager
import android.content.Context
import android.os.Environment
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.Stable
import androidx.compose.ui.platform.LocalContext
import com.mq1.player.data.api.PlaylistDto
import com.mq1.player.data.api.Track
import com.mq1.player.data.repo.playableStream
import com.mq1.player.di.ServiceLocator
import com.mq1.player.player.PlaybackController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * One reusable track-menu controller (the "MenuCore" of the app).
 *
 * Every screen opens the SAME web-parity [MqTrackContextMenu] through this
 * state holder instead of wiring its own dead `onMenu = {}` buttons:
 *
 *   val menu = remember { TrackMenuState() }
 *   TrackRow(..., onMenu = { menu.open(track) })
 *   TrackMenuHost(menu, controller, onOpenArtist = ...)
 *
 * Optional context flags:
 *  [queueIndex]     — the track's position in the play queue (real removal)
 *  [playlistId]     — the track sits in this playlist (real removal)
 *  [isCurrent]      — the track is the now-playing one (enables «Скачать»,
 *                     exactly like the web which downloads the active stream)
 */
@Stable
class TrackMenuState {
    var track by mutableStateOf<Track?>(null)
        private set
    var queueIndex by mutableIntStateOf(-1)
        private set
    var playlistId by mutableStateOf<String?>(null)
        private set
    var isCurrent by mutableStateOf(false)
        private set

    fun open(track: Track, queueIndex: Int = -1, playlistId: String? = null, isCurrent: Boolean = false) {
        this.track = track
        this.queueIndex = queueIndex
        this.playlistId = playlistId
        this.isCurrent = isCurrent
    }

    fun close() {
        track = null
        queueIndex = -1
        playlistId = null
        isCurrent = false
    }

    val isOpen: Boolean get() = track != null
}

/**
 * Hosts the shared [MqTrackContextMenu] and wires every action to the real
 * controller/repositories. Failures surface as honest toasts — no silent
 * swallowing, no fake success.
 */
@Composable
fun TrackMenuHost(
    state: TrackMenuState,
    controller: PlaybackController,
    onOpenArtist: (String) -> Unit,
    onDismissed: () -> Unit = {},
    onRemoveFromPlaylist: ((track: Track, playlistId: String) -> Unit)? = null,
) {
    val context = LocalContext.current
    val track = state.track ?: return

    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val favorites by produceState(initialValue = emptyList<Track>(), Unit) {
        ServiceLocator.localStore.favorites.collect { value = it }
    }
    val dislikedIds by controller.dislikedIds.collectAsState()
    val subscribedArtists by controller.subscribedArtists.collectAsState()

    val playlists: State<List<PlaylistDto>> = produceState(
        initialValue = emptyList(), state.isOpen
    ) {
        if (state.isOpen) {
            value = withContext(Dispatchers.IO) {
                ServiceLocator.playlistRepository.myPlaylists().getOrDefault(emptyList())
            }
        }
    }

    val isLiked = favorites.any { it.id == track.id }
    val isDisliked = dislikedIds.contains(track.scTrackId?.toString() ?: track.id)
    val isSubscribed = subscribedArtists.contains(track.artist)

    MqTrackContextMenu(
        track = track,
        isLiked = isLiked,
        isDisliked = isDisliked,
        isSubscribed = isSubscribed,
        playlists = playlists.value,
        queueIndex = state.queueIndex.takeIf { it >= 0 },
        canDownload = state.isCurrent,
        onDismiss = { state.close(); onDismissed() },
        onPlay = {
            if (state.queueIndex >= 0) {
                controller.seekToIndex(state.queueIndex)
            } else {
                // web semantics: keep the queue, append this track, play it
                val q = controller.currentQueue
                controller.playQueue(q + listOf(track), startIndex = q.size)
            }
        },
        onAddToQueue = { controller.addToQueue(listOf(track)) },
        onSimilar = { controller.startSimilar(track) },
        onToggleLike = { controller.toggleFavorite(track) },
        onDislike = { controller.dislike(track) },
        onOpenArtist = { artist -> if (artist.isNotBlank()) onOpenArtist(artist) },
        onToggleSubscription = {
            if (track.artist.isNotBlank()) controller.toggleArtistSubscription(track.artist)
        },
        onAddToPlaylist = { pid ->
            scope.launch(Dispatchers.IO) {
                runCatching {
                    val repo = ServiceLocator.playlistRepository
                    val pl = repo.playlist(pid) ?: error("Плейлист недоступен")
                    if (pl.tracks.none { it.id == track.id }) {
                        repo.updateTracks(pid, pl, pl.tracks + track).getOrThrow()
                    }
                }.onSuccess {
                    showToast(context, "Добавлено в плейлист")
                }.onFailure {
                    showToast(context, "Не удалось добавить в плейлист")
                }
            }
        },
        onCreatePlaylistAndAdd = {
            scope.launch(Dispatchers.IO) {
                runCatching {
                    val repo = ServiceLocator.playlistRepository
                    // web quick-create names the playlist after the artist
                    val name = track.artist.takeIf { it.isNotBlank() } ?: "Новый плейлист"
                    val pl = repo.create(name).getOrThrow()
                    repo.updateTracks(pl.id, pl, listOf(track)).getOrThrow()
                }.onSuccess {
                    showToast(context, "Плейлист создан")
                }.onFailure {
                    showToast(context, "Не удалось создать плейлист")
                }
            }
        },
        onRemoveFromQueue = { idx -> controller.removeQueueItem(idx) },
        onRemoveFromPlaylist = state.playlistId?.let { pid ->
            { onRemoveFromPlaylist?.invoke(track, pid) }
        },
        onDownload = { downloadTrack(context, track) },
    )
}

/** DownloadManager download of the CURRENT track's resolved stream
 *  (the web downloads the active audio.src — same semantics). */
private fun downloadTrack(context: Context, track: Track) {
    val scId = track.scTrackId
    if (scId == null) {
        showToast(context, "Скачивание недоступно для этого трека")
        return
    }
    CoroutineScope(Dispatchers.IO).launch {
        runCatching {
            val resolved = ServiceLocator.musicRepository.resolveStreamById(scId)
                ?: error("Поток недоступен")
            val playable = playableStream(resolved, com.mq1.player.BuildConfig.API_BASE)
                ?: error("Поток недоступен")
            if (playable.isHls) {
                showToast(context, "Скачивание недоступно для HLS-потока")
                return@launch
            }
            val name = "${track.artist} - ${track.title}.mp3"
                .replace(Regex("[\\\\/:*?\"<>|]"), "_").take(120)
            val request = DownloadManager.Request(android.net.Uri.parse(playable.url))
                .setTitle(track.title)
                .setDescription("${track.artist} · MQ Player")
                .setMimeType("audio/mpeg")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
            showToast(context, "Загрузка началась — см. Downloads")
        }.onFailure {
            showToast(context, "Не удалось начать загрузку")
        }
    }
}

private fun showToast(context: Context, message: String) {
    android.os.Handler(android.os.Looper.getMainLooper()).post {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }
}
