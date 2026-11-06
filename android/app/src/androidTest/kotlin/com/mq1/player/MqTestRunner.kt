package com.mq1.player

import android.os.Bundle
import androidx.test.runner.AndroidJUnitRunner
import com.mq1.player.data.MqEnv

/**
 * Default instrumentation runner (see `testInstrumentationRunner` in
 * app/build.gradle.kts). `onCreate` runs BEFORE the Application is created,
 * so ServiceLocator's lazy Retrofit/OkHttp already see the test environment:
 * instrumentation tests never use production unless someone deliberately
 * replaces this runner.
 */
class MqTestRunner : AndroidJUnitRunner() {
    override fun onCreate(arguments: Bundle?) {
        System.setProperty(MqEnv.PROP_TEST_ENV, "true")
        val base = arguments?.getString("mqApiBase")?.takeIf { it.isNotBlank() } ?: MqEnv.DEFAULT_TEST_API_BASE
        System.setProperty(MqEnv.PROP_API_BASE, base)
        super.onCreate(arguments)
    }
}
