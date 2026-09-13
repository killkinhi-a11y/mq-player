package com.mq1.player

import com.mq1.player.data.api.LyricsResponse
import com.mq1.player.data.api.StreamFallback
import com.mq1.player.data.api.StreamResponse
import com.mq1.player.data.repo.playableStream
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * F8 PLAYER CONTRACT TESTS:
 *  - playableStream selection priority (progressive > plain HLS >
 *    Widevine-encrypted HLS > encrypted progressive; FairPlay skipped)
 *  - license-proxy URL construction (licenseUrl + JWE token encoding)
 *  - stream/lyrics JSON shapes incl. additive/unknown fields
 */
class PlayerStreamSelectionTest {

    private fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8")

    private fun stream(
        url: String? = null,
        isHls: Boolean = false,
        isEncrypted: Boolean = false,
        protocol: String = "progressive",
        licenseUrl: String? = null,
        token: String? = null,
        fallbacks: List<StreamFallback> = emptyList()
    ) = StreamResponse(
        url = url, isHls = isHls, isEncrypted = isEncrypted, protocol = protocol,
        licenseUrl = licenseUrl, licenseAuthToken = token, fallbackStreams = fallbacks
    )

    // ── Selection priority ──────────────────────────────────────────────────

    @Test
    fun `progressive wins over everything`() {
        val s = stream(
            url = "https://cdn/progressive.mp3",
            fallbacks = listOf(
                StreamFallback(url = "https://cdn/hls.m3u8", isHls = true)
            )
        )
        val p = playableStream(s, "https://mq1.vercel.app")!!
        assertEquals("https://cdn/progressive.mp3", p.url)
        assertTrue(!p.isHls && !p.isEncrypted)
        assertNull(p.licenseProxyUrl)
    }

    @Test
    fun `plain hls picked when no progressive`() {
        val s = stream(
            url = "https://cdn/hls.m3u8", isHls = true, protocol = "hls",
            fallbacks = listOf(
                StreamFallback(url = "https://cdn/enc.m3u8", isHls = true, isEncrypted = true,
                    protocol = "ctr-encrypted-hls")
            )
        )
        val p = playableStream(s, "https://mq1.vercel.app")!!
        assertTrue(p.isHls && !p.isEncrypted)
        assertNull(p.licenseProxyUrl)
    }

    @Test
    fun `widevine encrypted hls gets license proxy url with token`() {
        val s = stream(
            url = "https://cdn/enc.m3u8", isHls = true, isEncrypted = true,
            protocol = "ctr-encrypted-hls",
            licenseUrl = "https://license.media-streaming.soundcloud.cloud/playback/widevine",
            token = "eyJhbGciOiJkaXIiLCJlbmM.i.kJWE.TOKEN+with/special==chars"
        )
        val p = playableStream(s, "https://mq1.vercel.app")!!
        assertTrue(p.isHls && p.isEncrypted)
        val proxy = p.licenseProxyUrl!!
        assertTrue(proxy.startsWith("https://mq1.vercel.app/api/music/soundcloud/license-proxy?licenseUrl="))
        // SC license server must be URL-encoded intact
        assertTrue(proxy.contains(enc("https://license.media-streaming.soundcloud.cloud/playback/widevine")))
        // JWE token forwarded
        assertTrue(proxy.contains("licenseAuthToken="))
        assertTrue(proxy.contains(enc("eyJhbGciOiJkaXIiLCJlbmM.i.kJWE.TOKEN+with/special==chars")))
    }

    @Test
    fun `widevine token taken from fallback when primary has none`() {
        val s = stream(
            url = null,
            fallbacks = listOf(
                StreamFallback(
                    url = "https://cdn/enc.m3u8", isHls = true, isEncrypted = true,
                    protocol = "ctr-encrypted-hls",
                    licenseUrl = "https://license.media-streaming.soundcloud.cloud/playback/widevine",
                    licenseAuthToken = "fb-token"
                )
            )
        )
        val p = playableStream(s, "https://mq1.vercel.app")!!
        assertNotNull(p.licenseProxyUrl)
        assertTrue(p.licenseProxyUrl!!.contains(enc("fb-token")))
    }

