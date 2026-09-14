package com.mq1.player

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * GOOGLE NATIVE LOGIN — runtime contract against a local HTTP backend.
 *
 * Runs the REAL app stack (ServiceLocator → OkHttp → Retrofit → kotlinx JSON
 * → AuthRepository) against a stub server. This verifies the app side of the
 * /api/auth/google/native contract: what it requests, how it parses success
 * AND rejection, and that no path crashes.
 *
 * HONEST LIMITS (not provable on the JVM):
 *  - SecureCookieJar's AndroidKeyStore sealing does not exist under
 *    Robolectric, so cookie REPLAY (nonce cookie → POST) is device-only.
 *  - Credential Manager (Play Services account picker) is device-only.
 *  Both are exercised by the same AuthRepository calls tested here.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GoogleNativeAuthTest {

    @Before
    fun setUp() {
        com.mq1.player.di.ServiceLocator.init(ApplicationProvider.getApplicationContext())
        ParityStub.startOnce()
        // Reset the cached client id between tests
        ParityStub.customResponses.clear()
        ParityStub.capturedRequests.clear()
    }

    /** Fresh repository per test — isolates the cached client id. */
    private fun auth() = com.mq1.player.data.repo.AuthRepository(
        com.mq1.player.di.ServiceLocator.api,
        com.mq1.player.di.ServiceLocator.localStore
    )

    @Test
    fun `G1 providers returns the public web client id`() = runBlocking {
        ParityStub.customResponses["api/auth/providers"] = ParityStub.StubResponse(
            body = """{"google":true,"googleClientId":"1234-test-web-id.apps.googleusercontent.com",
                "telegramWidget":false,"telegramBot":true,"telegramBotName":"MQPlayerBot",
                "email":true,"emailDelivery":true}"""
        )
        val clientId = auth().googleClientId()
        assertEquals("1234-test-web-id.apps.googleusercontent.com", clientId)
        // The app asked the backend for the client id over HTTP:
        assertTrue(
            ParityStub.capturedRequests.any { it.path.endsWith("api/auth/providers") }
        )
    }

    @Test
    fun `G2 providers with google disabled yields null client id`() = runBlocking {
        ParityStub.customResponses["api/auth/providers"] = ParityStub.StubResponse(
            body = """{"google":false,"googleClientId":null}"""
        )
        assertNull(auth().googleClientId())
    }

    @Test
    fun `G3 nonce endpoint is fetched and parsed`() = runBlocking {
        ParityStub.customResponses["GET /api/auth/google/native"] = ParityStub.StubResponse(
            body = """{"nonce":"cafebabe1234deadbeef"}""",
            headers = listOf(
                "Set-Cookie: mq_native_nonce=cafebabe1234deadbeef; Path=/; HttpOnly; Max-Age=600; SameSite=Lax"
            )
        )
        val nonce = auth().issueGoogleNativeNonce()
        assertEquals("cafebabe1234deadbeef", nonce)
    }

    @Test
    fun `G4 POST sends exactly the body the backend accepts`() = runBlocking {
        ParityStub.customResponses["POST /api/auth/google/native"] = ParityStub.StubResponse(
            status = 401,
            body = """{"error":"invalid_nonce"}"""
        )
        val result = auth().googleNativeLogin("dummy.idtoken.value")
        // Rejected logins must SURFACE the backend error, never crash/null-hide:
        assertNotNull("401 must be parsed as a response, not transport failure", result)
        assertEquals("invalid_nonce", result?.error)
        assertEquals(false, result?.authenticated)
        // The exact request shape the backend route expects:
        val post = ParityStub.capturedRequests.first { it.method == "POST" && it.path.endsWith("api/auth/google/native") }
        assertEquals("""{"idToken":"dummy.idtoken.value"}""", post.body)
    }

    @Test
    fun `G5 successful login response parses into a session user`() = runBlocking {
        ParityStub.customResponses["POST /api/auth/google/native"] = ParityStub.StubResponse(
            body = """{"authenticated":true,"userId":"user-42","username":"ivan",
                "email":"ivan@gmail.com","role":"user","avatar":"https://lh3.googleusercontent.com/a/pic",
                "linked":false,"created":true}""",
            headers = listOf(
                "Set-Cookie: session=jwt-value-here; Path=/; HttpOnly; Max-Age=2592000; Secure; SameSite=Lax"
            )
        )
        val result = auth().googleNativeLogin("valid.idtoken.value")
        assertEquals(true, result?.authenticated)
        assertEquals("user-42", result?.userId)
        assertEquals("ivan", result?.username)
        assertEquals("user", result?.role)
        assertEquals("https://lh3.googleusercontent.com/a/pic", result?.avatar)
        assertEquals(true, result?.created)
        assertNull(result?.error)
    }

    @Test
    fun `G6 server error 500 parses its error body - no crash`() = runBlocking {
        ParityStub.customResponses["POST /api/auth/google/native"] = ParityStub.StubResponse(
            status = 500,
            body = """{"error":"google_failed"}"""
        )
        val result = auth().googleNativeLogin("x")
        assertNotNull(result)
        assertEquals("google_failed", result?.error)
    }
}
