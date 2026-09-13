package com.mq1.player

import com.mq1.player.data.SocialHub
import com.mq1.player.data.api.LatestMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * F7 UNREAD TRACKER — pure reducer extracted from SocialHub (web-parity
 * unreadCounts semantics), unit-tested in isolation.
 */
class SocialHubUnreadTest {

    private fun msg(id: String, sender: String) = LatestMessage(
        id = id, content = "текст", senderId = sender,
        senderUsername = sender, senderAvatar = "", createdAt = "2026-09-13T10:00:00Z"
    )

    @Test
    fun `first observation records id without incrementing`() {
        val (counts, lastId) = SocialHub.advanceUnread(emptyMap(), null, msg("m1", "u2"), "me")
        assertTrue(counts.isEmpty())
        assertEquals("m1", lastId)
    }

    @Test
    fun `no new message keeps counts unchanged`() {
        val (counts, lastId) = SocialHub.advanceUnread(mapOf("u2" to 3), "m1", msg("m1", "u2"), "me")
        assertEquals(mapOf("u2" to 3), counts)
        assertEquals("m1", lastId)
    }

    @Test
    fun `new message from peer increments that peer by one`() {
        val (counts, lastId) = SocialHub.advanceUnread(mapOf("u2" to 1), "m1", msg("m2", "u2"), "me")
        assertEquals(mapOf("u2" to 2), counts)
        assertEquals("m2", lastId)
    }

    @Test
    fun `new message from unknown peer starts at one`() {
        val (counts, _) = SocialHub.advanceUnread(emptyMap(), "m1", msg("m2", "u9"), "me")
        assertEquals(mapOf("u9" to 1), counts)
    }

    @Test
    fun `multiple senders accumulate independently`() {
        var counts = emptyMap<String, Int>()
        var lastId: String? = null
        // first observation
        SocialHub.advanceUnread(counts, lastId, msg("m1", "u2"), "me").let { counts = it.first; lastId = it.second }
        // u3 writes
        SocialHub.advanceUnread(counts, lastId, msg("m2", "u3"), "me").let { counts = it.first; lastId = it.second }
        // u2 writes
        SocialHub.advanceUnread(counts, lastId, msg("m3", "u2"), "me").let { counts = it.first; lastId = it.second }
        // u3 writes again
        SocialHub.advanceUnread(counts, lastId, msg("m4", "u3"), "me").let { counts = it.first; lastId = it.second }

        assertEquals(mapOf("u3" to 2, "u2" to 1), counts)
        assertEquals("m4", lastId)
    }

    @Test
    fun `self-sent latest message never counts`() {
        val (counts, lastId) = SocialHub.advanceUnread(mapOf("u2" to 1), "m1", msg("m2", "me"), "me")
        assertEquals(mapOf("u2" to 1), counts)
        assertEquals("m2", lastId)
    }

    @Test
    fun `null or blank latest leaves state untouched`() {
        SocialHub.advanceUnread(mapOf("u2" to 1), "m1", null, "me").let { (c, l) ->
            assertEquals(mapOf("u2" to 1), c); assertEquals("m1", l)
        }
        SocialHub.advanceUnread(mapOf("u2" to 1), "m1", msg("", "u2"), "me").let { (c, l) ->
            assertEquals(mapOf("u2" to 1), c); assertEquals("m1", l)
        }
    }

    @Test
    fun `blank sender id records id but does not count`() {
        val (counts, lastId) = SocialHub.advanceUnread(emptyMap(), "m1", msg("m2", ""), "me")
        assertTrue(counts.isEmpty())
        assertEquals("m2", lastId)
    }

    private fun assertTrue(b: Boolean) = org.junit.Assert.assertTrue(b)
}
