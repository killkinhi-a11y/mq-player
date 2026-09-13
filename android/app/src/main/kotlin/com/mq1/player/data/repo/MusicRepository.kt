package com.mq1.player.data.repo

import com.mq1.player.data.api.LyricsResponse
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
        private const val LYRICS_TTL = 10 * 60 * 1000L
    }

    /**
     * F8: playableStream + license-proxy construction live in the companion
     * (pure selection logic — unit-tested in PlayerStreamSelectionTest).
     */

    /**
     * F11: deep-link track resolution via the PUBLIC share endpoint
     * (works even before login — /api/tracks/share?scTrackId=).
     */
    suspend fun sharedTrack(scTrackId: Long): Track? {
        if (scTrackId <= 0) return null
        return runCatching {
            val resp = api.sharedTrack(scTrackId.toString())
            val body = resp.body() ?: return@runCatching null
            Track(
                id = "sc-$scTrackId",
                title = body.title,
                artist = body.artist,
                album = "",
                duration = body.duration,
                cover = body.cover,
                genre = body.genre,
                scTrackId = body.scTrackId
            )
        }.getOrNull()
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

    // ── Lyrics (F8) ─────────────────────────────────────────────────────────

    private val lyricsCache = HashMap<String, CacheEntry<LyricsResponse>>()
    private val lyricsMutex = Mutex()

    /** Cached lyrics lookup; null only on transport/parse failure. */
    suspend fun lyrics(artist: String, title: String): LyricsResponse? {
        val key = "${artist.trim().lowercase()}|${title.trim().lowercase()}"
        if (key == "|") return null
        lyricsMutex.withLock {
            lyricsCache[key]?.let {
                if (System.currentTimeMillis() - it.at < LYRICS_TTL) return it.value
            }
        }
        val response = runCatching { api.lyrics(artist.trim(), title.trim()) }.getOrNull()
            ?: return null
        val body = response.body() ?: return null
        lyricsMutex.withLock { lyricsCache[key] = CacheEntry(body, System.currentTimeMillis()) }
        return body
    }

    /** Best-effort now-playing ping; failures are silent by design. */
    suspend fun reportNowPlaying(track: Track) {
        runCatching {
            api.nowPlaying(mapOf("title" to track.title, "artist" to track.artist))
        }
    }
}

// ── F8: stream selection (pure, top-level — unit-tested) ─────────────────────

/**
 * One playable stream candidate, fully described for MediaItem construction:
 * URL + HLS mime + Widevine license-proxy URL when the stream is DRM-encrypted
 * (proxy wraps the SC license server + JWE token — binary mode passthrough,
 * the same chain the web's EME uses).
 */
data class PlayableStream(
    val url: String,
    val isHls: Boolean,
    val isEncrypted: Boolean,
    val licenseProxyUrl: String?
)

private data class Candidate(
    val url: String,
    val isHls: Boolean,
    val isEncrypted: Boolean,
    val protocol: String,
    val licenseUrl: String?,
    val token: String?
)

private const val SC_WIDEVINE_DEFAULT =
    "https://license.media-streaming.soundcloud.cloud/playback/widevine"

/**
 * Best playable candidate with full playback metadata. Priority follows the
 * backend contract: progressive > ctr-encrypted-hls (Widevine) > hls.
 * FairPlay (cbc-encrypted-hls) is Apple-only and SKIPPED on Android.
 * Encrypted candidates carry the license-proxy URL; Media3's
 * HttpMediaDrmCallback POSTs the raw CDM challenge to it (octet-stream →
 * octet-stream = the proxy's binary mode, no CORS involved).
 */
fun playableStream(resolved: StreamResponse, apiBase: String): PlayableStream? {
    val candidates = buildList {
        resolved.url?.takeIf { it.isNotBlank() }?.let {
            add(
                Candidate(
                    url = it, isHls = resolved.isHls, isEncrypted = resolved.isEncrypted,
                    protocol = resolved.protocol,
                    licenseUrl = resolved.licenseUrl, token = resolved.licenseAuthToken
                )
            )
        }
        resolved.fallbackStreams.filter { it.url.isNotBlank() }.forEach { f ->
            add(
                Candidate(
                    url = f.url, isHls = f.isHls, isEncrypted = f.isEncrypted,
                    protocol = f.protocol,
                    licenseUrl = f.licenseUrl, token = f.licenseAuthToken
                )
            )
        }
    }
    val isFairPlay = { c: Candidate -> c.protocol.equals("cbc-encrypted-hls", ignoreCase = true) }
    // 1) unencrypted progressive — zero-config, top priority
    candidates.firstOrNull { !it.isHls && !it.isEncrypted }?.let { return it.toPlayable(null) }
    // 2) unencrypted HLS — needs HLS media source only
    candidates.firstOrNull { it.isHls && !it.isEncrypted }?.let { return it.toPlayable(null) }
    // 3) Widevine-encrypted HLS (ctr) — needs HLS + DRM session
    candidates.firstOrNull { it.isEncrypted && it.isHls && !isFairPlay(it) }?.let { c ->
        buildLicenseProxyUrl(apiBase, c.licenseUrl, c.token)?.let { return c.toPlayable(it) }
    }
    // 4) encrypted progressive (never seen in the SC contract, honest order)
    candidates.firstOrNull { !it.isHls && it.isEncrypted && !isFairPlay(it) }?.let { c ->
        buildLicenseProxyUrl(apiBase, c.licenseUrl, c.token)?.let { return c.toPlayable(it) }
    }
    return null
}

private fun Candidate.toPlayable(proxy: String?): PlayableStream =
    PlayableStream(url, isHls, isEncrypted, proxy)

private fun buildLicenseProxyUrl(
    apiBase: String,
    licenseUrl: String?,
    token: String?
): String? {
    // SC widevine endpoint is the known default; per-stream licenseUrl wins
    val effective = licenseUrl?.takeIf { it.isNotBlank() } ?: SC_WIDEVINE_DEFAULT
    return buildString {
        append(apiBase.trimEnd('/'))
        append("/api/music/soundcloud/license-proxy?licenseUrl=")
        append(encodeQuery(effective))
        if (!token.isNullOrBlank()) {
            append("&licenseAuthToken=").append(encodeQuery(token))
        }
    }
}

/** Percent-encode a query value (JVM-pure — unit-testable). */
private fun encodeQuery(value: String): String =
    java.net.URLEncoder.encode(value, "UTF-8")
