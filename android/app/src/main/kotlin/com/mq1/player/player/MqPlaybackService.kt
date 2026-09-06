package com.mq1.player.player

import android.content.Intent
import android.os.Bundle
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.mq1.player.data.api.Track
import com.mq1.player.di.ServiceLocator
import kotlinx.coroutines.runBlocking
import com.mq1.player.R

/**
 * Foreground playback service — the single owner of ExoPlayer.
 *
 * Platform integration provided by Media3 (P20.4/20.5):
 *  - MediaSession → lock screen / Bluetooth / headset controls
 *  - audio focus handling (pause on call, duck on notification, resume after)
 *  - audio-becoming-noisy → pause on headphone unplug
 *  - media playback foreground service + notification (artwork, play/pause,
 *    next/previous, custom Wave-next / Like buttons)
 */
class MqPlaybackService : MediaLibraryService() {

    private lateinit var player: ExoPlayer
    private var mediaSession: MediaLibrarySession? = null

    val waveNextCommand = SessionCommand(ACTION_WAVE_NEXT, Bundle.EMPTY)
    val favoriteCommand = SessionCommand(ACTION_TOGGLE_FAVORITE, Bundle.EMPTY)

    override fun onCreate() {
        super.onCreate()

        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("MQ-Android")
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(30_000)
            .setAllowCrossProtocolRedirects(true)

        val streamFactory = DataSource.Factory {
            MqStreamDataSource(httpFactory.createDataSource()) { trackId ->
                runBlocking {
                    val resolved = ServiceLocator.musicRepository.resolveStreamById(trackId)
                    resolved?.let { r ->
                        val urls = buildList {
                            ServiceLocator.musicRepository.playableUrl(r)?.let { add(it) }
                            r.fallbackStreams.mapNotNull { f -> f.url.takeIf { it.isNotBlank() } }
                                .forEach { add(it) }
                        }.distinct()
                        MqStreamDataSource.ResolvedStream(urls)
                    }
                }
            }
        }

        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(streamFactory))
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build()

        val sessionActivityPendingIntent =
            android.app.PendingIntent.getActivity(
                this, 0,
                Intent(this, com.mq1.player.MainActivity::class.java)
                    .setAction(Intent.ACTION_VIEW),
                android.app.PendingIntent.FLAG_IMMUTABLE or
                        android.app.PendingIntent.FLAG_UPDATE_CURRENT
            )

        mediaSession = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .setSessionActivity(sessionActivityPendingIntent)
            .setCustomLayout(customLayout())
            .build()
    }

    private fun customLayout(): List<CommandButton> {
        val likeButton = CommandButton.Builder()
            .setDisplayName("Нравится")
            .setSessionCommand(favoriteCommand)
            .setIconResId(R.drawable.ic_notif_favorite)
            .build()
        val waveButton = CommandButton.Builder()
            .setDisplayName("Дальше по Волне")
            .setSessionCommand(waveNextCommand)
            .setIconResId(R.drawable.ic_notif_wave)
            .build()
        return listOf(likeButton, waveButton)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? =
        mediaSession

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = this.player
        if (!player.playWhenReady || player.mediaItemCount == 0) {
            stopSelf()
        }
    }

    // ── Session callback: custom commands from notification / lock screen ────

    private inner class LibraryCallback : MediaLibrarySession.Callback {

        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo
        ): MediaSession.ConnectionResult {
            val sessionCommands =
                MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                    .add(waveNextCommand)
                    .add(favoriteCommand)
                    .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(sessionCommands)
                .build()
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle
        ): ListenableFuture<SessionResult> {
            when (customCommand.customAction) {
                ACTION_WAVE_NEXT -> {
                    ServiceLocator.playbackController.waveNextFromNotification()
                    return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
                }
                ACTION_TOGGLE_FAVORITE -> {
                    ServiceLocator.playbackController.toggleFavoriteForCurrent()
                    return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
                }
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED))
        }

        override fun onPlaybackResumption(
            session: MediaSession,
            controller: MediaSession.ControllerInfo
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val queue = ServiceLocator.playbackController.currentQueue
            if (queue.isEmpty()) {
                return Futures.immediateFailedFuture(IllegalStateException("no queue"))
            }
            val items = queue.map { it.toMediaItem() }
            val start = ServiceLocator.playbackController.currentIndex.value
                .coerceIn(0, items.size - 1)
            val pos = ServiceLocator.playbackController.resumePositionMs
            return Futures.immediateFuture(
                MediaSession.MediaItemsWithStartPosition(items, start, pos)
            )
        }
    }

    // ── Track → MediaItem (used for playback resumption) ─────────────────────

    private fun Track.toMediaItem(): MediaItem =
        MediaItem.Builder()
            .setMediaId(mediaKey())
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

    companion object {
        const val ACTION_WAVE_NEXT = "com.mq1.player.action.WAVE_NEXT"
        const val ACTION_TOGGLE_FAVORITE = "com.mq1.player.action.TOGGLE_FAVORITE"

        fun Track.mediaKey(): String = scTrackId?.toString() ?: id
    }
}
