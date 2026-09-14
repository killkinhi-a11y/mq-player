package com.mq1.player

import com.mq1.player.parity.ParityHostActivity
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * WEB ↔ ANDROID VISUAL PARITY — Chats / Settings / Profile (sweep).
 *
 * Same harness as ParityScreenshotsTest: 375×844 viewport, real design
 * system (Manrope + MqType + default palette), stateless bodies driven by
 * fixtures that mirror the web reference screenshots.
 *
 * Output: download/screens/parity/android-{chats,settings,profile2}-375.png
 * ("profile" is already captured by ParityScreenshotsTest — this one uses
 * the swept ProfileBody and captures as "profile2").
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w375dp-h844dp")
class ParityChatsSettingsTest {

    @get:Rule
    val compose = createAndroidComposeRule<ParityHostActivity>()

    @Before
    fun initDi() {
        ParityStub.startOnce()
        seedNowPlaying()
        com.mq1.player.di.ServiceLocator.init(compose.activity.applicationContext)
    }

    // ── CHATS (web-chats-375.png — MessengerView list panel) ─────────────────

    @Test
    fun `chats 375x844`() {
        val ui = com.mq1.player.ui.vm.ChatsViewModel.ChatsUi(
            rows = listOf(
                // pinned group chat (web: pin + accent time + members fallback)
                com.mq1.player.ui.vm.ChatRowUi(
                    id = "g1",
                    name = "MQ Клуб",
                    isGroup = true,
                    memberCount = 5,
                    lastText = "Вы: Хорошая подборка!",
                    lastTime = "14:02",
                    lastTimeMillis = 300L,
                    pinned = true,
                ),
                // online friend with unread badge
                com.mq1.player.ui.vm.ChatRowUi(
                    id = "f1",
                    name = "alice",
                    online = true,
                    unread = 2,
                    lastText = "Привет! Послушай новый трек",
                    lastTime = "12:41",
                    lastTimeMillis = 200L,
                ),
                com.mq1.player.ui.vm.ChatRowUi(
                    id = "f2",
                    name = "bob",
                    unread = 5,
                    lastText = "Вы: Ок, спасибо!",
                    lastTime = "09:15",
                    lastTimeMillis = 100L,
                ),
            ),
            requestCount = 0,
            loading = false,
            error = false,
        )
        compose.setContent {
            ParityHost {
                ParityScaffoldHost(route = "chats") {
                com.mq1.player.ui.screens.ChatsBody(
                    ui = ui,
                    onOpenChat = { _, _ -> },
                    onOpenFriends = { },
                    onNewGroup = { },
                    onNewChat = { },
                    onRetry = { },
                )
                }
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "chats")
    }

    // ── SETTINGS (web-settings-375.png — SettingsView account tab) ───────────

    @Test
    fun `settings 375x844`() {
        compose.setContent {
            ParityHost {
                ParityScaffoldHost(route = "profile") {
                com.mq1.player.ui.screens.SettingsBody(
                    appearance = com.mq1.player.data.LocalStore.Appearance(
                        themeId = "default",
                        darkMode = "dark",
                    ),
                    username = "listener",
                    avatarUrl = null,
                    tasteGenres = setOf("Hip Hop", "Lo-Fi"),
                    notificationsEnabled = false,
                    onSetTheme = { },
                    onSetDarkMode = { },
                    onSaveTaste = { },
                    onOpenProfile = { },
                    onLogout = { },
                    onToggleNotifications = { },
                    onDownloadApk = { },
                    onOpenUrl = { },
                )
                }
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "settings")
    }

    // ── PROFILE sweep (web-profile-375.png — ProfileView) ────────────────────
    // Another test already captures "profile"; this sweep shot is "profile2".

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
                ParityScaffoldHost(route = "profile") {
                com.mq1.player.ui.screens.ProfileBody(
                    ui = ui,
                    onBack = { }, onRefresh = { }, onChangeAvatar = { }, onEdit = { },
                    onOpenChat = { _, _ -> }, onOpenArtist = { }, onOpenPlaylist = { },
                    onOpenFriends = { }, onOpenSettings = { }, onOpenFullPlayer = { },
                    onLogout = { }, playTracks = { },
                )
                }
            }
        }
        compose.waitForIdle()
        capture375x844(compose, "profile2")
    }
}
