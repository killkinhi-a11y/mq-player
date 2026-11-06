package com.mq1.player

import retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.Track
import com.mq1.player.data.sync.SyncLocal
import com.mq1.player.data.sync.SyncRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Android ⇄ /api/sync against a MockWebServer that speaks the real route's
 * shapes (GET {data:{key:value}}, POST {data:{…}} per-key upsert).
 */
class SyncRepositoryHttpTest {
    private lateinit var server: MockWebServer
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }
    private val sleeps = mutableListOf<Long>()

    private class FakeLocal(var state: SyncLocal.State) : SyncLocal {
        val addedLiked = mutableListOf<Track>()
        val addedHistory = mutableListOf<Pair<Track, Long>>()
        var cleared: Pair<Set<String>, Set<String>>? = null
        override suspend fun syncState() = state
        override suspend fun applyServerAdditions(liked: List<Track>, disliked: List<Track>, history: List<Pair<Track, Long>>) {
            addedLiked += liked; addedHistory += history
        }
        override suspend fun clearTombstones(liked: Set<String>, disliked: Set<String>) { cleared = liked to disliked }
    }

    private fun t(id: String) = Track(id = id, title = id, artist = "A", source = "soundcloud")
    private fun state(
        userId: String? = "u1", favorites: List<Track> = emptyList(), history: List<Track> = emptyList(),
        removedLiked: Set<String> = emptySet(),
    ) = SyncLocal.State(userId, favorites, emptyList(), history, history.map { 5L }, removedLiked, emptySet())

    private fun repo(local: SyncLocal): SyncRepository {
        val client = OkHttpClient.Builder().readTimeout(2, TimeUnit.SECONDS).build()
        val api = Retrofit.Builder().baseUrl(server.url("/")).client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build().create(MqApi::class.java)
        return SyncRepository(api, local, CoroutineScope(Dispatchers.Unconfined), json, sleep = { sleeps += it })
    }

    @Before fun setUp() { server = MockWebServer().also { it.start() } }
    @After fun tearDown() { server.shutdown() }

    private fun ok(body: String) = MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body)

    @Test
    fun pullsMergesAndPushesOnlyChangedManagedKeys() = runBlocking {
        server.enqueue(ok("""{"data":{
            "likedTracks":["sc_1"],
            "likedTracksData":[{"id":"sc_1","title":"web","artist":"W","source":"soundcloud","webOnlyField":42}],
            "dislikedTracks":[],"dislikedTracksData":[],
            "history":[],
            "playlists":[{"id":"p1","tracks":[]}],
            "settings":{"volume":40}}}"""))
        server.enqueue(ok("""{"message":"Data synced"}"""))
        val local = FakeLocal(state(favorites = listOf(t("sc_2"))))

        val res = repo(local).syncNow()

        assertTrue(res is SyncRepository.Result.Ok)
        assertEquals(listOf("sc_1"), local.addedLiked.map { it.id }) // server like reached Android
        assertEquals("GET", server.takeRequest().method)
        val post = server.takeRequest()
        assertEquals("POST", post.method)
        assertEquals("/api/sync", post.path)
        val data = Json.parseToJsonElement(post.body.readUtf8()).jsonObject.getValue("data").jsonObject
        assertEquals(setOf("likedTracks", "likedTracksData"), data.keys) // never playlists/settings, unchanged keys skipped
        assertEquals(listOf("sc_1", "sc_2"), data.getValue("likedTracks").jsonArray.map { it.jsonPrimitive.content })
        val pushed = data.getValue("likedTracksData").jsonArray.map { it.jsonObject }
        assertEquals(listOf("sc_2", "sc_1"), pushed.map { it.getValue("id").jsonPrimitive.content })
        assertEquals("42", pushed[1].getValue("webOnlyField").jsonPrimitive.content) // web data pushed back verbatim
    }

    @Test
    fun noPushWhenNothingChanged() = runBlocking {
        server.enqueue(ok("""{"data":{"likedTracks":["sc_2"],"likedTracksData":[{"id":"sc_2","title":"x","artist":"A","source":"soundcloud","duration":215}],
            "dislikedTracks":[],"dislikedTracksData":[],"history":[]}}"""))
        val res = repo(FakeLocal(state(favorites = listOf(t("sc_2"))))).syncNow()
        assertEquals(SyncRepository.Result.Ok(emptySet()), res)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun localUnlikeIsNotResurrectedAndIsPushed() = runBlocking {
        server.enqueue(ok("""{"data":{"likedTracks":["sc_1"],"likedTracksData":[{"id":"sc_1","title":"x","artist":"A","source":"soundcloud"}]}}"""))
        server.enqueue(ok("{}"))
        val local = FakeLocal(state(favorites = emptyList(), removedLiked = setOf("sc_1")))
        repo(local).syncNow()
        assertTrue(local.addedLiked.isEmpty())
        server.takeRequest()
        val data = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject.getValue("data").jsonObject
        assertEquals(0, data.getValue("likedTracks").jsonArray.size)
        assertEquals(setOf("sc_1") to emptySet<String>(), local.cleared)
    }

    @Test
    fun historyFromServerKeepsPlayCountAndReachesAndroid() = runBlocking {
        server.enqueue(ok("""{"data":{"history":[{"track":{"id":"sc_9","title":"h","artist":"A","source":"soundcloud"},"playedAt":1717000000000,"playCount":7}]}}"""))
        server.enqueue(ok("{}"))
        val local = FakeLocal(state(history = listOf(t("sc_3"))))
        repo(local).syncNow()
        assertEquals(listOf("sc_9" to 1717000000000L), local.addedHistory.map { it.first.id to it.second })
        server.takeRequest()
        val hist = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
            .getValue("data").jsonObject.getValue("history").jsonArray.map { it.jsonObject }
        assertEquals("7", hist[0].getValue("playCount").jsonPrimitive.content)
        assertEquals(listOf("sc_9", "sc_3"), hist.map { it.getValue("track").jsonObject.getValue("id").jsonPrimitive.content })
    }

    @Test
    fun demoAndLoggedOutUsersNeverTouchTheServer() = runBlocking {
        assertEquals(SyncRepository.Result.SkippedDemo, repo(FakeLocal(state(userId = "demo-user-id"))).syncNow())
        assertEquals(SyncRepository.Result.SkippedDemo, repo(FakeLocal(state(userId = null))).syncNow())
        assertEquals(0, server.requestCount)
    }

    @Test
    fun unauthorizedStopsWithoutRetryOrPush() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401))
        assertEquals(SyncRepository.Result.Unauthorized, repo(FakeLocal(state(favorites = listOf(t("sc_2"))))).syncNow())
        assertEquals(1, server.requestCount)
        assertTrue(sleeps.isEmpty())
    }

    @Test
    fun serverErrorsAreRetriedWithBackoffAndNeverPushWithoutPull() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(500))
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.enqueue(MockResponse().setResponseCode(503))
        val local = FakeLocal(state(favorites = listOf(t("sc_2"))))
        val res = repo(local).syncNow()
        assertTrue(res is SyncRepository.Result.Failed)
        assertEquals(listOf(1000L, 2000L), sleeps)
        assertTrue(server.requestCount >= 3) // OkHttp may transparently retry the dropped connection
        repeat(server.requestCount) { assertEquals("GET", server.takeRequest().method) } // no POST after failed pulls
        assertEquals(null, local.cleared) // tombstones kept for the next attempt
    }

    @Test
    fun recoversOnRetry() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(502))
        server.enqueue(ok("""{"data":{}}"""))
        server.enqueue(ok("{}"))
        val res = repo(FakeLocal(state(favorites = listOf(t("sc_2"))))).syncNow()
        assertTrue(res is SyncRepository.Result.Ok)
        assertFalse((res as SyncRepository.Result.Ok).pushedKeys.isEmpty())
    }

    @Test
    fun malformedPayloadIsNotRetriedAndDoesNotPush() = runBlocking {
        server.enqueue(ok("not json"))
        val res = repo(FakeLocal(state(favorites = listOf(t("sc_2"))))).syncNow()
        assertTrue(res is SyncRepository.Result.Failed)
        assertEquals(1, server.requestCount)
    }
}
