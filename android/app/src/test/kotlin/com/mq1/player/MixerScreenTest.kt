package com.mq1.player

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import com.mq1.player.dsp.MeterSnapshot
import com.mq1.player.dsp.MixerParams
import com.mq1.player.ui.screens.MixerScreen
import com.mq1.player.ui.theme.mqColorScheme

/**
 * F10 MIXER UI REGRESSION — real Compose layout on JVM via Robolectric.
 *
 * Invariants:
 *   M1 meters panel renders all real-measurement rows (silence = honest floor)
 *   M2 master section renders with the dB slider semantics
 *   M3 EQ enabled → 10 faders render, each with a FULL-SIZE touch target
 *   M4 presets render with web-parity names
 *   M5 limiter enabled → threshold + release controls render
 *   M6 header actions (back / reset) are touch-sized
 *   M7 bypass state label reflects the engine params
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp")
class MixerScreenTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val mixer by lazy {
        com.mq1.player.di.ServiceLocator.mixerEngine
    }

    @Before
    fun initEngine() {
        com.mq1.player.di.ServiceLocator.init(
            compose.activity.applicationContext
        )
        // deterministic start state
        mixer.update { MixerParams() }
    }

    @Composable
    private fun Host() {
        MaterialTheme(colorScheme = mqColorScheme("default", "dark")) {
            Surface {
                Column(Modifier.width(360.dp)) {
                    MixerScreen(onBack = {})
                }
            }
        }
    }

    @Test
    fun `M1 meters panel shows all measurement rows`() {
        compose.setContent { Host() }
        compose.waitForIdle()

        compose.onNodeWithText("Измерения").assertExists()
        compose.onNodeWithText("тишина").assertExists() // no audio → honest floor
        compose.onNodeWithText("Пик").assertExists()
        compose.onNodeWithText("Истинный пик").assertExists()
        compose.onNodeWithText("LUFS (мгнов.)").assertExists()
        compose.onNodeWithText("LUFS (3 с)").assertExists()
        compose.onNodeWithText("Снижение усиления").assertExists()
    }

    @Test
    fun `M2 master section renders`() {
        compose.setContent { Host() }
        compose.waitForIdle()
        compose.onNodeWithText("Мастер").assertExists()
        compose.onNodeWithContentDescription("Общая громкость, децибелы").assertExists()
        compose.onNodeWithText("-30 dB").assertExists()
        compose.onNodeWithText("+6 dB").assertExists()
    }

    @Test
    fun `M3 EQ faders render with full-size touch targets`() {
        compose.setContent { Host() }
        compose.waitForIdle()

        // enable EQ through the engine (the switch is a standard M3 control)
        compose.runOnUiThread { mixer.setEqEnabled(true) }
        compose.waitForIdle()

        val density = compose.density
        val minTarget = with(density) { 44.dp.toPx() } - with(density) { 4.dp.toPx() }

        val faders = listOf("Саб", "Бас", "Низ. сред.", "Ср-низ.", "Средн.",
            "Ср-выс.", "Присут. Н", "Присут.", "Блеск", "Воздух")
        faders.forEach { band ->
            val node = compose.onNodeWithContentDescription(
                "Полоса $band, 0. Двойное нажатие — сброс.", useUnmergedTree = true
            ).fetchSemanticsNode()
            assertTrue(
                "fader $band too small: ${node.size.width}x${node.size.height}",
                node.size.width >= minTarget && node.size.height >= minTarget
            )
        }
    }

    @Test
    fun `M4 presets render with web-parity names`() {
        compose.setContent { Host() }
        compose.waitForIdle()
        compose.runOnUiThread { mixer.setEqEnabled(true) }
        compose.waitForIdle()

        // scroll to the preset row (it sits below the faders)
        compose.onRoot().performTouchInput { swipeUp() }
        compose.waitForIdle()

        compose.onNodeWithText("Плоская").assertExists()
        val presets = compose.onAllNodesWithText("Бас +").fetchSemanticsNodes()
        assertTrue(presets.isNotEmpty())
    }

    @Test
    fun `M5 limiter controls render when enabled`() {
        compose.setContent { Host() }
        compose.waitForIdle()
        compose.runOnUiThread { mixer.setLimiterEnabled(true) }
        compose.waitForIdle()

        // the limiter section sits below the EQ block — scroll like a user
        compose.onRoot().performTouchInput { swipeUp() }
        compose.waitForIdle()
        compose.onRoot().performTouchInput { swipeUp() }
        compose.waitForIdle()

        compose.onNodeWithText("ЛИМИТЕР").assertExists()
        compose.onNodeWithContentDescription("Порог лимитера, децибелы").assertExists()
        compose.onNodeWithContentDescription("Время восстановления лимитера").assertExists()
        compose.onNodeWithText("Восстановление").assertExists()
    }

    @Test
    fun `M6 header actions are touch-sized`() {
        compose.setContent { Host() }
        compose.waitForIdle()
        val density = compose.density
        val minTarget = with(density) { 40.dp.toPx() }

        val back = compose.onNodeWithContentDescription("Назад").fetchSemanticsNode()
        assertTrue(back.size.width >= minTarget && back.size.height >= minTarget)
        val reset = compose.onNodeWithContentDescription("Сбросить микшер").fetchSemanticsNode()
        assertTrue(reset.size.width >= minTarget && reset.size.height >= minTarget)
    }

    @Test
    fun `M7 bypass state reflects engine params`() {
        compose.setContent { Host() }
        compose.waitForIdle()
        compose.onNodeWithText("Обход").assertExists() // default bypass = true

        compose.runOnUiThread { mixer.setBypass(false) }
        compose.waitForIdle()
        compose.onNodeWithText("Активно").assertExists()
    }
}
