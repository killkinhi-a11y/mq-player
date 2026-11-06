package com.mq1.player.data.sync

import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.Track
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.io.IOException

/** Local side of the sync — implemented by LocalStore, faked in tests. */
interface SyncLocal {
    data class State(
        val userId: String?,
        val favorites: List<Track>,
        val disliked: List<Track>,
        val history: List<Track>,
        val historyPlayedAt: List<Long>,
        val removedLiked: Set<String>,
        val removedDisliked: Set<String>,
    )

    suspend fun syncState(): State

    /** Adds server-only items (never removes local ones — race-safe vs. concurrent taps). */
    suspend fun applyServerAdditions(liked: List<Track>, disliked: List<Track>, history: List<Pair<Track, Long>>)

    /** Clears only the tombstones that were part of the pushed sync. */
    suspend fun clearTombstones(liked: Set<String>, disliked: Set<String>)
}

/**
 * Android ⇄ /api/sync (web parity: favorites, dislikes and history follow the
 * account across devices). Previously Android kept them local-only.
 *
 * Cycle: GET → merge (SyncMerge, shared rules) → add server-only items locally
 * → POST only the managed keys that changed. Never pushes without a successful
 * pull in the same cycle (the server is per-key last-write-wins). Playlists and
 * settings are NOT pushed (Android uses /api/playlists directly; settings are
 * platform-specific).
 */
class SyncRepository(
    private val api: MqApi,
    private val local: SyncLocal,
    private val scope: CoroutineScope,
    private val json: Json,
    private val sleep: suspend (Long) -> Unit = { delay(it) },
    private val debounceMs: Long = 5_000,
) {
    sealed interface Result {
        data class Ok(val pushedKeys: Set<String>) : Result
        data object SkippedDemo : Result
        data object Unauthorized : Result
        data class Failed(val reason: String) : Result
    }

    private val mutex = Mutex()
    private var debounceJob: Job? = null

    /** Debounced trigger (web scheduleSyncToServer parity: 5 s after the last change). */
    fun requestSync() {
        debounceJob?.cancel()
        debounceJob = scope.launch {
            delay(debounceMs)
            runCatching { syncNow() }
        }
    }

    suspend fun syncNow(maxAttempts: Int = 3): Result = mutex.withLock {
        var attempt = 0
        var last: Result = Result.Failed("not started")
        while (attempt < maxAttempts) {
            attempt++
            last = try {
                syncOnce()
            } catch (e: IOException) {
                Result.Failed("io: ${e.message}")
            } catch (e: kotlinx.serialization.SerializationException) {
                return@withLock Result.Failed("bad payload: ${e.message}") // not retryable
            }
            val retryable = last is Result.Failed && (last as Result.Failed).reason.let { it.startsWith("io") || it.startsWith("http 5") }
            if (!retryable) return@withLock last
            if (attempt < maxAttempts) sleep(1000L shl (attempt - 1)) // 1 s, 2 s, 4 s…
        }
        last
    }

    private suspend fun syncOnce(): Result {
        val state = local.syncState()
        if (state.userId == null || state.userId == DEMO_USER_ID) return Result.SkippedDemo

        val get = api.syncGet()
        if (get.code() == 401 || get.code() == 403) return Result.Unauthorized
        if (!get.isSuccessful) return Result.Failed("http ${get.code()}")
        val data = (get.body()?.get("data") as? JsonObject) ?: JsonObject(emptyMap())
        fun arr(k: String): List<JsonElement> = (data[k] as? JsonArray)?.toList() ?: emptyList()

        val enc = { t: Track -> json.encodeToJsonElement(Track.serializer(), t) }
        val localLiked = state.favorites.map(enc)
        val localDisliked = state.disliked.map(enc)
        val localHistory = state.history.mapIndexed { i, t ->
            buildJsonObject {
                put("track", enc(t))
                put("playedAt", state.historyPlayedAt.getOrElse(i) { 0L })
                put("playCount", 1)
            }
        }

        val likedData = SyncMerge.mergeTracks(localLiked, arr("likedTracksData"), state.removedLiked)
        val dislikedData = SyncMerge.mergeTracks(localDisliked, arr("dislikedTracksData"), state.removedDisliked)
        val likedIds = SyncMerge.mergeIds(arr("likedTracks"), state.favorites.map { it.id }, state.removedLiked)
        val dislikedIds = SyncMerge.mergeIds(arr("dislikedTracks"), state.disliked.map { it.id }, state.removedDisliked)
        val history = SyncMerge.mergeHistory(localHistory, arr("history"), MAX_SERVER_HISTORY)

        // 1) local additions (server-only items)
        val localLikedIds = state.favorites.map { it.id }.toSet()
        val localDislikedIds = state.disliked.map { it.id }.toSet()
        val localHistoryIds = state.history.map { it.id }.toSet()
        local.applyServerAdditions(
            liked = likedData.filter { SyncMerge.trackId(it) !in localLikedIds }.mapNotNull(::decodeTrack),
            disliked = dislikedData.filter { SyncMerge.trackId(it) !in localDislikedIds }.mapNotNull(::decodeTrack),
            history = history.mapNotNull { e ->
                val o = e as? JsonObject ?: return@mapNotNull null
                val t = decodeTrack(o["track"]) ?: return@mapNotNull null
                if (t.id in localHistoryIds) return@mapNotNull null
                t to ((o["playedAt"] as? JsonPrimitive)?.content?.toDoubleOrNull()?.toLong() ?: 0L)
            },
        )

        // 2) push only managed keys whose merged value differs from the server copy
        val merged = mapOf(
            "likedTracks" to JsonArray(likedIds.map(::JsonPrimitive)),
            "dislikedTracks" to JsonArray(dislikedIds.map(::JsonPrimitive)),
            "likedTracksData" to JsonArray(likedData),
            "dislikedTracksData" to JsonArray(dislikedData),
            "history" to JsonArray(history),
        )
        // Compare by identity (ids / order), not by bytes: Android re-encodes
        // tracks slightly differently (e.g. 215.0 vs 215, omitted defaults),
        // which must not cause a push on every cycle.
        val changed = merged.filter { (k, v) -> identity(k, data[k]) != identity(k, v) }
        if (changed.isNotEmpty()) {
            val post = api.syncPost(buildJsonObject { put("data", JsonObject(changed)) })
            if (post.code() == 401 || post.code() == 403) return Result.Unauthorized
            if (!post.isSuccessful) return Result.Failed("http ${post.code()}")
        }
        local.clearTombstones(state.removedLiked, state.removedDisliked)
        return Result.Ok(changed.keys)
    }

    private fun identity(key: String, v: JsonElement?): List<String?> {
        val a = (v as? JsonArray) ?: return listOf("<absent>")
        return when (key) {
            "likedTracks", "dislikedTracks" -> a.map { (it as? JsonPrimitive)?.content }
            "history" -> a.map { SyncMerge.trackId((it as? JsonObject)?.get("track")) }
            else -> a.map { SyncMerge.trackId(it) }
        }
    }

    private fun decodeTrack(e: JsonElement?): Track? =
        e?.let { runCatching { json.decodeFromJsonElement(Track.serializer(), it) }.getOrNull() }
            ?.takeIf { it.id.isNotEmpty() }

    companion object {
        const val DEMO_USER_ID = "demo-user-id"
        /** web MAX_HISTORY_ENTRIES — the server copy keeps the web cap, Android displays its own 200. */
        const val MAX_SERVER_HISTORY = 1000
        val MANAGED_KEYS = setOf("history", "likedTracks", "dislikedTracks", "likedTracksData", "dislikedTracksData")
    }
}
