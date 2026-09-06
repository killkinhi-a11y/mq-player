package com.mq1.player.player

import androidx.media3.common.util.Assertions
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.TransferListener
import java.io.IOException

/**
 * Lazy stream-resolving DataSource.
 *
 * MediaItems can carry the synthetic URI `mq-stream://<scTrackId>` when the
 * real CDN URL is not resolved yet. On open() this data source:
 *   1. asks the resolver (MusicRepository, TTL-cached, single-flight) for the
 *      real http(s) URL,
 *   2. falls back through the stream's fallback list when the primary fails,
 *   3. delegates actual byte transfer to a DefaultHttpDataSource.
 *
 * open()/read() run on ExoPlayer's loader thread — blocking resolution there
 * is by design (same contract as every other DataSource).
 */
class MqStreamDataSource(
    private val http: DataSource,
    private val resolve: (Long) -> ResolvedStream?
) : DataSource {

    data class ResolvedStream(val urls: List<String>)

    private var openedUri: android.net.Uri? = null

    override fun addTransferListener(transferListener: TransferListener) {
        Assertions.checkNotNull(transferListener)
        http.addTransferListener(transferListener)
    }

    override fun open(dataSpec: DataSpec): Long {
        val uri = dataSpec.uri
        openedUri = uri
        val realUrl: String = if (uri.scheme == SCHEME) {
            val trackId = uri.host?.toLongOrNull()
                ?: uri.lastPathSegment?.toLongOrNull()
                ?: throw IOException("mq-stream: bad track id in $uri")
            val candidates = resolve(trackId)?.urls
                ?: throw IOException("mq-stream: stream unresolved for track $trackId")
            candidates.firstOrNull() ?: throw IOException("mq-stream: empty stream list")
        } else {
            uri.toString()
        }
        val redirectSpec = dataSpec.buildUpon().setUri(realUrl).build()
        return try {
            http.open(redirectSpec)
        } catch (primary: IOException) {
            // Walk the fallback chain before giving up.
            val candidates = resolve(uri.host?.toLongOrNull() ?: -1L)?.urls ?: emptyList()
            for (fallback in candidates.drop(1)) {
                try {
                    return http.open(dataSpec.buildUpon().setUri(fallback).build())
                } catch (_: IOException) {
                    // try next fallback
                }
            }
            throw primary
        }
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int = http.read(buffer, offset, length)

    override fun close() {
        openedUri = null
        http.close()
    }

    override fun getUri(): android.net.Uri? = http.uri ?: openedUri

    override fun getResponseHeaders(): Map<String, List<String>> = http.responseHeaders

    companion object {
        const val SCHEME = "mq-stream"

        /** Synthetic URI for a not-yet-resolved SoundCloud track. */
        fun lazyUri(scTrackId: Long): android.net.Uri =
            android.net.Uri.parse("$SCHEME://$scTrackId")
    }
}
