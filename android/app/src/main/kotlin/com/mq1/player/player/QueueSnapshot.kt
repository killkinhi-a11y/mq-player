package com.mq1.player.player

import com.mq1.player.data.api.Track
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Persisted queue (web parity: the web store persists queue/queueIndex/
 * currentTrack and restores them paused). Android previously lost the queue
 * on every process restart.
 *
 * Window rule shared with web: ≤ [QueueRules.PERSIST_QUEUE_MAX] items that
 * always contain the current track (QueueRules.persistWindow).
 */
@Serializable
data class QueueSnapshot(
    val version: Int = VERSION,
    val tracks: List<Track> = emptyList(),
    val index: Int = 0,
    val currentId: String? = null,
    val positionMs: Long = 0,
    val repeat: String = "off",
    val shuffle: Boolean = false,
) {
    companion object {
        const val VERSION = 1
        private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

        fun capture(queue: List<Track>, index: Int, positionMs: Long, repeatMode: Int, shuffle: Boolean): QueueSnapshot? {
            if (queue.isEmpty() || index !in queue.indices) return null
            val w = QueueRules.persistWindow(queue, index)
            return QueueSnapshot(
                tracks = w.queue,
                index = w.index,
                currentId = queue[index].id,
                positionMs = positionMs.coerceAtLeast(0),
                repeat = QueueRules.repeatToWeb(QueueRules.repeatFromMedia3(repeatMode)),
                shuffle = shuffle,
            )
        }

        fun encode(s: QueueSnapshot): String = json.encodeToString(serializer(), s)

        /** Null for missing/corrupt/future-version/empty snapshots — never throws. */
        fun decode(text: String?): QueueSnapshot? {
            if (text.isNullOrBlank()) return null
            val s = runCatching { json.decodeFromString(serializer(), text) }.getOrNull() ?: return null
            if (s.version != VERSION || s.tracks.isEmpty()) return null
            val idx = QueueRules.restoreIndex(s.tracks.map { it.id }, s.index, s.currentId)
            return s.copy(index = idx)
        }
    }
}
