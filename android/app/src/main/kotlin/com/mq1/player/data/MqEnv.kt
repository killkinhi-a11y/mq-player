package com.mq1.player.data

import com.mq1.player.BuildConfig
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/**
 * Runtime environment of the MQ backend endpoint — the ONLY place the app
 * decides which API base it talks to.
 *
 * WHY (Stage V, task G): `BuildConfig.API_BASE` is compiled once per variant
 * and the debug variant is shared by the debug app AND its unit tests, so a
 * plain `./gradlew testDebugUnitTest` (without `-PmqApiBase=…`) used to send
 * real requests to production. Now:
 *
 *  - **release** — `BuildConfig.API_BASE` is pinned to production in Gradle
 *    (see app/build.gradle.kts, verified by `ReleaseConfigTest`);
 *  - **debug app** — `BuildConfig.API_BASE` (production by default, or
 *    `-PmqApiBase=` for a local backend);
 *  - **any test run** (JVM/Robolectric unit tests, instrumentation via
 *    `MqTestRunner`) — `mq.testEnv=true` is set automatically; the API base
 *    comes from `mq.apiBase` (default: an unreachable local address) and a
 *    production base is REJECTED (fail-fast), while [ProductionGuardInterceptor]
 *    blocks any request that still targets a production host.
 */
object MqEnv {
    /** Must stay equal to `PRODUCTION_API_BASE` in app/build.gradle.kts. */
    const val PRODUCTION_API_BASE = "https://mq1.vercel.app"

    /** Hosts that tests must never reach. */
    val PRODUCTION_HOSTS: Set<String> = setOf("mq1.vercel.app")

    /** Default fake endpoint for tests: nothing listens there → fast, honest failure. */
    const val DEFAULT_TEST_API_BASE = "http://127.0.0.1:8717"

    const val PROP_TEST_ENV = "mq.testEnv"
    const val PROP_API_BASE = "mq.apiBase"

    /** True for every test process (set by Gradle for unit tests, by MqTestRunner for instrumentation). */
    val isTestEnvironment: Boolean
        get() = System.getProperty(PROP_TEST_ENV) == "true"

    /** Effective API base. Evaluated per call so test overrides are honoured. */
    val apiBase: String
        get() = resolveApiBase(isTestEnvironment, System.getProperty(PROP_API_BASE), BuildConfig.API_BASE)

    fun resolveApiBase(testEnv: Boolean, override: String?, buildConfigBase: String): String {
        if (!testEnv) return buildConfigBase
        val base = override?.takeIf { it.isNotBlank() } ?: DEFAULT_TEST_API_BASE
        check(!isProductionUrl(base)) {
            "MQ test environment must not use the production API ($base). " +
                "Point -PmqTestApiBase at a local/fake server."
        }
        return base
    }

    fun hostOf(url: String): String? =
        url.substringAfter("://", missingDelimiterValue = "")
            .substringBefore('/')
            .substringBefore('?')
            .substringAfterLast('@')
            .substringBefore(':')
            .lowercase()
            .takeIf { it.isNotEmpty() }

    fun isProductionUrl(url: String): Boolean = hostOf(url)?.let { isProductionHost(it) } == true

    fun isProductionHost(host: String): Boolean {
        val h = host.lowercase().trimEnd('.')
        return PRODUCTION_HOSTS.any { h == it || h.endsWith(".$it") }
    }
}

/**
 * Last line of defence: in a test environment any request to a production
 * host fails with [ProductionAccessBlocked] BEFORE a socket is opened.
 * Outside tests it is a no-op.
 */
class ProductionGuardInterceptor(
    private val testEnv: () -> Boolean = { MqEnv.isTestEnvironment },
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val url = chain.request().url
        if (testEnv() && MqEnv.isProductionHost(url.host)) {
            throw ProductionAccessBlocked(url.host)
        }
        return chain.proceed(chain.request())
    }
}

class ProductionAccessBlocked(host: String) :
    IOException("Blocked request to production host '$host' from a test environment")
