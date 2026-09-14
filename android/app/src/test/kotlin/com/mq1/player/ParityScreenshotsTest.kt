package com.mq1.player

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import com.mq1.player.di.ServiceLocator
import com.mq1.player.parity.ParityHostActivity
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * WEB ↔ ANDROID VISUAL PARITY harness.
 *
 * Renders each screen at EXACTLY the web reference viewport 375×844
 * (Robolectric mdpi → 1dp = 1px, so the PNG is 375×844 like the web
 * screenshots in download/screens/parity/web-*-375.png) with the REAL
 * design system (Manrope + MqType + exact theme palette).
 *
 * Output: /home/z/my-project/download/screens/parity/android-<name>-375.png
 * (gitignored build artifact — regenerable via this test).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w375dp-h844dp")
class ParityScreenshotsTest {

@get:Rule
    val compose = createAndroidComposeRule<ParityHostActivity>()

    @Before
    fun initDi() {
        ParityStub.startOnce()
        com.mq1.player.di.ServiceLocator.init(compose.activity.applicationContext)
    }

    // ── AUTH ────────────────────────────────────────────────────────────────
    @Test
    fun `auth landing 375x844`() {
        compose.setContent { ParityHost { com.mq1.player.ui.screens.LoginScreen(onLoggedIn = { }) } }
        // bot name comes from the local stub — wait for the real button
        compose.waitUntil(10_000) {
            compose.onAllNodesWithText("Открыть бота в Telegram").fetchSemanticsNodes().isNotEmpty()
        }
        compose.waitForIdle()
        capture375x844(compose, "auth")
    }

