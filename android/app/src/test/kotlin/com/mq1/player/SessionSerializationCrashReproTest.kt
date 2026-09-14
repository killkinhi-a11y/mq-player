package com.mq1.player

import com.mq1.player.data.LocalStore
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * REGRESSION LOCK for the login crash (v2.1.0 and earlier).
 *
 * ROOT CAUSE (proven here + by bytecode inspection): LocalStore.SessionUser
 * had NO @Serializable annotation, so `json.encodeToString(user)` compiled to
 * the runtime-reflection fallback (SerializersKt.noCompiledSerializer) which
 * THROWS on every call:
 *
 *   kotlinx.serialization.SerializationException:
 *     Serializer for class 'SessionUser' is not found.
 *
 * MainActivity wrapped that call in scope.launch(Dispatchers.IO) with no
 * CoroutineExceptionHandler → unhandled coroutine exception → FATAL EXCEPTION
 * → the app DIED on every login (Demo/Email/Telegram) at session persist.
 *
 * THE FIX: @Serializable on SessionUser (compile-time plugin serializer).
 * These tests lock BOTH directions of the exact production call path.
 */
class SessionSerializationCrashReproTest {

    private val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }

    @Test
    fun `encode SessionUser no longer throws - the login crash fix`() {
        val user = LocalStore.SessionUser(
            userId = "demo-user-id", username = "Демо", role = "user", avatar = null
        )
        // Before the fix this exact call threw SerializationException.
        val encoded = json.encodeToString(user)
        assertTrue("encoded session must be non-empty JSON", encoded.isNotBlank())
        assertTrue(
            "encoded session must carry the user id",
            encoded.contains("demo-user-id")
        )
    }

    @Test
    fun `SessionUser round-trips through the LocalStore JSON format`() {
        val user = LocalStore.SessionUser(
            userId = "u-123", username = "user_name", role = "admin",
            avatar = "https://mq1.vercel.app/icon-512.png"
        )
        val encoded = json.encodeToString(user)
        // LocalStore decodes with runCatching { json.decodeFromString<SessionUser>(it) }
        val decoded = json.decodeFromString<LocalStore.SessionUser>(encoded)
        assertEquals(user, decoded)
    }

    @Test
    fun `decode tolerates unknown keys - forward-compatible cache format`() {
        // Future fields must not brick old installs' cached sessions.
        val decoded = json.decodeFromString<LocalStore.SessionUser>(
            """{"userId":"u-9","username":"u","role":"user","avatar":null,"futureField":"x"}"""
        )
        assertEquals("u-9", decoded.userId)
    }
}
