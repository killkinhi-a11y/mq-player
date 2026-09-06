package com.mq1.player.data.repo

import com.mq1.player.data.LocalStore
import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.Track
import kotlinx.coroutines.flow.first

/**
 * Wave (radio) session logic — mirrors the web client's Wave engine:
 * - liked + history sc ids are sent as exclude/seed params (honest diversity)
 * - each next batch feeds played track ids back as historyScIds
 * - recommendations come with real `_reason` fields surfaced in the UI
 */
class WaveRepository(
    private val api: MqApi,
    private val local: LocalStore
) {

    data class WaveBatch(
        val tracks: List<Track>,
        val startedAt: Long
    )

    private var session: MutableList<Long> = mutableListOf()

    suspend fun nextBatch(count: Int = 15): List<Track> {
        val liked = local.likedScIds.first()
        val history = local.historyScIds.first()
        val played = session

        val tracks = runCatching {
            api.recommendations(
                wave = 1,
                genres = local.tasteGenres.first().joinToString(",").takeIf { it.isNotBlank() },
                likedScIds = liked.joinToString(",").takeIf { it.isNotBlank() },
                historyScIds = (played + history).joinToString(",").takeIf { it.isNotBlank() },
                count = count
            ).tracks
        }.getOrElse { emptyList() }

        tracks.mapNotNull { it.scTrackId }.forEach { session.add(it) }
        return tracks
    }

    /** First batch for a fresh Wave session. */
    suspend fun start(count: Int = 15): List<Track> {
        session = mutableListOf()
        return nextBatch(count)
    }

    fun reset() {
        session = mutableListOf()
    }

    val sessionSize: Int get() = session.size
}
