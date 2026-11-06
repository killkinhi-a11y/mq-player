package com.mq1.player

import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.Track
import com.mq1.player.data.repo.WaveRepository
import com.mq1.player.data.wave.WaveSignalsBuilder
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** Android WAVE uses the web /api/wave pipeline and falls back to the legacy endpoint. */
class WaveRepositoryHttpTest {
    private lateinit var server: MockWebServer
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Before fun setUp() { server = MockWebServer().also { it.start() } }
    @After fun tearDown() { server.shutdown() }

    private fun repo(): WaveRepository {
        val api = Retrofit.Builder().baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build().create(MqApi::class.java)
        return WaveRepository(
            api = api,
            inputs = {
                WaveSignalsBuilder.Input(
                    likedTracksData = listOf(Track(id = "sc_1", title = "L", artist = "Liked", source = "soundcloud", scTrackId = 1)),
                    queueIds = listOf("sc_5"),
                    tasteGenres = listOf("Pop"),
                )
            },
            anonId = { "and_test1234" },
            legacyInputs = { WaveRepository.LegacyInputs(setOf("Pop"), setOf("1"), emptySet()) },
        )
    }

    private fun ok(body: String) = MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body)
    private fun tr(id: String) = """{"id":"$id","title":"$id","artist":"A","source":"soundcloud","playbackCount":3}"""

    @Test
    fun startPostsSharedSignalsAndNextReusesTheSession() = runBlocking {
        server.enqueue(ok("""{"sessionId":"ws_1","tracks":[${tr("sc_10")},${tr("sc_11")}],"reasons":["liked_artist","discovery"],"meta":{}}"""))
        server.enqueue(ok("""{"tracks":[${tr("sc_11")},${tr("sc_12")}],"reasons":["x","y"]}"""))
        val r = repo()
        val first = r.start(15)
        assertEquals(listOf("sc_10", "sc_11"), first.map { it.id })
        assertEquals("liked_artist", first[0]._reason)
        assertEquals(WaveRepository.Source.WAVE_API, r.lastSource)
        val startReq = server.takeRequest()
        assertEquals("/api/wave", startReq.path)
        val body = Json.parseToJsonElement(startReq.body.readUtf8()).jsonObject
        assertEquals("and_test1234", body.getValue("anonId").jsonPrimitive.content)
        assertEquals(listOf("Liked"), body.getValue("likedArtists").jsonArray.map { it.jsonPrimitive.content })
        assertEquals(listOf("1"), body.getValue("likedScIds").jsonArray.map { it.jsonPrimitive.content })
        assertEquals(listOf("sc_5"), body.getValue("excludeIds").jsonArray.map { it.jsonPrimitive.content })

        val next = r.nextBatch(15)
        assertEquals(listOf("sc_12"), next.map { it.id }) // already-served sc_11 is not repeated
        val nextReq = server.takeRequest()
        assertEquals("/api/wave/next", nextReq.path)
        val nb = Json.parseToJsonElement(nextReq.body.readUtf8()).jsonObject
        assertEquals("ws_1", nb.getValue("sessionId").jsonPrimitive.content)
        assertTrue(nb.getValue("excludeIds").jsonArray.map { it.jsonPrimitive.content }.containsAll(listOf("sc_10", "sc_11")))
    }

    @Test
    fun fallsBackToLegacyRecommendationsWhenWaveFails() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(ok("""{"tracks":[${tr("sc_20")}]}"""))
        val r = repo()
        val batch = r.start(15)
        assertEquals(listOf("sc_20"), batch.map { it.id })
        assertEquals(WaveRepository.Source.LEGACY, r.lastSource)
        assertEquals("/api/wave", server.takeRequest().path)
        assertTrue(server.takeRequest().path!!.startsWith("/api/music/recommendations?wave=1"))
    }

    @Test
    fun emptyWaveAnswerAlsoFallsBack() = runBlocking {
        server.enqueue(ok("""{"sessionId":"local_error","tracks":[],"reasons":[],"meta":{"error":"wave_start_failed"}}"""))
        server.enqueue(ok("""{"tracks":[${tr("sc_30")}]}"""))
        assertEquals(listOf("sc_30"), repo().start(15).map { it.id })
    }
}
