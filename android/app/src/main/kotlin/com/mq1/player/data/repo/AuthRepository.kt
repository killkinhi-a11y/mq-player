package com.mq1.player.data.repo

import android.util.Log
import com.mq1.player.data.LocalStore
import com.mq1.player.data.api.AuthProvidersResponse
import com.mq1.player.data.api.GoogleNativeLoginResponse
import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.RegisterResponse
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
 *
 * Google native login: Credential Manager id_token → POST /api/auth/google/native
 * (same backend verification + account resolution as the web OAuth callback).
 * LOGGING POLICY: only safe fields (provider, step, HTTP status, timing, route)
 * — NEVER the id_token, cookies, or any credential material.
 */
class AuthRepository(
    private val api: MqApi,
    private val local: LocalStore
) {

    private val json = kotlinx.serialization.json.Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    sealed interface AuthState {
        data object LoggedOut : AuthState
        data object Pending : AuthState          // restoring session
        data class LoggedIn(val user: LocalStore.SessionUser) : AuthState
    }

    suspend fun botName(): String? = runCatching {
        api.telegramBotName().botName
    }.getOrNull()

    // ── Google native login (Credential Manager bridge) ─────────────────────

    /** Cached PUBLIC web client id (from /api/auth/providers). Null when
     *  Google is not configured server-side or the probe fails. */
    @Volatile private var cachedGoogleClientId: String? = null

    suspend fun googleClientId(): String? {
        cachedGoogleClientId?.let { return it }
        val t0 = android.os.SystemClock.elapsedRealtime()
        val response = runCatching { api.authProviders() }.getOrNull()
        val ms = android.os.SystemClock.elapsedRealtime() - t0
        if (response == null) {
            Log.w(TAG, "provider=google step=providers route=api/auth/providers status=network_error ms=$ms")
            return null
        }
        Log.d(TAG, "provider=google step=providers route=api/auth/providers http=${response.code()} ms=$ms")
        if (!response.isSuccessful) return null
        val body = response.body() ?: return null
        cachedGoogleClientId = if (body.google) body.googleClientId else null
        return cachedGoogleClientId
    }

    /** One-time nonce for GetGoogleIdOption; the matching HttpOnly cookie
     *  (mq_native_nonce) is captured by SecureCookieJar and replayed on
     *  googleNativeLogin — the backend compares the two. */
    suspend fun issueGoogleNativeNonce(): String? {
        val t0 = android.os.SystemClock.elapsedRealtime()
        val response = runCatching { api.googleNativeNonce() }.getOrNull()
        val ms = android.os.SystemClock.elapsedRealtime() - t0
        if (response == null) {
            Log.w(TAG, "provider=google step=nonce route=api/auth/google/native status=network_error ms=$ms")
            return null
        }
        Log.d(TAG, "provider=google step=nonce route=api/auth/google/native http=${response.code()} ms=$ms")
        if (!response.isSuccessful) return null
        return response.body()?.nonce
    }

    /** POST the Credential Manager id_token. Null = transport error;
     *  otherwise the backend's JSON answer (error field set on rejection —
     *  including non-2xx rejections, whose body we parse explicitly so a 401
     *  surfaces as the backend's rejection reason, NOT as "network down").
     *  Success also lands the httpOnly `session` cookie in SecureCookieJar. */
    suspend fun googleNativeLogin(idToken: String): GoogleNativeLoginResponse? {
        val t0 = android.os.SystemClock.elapsedRealtime()
        val response = runCatching { api.googleNativeLogin(mapOf("idToken" to idToken)) }.getOrNull()
        val ms = android.os.SystemClock.elapsedRealtime() - t0
        if (response == null) {
            Log.w(TAG, "provider=google step=native_login route=api/auth/google/native status=network_error ms=$ms")
            return null
        }
        Log.d(
            TAG,
            "provider=google step=native_login route=api/auth/google/native " +
                "http=${response.code()} auth=${response.body()?.authenticated} ms=$ms"
        )
        if (response.isSuccessful) return response.body()
        // Retrofit leaves non-2xx payloads in errorBody() — parse them so the
        // user sees the REAL failure reason from the backend.
        val errorBody = runCatching { response.errorBody()?.string() }.getOrNull()
        return errorBody?.let { body ->
            runCatching { json.decodeFromString<GoogleNativeLoginResponse>(body) }.getOrNull()
        } ?: GoogleNativeLoginResponse(error = "http_${response.code()}")
    }

    private companion object {
        const val TAG = "MqAuth"
    }

    /** @return null on transport error; TelegramVerifyResponse on HTTP-level answer */
    suspend fun verifyCode(code: String, username: String? = null): TelegramVerifyResponse? {
        val body = buildMap {
            put("code", code)
            if (!username.isNullOrBlank()) put("username", username.trim())
        }
        val response = runCatching { api.telegramVerify(body) }.getOrNull() ?: return null
        return response.body()
    }

    // ── WEB PARITY: email login / register / confirm (AuthView.tsx flows) ──

    suspend fun loginWithEmail(email: String, password: String): TelegramVerifyResponse? {
        val response = runCatching {
            api.loginEmail(mapOf("email" to email.trim(), "password" to password))
        }.getOrNull() ?: return null
        return response.body()
    }

    suspend fun registerEmail(username: String, email: String, password: String): RegisterResponse? {
        val response = runCatching {
            api.registerEmail(
                mapOf("username" to username.trim(), "email" to email.trim(), "password" to password)
            )
        }.getOrNull() ?: return null
        return response.body()
    }

    suspend fun confirmEmailCode(email: String, code: String): TelegramVerifyResponse? {
        val response = runCatching {
            api.verifyEmailCode(mapOf("email" to email.trim(), "code" to code))
        }.getOrNull() ?: return null
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
