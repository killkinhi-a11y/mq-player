package com.mq1.player

import com.mq1.player.data.api.FriendshipState
import com.mq1.player.data.api.FriendsResponse
import com.mq1.player.data.api.UnreadCountResponse
import com.mq1.player.data.api.UserProfileResponse
import com.mq1.player.data.api.UsersStatusResponse
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * F7 FRIENDS CONTRACT TESTS — the exact JSON shapes the production backend
 * ships (mq-build-7b213038+), plus tolerance rules:
 *  - additive backend fields must NOT break parsing (ignoreUnknownKeys)
 *  - fields ABSENT in older responses fall back to defaults (no crash)
 *  - unknown enum-ish values stay as opaque strings (no exception)
 */
class FriendsContractParsingTest {

    // Same config as ServiceLocator.json — production parser behavior
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }

    // ── GET /api/friends ────────────────────────────────────────────────────

    @Test
    fun `full friends response parses friends requests ids and outgoing`() {
        val payload = """
        {
          "friends": [
            {"id": "u1", "username": "alice", "avatar": "https://x/a.png",
             "addedAt": "2026-09-01T10:00:00Z", "friendshipId": "fr-1"}
          ],
          "pendingRequests": [
            {"id": "u2", "username": "bob", "avatar": "https://x/b.png",
             "requestId": "fr-2"}
          ],
          "outgoingRequests": [
            {"id": "u3", "username": "carol", "avatar": "",
             "requestId": "fr-3", "createdAt": "2026-09-12T09:00:00Z"}
          ]
        }
        """.trimIndent()

        val r = json.decodeFromString<FriendsResponse>(payload)

        assertEquals(1, r.friends.size)
        assertEquals("alice", r.friends[0].username)
        assertEquals("fr-1", r.friends[0].friendshipId) // DELETE needs this id
        assertEquals(1, r.pendingRequests.size)
        assertEquals("fr-2", r.pendingRequests[0].requestId)
        assertEquals("https://x/b.png", r.pendingRequests[0].avatar)
        assertEquals(1, r.outgoingRequests.size)
        assertEquals("carol", r.outgoingRequests[0].username)
        assertEquals("fr-3", r.outgoingRequests[0].requestId)
    }

    @Test
    fun `legacy response without outgoingRequests falls back to empty`() {
        val payload = """
        {"friends": [{"id": "u1", "username": "alice", "avatar": "",
                      "addedAt": "x", "friendshipId": ""}],
         "pendingRequests": []}
        """.trimIndent()

        val r = json.decodeFromString<FriendsResponse>(payload)

        assertTrue(r.outgoingRequests.isEmpty())
        assertTrue(r.pendingRequests.isEmpty())
        assertEquals("alice", r.friends[0].username)
    }

    @Test
    fun `unknown extra fields do not crash parsing`() {
        val payload = """
        {"friends": [], "pendingRequests": [], "outgoingRequests": [],
         "futureField": {"nested": [1, 2, 3]}, "another": true}
        """.trimIndent()

        val r = json.decodeFromString<FriendsResponse>(payload)
        assertTrue(r.friends.isEmpty())
    }

    @Test
    fun `empty body shape parses to all-empty`() {
        val r = json.decodeFromString<FriendsResponse>("{}")
        assertTrue(r.friends.isEmpty() && r.pendingRequests.isEmpty() && r.outgoingRequests.isEmpty())
    }

    // ── GET /api/users/[id] ─────────────────────────────────────────────────

    @Test
    fun `user profile parses all friendship states`() {
        fun profile(status: String, requestId: String?, friendshipId: String?): UserProfileResponse {
            val payload = """
            {"user": {"id": "u9", "username": "dave", "avatar": "https://x/d.png"},
             "online": true, "lastSeen": "2026-09-13T12:00:00Z",
             "friendship": {"status": "$status",
                            "requestId": ${requestId?.let { "\"$it\"" } ?: "null"},
                            "friendshipId": ${friendshipId?.let { "\"$it\"" } ?: "null"}}}
            """.trimIndent()
            return json.decodeFromString<UserProfileResponse>(payload)
        }

        profile("none", null, null).let {
            assertEquals("none", it.friendship.status)
            assertNull(it.friendship.requestId)
            assertTrue(it.online)
            assertEquals("dave", it.user.username)
        }
        profile("friends", null, "fr-77").let {
            assertEquals("friends", it.friendship.status)
            assertEquals("fr-77", it.friendship.friendshipId)
        }
        profile("outgoing", "fr-88", null).let {
            assertEquals("outgoing", it.friendship.status)
            assertEquals("fr-88", it.friendship.requestId)
        }
        profile("incoming", "fr-99", null).let {
            assertEquals("incoming", it.friendship.status)
        }
        profile("self", null, null).let { assertEquals("self", it.friendship.status) }
    }

    @Test
    fun `user profile with unknown status and missing friendship stays usable`() {
        val payload = """
        {"user": {"id": "u9", "username": "dave"},
         "online": false, "lastSeen": null,
         "friendship": {"status": "some-future-state", "requestId": null, "friendshipId": null}}
        """.trimIndent()

        val r = json.decodeFromString<UserProfileResponse>(payload)

        assertEquals("some-future-state", r.friendship.status) // opaque string, no crash
        assertEquals("dave", r.user.username)
        assertNull(r.lastSeen)
    }

    @Test
    fun `user profile missing optional blocks falls back to defaults`() {
        val r = json.decodeFromString<UserProfileResponse>("""{"user": {"id": "u1"}}""")
        assertEquals(FriendshipState(), r.friendship)
        assertTrue(!r.online)
    }

    // ── GET /api/messages/unread-count ──────────────────────────────────────

    @Test
    fun `unread count parses latest message and null case`() {
        val withMsg = """
        {"latestMessage": {"id": "m1", "content": "привет", "senderId": "u2",
                           "senderUsername": "bob", "senderAvatar": "",
                           "createdAt": "2026-09-13T10:00:00Z"}}
        """.trimIndent()
        val r1 = json.decodeFromString<UnreadCountResponse>(withMsg)
        assertNotNull(r1.latestMessage)
        assertEquals("u2", r1.latestMessage?.senderId)
        assertEquals("привет", r1.latestMessage?.content)

        val r2 = json.decodeFromString<UnreadCountResponse>("""{"latestMessage": null}""")
        assertNull(r2.latestMessage)
    }

    // ── GET /api/users/status ───────────────────────────────────────────────

    @Test
    fun `batch user status parses map with ids not found offline`() {
        val payload = """
        {"statuses": {"u1": {"online": true, "lastSeen": "2026-09-13T12:00:00Z"},
                      "u2": {"online": false, "lastSeen": null}}}
        """.trimIndent()

        val r = json.decodeFromString<UsersStatusResponse>(payload)

        assertEquals(2, r.statuses.size)
        assertTrue(r.statuses["u1"]?.online == true)
        assertTrue(r.statuses["u2"]?.online == false)
    }
}
