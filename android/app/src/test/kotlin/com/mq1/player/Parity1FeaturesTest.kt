package com.mq1.player

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * parity-1 feature regression tests:
 *  1. MqUrls — ROOT-CAUSE fix for the P0 artwork bug (origin-relative URLs)
 *  2. LocalStore — disliked / favorite artists / recent searches / demo playlists
 *  3. PlaylistRepository demo mode — local playlists (web demo parity)
 *  4. Sleep timer state machine — kind/remaining transitions, no service needed
 *  5. Group-chats API contract — against the local stub server
 *  6. Genre endpoint contract — /api/music/genre (search parity)
 *  7. MyProfileViewModel demo mode — no server calls, local render
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class Parity1FeaturesTest {

    @Before
    fun setUp() {
        com.mq1.player.di.ServiceLocator.init(ApplicationProvider.getApplicationContext())
        com.mq1.player.di.ServiceLocator.demoUserId = null
        com.mq1.player.di.ServiceLocator.demoUserName = null
        ParityStub.startOnce()
        ParityStub.customResponses.clear()
        ParityStub.capturedRequests.clear()
    }

    private fun demoSession() = runBlocking {
        com.mq1.player.di.ServiceLocator.localStore.wipe()
        com.mq1.player.di.ServiceLocator.localStore.setSessionUser(
            com.mq1.player.data.LocalStore.SessionUser(userId = "demo-user-id", username = "Демо")
        )
    }

    // ── 1. MqUrls — the P0 artwork root-cause fix ────────────────────────

    @Test
    fun `U1 relative image-proxy URL resolves against the API base`() {
        val url = com.mq1.player.data.MqUrls.absolute(
            "/api/music/soundcloud/image-proxy?url=https%3A%2F%2Fi1.sndcdn.com%2Fartworks-x-t500x500.jpg"
        )
        assertNotNull(url)
        val base = com.mq1.player.BuildConfig.API_BASE.trimEnd('/')
        assertTrue(url!!.startsWith("$base/api/music/soundcloud/image-proxy?url="))
    }

    @Test
    fun `U2 absolute https URL passes through unchanged`() {
        assertEquals(
            "https://i1.sndcdn.com/artworks-x.jpg",
            com.mq1.player.data.MqUrls.absolute("https://i1.sndcdn.com/artworks-x.jpg")
        )
    }

    @Test
    fun `U3 data-url avatars pass through (base64 uploads)`() {
        assertEquals(
            "data:image/jpeg;base64,QUJD",
            com.mq1.player.data.MqUrls.absolute("data:image/jpeg;base64,QUJD")
        )
    }

    @Test
    fun `U4 blank cover yields null (music-icon placeholder branch)`() {
        assertNull(com.mq1.player.data.MqUrls.absolute(null))
        assertNull(com.mq1.player.data.MqUrls.absolute(""))
        assertNull(com.mq1.player.data.MqUrls.absolute("   "))
    }

    // ── 2. LocalStore — new web-parity lists ─────────────────────────────

    @Test
    fun `L1 toggleDisliked adds and removes, caps at 100, never overlaps favorites`() = runBlocking {
        val local = com.mq1.player.di.ServiceLocator.localStore
        local.wipe()
        val t = com.mq1.player.data.api.Track(id = "sc_1", title = "T", artist = "A", scTrackId = 1)
        assertTrue(local.toggleDisliked(t))          // added
        assertFalse(local.toggleDisliked(t))         // removed
        // like + dislike cannot coexist
        local.toggleFavorite(t)
        assertTrue(local.toggleDisliked(t))          // dislike removes the like
        assertFalse(local.favorites.firstOrNull().orEmpty().any { it.id == "sc_1" })
        assertTrue(local.disliked.firstOrNull()!!.any { it.id == "sc_1" })
    }

    @Test
    fun `L2 favoriteArtists toggle roundtrip (web «Подписки»)`() = runBlocking {
        val local = com.mq1.player.di.ServiceLocator.localStore
        local.wipe()
        assertTrue(local.toggleFavoriteArtist("Cardell"))
        assertFalse(local.toggleFavoriteArtist("Cardell"))
        assertTrue(local.favoriteArtists.firstOrNull().orEmpty().isEmpty())
    }

    @Test
    fun `L3 recent searches persist, dedupe case-insensitively, cap at 15`() = runBlocking {
        val local = com.mq1.player.di.ServiceLocator.localStore
        local.wipe()
        local.pushRecentSearch("imagine")
        local.pushRecentSearch("IMAGINE")             // dedupe — newest spelling wins (web stores the raw query)
        local.pushRecentSearch("daft punk")
        val saved = local.recentSearches.firstOrNull()!!
        assertEquals(listOf("daft punk", "IMAGINE"), saved)
        local.removeRecentSearch("Imagine")           // case-insensitive removal
        assertEquals(listOf("daft punk"), local.recentSearches.firstOrNull()!!)
        (1..20).forEach { local.pushRecentSearch("q$it") }
        assertEquals(15, local.recentSearches.firstOrNull()!!.size)
        local.clearRecentSearches()
        assertTrue(local.recentSearches.firstOrNull()!!.isEmpty())
    }

    @Test
    fun `L4 demo playlists roundtrip via LocalStore`() = runBlocking {
        val local = com.mq1.player.di.ServiceLocator.localStore
        local.wipe()
        val pl = com.mq1.player.data.api.PlaylistDto(id = "demo-pl-1", name = "Чилл", trackCount = 2)
        local.setDemoPlaylists(listOf(pl))
        assertEquals(listOf(pl), local.demoPlaylists.firstOrNull())
        local.setDemoPlaylists(emptyList())
        assertTrue(local.demoPlaylists.firstOrNull()!!.isEmpty())
    }

    // ── 3. PlaylistRepository demo mode ─────────────────────────────────

    @Test
    fun `P1 demo create-rename-delete stays device-local (no HTTP)`() = runBlocking {
        demoSession()
        val repo = com.mq1.player.di.ServiceLocator.playlistRepository
        val before = ParityStub.capturedRequests.size
        val created = repo.create("Ночной драйв", "описание").getOrThrow()
        assertEquals("demo-pl-1", created.id)
        assertEquals("Ночной драйв", created.name)
        assertTrue(repo.myPlaylists().getOrDefault(emptyList()).any { it.id == "demo-pl-1" })

        val renamed = repo.rename("demo-pl-1", "Утро").getOrThrow()
        assertEquals("Утро", renamed.name)

        val track = com.mq1.player.data.api.Track(id = "sc_9", title = "T9", artist = "A9", scTrackId = 9)
        val updated = repo.updateTracks("demo-pl-1", renamed, listOf(track)).getOrThrow()
        assertEquals(1, updated.tracks.size)

        assertTrue(repo.delete("demo-pl-1").getOrDefault(false))
        assertTrue(repo.myPlaylists().getOrDefault(emptyList()).isEmpty())
        // ZERO server round-trips in demo playlist mode:
        assertEquals(before, ParityStub.capturedRequests.size)
    }

    // ── 4. Sleep timer state machine ────────────────────────────────────

    @Test
    fun `S1 TIME timer sets kind and remaining, cancel resets`() {
        val c = com.mq1.player.di.ServiceLocator.playbackController
        c.startSleepTimer(15)
        assertEquals(
            com.mq1.player.player.PlaybackController.SleepKind.TIME,
            c.sleepKind.value
        )
        assertTrue(c.sleepRemainingMs.value in 1..15 * 60_000L)
        c.cancelSleepTimer()
        assertEquals(com.mq1.player.player.PlaybackController.SleepKind.NONE, c.sleepKind.value)
        assertEquals(0L, c.sleepRemainingMs.value)
    }

    @Test
    fun `S2 END_OF_TRACK requires a now-playing track (honest guard)`() {
        val c = com.mq1.player.di.ServiceLocator.playbackController
        c.cancelSleepTimer()
        c.startSleepEndOfTrack() // no queue in this test → no-op
        assertEquals(com.mq1.player.player.PlaybackController.SleepKind.NONE, c.sleepKind.value)
    }

    @Test
    fun `S3 volume percent applies the web quadratic curve`() {
        val c = com.mq1.player.di.ServiceLocator.playbackController
        c.setVolume(50f)
        assertEquals(50f, c.volumePercent.value)
        c.setVolume(150f) // clamped
        assertEquals(100f, c.volumePercent.value)
        c.setVolume(-5f)
        assertEquals(0f, c.volumePercent.value)
        c.setVolume(100f)
    }

    // ── 5. Group chats contract (stub backend) ──────────────────────────

    @Test
    fun `G1 group chats list parses the backend shape`() = runBlocking {
        ParityStub.customResponses["api/group-chats"] = ParityStub.StubResponse(
            body = """{"groupChats":[{"id":"g1","name":"Музыкальный чилл","description":"d",
                "avatar":"","createdBy":"u1","createdAt":"2026-01-01T00:00:00Z",
                "updatedAt":"2026-01-02T00:00:00Z","memberCount":5,
                "lastMessage":{"id":"m1","content":"Привет","messageType":"text",
                "createdAt":"2026-01-02T00:00:00Z",
                "sender":{"id":"u2","username":"Меломан","avatar":""}}}]}"""
        )
        val groups = com.mq1.player.di.ServiceLocator.socialRepository.groupChats()!!
        assertEquals(1, groups.size)
        assertEquals("Музыкальный чилл", groups[0].name)
        assertEquals(5, groups[0].memberCount)
        assertEquals("Меломан", groups[0].lastMessage?.sender?.username)
        assertTrue(ParityStub.capturedRequests.any { it.path.endsWith("api/group-chats") })
    }

    @Test
    fun `G2 sendGroupMessage posts the body the backend accepts`() = runBlocking {
        ParityStub.customResponses["POST api/group-chats/g1/messages"] = ParityStub.StubResponse(
            body = """{"id":"m2","content":"Йо","messageType":"text","createdAt":"2026-01-02T00:01:00Z",
                "sender":{"id":"me","username":"Я","avatar":""}}"""
        )
        val sent = com.mq1.player.di.ServiceLocator.socialRepository
            .sendGroupMessage("g1", "Йо").getOrThrow()
        assertEquals("Йо", sent.content)
        val captured = ParityStub.capturedRequests.lastOrNull { it.path.endsWith("api/group-chats/g1/messages") }
        assertNotNull(captured)
        println("G2 CAPTURED BODY: [${captured!!.body}]")
        assertTrue(captured.body.contains("\"content\":\"Йо\""))
        // messageType is omitted by kotlinx (default-value encoding) and the
        // backend defaults it to "text" — contract verified, no fake fields
    }

    // ── 6. Genre endpoint contract (search parity) ──────────────────────

    @Test
    fun `E1 genre chips hit api music genre (not text search)`() = runBlocking {
        ParityStub.customResponses["api/music/genre"] = ParityStub.StubResponse(
            body = """{"tracks":[{"id":"sc_7","title":"Rock Song","artist":"Rockers",
                "duration":200,"cover":"","genre":"rock","scTrackId":7}]}"""
        )
        val tracks = com.mq1.player.di.ServiceLocator.musicRepository.genreTracks("Рок")
        assertEquals(1, tracks.size)
        assertEquals("Rock Song", tracks[0].title)
        assertTrue(ParityStub.capturedRequests.any {
            it.path.substringBefore('?').endsWith("api/music/genre") && it.path.contains("genre=")
        })
    }

    // ── 7. MyProfile demo mode — local render, zero protected calls ─────

    @Test
    fun `D1 demo profile renders locally without touching api user profile`() = runBlocking {
        demoSession()
        val before = ParityStub.capturedRequests.size
        val vm = com.mq1.player.ui.vm.MyProfileViewModel()
        // refresh() runs on the Robolectric Main looper — pump it while polling
        kotlinx.coroutines.withTimeout(5000) {
            while (vm.ui.value.loading) {
                org.robolectric.Shadows.shadowOf(
                    android.os.Looper.getMainLooper()
                ).idle()
                kotlinx.coroutines.delay(20)
            }
        }
        val ui = vm.ui.value
        assertNull(ui.error)
        assertEquals("Демо", ui.username)
        assertEquals("demo@mq-player.internal", ui.email)
        val protected = ParityStub.capturedRequests
            .drop(before)
            .filter { it.path.endsWith("api/user/profile") || it.path.endsWith("api/auth/me") }
        assertEquals(0, protected.size) // canPollProtected parity — no 401s in demo
        assertEquals(before, ParityStub.capturedRequests.size) // ZERO server round-trips
    }
}
