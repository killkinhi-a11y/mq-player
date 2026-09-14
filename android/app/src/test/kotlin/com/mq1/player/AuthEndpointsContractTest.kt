package com.mq1.player

import org.junit.Assert.assertEquals
import com.mq1.player.data.api.MqApi
import org.junit.Assert.assertNotNull
import org.junit.Test
import retrofit2.http.POST

/**
 * AUTH ENDPOINT CONTRACT — locks the web-parity auth surface of MqApi to
 * the exact same endpoints AuthView.tsx calls (no drift, no fake URLs):
 *   POST /api/auth/login        {email, password}
 *   POST /api/auth/register     {username, email, password}
 *   POST /api/auth/verify-code  {email, code}
 *   POST /api/auth/telegram-verify {code[, username]}
 *   GET  /api/auth/telegram-bot-name
 */
class AuthEndpointsContractTest {

    private fun postPath(methodName: String): String {
        val m = MqApi::class.java.methods.first { it.name == methodName }
        val ann = m.annotations.firstNotNullOfOrNull { it as? POST }
            ?: throw AssertionError("$methodName has no @POST annotation")
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
}
