package com.mq1.player

import com.mq1.player.di.demoHeaderSafeValueOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * REGRESSION: the v2.3.1 Demo-tap crash.
 *
 * Runtime-proven (emulator, exact release APK 2.3.1/vc7, system_server alive):
 *   FATAL EXCEPTION: h3.x Dispatcher (OkHttp)
 *   java.lang.IllegalArgumentException: Unexpected char 0x414 at 0 in
 *   x-demo-user-name value: Демо
 *
 * The demo login sets ServiceLocator.demoUserName = "Демо" (Cyrillic); the
 * OkHttp interceptor put it raw into a header; OkHttp's Headers validator
 * rejects non-ASCII values; the exception escaped on the dispatcher thread
 * and killed the process 4s after the tap.
 *
 * Fix = web parity (MessengerView.tsx sends only x-demo-user-id because
 * "fetch rejects non-ISO-8859-1" and the backend defaults the name to
 * «Демо» when the header is absent): never send non-ASCII header values.
 */
class DemoHeaderSafetyTest {

    @Test
    fun `cyrillic demo name is never sent as a header value`() {
        // THE crash value from the runtime stacktrace.
        assertNull(demoHeaderSafeValueOrNull("Демо"))
        assertNull(demoHeaderSafeValueOrNull("Демо Пользователь"))
        assertNull(demoHeaderSafeValueOrNull("demo\u00A0user")) // nbsp > 0x7E
    }

    @Test
    fun `ascii values pass through unchanged`() {
        assertEquals("Demo", demoHeaderSafeValueOrNull("Demo"))
        assertEquals("demo-user-id", demoHeaderSafeValueOrNull("demo-user-id"))
        assertEquals("Anna  (dev)", demoHeaderSafeValueOrNull("Anna  (dev)"))
        assertNull(demoHeaderSafeValueOrNull(null))
    }

    @Test
    fun `control and DEL characters are dropped`() {
        assertNull(demoHeaderSafeValueOrNull("a\u007Fb")) // DEL
        assertNull(demoHeaderSafeValueOrNull("a\u001Fb")) // unit separator
        assertNull(demoHeaderSafeValueOrNull("tab\tname")) // \t kept? no — dropped (0x09 < 0x20)
    }

    @Test
    fun `okhttp itself rejects the crash value - mechanism pin`() {
        // If OkHttp ever ACCEPTS non-ASCII header values, the web/app parity
        // contract changes — this test makes that change loud.
        try {
            val headers = okhttp3.Headers.Builder()
                .set("x-demo-user-name", "Демо")
                .build()
            // If we get here OkHttp changed its validation policy.
            throw AssertionError(
                "OkHttp accepted non-ASCII header value '$headers' — " +
                    "revisit demoHeaderSafeValueOrNull + web parity"
            )
        } catch (expected: IllegalArgumentException) {
            // OkHttp's contract: only printable ASCII header values.
        }
    }
}
