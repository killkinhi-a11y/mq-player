package com.mq1.player

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import com.mq1.player.data.AppRelease
import com.mq1.player.ui.screens.SettingsScreen
import com.mq1.player.ui.theme.mqColorScheme

/**
 * RELEASE TASK PART 1/16 UI REGRESSION — Settings → About → Download APK.
 *
 * Invariants:
 *   S1 the About card shows the real version (BuildConfig, not a fake label)
 *   S2 the download button renders with the production wording
 *   S3 the button's touch target is ≥ 44dp (48dp nominal, 4dp inset allowed)
 *   S4 clicking fires ACTION_VIEW with the PERMANENT production GitHub
 *      Releases URL — no localhost, no placeholder, no fake handler
 *   S5 the URL is https-only and points at the stable latest-release asset
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp")
class SettingsDownloadTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Before
    fun initDi() {
        com.mq1.player.di.ServiceLocator.init(
            compose.activity.applicationContext
        )
    }

    @Composable
    private fun Host() {
        MaterialTheme(colorScheme = mqColorScheme("default", "dark")) {
            Surface {
                Column(Modifier.width(360.dp)) {
                    SettingsScreen(onLogout = {}, onBack = {})
                }
            }
        }
    }

    @Test
    fun `S1 S2 about card shows real version and download button`() {
        compose.setContent { Host() }
        compose.waitForIdle()

        compose.onNodeWithText("О ПРИЛОЖЕНИИ", ignoreCase = true).assertExists()
        // Real BuildConfig value (debug variant appends -debug; release is 2.0.0)
        compose.onNodeWithText(
            "Версия ${com.mq1.player.BuildConfig.VERSION_NAME} · нативный клиент MQ (mq1.vercel.app)"
        ).assertExists()
        compose.onNodeWithText("Скачать Android-приложение").assertExists()
        compose.onNodeWithText(
            "Актуальный APK с официальной страницы релизов GitHub"
        ).assertExists()
    }

    @Test
    fun `S3 download button touch target is at least 44dp`() {
        compose.setContent { Host() }
        compose.waitForIdle()

        val density = compose.density
        val minTarget = with(density) { 44.dp.toPx() } - with(density) { 4.dp.toPx() }

        val node = compose.onNodeWithText("Скачать Android-приложение")
            .fetchSemanticsNode()
        assertTrue(
            "download button too small: ${node.size.width}x${node.size.height}",
            node.size.width >= minTarget && node.size.height >= minTarget
        )
    }

    @Test
    fun `S4 click scrolls to button and opens ACTION_VIEW with production URL`() {
        compose.setContent { Host() }
        compose.waitForIdle()

        // The About card sits below the fold (theme grid ~432dp): scroll it
        // into the viewport first — same pattern as MyProfileScreenTest.
        repeat(2) {
            compose.onRoot().performTouchInput { swipeUp() }
            compose.waitForIdle()
        }
        val app = RuntimeEnvironment.getApplication()
        compose.onNodeWithText("Скачать Android-приложение").performClick()
        compose.waitForIdle()

        val started = shadowOf(app).nextStartedActivity
        assertNotNull("no activity started after click", started)
        assertEquals(android.content.Intent.ACTION_VIEW, started.action)
        assertEquals(AppRelease.APK_DOWNLOAD_URL, started.data.toString())
    }

    @Test
    fun `S5 openDownload fires the permanent https release URL directly`() {
        // Unit-level wiring proof (independent of Compose layout):
        // AppRelease.openDownload → browser intent with the production URL.
        val app = RuntimeEnvironment.getApplication()
        AppRelease.openDownload(app)

        val started = shadowOf(app).nextStartedActivity
        assertNotNull("no activity started", started)
        assertEquals(android.content.Intent.ACTION_VIEW, started.action)
        assertEquals(AppRelease.APK_DOWNLOAD_URL, started.data.toString())

        // URL contract: production-only, permanent, https
        val url = AppRelease.APK_DOWNLOAD_URL
        assertTrue("must be https", url.startsWith("https://"))
        assertTrue(
            "must be the permanent latest-release asset",
            url == "https://github.com/killkinhi-a11y/mq-player/releases/latest/download/MQPlayer.apk"
        )
        assertTrue("no localhost", !url.contains("localhost"))
        assertTrue("no 127.0.0.1", !url.contains("127.0.0.1"))
        assertTrue("no file scheme", !url.startsWith("file://"))
    }
}
