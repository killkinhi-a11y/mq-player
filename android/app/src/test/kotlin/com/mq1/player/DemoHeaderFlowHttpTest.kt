package com.mq1.player

import androidx.test.core.app.ApplicationProvider
import com.mq1.player.di.ServiceLocator
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * END-TO-END HTTP-STACK regression for the v2.3.1 Demo-tap crash, at the
 * deepest level the JVM can prove:
 *
 *   FATAL EXCEPTION (emulator, release 2.3.1, system_server alive):
 *   java.lang.IllegalArgumentException: Unexpected char 0x414 at 0 in
 *   x-demo-user-name value: Демо
 *
 * Drives the REAL production chain — ServiceLocator.okHttp (with the real
 * demo-header interceptor) → Retrofit → kotlinx JSON → wire — with the
 * EXACT runtime crash values (demoUserId="demo-user-id", demoUserName="Демо")
 * against the in-process stub, and asserts on the WIRE-CAPTURED request:
 *   1. the call completes (no thread death — pre-fix this threw IAE),
 *   2. x-demo-user-id IS sent (the demo gate the backend needs),
 *   3. x-demo-user-name is NOT sent (web parity: the backend defaults it).
 *
 * Run with -PmqApiBase=http://127.0.0.1:8717 (stub flag), like all
 * Parity/Google suites.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DemoHeaderFlowHttpTest {

    @Before
    fun setUp() {
        ServiceLocator.init(ApplicationProvider.getApplicationContext())
        ParityStub.startOnce()
        ParityStub.customResponses.clear()
        ParityStub.capturedRequests.clear()
        // THE exact runtime crash state from the v41 emulator run:
        ServiceLocator.demoUserId = "demo-user-id"
        ServiceLocator.demoUserName = "Демо"
    }

    @Test
    fun `cyrillic demo name survives the real interceptor - id sent, name omitted`() =
        runBlocking {
            ParityStub.customResponses["api/auth/telegram-bot-name"] = ParityStub.StubResponse(
                body = """{"configured":true,"botName":"MQPlayerBot"}"""
            )
            // Before the fix: the interceptor called
            // builder.header("x-demo-user-name", "Демо") and OkHttp threw
            // IllegalArgumentException (Unexpected char 0x414) here.
            val response = runCatching { ServiceLocator.api.telegramBotName() }
            assertTrue(
                "request through the real interceptor must succeed, was ${response.exceptionOrNull()}",
                response.isSuccess,
            )
            assertEquals("MQPlayerBot", response.getOrNull()?.botName)

            val fired = ParityStub.capturedRequests.filter { it.path.endsWith("api/auth/telegram-bot-name") }
            assertTrue("the request must reach the stub", fired.isNotEmpty())

            fun headerValue(name: String): String? =
                fired.firstNotNullOfOrNull { cr ->
                    cr.headers.firstOrNull { it.first.equals(name, ignoreCase = true) }?.second
                }

            // 2. The demo gate header IS on the wire:
            assertEquals("demo-user-id", headerValue("x-demo-user-id"))
            // 3. The crash header is NOT on the wire (server defaults it):
            assertEquals(null, headerValue("x-demo-user-name"))
            // And the stub never received any non-ASCII header value at all:
            assertFalse(
                fired.flatMap { it.headers }.any { it.second.any { c -> c.code > 0x7E } },
            )
        }
}
