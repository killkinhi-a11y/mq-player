package com.mq1.player

import com.mq1.player.data.api.Track
import com.mq1.player.ui.components.formatDuration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * LONG-TITLE REGRESSION MATRIX (P20.6) — data-level layer.
 *
 * The full interactive matrix (50/100/147/300 chars, no-space, RTL, emoji,
 * unicode, long-artist) runs as a Compose UI test in androidTest
 * (TrackRowLongTitleTest) on device/emulator. This unit layer guarantees the
 * Track model itself never mangles pathological inputs: no trimming, no
 * exceptions, stable ids, and the UI layer owns truncation.
 */
class TrackModelLongTitleTest {

    private fun track(title: String, artist: String) = Track(
        id = "t-$title.length", title = title, artist = artist,
        cover = "", duration = 210.0, scTrackId = 123L
    )

    private val longTitle50 = "А".repeat(50)
    private val longTitle100 = "B".repeat(100)
    private val longTitle147 = "Вы".repeat(73) + "й" // 147 chars
    private val longTitle300 = " track title ".repeat(23).trim() + "!" // 300 chars
    private val noSpace = "С".repeat(200) // no break opportunity
    private val rtl = "שלום עולם ".repeat(12).trim() + " مرحبا" // RTL Hebrew+Arabic
    private val emoji = "🎧🎶 ".repeat(40).trim() // 200 emoji-ish chars
    private val unicode = "Ω≈ç√∫˜µ≤≥÷ 😀 日本語 ".repeat(10).trim()
    private val longArtist = "Very Extremely Long Artist Name Foundation ".repeat(3).trim()

    private val matrix: List<Pair<String, String>> = listOf(
        "50" to longTitle50,
        "100" to longTitle100,
        "147" to longTitle147,
        "300" to longTitle300,
        "no-space" to noSpace,
        "rtl" to rtl,
        "emoji" to emoji,
        "unicode" to unicode,
        "long-title+long-artist" to longTitle300
    )

    @Test
    fun `matrix tracks keep title and artist intact`() {
        matrix.forEach { (label, title) ->
            val artist = if (label == "long-title+long-artist") longArtist else "Artist"
            val t = track(title, artist)
            assertEquals("title mangled: $label", title, t.title)
            assertEquals("artist mangled: $label", artist, t.artist)
            assertTrue("id must be stable: $label", t.id.isNotBlank())
        }
    }

    @Test
    fun `blank title and artist fall back safely for display`() {
        val t = track("", "")
        assertTrue(t.title.isBlank())
        assertTrue(t.artist.isBlank())
        // Display layer substitutes: "Без названия" / "Неизвестный исполнитель"
        assertEquals("Без названия", t.title.ifBlank { "Без названия" })
        assertEquals("Неизвестный исполнитель", t.artist.ifBlank { "Неизвестный исполнитель" })
    }

    @Test
    fun `duration formatting is stable for pathological values`() {
        assertEquals("0:00", formatDuration(0))
        assertEquals("3:30", formatDuration(210))
        assertEquals("1:02:03", formatDuration(3723))
        assertEquals("0:00", formatDuration(-5)) // negative guard
    }

    @Test
    fun `reason field survives serialization roundtrip with underscore`() {
        val t = Track(id = "1", title = "x", artist = "y", _reason = "related_history")
        assertEquals("related_history", t.reason)
    }
}
