package com.mq1.player.contracts

import com.mq1.player.data.api.Track
import com.mq1.player.data.contracts.ContractValidator
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.serializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Runs the SAME fixtures as src/__tests__/contracts/track-contract.test.ts
 * (shared/test-fixtures/track.cases.json) against the Kotlin validator and the
 * Android Track model.
 */
class TrackContractTest {

    private fun resource(path: String): String =
        requireNotNull(javaClass.classLoader!!.getResource(path)) { "missing test resource $path (shared/ srcDir)" }
            .readText()

    private val contract = ContractValidator.fromJson(resource("contracts/track.contract.json"))
    private val fixtures = Json.parseToJsonElement(resource("test-fixtures/track.cases.json")).jsonObject
    private val cases = fixtures.getValue("cases").jsonArray.map { it.jsonObject }

    // Same config as ServiceLocator.json (network) — unknown keys ignored, nulls omitted.
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    // The network Json omits default-valued fields on encode (encodeDefaults = false);
    // receivers fill them back from the contract defaults (web: parseTrack). To
    // compare the full normalized form we encode with defaults.
    private val jsonWithDefaults = Json(json) { encodeDefaults = true }

    private fun strings(o: JsonObject, key: String) = o.getValue(key).jsonArray.map { it.jsonPrimitive.content }.sorted()

    @Test
    fun fixturesTargetCurrentContractVersion() {
        assertEquals("track", fixtures.getValue("contract").jsonPrimitive.content)
        assertEquals(contract.version, fixtures.getValue("contractVersion").jsonPrimitive.int)
    }

    @Test
    fun kotlinTrackModelListsExactlyTheContractFields() {
        val descriptor = serializer<Track>().descriptor
        val modelFields = (0 until descriptor.elementsCount).map { descriptor.getElementName(it) }.toSet()
        assertEquals(contract.fieldNames, modelFields)
    }

    @Test
    fun validatorMatchesSharedFixtures() {
        assertTrue(cases.size >= 10)
        for (c in cases) {
            val id = c.getValue("id").jsonPrimitive.content
            val input = c["input"]
            val expected = c.getValue("expected").jsonObject
            val res = contract.validate(input)
            assertEquals("$id valid", expected.getValue("valid").jsonPrimitive.content.toBoolean(), res.valid)
            assertEquals("$id errors", strings(expected, "errors"), res.errors.sorted())
            assertEquals("$id warnings", strings(expected, "warnings"), res.warnings.sorted())
        }
    }

    @Test
    fun validCasesDecodeToNormalizedFormAndRoundTrip() {
        for (c in cases) {
            val expected = c.getValue("expected").jsonObject
            val normalized = expected["normalized"]?.jsonObject ?: continue
            val id = c.getValue("id").jsonPrimitive.content
            val track = json.decodeFromJsonElement(Track.serializer(), c.getValue("input"))
            val encoded = json.parseToJsonElement(jsonWithDefaults.encodeToString(track)).jsonObject
            // Every contract field present in the normalized form survives decode → encode.
            for ((k, v) in normalized) {
                if (k !in contract.fieldNames) continue // unknown fields: Android ignores them by design
                assertJsonEquals("$id.$k", v, encoded[k] ?: JsonNull)
            }
            // Model-level round trip is lossless.
            assertEquals(id, track, json.decodeFromString(Track.serializer(), json.encodeToString(track)))
        }
    }

    private fun assertJsonEquals(msg: String, expected: JsonElement, actual: JsonElement) {
        if (expected is JsonPrimitive && actual is JsonPrimitive && !expected.isString && !actual.isString &&
            expected.doubleOrNull != null) {
            assertEquals(msg, expected.doubleOrNull!!, actual.doubleOrNull ?: Double.NaN, 1e-9)
        } else {
            assertEquals(msg, expected, actual)
        }
    }
}