    // ── PROFILE (fixture data, MyProfileScreenTest pattern) ─────────────────
    @Test
    fun `profile 375x844`() {
        val ui = com.mq1.player.ui.vm.MyProfileViewModel.ProfileUi(
            userId = "u1",
            username = "listener",
            email = "listener@example.com",
            avatar = null,
            role = "user",
            createdAt = "2026-01-15T08:30:00.000Z",
            telegramUsername = "tg_name",
            confirmed = true,
            playlists = listOf(
                com.mq1.player.data.api.PlaylistDto(id = "pl1", name = "Ночной драйв", trackCount = 12),
                com.mq1.player.data.api.PlaylistDto(id = "pl2", name = "Кинематик", trackCount = 5),
            ),
            likes = listOf(
                com.mq1.player.data.api.Track(id = "t1", title = "Abracadabra", artist = "Steve Miller Band"),
                com.mq1.player.data.api.Track(id = "t2", title = "Blue Sky", artist = "Steve Miller Band"),
            ),
            history = listOf(
                com.mq1.player.data.api.Track(id = "t3", title = "Recent One", artist = "Other Artist"),
            ),
            friends = listOf(
                com.mq1.player.data.api.Friend(id = "f1", username = "alice", avatar = "", friendshipId = "fr1"),
                com.mq1.player.data.api.Friend(id = "f2", username = "bob", avatar = "", friendshipId = "fr2"),
            ),
            online = mapOf("f1" to true),
            loading = false,
            error = null,
        )
        compose.setContent {
            ParityHost {
                com.mq1.player.ui.screens.ProfileBody(
                    ui = ui,
                    onBack = { }, onRefresh = { }, onChangeAvatar = { }, onEdit = { },
                    onOpenChat = { _, _ -> }, onOpenArtist = { }, onOpenPlaylist = { },
                    onOpenFriends = { }, onOpenSettings = { }, onOpenFullPlayer = { },
                    onLogout = { }, playTracks = { },
                )
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "profile")
    }

    private fun track(id: String, title: String, artist: String) =
        com.mq1.player.data.api.Track(
            id = id, title = title, artist = artist,
            duration = 212.0, cover = "", scTrackId = id.hashCode().toLong()
        )

    // ── HOME (fixture data mirroring the web screenshot state) ──────────────
    @Test
    fun `home 375x844`() {
        seedNowPlaying()
        val ui = com.mq1.player.ui.vm.HomeViewModel.HomeUi(
            history = listOf(
                track("t1", "Ambient Dreams", "MQ Demo"),
                track("t2", "Electronic Pulse", "MQ Demo"),
                track("t3", "Jazz Evening", "MQ Demo"),
            ),
            wavePreview = listOf(
                track("w1", "Abracadabra", "Steve Miller Band"),
                track("w2", "Blue Sky", "Steve Miller Band"),
                track("w3", "Fly Like an Eagle", "Steve Miller Band"),
            ),
            publicPlaylists = listOf(
                com.mq1.player.data.api.PlaylistDto(id = "pl1", name = "Ночной драйв", trackCount = 12, username = "listener"),
                com.mq1.player.data.api.PlaylistDto(id = "pl2", name = "Кинематик", trackCount = 5, username = "listener"),
            ),
            loading = false,
        )
        compose.setContent {
            ParityHost {
                ParityScaffoldHost(route = "home") {
                com.mq1.player.ui.screens.HomeBody(
                    ui = ui,
                    activeTrack = track("t1", "Ambient Dreams", "MQ Demo"),
                    isPlaying = true,
                    progress = 0.42f,
                    playingTrackId = "t1",
                    favoriteIds = setOf("w1"),
                    onOpenFullPlayer = {}, onOpenArtist = {}, onOpenPlaylist = {},
                    onOpenSettings = {}, onOpenFavorites = {}, onOpenHistory = {},
                    onOpenChats = {}, onPlayQueue = { _, _ -> }, onFavorite = {},
                    onStartWave = {}, onNext = {}, onTogglePlay = {}, onRetry = {},
                )
                }
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "home")
    }

    /** Seed the real controller queue state (test-only reflection). */
    private fun seedNowPlaying(
        id: String = "t1",
        title: String = "Ambient Dreams",
        artist: String = "MQ Demo",
    ) {
        runCatching {
            val c = ServiceLocator.playbackController
            val fq = c.javaClass.getDeclaredField("_queue").apply { isAccessible = true }
            (fq.get(c) as kotlinx.coroutines.flow.MutableStateFlow<List<com.mq1.player.data.api.Track>>)
                .value = listOf(parityTrack(id, title, artist))
            val fi = c.javaClass.getDeclaredField("_currentIndex").apply { isAccessible = true }
            (fi.get(c) as kotlinx.coroutines.flow.MutableStateFlow<Int>).value = 0
            val fd = c.javaClass.getDeclaredField("_durationMs").apply { isAccessible = true }
            (fd.get(c) as kotlinx.coroutines.flow.MutableStateFlow<Long>).value = 40000L
            val fp = c.javaClass.getDeclaredField("_positionMs").apply { isAccessible = true }
            (fp.get(c) as kotlinx.coroutines.flow.MutableStateFlow<Long>).value = 17000L
            val fpl = c.javaClass.getDeclaredField("_isPlaying").apply { isAccessible = true }
            (fpl.get(c) as kotlinx.coroutines.flow.MutableStateFlow<Boolean>).value = true
        }
    }

    private fun parityTrack(id: String, title: String, artist: String) =
        com.mq1.player.data.api.Track(
            id = id, title = title, artist = artist,
            duration = 212.0, cover = "", scTrackId = id.hashCode().toLong()
        )

    // ── FULL PLAYER (real controller state — playQueue sets queue/index
    //    synchronously before any Media3 work) ─────────────────────────────
    @Test
    fun `fullplayer 375x844`() {
        seedNowPlaying("fp1", "Jazz Cabbage", "Wooli & Cyclops")
        compose.setContent {
            ParityHost {
                com.mq1.player.ui.screens.FullPlayerScreen(
                    onClose = {}, onOpenArtist = {}, onOpenMixer = {}
                )
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "fullplayer")
    }

    // ── MIXER (local DSP — real params) ───────────────────────────────────
    @Test
    fun `mixer 375x844`() {
        // web shot state: processing ON, EQ ON, preset selected
        runCatching {
            val m = ServiceLocator.mixerEngine
            m.setBypass(false)
            m.setEqEnabled(true)
            m.applyPreset(com.mq1.player.dsp.EqSpec.PRESETS.first { it.first == "Электроника" }.second)
            m.setLimiterEnabled(true)
        }
        compose.setContent {
            ParityHost { com.mq1.player.ui.screens.MixerScreen(onBack = {}) }
        }
        compose.waitForIdle()
        capture375x844(compose, "mixer")
    }

    // ── CONTEXT MENU (web sheet over a dimmed backdrop) ───────────────────
    @Test
    fun `contextmenu 375x844`() {
        compose.setContent {
            ParityHost {
                // web shot: the menu overlays the HOME screen (dimmed scrim)
                Box(Modifier.fillMaxSize()) {
                    com.mq1.player.ui.screens.HomeBody(
                        ui = com.mq1.player.ui.vm.HomeViewModel.HomeUi(
                            history = listOf(parityTrack("t1", "Ambient Dreams", "MQ Demo")),
                            wavePreview = listOf(parityTrack("w1", "Blue Sky", "Steve Miller Band")),
                            loading = false,
                        ),
                        activeTrack = parityTrack("t1", "Ambient Dreams", "MQ Demo"),
                        isPlaying = true, progress = 0.4f, playingTrackId = "t1",
                        favoriteIds = emptySet(),
                        onOpenFullPlayer = {}, onOpenArtist = {}, onOpenPlaylist = {},
                        onOpenSettings = {}, onOpenFavorites = {}, onOpenHistory = {},
                        onOpenChats = {}, onPlayQueue = { _, _ -> }, onFavorite = {},
                        onStartWave = {}, onNext = {}, onTogglePlay = {}, onRetry = {},
                    )
                    com.mq1.player.ui.components.MqTrackContextMenu(
                    track = parityTrack("cm1", "Jazz Cabbage", "Wooli & Cyclops"),
                    isLiked = false,
                    playlists = listOf(
                        com.mq1.player.data.api.PlaylistDto(
                            id = "pl1", name = "Ночной драйв", trackCount = 12
                        )
                    ),
                    onDismiss = {}, onPlay = {}, onAddToQueue = {},
                    onToggleLike = {}, onOpenArtist = {},
                    onAddToPlaylist = {}, onCreatePlaylistAndAdd = {},
                    )
                }
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "contextmenu")
    }
}
