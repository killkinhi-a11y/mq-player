package com.mq1.player

import com.mq1.player.data.api.AvatarUpdateResponse
import com.mq1.player.data.api.MyProfileResponse
import com.mq1.player.data.api.SharedTrackResponse
import com.mq1.player.data.api.UpdateUsernameResponse
import com.mq1.player.data.api.UsernameCheckResponse
import com.mq1.player.data.repo.ProfileRepository
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * F9 PROFILE CONTRACT TESTS — the exact JSON shapes the production backend
 * ships for the own-profile surface (all endpoints already exist and serve
 * the web ProfileView):
 *   GET  /api/user/profile         {id, username, email, avatar, role, createdAt}
 *   POST /api/user/avatar          {message, avatar}
 *   GET  /api/auth/username-check  {available, error}
 *   POST /api/auth/update-username {message, username}
 *   GET  /api/tracks/share         {title, artist, cover, duration, …} (F11)
 *
 * Tolerance rules (production hardening):
 *  - additive backend fields must NOT break parsing (ignoreUnknownKeys)
 *  - absent optional fields fall back to defaults/null (no crash)
 *  - error bodies are extracted safely ({"error": "…"} → message)
 */
class ProfileContractParsingTest {

    // Same config as ServiceLocator.json — production parser behavior
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }

    // ── GET /api/user/profile ───────────────────────────────────────────────

    @Test
    fun `own profile parses full shape`() {
        val payload = """
        {
          "id": "cm5abc123",
          "username": "listener",
          "email": "listener@example.com",
          "avatar": "data:image/jpeg;base64,/9j/4AAQ",
          "role": "user",
          "createdAt": "2026-01-15T08:30:00.000Z"
        }
        """.trimIndent()

        val r = json.decodeFromString<MyProfileResponse>(payload)

        assertEquals("cm5abc123", r.id)
        assertEquals("listener", r.username)
        assertEquals("listener@example.com", r.email)
        assertNotNull(r.avatar)
        assertEquals("user", r.role)
        assertEquals("2026-01-15T08:30:00.000Z", r.createdAt)
    }

    @Test
    fun `own profile tolerates additive fields and missing optionals`() {
        val payload = """
        {
          "id": "u1",
          "username": "minimal",
          "displayName": "Not A Real Field Yet",
          "bio": "also not real yet",
          "futureField": {"nested": [1, 2, 3]}
        }
        """.trimIndent()

        val r = json.decodeFromString<MyProfileResponse>(payload)

        // Unknown fields (displayName/bio are NOT in the backend model) are
        // ignored — the app never crashes on additive backend changes.
        assertEquals("minimal", r.username)
        assertNull(r.email)
        assertNull(r.avatar)
        assertNull(r.createdAt)
        assertEquals("user", r.role) // default
    }

    @Test
    fun `own profile parses empty avatar string`() {
        val payload = """{"id": "u1", "username": "u", "avatar": ""}"""
        val r = json.decodeFromString<MyProfileResponse>(payload)
        assertEquals("", r.avatar) // empty string = placeholder avatar (web parity)
    }

    // ── POST /api/auth/update-username ──────────────────────────────────────

    @Test
    fun `update username success shape`() {
        val payload = """{"message": "Имя обновлено", "username": "newname"}"""
        val r = json.decodeFromString<UpdateUsernameResponse>(payload)
        assertEquals("Имя обновлено", r.message)
        assertEquals("newname", r.username)
    }

    @Test
    fun `update username error body extracts message`() {
        // Failure path: HTTP 409 with {"error": "Имя уже занято"}
        val errorBody = """{"error": "Имя уже занято"}"""
        val msg = ProfileRepository.serverError(errorBody, 409)
        assertEquals("Имя уже занято", msg)
    }

    @Test
    fun `server error falls back to http code message on unparseable body`() {
        val msg = ProfileRepository.serverError("<html>gateway</html>", 502)
        assertEquals("Ошибка 502", msg)
        assertEquals("Сессия истекла — войдите снова", ProfileRepository.serverError(null, 401))
    }

    // ── GET /api/auth/username-check ────────────────────────────────────────

    @Test
    fun `username check available and taken shapes`() {
        val ok = json.decodeFromString<UsernameCheckResponse>(
            """{"available": true}"""
        )
        assertTrue(ok.available)
        assertNull(ok.error)

        val taken = json.decodeFromString<UsernameCheckResponse>(
            """{"available": false, "error": "Имя уже занято"}"""
        )
        assertEquals(false, taken.available)
        assertEquals("Имя уже занято", taken.error)

        // 400-style local rejection arrives as {"available": false, "error": "…"}
        val tooShort = json.decodeFromString<UsernameCheckResponse>(
            """{"available": false, "error": "Имя должно быть не менее 2 символов"}"""
        )
        assertEquals("Имя должно быть не менее 2 символов", tooShort.error)
    }

    @Test
    fun `username check tolerates unknown fields`() {
        val r = json.decodeFromString<UsernameCheckResponse>(
            """{"available": true, "checkedAt": "2026-09-13T00:00:00Z"}"""
        )
        assertTrue(r.available)
    }

    // ── POST /api/user/avatar ───────────────────────────────────────────────

    @Test
    fun `avatar update success shape`() {
        val payload = """
        {"message": "Аватарка обновлена", "avatar": "data:image/jpeg;base64,AAA"}
        """.trimIndent()
        val r = json.decodeFromString<AvatarUpdateResponse>(payload)
        assertEquals("Аватарка обновлена", r.message)
        assertEquals("data:image/jpeg;base64,AAA", r.avatar)
    }

    @Test
    fun `avatar size rejection message extracts`() {
        val errorBody = """{"error": "Изображение слишком большое (макс. 500 КБ)"}"""
        val msg = ProfileRepository.serverError(errorBody, 400)
        assertEquals("Изображение слишком большое (макс. 500 КБ)", msg)
    }

    // ── GET /api/tracks/share (F11 deep-link resolution, public) ─────────────

    @Test
    fun `shared track parses production shape`() {
        val payload = """
        {
          "title": "Abracadabra",
          "artist": "Steve Miller Band",
          "cover": "https://i1.sndcdn.com/art-xxx-large.jpg",
          "duration": 237.45,
          "genre": "Classic Rock",
          "scTrackId": 417474360,
          "description": "some description"
        }
        """.trimIndent()

        val r = json.decodeFromString<SharedTrackResponse>(payload)

        assertEquals("Abracadabra", r.title)
        assertEquals("Steve Miller Band", r.artist)
        assertEquals(417474360, r.scTrackId)
        assertEquals(237.45, r.duration, 0.001)
    }

    @Test
    fun `shared track tolerates absent optionals and unknown fields`() {
        val payload = """{"title": "T", "artist": "A", "scTrackId": 42, "extra": 1}"""
        val r = json.decodeFromString<SharedTrackResponse>(payload)
        assertEquals(42, r.scTrackId)
        assertEquals("", r.cover)
        assertEquals(0.0, r.duration, 0.001)
        assertNull(r.description)
    }

    // ── Local username validation (web ProfileView parity) ───────────────────

    @Test
    fun `username validation matches web rules`() {
        assertNull(ProfileRepository.validateUsername("valid_name-1")) // ok

        assertEquals("Минимум 2 символа", ProfileRepository.validateUsername("a"))
        assertEquals("Максимум 20 символов", ProfileRepository.validateUsername("a".repeat(21)))
        assertEquals("Только буквы, цифры, _ и -", ProfileRepository.validateUsername("привет"))
        assertEquals("Только буквы, цифры, _ и -", ProfileRepository.validateUsername("has space"))
        assertEquals("Это имя зарезервировано", ProfileRepository.validateUsername("Admin"))
        assertEquals("Это имя зарезервировано", ProfileRepository.validateUsername("mqplayer"))
    }
}
