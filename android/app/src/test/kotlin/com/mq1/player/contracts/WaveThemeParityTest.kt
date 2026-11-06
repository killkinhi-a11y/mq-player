package com.mq1.player.contracts

import androidx.compose.ui.graphics.toArgb
import com.mq1.player.data.api.Track
import com.mq1.player.data.wave.WaveSignalsBuilder
import com.mq1.player.ui.theme.mqThemes
import com.mq1.player.ui.wave.WavePalette
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** Same golden files as src/__tests__/contracts/wave-theme-parity.test.ts. */
class WaveThemeParityTest {
    private fun res(path: String) = Json.parseToJsonElement(
        requireNotNull(javaClass.classLoader!!.getResource(path)) { "missing $path" }.readText()
    ).jsonObject
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    private fun JsonObject.strs(k: String) = (this[k]?.jsonArray ?: emptyList()).map { it.jsonPrimitive.content }
    private fun JsonObject.tracks(k: String) = (this[k]?.jsonArray ?: emptyList()).map { json.decodeFromJsonElement(Track.serializer(), it) }

    @Test
    fun waveSignalsMatchSharedFixtures() {
        val cases = res("test-fixtures/wave-signals.cases.json").getValue("cases").jsonArray.map { it.jsonObject }
        check(cases.size >= 4)
        for (c in cases) {
            val i = c.getValue("input").jsonObject
            val taste = i.getValue("taste").jsonObject
            val mem = i["waveMemory"] as? JsonObject
            fun memVals(k: String) = (mem?.get(k)?.jsonArray ?: emptyList()).map { it.jsonObject.getValue("value").jsonPrimitive.content }
            val input = WaveSignalsBuilder.Input(
                history = i.getValue("history").jsonArray.map { e ->
                    (e.jsonObject["track"]).let { t -> if (t == null || t is JsonNull) null else json.decodeFromJsonElement(Track.serializer(), t) }
                },
                likedTracksData = i.tracks("likedTracksData"),
                dislikedTracksData = i.tracks("dislikedTracksData"),
                dislikedTrackIds = i.strs("dislikedTrackIds"),
                queueIds = i.strs("queueIds"),
                waveQueueIds = i.strs("waveQueueIds"),
                favoriteArtistNames = i.strs("favoriteArtistNames"),
                tasteGenres = taste.strs("topGenres"),
                tasteArtists = taste.strs("topArtists"),
                language = taste["language"]?.jsonPrimitive?.contentOrNull,
                sessionEvents = i.getValue("sessionEvents").jsonArray.map { it.jsonObject },
                recentWaveArtists = memVals("artists"),
                recentWaveGenres = memVals("genres"),
                recentWaveTrackIds = memVals("tracks"),
                seed = i["seed"] as? JsonObject,
                debug = i["debug"]?.jsonPrimitive?.booleanOrNull == true,
            )
            assertEquals(c.getValue("id").jsonPrimitive.content, c.getValue("expected"), WaveSignalsBuilder.build(input))
        }
    }

    @Test
    fun wavePaletteMatchesWebMath() {
        val f = res("test-fixtures/wave-palette.cases.json")
        assertEquals(WavePalette.PALETTE_LERP_MS, f.getValue("paletteLerpMs").jsonPrimitive.int)
        assertEquals(WavePalette.DEFAULT_ANCHOR_HUE, f.getValue("defaultAnchorHue").jsonPrimitive.int)
        for (c in f.getValue("cases").jsonArray.map { it.jsonObject }) {
            val i = c.getValue("input").jsonObject
            val p = when (c.getValue("fn").jsonPrimitive.content) {
                "deriveWavePalette" -> WavePalette.derive(i.getValue("primary").jsonPrimitive.content, i["anchorHueDeg"]?.jsonPrimitive?.doubleOrNull)
                "defaultPaletteForHue" -> WavePalette.forHue(i.getValue("hueDeg").jsonPrimitive.double)
                else -> WavePalette.lerp(WavePalette.DEFAULT, WavePalette.forHue(i.getValue("bHue").jsonPrimitive.double), i.getValue("t").jsonPrimitive.double)
            }
            val expected = c.getValue("expected").jsonObject.mapValues { it.value.jsonPrimitive.content }
            assertEquals(c.getValue("id").jsonPrimitive.content, expected, p.toCss())
        }
    }

    private fun hex8(argb: Int): String {
        val a = (argb ushr 24) and 255; val rgb = argb and 0xFFFFFF
        return "#" + rgb.toString(16).padStart(6, '0') + a.toString(16).padStart(2, '0')
    }

    @Test
    fun androidPalettesEqualSharedThemeTokens() {
        val tokens = res("design/themes.json").getValue("themes").jsonArray.map { it.jsonObject }
        assertEquals(tokens.map { it.getValue("id").jsonPrimitive.content }, mqThemes.map { it.id })
        for ((t, p) in tokens.zip(mqThemes)) {
            val s = { k: String -> t.getValue(k).jsonPrimitive.content }
            val amb = t.getValue("ambient").jsonObject
            val id = p.id
            assertEquals("$id name", s("name"), p.name)
            assertEquals("$id background", s("background"), hex8(p.background.toArgb()))
            assertEquals("$id card", s("card"), hex8(p.surface.toArgb()))
            assertEquals("$id cardHover", s("cardHover"), hex8(p.surfaceHigh.toArgb()))
            assertEquals("$id accent", s("accent"), hex8(p.accent.toArgb()))
            assertEquals("$id text", s("text"), hex8(p.text.toArgb()))
            assertEquals("$id textMuted", s("textMuted"), hex8(p.textMuted.toArgb()))
            assertEquals("$id border", s("border"), hex8(p.outline.toArgb()))
            assertEquals("$id inputBg", s("inputBg"), hex8(p.inputBg.toArgb()))
            assertEquals("$id playerBg", s("playerBg"), hex8(p.playerBg.toArgb()))
            assertEquals("$id navBg", s("navBg"), hex8(p.navBg.toArgb()))
            assertEquals("$id onAccent", s("onAccent"), hex8(p.onAccent.toArgb()))
            assertEquals("$id isDark", t.getValue("isDark").jsonPrimitive.content.toBoolean(), p.isDark)
            assertEquals("$id glass", amb.getValue("glass").jsonPrimitive.content, hex8(p.glass.toArgb()))
            assertEquals("$id platinum", amb.getValue("platinum").jsonPrimitive.content, hex8(p.platinum.toArgb()))
            assertEquals("$id waveBase", amb.getValue("waveBase").jsonPrimitive.content, hex8(p.waveBase.toArgb()))
            assertEquals("$id waveHue", amb.getValue("waveHue").jsonPrimitive.double, p.waveHue.toDouble(), 0.0)
        }
    }
}
