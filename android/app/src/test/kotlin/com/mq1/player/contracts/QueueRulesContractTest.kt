package com.mq1.player.contracts

import com.mq1.player.player.QueueRules
import com.mq1.player.player.QueueRules.PreviousAction
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

/** Same golden cases as src/__tests__/contracts/queue-rules.test.ts. */
class QueueRulesContractTest {
    private val fixtures = Json.parseToJsonElement(
        requireNotNull(javaClass.classLoader!!.getResource("test-fixtures/queue.cases.json")).readText()
    ).jsonObject

    private fun JsonObject.i(k: String) = getValue(k).jsonPrimitive.int
    private fun JsonObject.s(k: String) = getValue(k).jsonPrimitive.content
    private fun JsonObject.strs(k: String) = getValue(k).jsonArray.map { it.jsonPrimitive.content }
    private fun JsonObject.ints(k: String) = getValue(k).jsonArray.map { it.jsonPrimitive.int }.toSet()
    private fun rep(a: JsonObject) = QueueRules.repeatFromWeb(a.s("repeat"))
    private fun num(v: Int?): JsonElement = v?.let { JsonPrimitive(it) } ?: JsonNull
    private fun arr(l: List<String>) = JsonArray(l.map { JsonPrimitive(it) })

    private fun run(fn: String, a: JsonObject): JsonElement = when (fn) {
        "nextIndex" -> a.ints("broken").let { b -> num(QueueRules.nextIndex(a.i("length"), a.i("index"), rep(a)) { it in b }) }
        "autoAdvanceIndex" -> a.ints("broken").let { b -> num(QueueRules.autoAdvanceIndex(a.i("length"), a.i("index"), rep(a)) { it in b }) }
        "previousAction" -> when (val r = QueueRules.previousAction(a.i("length"), a.i("index"), rep(a), a.getValue("progressSec").jsonPrimitive.double)) {
            PreviousAction.Restart -> buildJsonObject { put("type", "restart") }
            is PreviousAction.Go -> buildJsonObject { put("type", "go"); put("index", r.index) }
        }
        "playNextInsertIndex" -> num(QueueRules.playNextInsertIndex(a.i("currentIndex"), a.i("pending")))
        "pendingAfterTransition" -> num(QueueRules.pendingAfterTransition(a.i("pending"), a.i("oldIndex"), a.i("newIndex")))
        "consumeUpNext" -> {
            val broken = a.strs("broken").toSet()
            QueueRules.consumeUpNext(a.strs("queue"), a.i("index"), a.strs("upNext")) { it in broken }?.let {
                buildJsonObject { put("queue", arr(it.queue)); put("index", it.index); put("upNext", arr(it.upNext)); put("track", it.track) }
            } ?: JsonNull
        }
        "indexAfterMove" -> num(QueueRules.indexAfterMove(a.i("from"), a.i("to"), a.i("current")))
        "indexAfterRemove" -> num(QueueRules.indexAfterRemove(a.i("removed"), a.i("current"), a.i("length")))
        "persistWindow" -> QueueRules.persistWindow(a.strs("queue"), a.i("index"), a.i("max")).let {
            buildJsonObject { put("queue", arr(it.queue)); put("index", it.index) }
        }
        "restoreIndex" -> num(QueueRules.restoreIndex(a.strs("ids"), a.i("index"), a["currentId"]?.jsonPrimitive?.contentOrNull))
        "repeatToMedia3" -> num(QueueRules.repeatToMedia3(QueueRules.repeatFromWeb(a.s("mode"))))
        "repeatFromMedia3" -> JsonPrimitive(QueueRules.repeatToWeb(QueueRules.repeatFromMedia3(a.i("mode"))))
        else -> error("fixture function $fn not implemented on Android")
    }

    @Test
    fun allSharedQueueCasesPass() {
        val cases = fixtures.getValue("cases").jsonArray.map { it.jsonObject }
        check(cases.size >= 40)
        for (c in cases) {
            val actual = run(c.s("fn"), c.getValue("input").jsonObject)
            assertEquals(c.s("id"), c.getValue("expected"), actual)
        }
    }
}