    @Test
    fun `fairplay cbc candidates are skipped on android`() {
        val s = stream(
            url = "https://cdn/cbc.m3u8", isHls = true, isEncrypted = true,
            protocol = "cbc-encrypted-hls", // FairPlay — Apple only
            token = "fp-token"
        )
        val p = playableStream(s, "https://mq1.vercel.app")
        assertNull(p) // honest skip: cannot play, rather than fake attempt
    }

    @Test
    fun `widevine encrypted hls wins over fairplay even when cbc is primary`() {
        val s = stream(
            url = "https://cdn/cbc.m3u8", isHls = true, isEncrypted = true,
            protocol = "cbc-encrypted-hls",
            fallbacks = listOf(
                StreamFallback(
                    url = "https://cdn/ctr.m3u8", isHls = true, isEncrypted = true,
                    protocol = "ctr-encrypted-hls",
                    licenseUrl = "https://license.media-streaming.soundcloud.cloud/playback/widevine",
                    licenseAuthToken = "ctr-token"
                )
            )
        )
        val p = playableStream(s, "https://mq1.vercel.app")!!
        assertEquals("https://cdn/ctr.m3u8", p.url)
        assertTrue(p.licenseProxyUrl!!.contains(enc("ctr-token")))
    }

    @Test
    fun `empty stream returns null`() {
        assertNull(playableStream(stream(url = ""), "https://mq1.vercel.app"))
        assertNull(playableStream(stream(url = null), "https://mq1.vercel.app"))
    }

    // ── JSON contract (backend stream response shape) ───────────────────────

    @Test
    fun `stream response parses encrypted hls with license fields`() {
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
        val payload = """
        {
          "url": "https://cdn/enc.m3u8",
          "trackAuthorization": "jwt",
          "isHls": true, "isEncrypted": true,
          "protocol": "ctr-encrypted-hls", "quality": "sq",
          "licenseUrl": "https://license.media-streaming.soundcloud.cloud/playback/widevine",
          "licenseAuthToken": "jwe-token",
          "fallbackStreams": [
            {"url": "https://cdn/2.m3u8", "protocol": "cbc-encrypted-hls",
             "isHls": true, "isEncrypted": true,
             "licenseUrl": "https://license.media-streaming.soundcloud.cloud/playback/fairplay"}
          ],
          "futureField": 123
        }
        """.trimIndent()
        val r = json.decodeFromString<StreamResponse>(payload)
        assertEquals("ctr-encrypted-hls", r.protocol)
        assertEquals("jwe-token", r.licenseAuthToken)
        assertEquals(1, r.fallbackStreams.size)
        assertEquals("cbc-encrypted-hls", r.fallbackStreams[0].protocol)
        assertEquals("https://license.media-streaming.soundcloud.cloud/playback/fairplay", r.fallbackStreams[0].licenseUrl)
    }

    @Test
    fun `lyrics response parses synced and plain shapes`() {
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
        val synced = """
        {"lyrics": [{"time": 1.2, "text": "первая строка"},
                    {"time": 4.5, "text": "вторая строка"}],
         "plainText": "", "synced": true, "source": "lrclib"}
        """.trimIndent()
        val r1 = json.decodeFromString<LyricsResponse>(synced)
        assertTrue(r1.synced)
        assertEquals(2, r1.lyrics.size)
        assertEquals(4.5, r1.lyrics[1].time, 0.001)
        assertEquals("вторая строка", r1.lyrics[1].text)

        val plain = """{"lyrics": [], "plainText": "текст без таймкодов", "synced": false}"""
        val r2 = json.decodeFromString<LyricsResponse>(plain)
        assertTrue(!r2.synced)
        assertEquals("текст без таймкодов", r2.plainText)

        // Tolerance: unknown/extra fields don't break, defaults apply
        val empty = """{}"""
        val r3 = json.decodeFromString<LyricsResponse>(empty)
        assertTrue(r3.lyrics.isEmpty() && r3.plainText.isEmpty() && !r3.synced)
    }
}
