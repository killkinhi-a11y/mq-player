package com.mq1.player

import com.mq1.player.parity.ParityHostActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * WEB ↔ ANDROID VISUAL PARITY — Search + Library screens.
 *
 * Renders SearchBody / LibraryBody at the web reference viewport 375×844
 * (Robolectric mdpi → 1dp = 1px) with the REAL design system
 * (Manrope + MqType + default palette), mirroring the states captured in
 * download/screens/parity/web-search-375.png and web-library-375.png:
 *  - search: idle hero (no query, no history, no quick picks)
 *  - library: favorites tab, empty collection («Пока пусто»)
 * plus populated fixtures exercising the results list, playlist grid and
 * history list.
 *
 * Output: /home/z/my-project/download/screens/parity/android-<name>-375.png
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w375dp-h844dp")
class ParitySearchLibraryTest {

    @get:Rule
    val compose = createAndroidComposeRule<ParityHostActivity>()

    @Before
    fun initDi() {
        ParityStub.startOnce()
        seedNowPlaying()
        com.mq1.player.di.ServiceLocator.init(compose.activity.applicationContext)
    }

    private fun track(
        id: String,
        title: String,
        artist: String,
        duration: Double = 212.0,
    ) = com.mq1.player.data.api.Track(
        id = id, title = title, artist = artist,
        duration = duration, cover = "", genre = "",
        scTrackId = id.hashCode().toLong()
    )

    // ── SEARCH: idle state — mirrors web-search-375.png ─────────────────────

    @Test
    fun `search 375x844`() {
        val ui = com.mq1.player.ui.vm.SearchViewModel.SearchUi(
            query = "",
            results = emptyList(),
            loading = false,
            searched = false,
            error = null,
            history = emptyList(),
        )
        compose.setContent {
            ParityHost {
                ParityScaffoldHost(route = "search") {
                com.mq1.player.ui.screens.SearchBody(
                    ui = ui,
                    playingTrackId = null,
                    favorites = emptyList(),
                    onQueryChange = { },
                    onClearHistory = { },
                    onRemoveHistoryItem = { },
                    onPlayQueue = { _, _ -> },
                    onFavorite = { },
                    onOpenArtist = { },
                    onRetry = { },
                )
                }
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "search")
    }

    // ── SEARCH: results state (TrackRow list + results head) ────────────────

    @Test
    fun `search results 375x844`() {
        val results = listOf(
            track("t1", "Abracadabra", "Steve Miller Band", 212.0),
            track("t2", "Blue Sky", "Steve Miller Band", 254.0),
            track("t3", "Fly Like an Eagle", "Steve Miller Band", 286.0),
            track("t4", "Ambient Dreams", "MQ Demo", 45.0),
            track("t5", "Electronic Pulse", "MQ Demo", 180.0),
        )
        val ui = com.mq1.player.ui.vm.SearchViewModel.SearchUi(
            query = "Steve Miller Band",
            results = results,
            loading = false,
            searched = true,
            error = null,
            history = listOf("Steve Miller Band", "джаз"),
        )
        compose.setContent {
            ParityHost {
                ParityScaffoldHost(route = "search") {
                com.mq1.player.ui.screens.SearchBody(
                    ui = ui,
                    playingTrackId = "t1",
                    favorites = listOf(results[0], results[3]),
                    onQueryChange = { },
                    onClearHistory = { },
                    onRemoveHistoryItem = { },
                    onPlayQueue = { _, _ -> },
                    onFavorite = { },
                    onOpenArtist = { },
                    onRetry = { },
                )
                }
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "search-results")
    }

    // ── LIBRARY: favorites tab, empty — mirrors web-library-375.png ─────────

    @Test
    fun `library 375x844`() {
        val ui = com.mq1.player.ui.vm.PlaylistViewModel.PlaylistUi(
            mine = emptyList(),
            public = emptyList(),
            current = null,
            loading = false,
            error = null,
        )
        compose.setContent {
            ParityHost {
                ParityScaffoldHost(route = "library") {
                com.mq1.player.ui.screens.LibraryBody(
                    ui = ui,
                    activeTab = 0,
                    favorites = emptyList(),
                    history = emptyList(),
                    playingTrackId = null,
                    favoriteIds = emptySet(),
                    query = "",
                    sort = 0,
                    onTabChange = { },
                    onQueryChange = { },
                    onSortChange = { },
                    onOpenPlaylist = { },
                    onPlayQueue = { _, _ -> },
                    onFavorite = { },
                    onGoHome = { },
                )
                }
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "library")
    }

    // ── LIBRARY: playlists grid ─────────────────────────────────────────────

    @Test
    fun `library playlists 375x844`() {
        val ui = com.mq1.player.ui.vm.PlaylistViewModel.PlaylistUi(
            mine = listOf(
                com.mq1.player.data.api.PlaylistDto(
                    id = "pl1", name = "Ночной драйв", trackCount = 12, username = "listener"
                ),
                com.mq1.player.data.api.PlaylistDto(
                    id = "pl2", name = "Кинематик", trackCount = 5, username = "listener"
                ),
            ),
            public = emptyList(),
            current = null,
            loading = false,
            error = null,
        )
        compose.setContent {
            ParityHost {
                ParityScaffoldHost(route = "library") {
                com.mq1.player.ui.screens.LibraryBody(
                    ui = ui,
                    activeTab = 1,
                    favorites = emptyList(),
                    history = emptyList(),
                    playingTrackId = null,
                    favoriteIds = emptySet(),
                    query = "",
                    sort = 0,
                    onTabChange = { },
                    onQueryChange = { },
                    onSortChange = { },
                    onOpenPlaylist = { },
                    onPlayQueue = { _, _ -> },
                    onFavorite = { },
                    onGoHome = { },
                )
                }
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "library-playlists")
    }

    // ── LIBRARY: history list ───────────────────────────────────────────────

    @Test
    fun `library history 375x844`() {
        val history = listOf(
            track("h1", "Jazz Evening", "MQ Demo", 301.0),
            track("h2", "Ambient Dreams", "MQ Demo", 45.0),
            track("h3", "Fly Like an Eagle", "Steve Miller Band", 286.0),
        )
        val ui = com.mq1.player.ui.vm.PlaylistViewModel.PlaylistUi(
            mine = emptyList(),
            public = emptyList(),
            current = null,
            loading = false,
            error = null,
        )
        compose.setContent {
            ParityHost {
                ParityScaffoldHost(route = "library") {
                com.mq1.player.ui.screens.LibraryBody(
                    ui = ui,
                    activeTab = 2,
                    favorites = listOf(track("t1", "Abracadabra", "Steve Miller Band", 212.0)),
                    history = history,
                    playingTrackId = "h1",
                    favoriteIds = setOf("t1"),
                    query = "",
                    sort = 0,
                    onTabChange = { },
                    onQueryChange = { },
                    onSortChange = { },
                    onOpenPlaylist = { },
                    onPlayQueue = { _, _ -> },
                    onFavorite = { },
                    onGoHome = { },
                )
                }
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "library-history")
    }
}
