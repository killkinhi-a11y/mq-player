package com.mq1.player

import androidx.test.core.app.ApplicationProvider
import com.mq1.player.data.MqEnv
import com.mq1.player.data.MqUrls
import com.mq1.player.data.ProductionAccessBlocked
import com.mq1.player.di.ServiceLocator
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Stage V / task G — a test run can never reach production.
 * Runs on every `testDebugUnitTest` / `testReleaseUnitTest` with NO extra flags.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TestEnvironmentIsolationTest {

    @Test
    fun `gradle marks every unit test JVM as a test environment`() {
        assertTrue("mq.testEnv must be set by app/build.gradle.kts", MqEnv.isTestEnvironment)
    }

    @Test
    fun `effective API base in tests is not production`() {
        val base = MqEnv.apiBase
        assertFalse("tests resolved production base: $base", MqEnv.isProductionUrl(base))
    }

    @Test
    fun `relative artwork URLs resolve against the test base, not production`() {
        val url = MqUrls.absolute("/api/music/soundcloud/image-proxy?url=x")!!
        assertFalse(url, MqEnv.isProductionUrl(url))
    }

    @Test
    fun `a production override in test env fails fast`() {
        try {
            MqEnv.resolveApiBase(testEnv = true, override = "https://mq1.vercel.app", buildConfigBase = "x")
            fail("production base must be rejected in tests")
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.contains("production"))
        }
        // sub-domains are production too
        assertTrue(MqEnv.isProductionUrl("https://preview.mq1.vercel.app/api"))
        assertFalse(MqEnv.isProductionUrl("http://127.0.0.1:8717"))
        assertFalse(MqEnv.isProductionUrl("https://mq1.vercel.app.evil.test/"))
    }

    @Test
    fun `outside tests the build config base is used unchanged`() {
        assertEquals(
            "https://mq1.vercel.app",
            MqEnv.resolveApiBase(testEnv = false, override = "http://ignored", buildConfigBase = "https://mq1.vercel.app"),
        )
    }

    @Test
    fun `the real app HTTP client blocks production hosts before any socket opens`() {
        ServiceLocator.init(ApplicationProvider.getApplicationContext())
        val call = ServiceLocator.okHttp.newCall(
            Request.Builder().url("https://mq1.vercel.app/api/auth/me").build()
        )
        try {
            call.execute().close()
            fail("request to production must be blocked in tests")
        } catch (e: ProductionAccessBlocked) {
            assertTrue(e.message!!.contains("mq1.vercel.app"))
        }
    }

    @Test
    fun `gradle and kotlin agree on the production constant`() {
        assertEquals(MqEnv.PRODUCTION_API_BASE, BuildConfig.PRODUCTION_API_BASE)
    }
}
