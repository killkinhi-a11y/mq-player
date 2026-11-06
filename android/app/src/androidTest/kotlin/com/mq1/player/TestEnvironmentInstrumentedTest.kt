package com.mq1.player

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.mq1.player.data.MqEnv
import com.mq1.player.data.ProductionAccessBlocked
import com.mq1.player.di.ServiceLocator
import okhttp3.Request
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith

/** On-device counterpart of TestEnvironmentIsolationTest (needs an emulator/device). */
@RunWith(AndroidJUnit4::class)
class TestEnvironmentInstrumentedTest {
    @Test
    fun runnerMarksTestEnvironmentAndAvoidsProduction() {
        assertTrue(MqEnv.isTestEnvironment)
        assertFalse(MqEnv.isProductionUrl(MqEnv.apiBase))
    }

    @Test
    fun productionRequestsAreBlocked() {
        try {
            ServiceLocator.okHttp.newCall(Request.Builder().url("https://mq1.vercel.app/api/auth/me").build())
                .execute().close()
            fail("must be blocked")
        } catch (_: ProductionAccessBlocked) {
        }
    }
}
