package com.mq1.player

import org.junit.Assert.assertEquals
import com.mq1.player.data.api.MqApi
import org.junit.Assert.assertNotNull
import org.junit.Test
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * AUTH ENDPOINT CONTRACT — locks the web-parity auth surface of MqApi to
 * the exact same endpoints AuthView.tsx calls (no drift, no fake URLs):
 *   POST /api/auth/login        {email, password}
 *   POST /api/auth/register     {username, email, password}
 *   POST /api/auth/verify-code  {email, code}
 *   POST /api/auth/telegram-verify {code[, username]}
 *   GET  /api/auth/telegram-bot-name
 * Google native login (Credential Manager bridge):
 *   GET  /api/auth/providers            → public web client id
 *   GET  /api/auth/google/native        → one-time nonce
 *   POST /api/auth/google/native        {idToken}
 */
class AuthEndpointsContractTest {

    private fun postPath(methodName: String): String {
        val m = MqApi::class.java.methods.first { it.name == methodName }
        val ann = m.annotations.firstNotNullOfOrNull { it as? POST }
            ?: throw AssertionError("$methodName has no @POST annotation")
        return ann.value
    }

    private fun getPath(methodName: String): String {
        val m = MqApi::class.java.methods.first { it.name == methodName }
        val ann = m.annotations.firstNotNullOfOrNull { it as? GET }
            ?: throw AssertionError("$methodName has no @GET annotation")
        return ann.value
    }

    @Test
    fun `loginEmail posts to the web login endpoint`() {
        assertEquals("api/auth/login", postPath("loginEmail"))
    }

    @Test
    fun `registerEmail posts to the web register endpoint`() {
        assertEquals("api/auth/register", postPath("registerEmail"))
    }

    @Test
    fun `verifyEmailCode posts to the web verify-code endpoint`() {
        assertEquals("api/auth/verify-code", postPath("verifyEmailCode"))
    }

    @Test
    fun `telegramVerify posts to the web telegram-verify endpoint`() {
        assertEquals("api/auth/telegram-verify", postPath("telegramVerify"))
    }

    // ── Google native login bridge ──────────────────────────────────────────

    @Test
    fun `authProviders gets the web providers probe`() {
        assertEquals("api/auth/providers", getPath("authProviders"))
    }

    @Test
    fun `googleNativeNonce gets the nonce endpoint`() {
        assertEquals("api/auth/google/native", getPath("googleNativeNonce"))
    }

    @Test
    fun `googleNativeLogin posts the id token to the native endpoint`() {
        assertEquals("api/auth/google/native", postPath("googleNativeLogin"))
    }
}
