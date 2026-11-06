package com.mq1.player.data.wave

import com.mq1.player.data.api.Track
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Kotlin twin of src/lib/wave/signals.ts — builds the POST /api/wave body
 * (WaveSignals, §29) with the same caps and filters. Golden cases:
 * shared/test-fixtures/wave-signals.cases.json.
 */
object WaveSignalsBuilder {

    data class Input(
        val history: List<Track?> = emptyList(),
        val likedTracksData: List<Track> = emptyList(),
        val dislikedTracksData: List<Track> = emptyList(),
        val dislikedTrackIds: List<String> = emptyList(),
        val queueIds: List<String> = emptyList(),
        val waveQueueIds: List<String> = emptyList(),
        val favoriteArtistNames: List<String> = emptyList(),
        val tasteGenres: List<String> = emptyList(),
        val tasteArtists: List<String> = emptyList(),
        val language: String? = null,
        val sessionEvents: List<JsonObject> = emptyList(),
        val recentWaveArtists: List<String> = emptyList(),
        val recentWaveGenres: List<String> = emptyList(),
        val recentWaveTrackIds: List<String> = emptyList(),
        val seed: JsonObject? = null,
        val debug: Boolean = false,
    )

    // Same numbers as WAVE_SIGNAL_LIMITS (TS) — asserted by the shared fixtures.
    private const val LIKED_ARTISTS = 10; private const val LIKED_GENRES = 10; private const val DISLIKED_ARTISTS = 10
    private const val LIKED_SC = 5; private const val HISTORY_SC = 12
    private const val HISTORY_ARTISTS_WINDOW = 20; private const val HISTORY_ARTISTS = 12
    private const val HISTORY_GENRES_WINDOW = 30; private const val HISTORY_GENRES = 12
    private const val TASTE_GENRES = 6; private const val TASTE_ARTISTS = 5; private const val SESSION_EVENTS = 120
    private const val EXCLUDE_HISTORY_WINDOW = 100; private const val EXCLUDE_IDS = 150; private const val EXCLUDE_SC = 50
    private const val RECENT_ARTISTS = 25; private const val RECENT_GENRES = 15; private const val RECENT_TRACKS = 60
    private const val LIKED_TEXTS = 12; private const val HISTORY_TEXTS = 16; private const val TEXT_LEN = 120

    private fun strs(l: List<String>) = JsonArray(l.map(::JsonPrimitive))
    private fun nums(l: List<Long>) = JsonArray(l.map(::JsonPrimitive))
    private fun sc(t: Track?): Long? = t?.scTrackId?.takeIf { it != 0L }
    private fun text(t: Track?): String = "${t?.title.orEmpty()} ${t?.artist.orEmpty()}".trim().take(TEXT_LEN)

    fun build(i: Input): JsonObject {
        val h = i.history
        val exclude = (i.queueIds + h.take(EXCLUDE_HISTORY_WINDOW).map { it?.id.orEmpty() } + i.waveQueueIds + i.dislikedTrackIds)
            .filter { it.isNotEmpty() }.distinct().take(EXCLUDE_IDS)
        val m = linkedMapOf<String, JsonElement>(
            "likedArtists" to strs(i.likedTracksData.map { it.artist }.filter { it.isNotEmpty() }.distinct().take(LIKED_ARTISTS)),
            "likedGenres" to strs(i.likedTracksData.map { it.genre }.filter { it.isNotEmpty() }.distinct().take(LIKED_GENRES)),
            "dislikedArtists" to strs(i.dislikedTracksData.map { it.artist }.filter { it.isNotEmpty() }.distinct().take(DISLIKED_ARTISTS)),
            "likedScIds" to nums(i.likedTracksData.mapNotNull(::sc).take(LIKED_SC)),
            "historyScIds" to nums(h.mapNotNull(::sc).take(HISTORY_SC)),
            "historyArtists" to strs(h.take(HISTORY_ARTISTS_WINDOW).mapNotNull { it?.artist?.takeIf(String::isNotEmpty) }.take(HISTORY_ARTISTS)),
            "historyGenres" to strs(h.take(HISTORY_GENRES_WINDOW).mapNotNull { it?.genre?.takeIf(String::isNotEmpty) }.take(HISTORY_GENRES)),
            "tasteGenres" to strs(i.tasteGenres.take(TASTE_GENRES)),
            "tasteArtists" to strs((i.favoriteArtistNames + i.tasteArtists).filter { it.isNotEmpty() }.distinct().take(TASTE_ARTISTS)),
        )
        i.language?.let { m["language"] = JsonPrimitive(it) }
        m["sessionEvents"] = JsonArray(i.sessionEvents.takeLast(SESSION_EVENTS))
        m["excludeIds"] = strs(exclude)
        m["excludeScIds"] = nums(i.dislikedTracksData.mapNotNull(::sc).take(EXCLUDE_SC))
        m["recentWaveArtists"] = strs(i.recentWaveArtists.take(RECENT_ARTISTS))
        m["recentWaveGenres"] = strs(i.recentWaveGenres.take(RECENT_GENRES))
        m["recentWaveTrackIds"] = strs(i.recentWaveTrackIds.take(RECENT_TRACKS))
        i.seed?.let { m["seed"] = it }
        m["likedTexts"] = strs(i.likedTracksData.take(LIKED_TEXTS).map(::text).filter { it.isNotEmpty() })
        m["historyTexts"] = strs(h.take(HISTORY_TEXTS).map(::text).filter { it.isNotEmpty() })
        if (i.debug) m["debug"] = JsonPrimitive(true)
        return JsonObject(m)
    }
}
