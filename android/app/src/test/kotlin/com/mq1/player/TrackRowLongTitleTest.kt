package com.mq1.player

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import com.mq1.player.data.api.Track
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.theme.mqColorScheme

/**
 * LONG-TITLE AUTOMATED UI REGRESSION (P20.6) — real Compose layout on JVM
 * via Robolectric. Full matrix: 50 / 100 / 147 / 300 chars, no-space, RTL,
 * emoji, unicode, long-artist.
 *
 * Invariants verified per case:
 *   I1 row renders (semantics present)
 *   I2 row width == constrained width exactly (no horizontal overflow)
 *   I3 row height is CONSTANT across the whole matrix (no wrap/explosion)
 *   I4 favorite action visible and inside parent bounds (clickable)
 *   I5 menu action visible and inside parent bounds (clickable)
 *   I6 fixed-size artwork — implied by I3 (height band driven by 48dp art)
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp")
class TrackRowLongTitleTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val rowWidth: Dp = 360.dp

    private fun track(title: String, artist: String) = Track(
        id = "t-${title.length}", title = title, artist = artist,
        duration = 195.0, cover = "", scTrackId = title.length.toLong()
    )

    val longArtist = "Very Extremely Long Artist Name That Breaks Layouts " + "A".repeat(80)

    private val cases: List<Pair<String, Track>> = listOf(
        "50-chars" to track("А".repeat(50), "Artist"),
        "100-chars" to track("В".repeat(100), "Исполнитель с длинным именем " + "И".repeat(40)),
        "147-chars" to track("Вы".repeat(73) + "й", "Artist"),
        "300-chars" to track("Очень длинное название трека которое ломало вёрстку ".repeat(5).trim(), "Artist"),
        "no-space" to track("С".repeat(200), "Artist"),
        "rtl" to track("שלום עולם " + "ש".repeat(90) + " مرحبا بالعالم", "אמן לדוגמה"),
        "emoji" to track("🎧🎶🎵 Музыка века " + "🔥".repeat(60), "DJ 🎧"),
        "unicode" to track("Ω≈ç√∫˜µ≤≥÷ 日本語テキスト 😀 " + "é".repeat(80), "Zoë Édition"),
        "long-artist" to track(
            "Трек с очень длинным названием исполнителя в обеих строках " + "Х".repeat(120),
            longArtist
        )
    )

    @Test
    fun `matrix - width exact, height constant, actions in bounds`() {
        compose.setContent { MatrixContent() }
        compose.waitForIdle()

        val density = compose.density
        val widthPx = with(density) { rowWidth.toPx() }

        val heights = mutableListOf<Int>()

        cases.forEach { (label, track) ->
            // I1 — row semantics present
            val row = compose.onNodeWithContentDescription("Трек: ${track.title}")
            row.assertExists("row missing: $label")

            val node = row.fetchSemanticsNode()
            // I2 — exact width, no overflow
            assertEquals(
                "row width mismatch for $label",
                widthPx.toInt(),
                node.size.width
            )

            // Height via testTag wrapper — exact layout bounds of the row box
            val boxNode = compose.onNodeWithTag("case-$label").fetchSemanticsNode()
            heights.add(boxNode.size.height)

            // I4/I5 — actions exist and stay inside the parent bounds
            val fav = compose.onNodeWithContentDescription("Нравится: ${track.title}")
            fav.assertExists("favorite missing: $label")
            fav.fetchSemanticsNode().assertRightEdgeWithin(widthPx, label + "/fav")
        }

        // All 9 menu targets exist (one per row) and all fit within the row width
        val menus = compose.onAllNodesWithContentDescription("Меню трека")
        assertEquals("menu button count", cases.size, menus.fetchSemanticsNodes().size)
        menus.fetchSemanticsNodes().forEachIndexed { i, node ->
            node.assertRightEdgeWithin(widthPx, "menu[$i]")
        }

        // I3 — height constant across the entire matrix
        val distinct = heights.distinct()
        assertTrue(
            "row height varies across matrix (long-title wrap!): $distinct",
            distinct.size == 1
        )
        // I6 — height in the fixed band (48dp artwork + padding)
        val h = heights.first()
        val hDp = with(density) { h.dp }
        assertTrue("row height out of band: $hDp", hDp >= 52.dp && hDp <= 96.dp)
    }

    @Test
    fun `favorite and menu actions are clickable sized targets`() {
        compose.setContent { MatrixContent() }
        compose.waitForIdle()
        val density = compose.density
        val minTarget = with(density) { 40.dp.toPx() } // icon buttons are 44dp with icon inset

        cases.forEach { (label, track) ->
            val fav = compose.onNodeWithContentDescription("Нравится: ${track.title}")
                .fetchSemanticsNode()
            assertTrue(
                "favorite target too small for $label: ${fav.size.width}x${fav.size.height}",
                fav.size.width >= minTarget && fav.size.height >= minTarget
            )
        }
        val menus = compose.onAllNodesWithContentDescription("Меню трека")
            .fetchSemanticsNodes()
        assertEquals("menu count", cases.size, menus.size)
        menus.forEachIndexed { i, node ->
            assertTrue(
                "menu target too small for menu[$i]: ${node.size.width}x${node.size.height}",
                node.size.width >= minTarget && node.size.height >= minTarget
            )
        }
    }

    @Composable
    private fun MatrixContent() {
        MaterialTheme(colorScheme = mqColorScheme("default", "dark")) {
            Surface {
                // Scrollable like production screens (LazyColumn) — children
                // get unbounded height constraints, matching real usage.
                Column(
                    Modifier
                        .width(rowWidth)
                        .verticalScroll(rememberScrollState())
                ) {
                    cases.forEach { (label, track) ->
                        Box(Modifier.width(rowWidth).testTag("case-$label")) {
                            TrackRow(
                                track = track,
                                isPlaying = false,
                                isFavorite = true,
                                onPlay = {},
                                onFavorite = {},
                                onMenu = {}
                            )
                        }
                    }
                }
            }
        }
    }

    private fun androidx.compose.ui.semantics.SemanticsNode.assertRightEdgeWithin(
        parentWidthPx: Float,
        label: String
    ) {
        val right = positionInRoot.x + size.width
        assertTrue(
            "$label out of bounds: x=${positionInRoot.x} right=$right parentW=$parentWidthPx",
            positionInRoot.x >= 0f && right <= parentWidthPx + 1f
        )
    }
}
