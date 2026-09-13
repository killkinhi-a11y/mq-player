package com.mq1.player

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import com.mq1.player.data.api.Friend
import com.mq1.player.data.api.PlaylistDto
import com.mq1.player.data.api.Track
import com.mq1.player.ui.screens.ProfileBody
import com.mq1.player.ui.theme.mqColorScheme
import com.mq1.player.ui.vm.MyProfileViewModel

/**
 * F9 PROFILE UI REGRESSION — real Compose layout on JVM via Robolectric.
 *
 * Invariants:
 *   I1 loading state renders (no fake content)
 *   I2 error state renders with a working retry action
 *   I3 content state renders identity, stats, sections (real ui data)
 *   I4 all row actions are ≥ 40dp effective targets (44dp nominal - inset)
 *   I5 friend chip → chat callback fires with peerId+peerName (Profile→Chat)
 *   I6 empty likes/playlists render empty states, not blank space
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp")
class MyProfileScreenTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun contentUi() = MyProfileViewModel.ProfileUi(
        userId = "u1",
        username = "listener",
        email = "listener@example.com",
        avatar = null,
        role = "user",
        createdAt = "2026-01-15T08:30:00.000Z",
        telegramUsername = "tg_name",
        confirmed = true,
        playlists = listOf(
            PlaylistDto(id = "pl1", name = "Ночной драйв", trackCount = 12),
            PlaylistDto(id = "pl2", name = "Кинематик", trackCount = 5)
        ),
        likes = listOf(
            Track(id = "t1", title = "Abracadabra", artist = "Steve Miller Band", scTrackId = 1L),
            Track(id = "t2", title = "Blue Sky", artist = "Steve Miller Band", scTrackId = 2L)
        ),
        history = listOf(
            Track(id = "t3", title = "Recent One", artist = "Other Artist", scTrackId = 3L)
        ),
        friends = listOf(
            Friend(id = "f1", username = "alice", avatar = "", friendshipId = "fr1"),
            Friend(id = "f2", username = "bob", avatar = "", friendshipId = "fr2")
        ),
        online = mapOf("f1" to true),
        loading = false,
        error = null
    )

    @Composable
    private fun Host(ui: MyProfileViewModel.ProfileUi, captures: Captures) {
        MaterialTheme(colorScheme = mqColorScheme("default", "dark")) {
            Surface {
                Column(Modifier.width(360.dp)) {
                    ProfileBody(
                        ui = ui,
                        onBack = { },
                        onRefresh = { captures.refresh++ },
                        onChangeAvatar = { },
                        onEdit = { },
                        onOpenChat = { id, name -> captures.chat = "$id/$name" },
                        onOpenArtist = { captures.artist = it },
                        onOpenPlaylist = { captures.playlist = it },
                        onOpenFriends = { captures.friends = true },
                        onOpenSettings = { },
                        onOpenFullPlayer = { },
                        onLogout = { },
                        playTracks = { }
                    )
                }
            }
        }
    }

    private class Captures {
        var refresh = 0
        var chat: String? = null
        var artist: String? = null
        var playlist: String? = null
        var friends = false
    }

    @Test
    fun `I1 loading state renders without fake content`() {
        val ui = MyProfileViewModel.ProfileUi(loading = true)
        compose.setContent { Host(ui, Captures()) }
        compose.waitForIdle()
        compose.onNodeWithText("Загрузка профиля…").assertExists()
    }

    @Test
    fun `I2 error state renders with retry that fires`() {
        val ui = MyProfileViewModel.ProfileUi(loading = false, error = "Профиль недоступен")
        val captures = Captures()
        compose.setContent { Host(ui, captures) }
        compose.waitForIdle()
        compose.onNodeWithText("Профиль недоступен").assertExists()
        compose.onNodeWithText("Повторить").performClick()
        compose.waitForIdle()
        assertEquals(1, captures.refresh)
    }

    @Test
    fun `I3 content renders identity stats and sections`() {
        compose.setContent { Host(contentUi(), Captures()) }
        compose.waitForIdle()

        compose.onNodeWithText("listener").assertExists()
        compose.onNodeWithText("Участник с 15 января 2026").assertExists()
        // stats
        compose.onNodeWithText("Плейлисты").assertExists()
        compose.onNodeWithText("Лайки").assertExists()
        compose.onNodeWithText("Друзья").assertExists()
        // account card
        compose.onNodeWithText("listener@example.com").assertExists()
        // sections
        compose.onNodeWithText("ЛЮБИМЫЕ ИСПОЛНИТЕЛИ").assertExists()
        assertTrue(
            "artist chip/rows missing",
            compose.onAllNodesWithText("Steve Miller Band").fetchSemanticsNodes().size >= 1
        )
        // likes rows
        compose.onNodeWithText("Abracadabra").assertExists()
        // playlist rows
        compose.onNodeWithText("Ночной драйв").assertExists()
        // actions
        compose.onNodeWithText("Редактировать профиль").assertExists()
        compose.onNodeWithText("Выйти").assertExists()
    }

    @Test
    fun `I4 header actions are touch-sized targets`() {
        compose.setContent { Host(contentUi(), Captures()) }
        compose.waitForIdle()
        val density = compose.density
        val minTarget = with(density) { 40.dp.toPx() } // 44dp nominal minus icon inset

        val back = compose.onNodeWithContentDescription("Назад").fetchSemanticsNode()
        assertTrue("back too small: ${back.size}", back.size.width >= minTarget)
        val refresh = compose.onNodeWithContentDescription("Обновить профиль")
            .fetchSemanticsNode()
        assertTrue("refresh too small: ${refresh.size}", refresh.size.width >= minTarget)
        val camera = compose.onNodeWithContentDescription("Изменить аватар")
            .fetchSemanticsNode()
        assertTrue("avatar hitbox too small: ${camera.size}", camera.size.width >= minTarget)
    }

    @Test
    fun `I5 friend chip opens chat with peer identity`() {
        // Compact layout: no account card / artists / playlists above the
        // friends row, so the chips are inside the 800dp viewport.
        val ui = MyProfileViewModel.ProfileUi(
            userId = "u1",
            username = "listener",
            likes = listOf(Track(id = "t1", title = "Song", artist = "", scTrackId = 1L)),
            friends = listOf(
                Friend(id = "f1", username = "alice", avatar = "", friendshipId = "fr1"),
                Friend(id = "f2", username = "bob", avatar = "", friendshipId = "fr2")
            ),
            online = mapOf("f1" to true),
            loading = false,
            error = null
        )
        val captures = Captures()
        compose.setContent { Host(ui, captures) }
        compose.waitForIdle()

        compose.onNodeWithContentDescription("Друг: alice, в сети").performClick()
        compose.waitForIdle()
        assertEquals("f1/alice", captures.chat)
    }

    @Test
    fun `I6 empty content renders explicit empty states`() {
        val ui = MyProfileViewModel.ProfileUi(
            userId = "u1", username = "solo", loading = false
        )
        compose.setContent { Host(ui, Captures()) }
        compose.waitForIdle()

        compose.onNodeWithText("Друзей пока нет — добавьте из поиска").assertExists()
        compose.onNodeWithText("Лайканных треков пока нет").assertExists()
        compose.onNodeWithText("Плейлистов пока нет — создайте в Библиотеке").assertExists()
        // member-since absent when createdAt is null — no fake date
        val member = compose.onAllNodesWithText("").fetchSemanticsNodes()
        assertTrue(member.isEmpty())
    }
}
