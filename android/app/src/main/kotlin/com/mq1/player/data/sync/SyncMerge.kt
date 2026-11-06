package com.mq1.player.data.sync

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Kotlin twin of src/lib/sync/merge.ts — same golden cases
 * (shared/test-fixtures/sync-merge.cases.json, SyncMergeContractTest).
 *
 * Works on raw JSON elements so server items are pushed back VERBATIM: fields
 * the Android model does not know (playlists' extras, future Track fields,
 * web playCount) survive an Android sync.
 */
object SyncMerge {

    fun trackId(t: JsonElement?): String? =
        ((t as? JsonObject)?.get("id") as? JsonPrimitive)?.takeIf { it.isString && it.content.isNotEmpty() }?.content

    private fun historyTrackId(e: JsonElement?): String? = trackId((e as? JsonObject)?.get("track"))

    fun mergeIds(server: List<JsonElement>, local: List<String>, localRemoved: Set<String> = emptySet()): List<String> {
        val serverIds = server.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString && p.content.isNotEmpty() }?.content }
        return LinkedHashSet(serverIds + local).filter { it !in localRemoved || it in local }
    }

    fun mergeTracks(local: List<JsonElement>, server: List<JsonElement>, localRemoved: Set<String> = emptySet()): List<JsonElement> {
        val ids = local.mapNotNull(::trackId).toMutableSet()
        val out = local.toMutableList()
        for (t in server) {
            val id = trackId(t) ?: continue
            if (id in ids || id in localRemoved) continue
            ids += id
            out += t
        }
        return out
    }

    fun mergeHistory(local: List<JsonElement>, server: List<JsonElement>, max: Int): List<JsonElement> {
        val localIds = local.mapNotNull(::historyTrackId).toSet()
        val seen = HashSet<String>()
        val fromServer = server.filter { e ->
            val id = historyTrackId(e) ?: return@filter false
            id !in localIds && seen.add(id)
        }
        return (fromServer + local).take(max)
    }
}
