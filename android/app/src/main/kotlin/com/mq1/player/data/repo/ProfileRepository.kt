package com.mq1.player.data.repo

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import com.mq1.player.data.api.AvatarUpdateResponse
import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.MyProfileResponse
import com.mq1.player.data.api.UpdateUsernameResponse
import com.mq1.player.data.api.UsernameCheckResponse
import java.io.ByteArrayOutputStream

/**
 * F9 — own profile editing, on the SAME backend surface the web ProfileView
 * uses (no duplicate profile backend):
 *   GET  /api/user/profile          → account (username/email/avatar/createdAt)
 *   POST /api/user/avatar           → {avatar: "data:image/jpeg;base64,…"} ≤700KB
 *   GET  /api/auth/username-check   → availability (2-20 chars, [a-zA-Z0-9_-])
 *   POST /api/auth/update-username  → rename (reserved names rejected server-side)
 *
 * Session-cache updates (LocalStore.SessionUser) are done by the ViewModel
 * after successful mutations, so every surface (Settings, SocialHub gate,
 * chats) sees the new identity immediately — same as useAppStore.setState
 * on the web.
 */
class ProfileRepository(
    private val api: MqApi
) {

    suspend fun myProfile(): Result<MyProfileResponse> = runCatching {
        val response = api.myProfile()
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            throw IllegalStateException(httpMessage(response.code()))
        }
        body
    }

    suspend fun checkUsername(username: String, excludeId: String): Result<UsernameCheckResponse> =
        runCatching {
            val response = api.usernameCheck(username, excludeId)
            val body = response.body()
            if (!response.isSuccessful || body == null) {
                throw IllegalStateException(httpMessage(response.code()))
            }
            body
        }

    suspend fun updateUsername(newUsername: String): Result<UpdateUsernameResponse> = runCatching {
        val response = api.updateUsername(mapOf("username" to newUsername))
        val body = response.body()
        if (response.isSuccessful && body != null) {
            body
        } else {
            throw IllegalStateException(serverError(response.errorBody()?.string(), response.code()))
        }
    }

    suspend fun uploadAvatar(dataUrl: String): Result<AvatarUpdateResponse> = runCatching {
        val response = api.updateAvatar(mapOf("avatar" to dataUrl))
        val body = response.body()
        if (response.isSuccessful && body != null) {
            body
        } else {
            throw IllegalStateException(serverError(response.errorBody()?.string(), response.code()))
        }
    }

    companion object {

        // ── Local validation — identical rules to ProfileView.validateUsername ─

        private val reserved = setOf(
            "admin", "administrator", "moderator", "support", "help", "system",
            "mq", "mqplayer", "root", "null", "undefined"
        )

        val USERNAME_REGEX = Regex("^[a-zA-Z0-9_-]+$")

        fun validateUsername(name: String): String? = when {
            name.length < 2 -> "Минимум 2 символа"
            name.length > 20 -> "Максимум 20 символов"
            !USERNAME_REGEX.matches(name) -> "Только буквы, цифры, _ и -"
            name.lowercase() in reserved -> "Это имя зарезервировано"
            else -> null
        }

        /**
         * Decode → center-crop → 200×200 JPEG q80 → data URL. Mirrors the web
         * canvas pipeline exactly (same size/quality); the backend rejects
         * anything over ~700 KB of base64.
         */
        fun bitmapToAvatarDataUrl(bytes: ByteArray): String? {
            val src = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
            val minDim = minOf(src.width, src.height)
            val crop = Bitmap.createBitmap(
                src,
                (src.width - minDim) / 2, (src.height - minDim) / 2,
                minDim, minDim
            )
            val scaled = if (crop.width == 200 && crop.height == 200) crop
                else Bitmap.createScaledBitmap(crop, 200, 200, true)
            val out = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
            val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            return "data:image/jpeg;base64,$b64"
        }

        fun httpMessage(code: Int): String = when (code) {
            401 -> "Сессия истекла — войдите снова"
            500 -> "Сервер недоступен"
            else -> "Ошибка $code"
        }

        /** Extract {"error": "…"} from the error body, with a safe fallback. */
        fun serverError(errorBody: String?, code: Int): String {
            val extracted = errorBody?.let { body ->
                runCatching {
                    val obj = kotlinx.serialization.json.Json.parseToJsonElement(body)
                        as? kotlinx.serialization.json.JsonObject
                    (obj?.get("error") as? kotlinx.serialization.json.JsonPrimitive)?.content
                }.getOrNull()
            }
            return extracted ?: httpMessage(code)
        }
    }
}
