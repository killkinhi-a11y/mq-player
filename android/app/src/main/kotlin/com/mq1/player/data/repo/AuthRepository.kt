package com.mq1.player.data.repo

import com.mq1.player.data.LocalStore
import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.MeResponse
import com.mq1.player.data.api.TelegramVerifyResponse
import com.mq1.player.di.ServiceLocator
import kotlinx.coroutines.flow.first

/**
 * Auth flow — exact reuse of the web backend's Telegram-code login:
 * 1. GET telegram-bot-name → open t.me/<bot>?start=code in the Telegram app
 * 2. user receives a 6-digit code
 * 3. POST telegram-verify { code } → existing user: Set-Cookie session JWT;
 *    new user: isNewUser=true → POST again with { code, username }
 * The httpOnly cookie is persisted by SecureCookieJar (AndroidKeyStore-sealed).
 */
class AuthRepository(
    private val api: MqApi,
    private val local: LocalStore
) {

    sealed interface AuthState {
        data object LoggedOut : AuthState
        data object Pending : AuthState          // restoring session
        data class LoggedIn(val user: LocalStore.SessionUser) : AuthState
    }

    suspend fun botName(): String? = runCatching {
        api.telegramBotName().botName
    }.getOrNull()

    /** @return null on transport error; TelegramVerifyResponse on HTTP-level answer */
    suspend fun verifyCode(code: String, username: String? = null): TelegramVerifyResponse? {
        val body = buildMap {
            put("code", code)
            if (!username.isNullOrBlank()) put("username", username.trim())
        }
        val response = runCatching { api.telegramVerify(body) }.getOrNull() ?: return null
        return response.body()
    }

    suspend fun restoreSession(): AuthState {
        val cached = local.sessionUser.first()
        return runCatching {
            val me: MeResponse = api.me().body() ?: return AuthState.LoggedOut
            if (!me.authenticated) {
                local.setSessionUser(null)
                return AuthState.LoggedOut
            }
            val user = LocalStore.SessionUser(
                userId = me.userId ?: "",
                username = me.username ?: "",
                role = me.role ?: "user",
                avatar = me.avatar
            )
            local.setSessionUser(user)
            AuthState.LoggedIn(user)
        }.getOrElse {
            // Network down → keep the cached user; the cookie may still be valid.
            cached?.let { AuthState.LoggedIn(it) } ?: AuthState.LoggedOut
        }
    }

    suspend fun logout() {
        runCatching { api.logout() }
        ServiceLocator.cookieJar.clear()
        local.wipe()
    }
}
