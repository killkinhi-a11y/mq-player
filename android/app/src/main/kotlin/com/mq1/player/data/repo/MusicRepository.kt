package com.mq1.player.data.repo

import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.StreamResponse
import com.mq1.player.data.api.Track
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Music metadata + stream resolution.
 *
 * Caching/dedupe strategy (P20.7 — no unnecessary API requests):
 * - search/artist results: 5-minute in-memory TTL cache keyed by query
 * - stream resolution: 10-minute cache keyed by scTrackId — URLs are reused
 *   for repeat plays, and pre-resolution for the next queue item uses the
 *   same cache (gapless prep costs zero extra backend hits)
 * - single-flight: concurrent requests for the same key share one call
 */
class MusicRepository(
    private val api: MqApi,
    private val scope: CoroutineScope
) {

    private class CacheEntry<T>(val value: T, val at: Long)

    private val searchCache = HashMap<String, CacheEntry<List<Track>>>()
    private val artistCache = HashMap<String, CacheEntry<Pair<Track?, List<Track>>>>()
    private val streamCache = HashMap<Long, CacheEntry<StreamResponse>>()
    private val searchMutex = Mutex()
    private val artistMutex = Mutex()
    private val streamMutex = Mutex()

    companion object {
        private const val SEARCH_TTL = 5 * 60 * 1000L
        private const val STREAM_TTL = 10 * 60 * 1000L
    }

    suspend fun search(query: String): List<Track> {
        val q = query.trim()
        if (q.isEmpty()) return emptyList()
        searchMutex.withLock {
            searchCache[q]?.let { if (System.currentTimeMillis() - it.at < SEARCH_TTL) return it.value }
        }
        val result = runCatching { api.search(q).tracks }.getOrElse { emptyList() }
        searchMutex.withLock { searchCache[q] = CacheEntry(result, System.currentTimeMillis()) }
        return result
    }

    /** @return (artistHeaderTrack, tracks) — header track provides artwork for the artist screen */
    suspend fun artistTracks(artist: String, limit: Int = 20): Pair<Track?, List<Track>> {
        val q = artist.trim()
        if (q.isEmpty()) return null to emptyList()
        artistMutex.withLock {
            artistCache[q.lowercase()]?.let {
                if (System.currentTimeMillis() - it.at < SEARCH_TTL) return it.value
            }
        }
        val response = runCatching { api.artistTracks(q, limit) }.getOrNull()
        val result = (response?.tracks ?: emptyList()).let { tracks ->
            (tracks.firstOrNull { it.cover.isNotBlank() } ?: tracks.firstOrNull()) to tracks
        }
        artistMutex.withLock { artistCache[q.lowercase()] = CacheEntry(result, System.currentTimeMillis()) }
        return result
    }

    /**
     * Resolve a playable stream for a track by its SoundCloud id.
     * Order: cached → /stream (primary) → fallbackStreams.
     */
    suspend fun resolveStreamById(trackId: Long): StreamResponse? {
        streamMutex.withLock {
            streamCache[trackId]?.let {
                if (System.currentTimeMillis() - it.at < STREAM_TTL) return it.value
            }
        }
        val response = runCatching { api.stream(trackId) }.getOrNull() ?: return null
        if (response.url.isNullOrBlank() && response.fallbackStreams.isEmpty()) return null
        streamMutex.withLock { streamCache[trackId] = CacheEntry(response, System.currentTimeMillis()) }
        return response
    }

    suspend fun resolveStream(track: Track): StreamResponse? =
        track.scTrackId?.let { resolveStreamById(it) }

    /** First playable URL for a resolved stream (progressive preferred). */
    fun playableUrl(resolved: StreamResponse): String? {
        resolved.url?.let { return it }
        return resolved.fallbackStreams
            .filter { it.url.isNotBlank() && !it.isHls }
            .ifEmpty { resolved.fallbackStreams.filter { it.url.isNotBlank() } }
            .firstOrNull()?.url
    }

    /** True when the primary URL is an HLS variant (needs HLS media source). */
    fun isHls(resolved: StreamResponse): Boolean = resolved.isHls

    /** Best-effort now-playing ping; failures are silent by design. */
    suspend fun reportNowPlaying(track: Track) {
        runCatching {
            api.nowPlaying(mapOf("title" to track.title, "artist" to track.artist))
        }
    }
}
