package com.mq1.player

import android.net.Uri
import com.mq1.player.deeplink.DeepLink
import com.mq1.player.deeplink.DeepLinkParser
import com.mq1.player.deeplink.DeepLinkQueue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * F11 DEEP LINK TESTS — the full parsing matrix (custom scheme + App Links),
 * the auth-restore queue semantics, and share URL construction. All pure
 * JVM (Uri is Robolectric-free — android.net.Uri parses without Android
 * runtime in unit tests? No: Uri requires Robolectric — these tests run
 * under Robolectric for that reason).
 *
 * Invariants:
 *   D1 mqplayer://track|artist|playlist/{id} parse to the right destination
 *   D2 https App Links (/track/{id}, /play?pl=, /play?artist=) parse
 *   D3 unknown hosts/schemes/ids → null (no invented destinations)
 *   D4 legacy mq://player still opens the Full Player
 *   D5 queue: offer → take consumes exactly once (auth-restore flow)
 *   D6 share URLs are REAL https links on the production host
 */
@org.junit.runner.RunWith(org.robolectric.RobolectricTestRunner::class)
@org.robolectric.annotation.Config(sdk = [34])
class DeepLinkParsingTest {

    private fun parse(s: String): DeepLink? = DeepLinkParser.parse(Uri.parse(s))

    // ── D1 custom scheme ─────────────────────────────────────────────────

    @Test
    fun `mqplayer track parses numeric id`() {
        val link = parse("mqplayer://track/417474360")
        assertEquals(DeepLink.Track(417474360L), link)
    }

    @Test
    fun `mqplayer artist parses url-encoded names`() {
        assertEquals(
            DeepLink.Artist("Steve Miller Band"),
            parse("mqplayer://artist/Steve%20Miller%20Band")
        )
        // Cyrillic names survive double-byte percent-encoding
        assertEquals(
            DeepLink.Artist("Иван Дорн"),
            parse("mqplayer://artist/%D0%98%D0%B2%D0%B0%D0%BD%20%D0%94%D0%BE%D1%80%D0%BD")
        )
    }

    @Test
    fun `mqplayer playlist parses cuid`() {
        assertEquals(
            DeepLink.Playlist("cm5abc123def"),
            parse("mqplayer://playlist/cm5abc123def")
        )
    }

    // ── D2 App Links (https) ─────────────────────────────────────────────

    @Test
    fun `https track page parses`() {
        assertEquals(
            DeepLink.Track(417474360L),
            parse("https://mq1.vercel.app/track/417474360")
        )
    }

    @Test
    fun `https play with pl param parses playlist`() {
        assertEquals(
            DeepLink.Playlist("pl42"),
            parse("https://mq1.vercel.app/play?pl=pl42")
        )
    }

    @Test
    fun `https play with artist param parses artist`() {
        assertEquals(
            DeepLink.Artist("Nirvana"),
            parse("https://mq1.vercel.app/play?artist=Nirvana")
        )
        assertEquals(
            DeepLink.Artist("Steve Miller Band"),
            parse("https://mq1.vercel.app/play?artist=Steve%20Miller%20Band")
        )
    }

    @Test
    fun `https play without params is null (home, not an invented screen)`() {
        assertNull(parse("https://mq1.vercel.app/play"))
    }

    // ── D3 unknown → null ────────────────────────────────────────────────

    @Test
    fun `unknown scheme host and paths are null`() {
        assertNull(parse("mailto:someone@example.com"))
        assertNull(parse("https://example.com/track/123"))       // wrong host
        assertNull(parse("https://mq1.vercel.app/track"))        // no id
        assertNull(parse("https://mq1.vercel.app/track/abc"))    // non-numeric
        assertNull(parse("mqplayer://unknown/123"))              // unknown entity
        assertNull(parse("mqplayer://track/notanumber"))
        assertNull(parse("mqplayer://artist/"))                  // empty name
        assertNull(parse("https://mq1.vercel.app/privacy"))      // other web page
        assertNull(DeepLinkParser.parse(null as Uri?))
    }

    // ── D4 legacy ────────────────────────────────────────────────────────

    @Test
    fun `legacy mq player still opens the full player`() {
        assertEquals(DeepLink.Player, parse("mq://player"))
    }

    @Test
    fun `legacy mq non-player host is null`() {
        assertNull(parse("mq://somethingelse"))
    }

    // ── D5 queue semantics (auth restore) ────────────────────────────────

    @Test
    fun `queue take consumes the link exactly once`() {
        DeepLinkQueue.clear()
        assertNull(DeepLinkQueue.take())
        val before = DeepLinkQueue.version.value

        DeepLinkQueue.offer(DeepLink.Playlist("pl1"))
        assertEquals(before + 1, DeepLinkQueue.version.value)
        assertEquals(DeepLink.Playlist("pl1"), DeepLinkQueue.take())
        // second take (e.g. re-composition after login) must NOT replay
        assertNull(DeepLinkQueue.take())
        assertEquals(before + 1, DeepLinkQueue.version.value) // persists
    }

    @Test
    fun `queue latest link wins and bumps version`() {
        DeepLinkQueue.clear()
        val before = DeepLinkQueue.version.value
        DeepLinkQueue.offer(DeepLink.Track(1L))
        DeepLinkQueue.offer(DeepLink.Artist("X"))
        assertEquals(before + 2, DeepLinkQueue.version.value)
        assertEquals(DeepLink.Artist("X"), DeepLinkQueue.take())
        assertNull(DeepLinkQueue.peek())
    }

    // ── D6 share URLs ────────────────────────────────────────────────────

    @Test
    fun `share urls are real https links`() {
        assertEquals(
            "https://mq1.vercel.app/track/417474360",
            DeepLinkParser.shareTrackUrl(417474360L, "internal-id")
        )
        // no scTrackId → falls back to the internal id (same web behavior)
        assertEquals(
            "https://mq1.vercel.app/track/internal-id",
            DeepLinkParser.shareTrackUrl(null, "internal-id")
        )
        assertEquals(
            "https://mq1.vercel.app/play?pl=abc",
            DeepLinkParser.sharePlaylistUrl("abc")
        )
        assertEquals(
            "https://mq1.vercel.app/play?artist=Steve%20Miller%20Band",
            DeepLinkParser.shareArtistUrl("Steve Miller Band")
        )
    }
}
