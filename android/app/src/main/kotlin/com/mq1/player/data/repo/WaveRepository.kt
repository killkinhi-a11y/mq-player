package com.mq1.player.data.repo

import com.mq1.player.data.LocalStore
import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.Track
import com.mq1.player.data.wave.WaveSignalsBuilder
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/**
 * WAVE session — same pipeline as the web (useWaveEngine):
 *  1. POST /api/wave (start) / POST /api/wave/next with WaveSignals built by
 *     the shared rules (WaveSignalsBuilder ⇄ src/lib/wave/signals.ts);
 *  2. on error / empty answer → legacy GET /api/music/recommendations?wave=1
 *     (the previous Android path, also the web's legacy fallback).
 * Previously Android used ONLY the legacy endpoint, so it got different
 * recommendations (no relevance gate, no session memory) than the web.
 */
class WaveRepository(
    private val api: MqApi,
    private val inputs: suspend () -> WaveSignalsBuilder.Input,
    private val anonId: suspend () -> String,
    private val legacyInputs: suspend () -> LegacyInputs,
) {
    data class LegacyInputs(val genres: Set<String>, val likedScIds: Set<String>, val historyScIds: Set<String>)

    @Serializable
    data class WaveApiResponse(
        val sessionId: String? = null,
        val tracks: List<Track> = emptyList(),
        val reasons: List<String> = emptyList(),
    )

    /** Which pipeline produced the last batch (diagnostics + tests). */
    enum class Source { WAVE_API, LEGACY }

    var lastSource: Source? = null
        private set
    private var sessionId: String? = null
    private var session: MutableList<Track> = mutableListOf()

    constructor(api: MqApi, local: LocalStore, queueIds: () -> List<String> = { emptyList() }) : this(
        api = api,
        inputs = {
            WaveSignalsBuilder.Input(
                history = local.history.first(),
                likedTracksData = local.favorites.first(),
                dislikedTracksData = local.disliked.first(),
                dislikedTrackIds = local.disliked.first().map { it.id },
                queueIds = queueIds(),
                favoriteArtistNames = local.favoriteArtists.first(),
                tasteGenres = local.tasteGenres.first().toList(),
            )
        },
        anonId = { local.waveAnonId() },
        legacyInputs = { LegacyInputs(local.tasteGenres.first(), local.likedScIds.first(), local.historyScIds.first()) },
    )

    private suspend fun body(): JsonObject {
        val base = inputs()
        // session tracks behave like the web waveQueue: hard exclusions
        val signals = WaveSignalsBuilder.build(base.copy(waveQueueIds = session.map { it.id }))
        return buildJsonObject {
            put("anonId", JsonPrimitive(anonId()))
            sessionId?.let { put("sessionId", JsonPrimitive(it)) }
            signals.forEach { (k, v) -> put(k, v) }
        }
    }

    private suspend fun fromWaveApi(start: Boolean): List<Track> = runCatching {
        val res = if (start) api.waveStart(body()) else api.waveNext(body())
        if (!res.isSuccessful) return@runCatching emptyList()
        val payload = res.body() ?: return@runCatching emptyList()
        if (start) sessionId = payload.sessionId
        payload.tracks.mapIndexed { i, t -> if (t._reason == null) t.copy(_reason = payload.reasons.getOrNull(i)) else t }
    }.getOrElse { emptyList() }

    private suspend fun fromLegacy(count: Int): List<Track> = runCatching {
        val l = legacyInputs()
        val played = session.mapNotNull { it.scTrackId?.toString() }
        api.recommendations(
            wave = 1,
            genres = l.genres.joinToString(",").takeIf { it.isNotBlank() },
            likedScIds = l.likedScIds.joinToString(",").takeIf { it.isNotBlank() },
            historyScIds = (played + l.historyScIds).joinToString(",").takeIf { it.isNotBlank() },
            count = count,
        ).tracks
    }.getOrElse { emptyList() }

    suspend fun nextBatch(count: Int = 15): List<Track> = batch(start = false, count = count)

    private suspend fun batch(start: Boolean, count: Int): List<Track> {
        val seen = session.map { it.id }.toSet()
        var tracks = fromWaveApi(start).filter { it.id !in seen }
        lastSource = Source.WAVE_API
        if (tracks.isEmpty()) {
            tracks = fromLegacy(count).filter { it.id !in seen }
            lastSource = Source.LEGACY
        }
        val out = tracks.take(count)
        session.addAll(out)
        return out
    }

    /** First batch for a fresh Wave session. */
    suspend fun start(count: Int = 15): List<Track> {
        reset()
        return batch(start = true, count = count)
    }

    fun reset() {
        session = mutableListOf()
        sessionId = null
    }

    val sessionSize: Int get() = session.size
}
