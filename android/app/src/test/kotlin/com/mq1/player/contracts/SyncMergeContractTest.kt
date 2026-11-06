package com.mq1.player.contracts

import com.mq1.player.data.sync.SyncMerge
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** Same golden cases as src/__tests__/contracts/sync-merge.test.ts. */
class SyncMergeContractTest {
    private val cases = Json.parseToJsonElement(
        requireNotNull(javaClass.classLoader!!.getResource("test-fixtures/sync-merge.cases.json")).readText()
    ).jsonObject.getValue("cases").jsonArray.map { it.jsonObject }

    private fun JsonObject.list(k: String) = getValue(k).jsonArray.toList()
    private fun JsonObject.strs(k: String) = getValue(k).jsonArray.map { it.jsonPrimitive.content }

    private fun run(fn: String, a: JsonObject): JsonElement = when (fn) {
        "mergeIds" -> JsonArray(SyncMerge.mergeIds(a.list("server"), a.strs("local"), a.strs("localRemoved").toSet()).map(::JsonPrimitive))
        "mergeTracks" -> JsonArray(SyncMerge.mergeTracks(a.list("local"), a.list("server"), a.strs("localRemoved").toSet()))
        "mergeHistory" -> JsonArray(SyncMerge.mergeHistory(a.list("local"), a.list("server"), a.getValue("max").jsonPrimitive.int))
        else -> error("fixture function $fn not implemented on Android")
    }

    @Test
    fun allSharedSyncMergeCasesPass() {
        check(cases.size >= 10)
        for (c in cases) {
            assertEquals(c.getValue("id").jsonPrimitive.content, c.getValue("expected"),
                run(c.getValue("fn").jsonPrimitive.content, c.getValue("input").jsonObject))
        }
    }
}
