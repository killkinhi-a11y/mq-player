package com.mq1.player.ui.nav

import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.navArgument
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.ui.components.MiniPlayerBar
import com.mq1.player.ui.components.LucideIcon
import com.mq1.player.ui.components.MqIcon
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.theme.MqType
import com.mq1.player.ui.screens.ArtistScreen
import com.mq1.player.ui.screens.ChatDetailScreen
import com.mq1.player.ui.screens.ChatsScreen
import com.mq1.player.ui.screens.FriendsScreen
import com.mq1.player.ui.screens.FullPlayerScreen
import com.mq1.player.ui.screens.HomeScreen
import com.mq1.player.ui.screens.LibraryScreen
import com.mq1.player.ui.screens.MixerScreen
import com.mq1.player.ui.screens.MyProfileScreen
import com.mq1.player.ui.screens.PlaylistScreen
import com.mq1.player.ui.screens.SearchScreen
import com.mq1.player.ui.screens.SettingsScreen
import com.mq1.player.ui.screens.UserProfileScreen
import com.mq1.player.ui.screens.WaveScreen
import com.mq1.player.ui.vm.PlayerViewModel

object Routes {
    const val HOME = "home"
    const val SEARCH = "search"
    // single pattern "library?tab={tab}" — plain "library" matches default
    const val LIBRARY = "library?tab={tab}"
    const val WAVE = "wave"
    const val CHATS = "chats"
    const val FRIENDS = "friends"
    const val SETTINGS = "settings"
    const val FULL_PLAYER = "fullplayer"
    const val ARTIST = "artist/{name}"
    const val PLAYLIST = "playlist/{id}"
    const val CHAT_DETAIL = "chat/{peerId}/{peerName}"
    const val USER_PROFILE = "user/{id}"
    // F9: own profile (account + content + editing)
    const val MY_PROFILE = "profile"
    // F10: native mixer (control surface over the real DSP chain)
    const val MIXER = "mixer"

    fun artist(name: String) = "artist/" + android.net.Uri.encode(name)
    fun playlist(id: String) = "playlist/$id"
    fun chat(peerId: String, peerName: String) =
        "chat/$peerId/" + android.net.Uri.encode(peerName)
    fun userProfile(userId: String) = "user/$userId"

    // Library: single route pattern with an optional tab arg — navigating
    // plain "library" matches it with the default (web view-switch parity
    // for Home quick actions «Избранное»/«История»/«Плейлисты»/«Чаты»).
    fun libraryTab(tab: String) = "library?tab=$tab"
}

private data class Tab(val route: String, val label: String, val icon: LucideIcon)

/** Tab switch with web view-switch semantics: single top + state restore. */
private fun NavHostController.navigateToTab(route: String) {
    navigate(route) {
        popUpTo(Routes.HOME) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

// WEB PARITY (MobileDock.tsx NAV): Profile is the 5th primary destination.
// Wave is NOT a tab on the web — it lives on Home (WaveStartCard).
private val tabs = listOf(
    Tab(Routes.HOME, "Главная", MqIcons.Home),
    Tab(Routes.SEARCH, "Поиск", MqIcons.Search),
    Tab("library", "Библиотека", MqIcons.Library),
    Tab(Routes.CHATS, "Чаты", MqIcons.MessageCircle),
    Tab(Routes.MY_PROFILE, "Профиль", MqIcons.User)
)

@Composable
fun MqAppNavHost(
    startDestination: String,
    onLogout: () -> Unit,
    navController: NavHostController = rememberNavController()
) {
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    // "library?tab={tab}" pattern must highlight the Library tab too
    val currentTabRoute = currentRoute?.substringBefore('?')
    // UX pass 2.3.4: web shows the dock + mini player on EVERY view (it is
    // fixed bottom, z-60; only the full-player overlay z-100 covers it).
    // Android previously hid the whole chrome on detail routes (Settings,
    // Artist, Playlist, Mixer, Friends, Chat…) — playback control vanished
    // as soon as the user left the 5 top tabs. Chrome now stays on every
    // destination except the full player itself (which owns the screen).
    val showChrome = currentRoute != null && currentRoute != Routes.FULL_PLAYER
    val player: PlayerViewModel = viewModel()

    // F7: shared social state — Chats tab unread badge
    val socialState by com.mq1.player.di.ServiceLocator.socialHub.state.collectAsState()

    val queue by player.controller.queue.collectAsState()
    val index by player.controller.currentIndex.collectAsState()
    // F9: favorites for the profile's play-from-likes action
    val likes by player.favorites.collectAsState(initial = emptyList())
    val isPlaying by player.controller.isPlaying.collectAsState()
    val isBuffering by player.controller.isBuffering.collectAsState()
    val position by player.controller.positionMs.collectAsState()
    val duration by player.controller.durationMs.collectAsState()
    val openPlayerRequest by player.controller.openPlayerRequest.collectAsState()
    val activeTrack = queue.getOrNull(index)
    val likedIds = likes.map { it.id }.toSet()

    // mq://player deep link → Full Player (cold start AND warm relaunch)
    androidx.compose.runtime.LaunchedEffect(openPlayerRequest) {
        if (openPlayerRequest > 0) {
            navController.navigate(Routes.FULL_PLAYER) { launchSingleTop = true }
        }
    }

    // ── F11 deep links: navigate as soon as the user is authenticated. ────
    // Cold start while logged out → Login/Onboarding run first; the link
    // sits in DeepLinkQueue and is delivered right after Main composes —
    // the destination is never lost.
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    val deepLinkVersion by com.mq1.player.deeplink.DeepLinkQueue.version.collectAsState()
    androidx.compose.runtime.LaunchedEffect(deepLinkVersion) {
        val link = com.mq1.player.deeplink.DeepLinkQueue.take() ?: return@LaunchedEffect
        when (link) {
            is com.mq1.player.deeplink.DeepLink.Artist -> {
                navController.navigate(Routes.artist(link.name))
            }
            is com.mq1.player.deeplink.DeepLink.Playlist -> {
                navController.navigate(Routes.playlist(link.id))
            }
            is com.mq1.player.deeplink.DeepLink.Track -> {
                // resolve the public track metadata, then play + open player
                val track = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    com.mq1.player.di.ServiceLocator.musicRepository.sharedTrack(link.scTrackId)
                }
                if (track != null) {
                    com.mq1.player.di.ServiceLocator.playbackController.playQueue(listOf(track))
                    navController.navigate(Routes.FULL_PLAYER) { launchSingleTop = true }
                } else {
                    android.widget.Toast.makeText(
                        context, "Трек недоступен", android.widget.Toast.LENGTH_SHORT
                    ).show()
                }
            }
            com.mq1.player.deeplink.DeepLink.Player -> Unit // handled directly
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            if (showChrome) {
                MqBottomDock(
                    tabs = tabs,
                    currentRoute = currentTabRoute,
                    socialState = socialState,
                    activeTrack = activeTrack,
                    isPlaying = isPlaying,
                    isBuffering = isBuffering,
                    isLiked = activeTrack != null && activeTrack.id in likedIds,
                    position = position,
                    duration = duration,
                    onTogglePlay = player.controller::togglePlayPause,
                    onToggleLike = { player.controller.toggleFavoriteForCurrent() },
                    onOpenPlayer = { navController.navigate(Routes.FULL_PLAYER) { launchSingleTop = true } },
                    onTab = { tab -> navController.navigate(tab.route) {
                        popUpTo(Routes.HOME) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    } }
                )
            }
        }
    ) { padding ->
        Box(
            Modifier
                .fillMaxSize()
                .padding(bottom = if (showChrome) padding.calculateBottomPadding() else 0.dp)
        ) {
            NavHost(
                navController = navController,
                startDestination = startDestination,
                enterTransition = { androidx.compose.animation.fadeIn() },
                exitTransition = { androidx.compose.animation.fadeOut() },
                popEnterTransition = { androidx.compose.animation.fadeIn() },
                popExitTransition = { androidx.compose.animation.fadeOut() }
            ) {
                composable(Routes.HOME) {
                    HomeScreen(
                        onOpenFullPlayer = {
                            navController.navigate(Routes.FULL_PLAYER) { launchSingleTop = true }
                        },
                        onOpenArtist = { name -> navController.navigate(Routes.artist(name)) },
                        onOpenPlaylist = { id -> navController.navigate(Routes.playlist(id)) },
                        onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                        // web MobileQuickRow targets: favorites/history/playlists
                        // switch the Library tab, chats opens the Chats tab
                        onOpenLibraryTab = { tab ->
                            navController.navigate(Routes.libraryTab(tab)) {
                                popUpTo(Routes.HOME) { saveState = true }
                                launchSingleTop = true
                                restoreState = false // fresh tab each action
                            }
                        },
                        onOpenChats = { navController.navigateToTab(Routes.CHATS) }
                    )
                }
                composable(Routes.SEARCH) {
                    SearchScreen(onOpenArtist = { name -> navController.navigate(Routes.artist(name)) })
                }
                composable(Routes.WAVE) {
                    WaveScreen(onOpenFullPlayer = { navController.navigate(Routes.FULL_PLAYER) })
                }
                composable(
                    Routes.LIBRARY,
                    arguments = listOf(navArgument("tab") {
                        type = androidx.navigation.NavType.StringType
                        defaultValue = "favorites"
                    })
                ) { entry ->
                    val tabArg = entry.arguments?.getString("tab") ?: "favorites"
                    val tabIndex = when (tabArg) {
                        "playlists" -> 1
                        "history" -> 2
                        else -> 0
                    }
                    LibraryScreen(
                        initialTab = tabIndex,
                        onOpenPlaylist = { id -> navController.navigate(Routes.playlist(id)) },
                        onOpenArtist = { name -> navController.navigate(Routes.artist(name)) },
                        onGoHome = { navController.navigateToTab(Routes.HOME) }
                    )
                }
                composable(Routes.CHATS) {
                    ChatsScreen(
                        onOpenChat = { peerId, peerName ->
                            navController.navigate(Routes.chat(peerId, peerName))
                        },
                        onOpenFriends = { navController.navigate(Routes.FRIENDS) }
                    )
                }
                composable(Routes.FRIENDS) {
                    FriendsScreen(
                        onBack = { navController.popBackStack() },
                        onOpenChat = { peerId, peerName ->
                            navController.navigate(Routes.chat(peerId, peerName))
                        },
                        onOpenProfile = { userId ->
                            navController.navigate(Routes.userProfile(userId))
                        }
                    )
                }
                composable(Routes.USER_PROFILE) { entry ->
                    val userId = entry.arguments?.getString("id") ?: ""
                    UserProfileScreen(
                        userId = userId,
                        onBack = { navController.popBackStack() },
                        onOpenChat = { peerId, peerName ->
                            navController.navigate(Routes.chat(peerId, peerName))
                        },
                        // F9: self-view → the full own profile screen
                        onOpenMyProfile = { navController.navigate(Routes.MY_PROFILE) }
                    )
                }
                composable(Routes.SETTINGS) {
                    SettingsScreen(
                        onLogout = onLogout,
                        onBack = { navController.popBackStack() },
                        onOpenProfile = { navController.navigate(Routes.MY_PROFILE) },
                        onOpenMixer = { navController.navigate(Routes.MIXER) }
                    )
                }
                // F9: own profile — account, content, editing, logout shortcut
                composable(Routes.MY_PROFILE) {
                    MyProfileScreen(
                        onBack = { navController.popBackStack() },
                        onOpenChat = { peerId, peerName ->
                            navController.navigate(Routes.chat(peerId, peerName))
                        },
                        onOpenArtist = { name -> navController.navigate(Routes.artist(name)) },
                        onOpenPlaylist = { id -> navController.navigate(Routes.playlist(id)) },
                        onOpenFriends = { navController.navigate(Routes.FRIENDS) },
                        onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                        onOpenFullPlayer = {
                            navController.navigate(Routes.FULL_PLAYER) { launchSingleTop = true }
                        },
                        onLogout = onLogout,
                        playTracks = { startIndex ->
                            if (likes.isNotEmpty()) {
                                player.controller.playQueue(likes, startIndex)
                            }
                        }
                    )
                }
                composable(
                    Routes.FULL_PLAYER,
                    enterTransition = {
                        slideInVertically(initialOffsetY = { it }) + androidx.compose.animation.fadeIn()
                    },
                    exitTransition = {
                        slideOutVertically(targetOffsetY = { it }) + androidx.compose.animation.fadeOut()
                    }
                ) {
                    FullPlayerScreen(
                        onClose = { navController.popBackStack() },
                        onOpenArtist = { name -> navController.navigate(Routes.artist(name)) },
                        // F10: mixer entry from the player
                        onOpenMixer = { navController.navigate(Routes.MIXER) }
                    )
                }
                // F10: native mixer — real DSP control surface
                composable(Routes.MIXER) {
                    MixerScreen(onBack = { navController.popBackStack() })
                }
                composable(Routes.ARTIST) { entry ->
                    val name = entry.arguments?.getString("name") ?: ""
                    ArtistScreen(artistName = name, onBack = { navController.popBackStack() })
                }
                composable(Routes.PLAYLIST) { entry ->
                    val id = entry.arguments?.getString("id") ?: ""
                    PlaylistScreen(playlistId = id, onBack = { navController.popBackStack() })
                }
                composable(Routes.CHAT_DETAIL) { entry ->
                    val peerId = entry.arguments?.getString("peerId") ?: ""
                    val peerName = entry.arguments?.getString("peerName") ?: ""
                    ChatDetailScreen(
                        peerId = peerId,
                        peerName = peerName,
                        onBack = { navController.popBackStack() },
                        onOpenProfile = { navController.navigate(Routes.userProfile(peerId)) }
                    )
                }
            }
        }
    }
}

/**
 * Standalone dock renderer (visual-parity harness + previews): the same
 * MqBottomDock the app uses, with neutral social state.
 */
@Composable
fun MqDockHost(
    currentRoute: String?,
    activeTrack: com.mq1.player.data.api.Track?,
    isPlaying: Boolean,
    isBuffering: Boolean = false,
    isLiked: Boolean = false,
    positionMs: Long = 0L,
    durationMs: Long = 0L,
    onTogglePlay: () -> Unit = {},
    onToggleLike: () -> Unit = {},
    onOpenPlayer: () -> Unit = {},
    onTab: (String) -> Unit = {},
) {
    MqBottomDock(
        tabs = tabs,
        currentRoute = currentRoute,
        socialState = com.mq1.player.data.SocialHub.SocialState(),
        activeTrack = activeTrack,
        isPlaying = isPlaying,
        isBuffering = isBuffering,
        isLiked = isLiked,
        position = positionMs,
        duration = durationMs,
        onTogglePlay = onTogglePlay,
        onToggleLike = onToggleLike,
        onOpenPlayer = onOpenPlayer,
        onTab = { onTab(it.route) },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// WEB PARITY BOTTOM DOCK — exact port of MobileDock.tsx
//  bg 92% + 1dp hairline (border @22%)
//  [mini player: 3dp progress + 60dp row]  (see MiniPlayerBar)
//  nav row 56dp: icon 22dp (stroke 2.3 active / 1.7 idle) + 10sp label,
//  active accent hairline 22×2.5dp at tab top, 14dp badge (cap 99),
//  full-height ≥44dp touch targets, 5/10ms haptics like the web.
//  NO Material NavigationBar — default M3 appearance is NOT used.
// ─────────────────────────────────────────────────────────────────────────────
@Composable
private fun MqBottomDock(
    tabs: List<Tab>,
    currentRoute: String?,
    socialState: com.mq1.player.data.SocialHub.SocialState,
    activeTrack: com.mq1.player.data.api.Track?,
    isPlaying: Boolean,
    isBuffering: Boolean,
    isLiked: Boolean,
    position: Long,
    duration: Long,
    onTogglePlay: () -> Unit,
    onToggleLike: () -> Unit,
    onOpenPlayer: () -> Unit,
    onTab: (Tab) -> Unit,
) {
    val bg = MaterialTheme.colorScheme.background
    val hairline = MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)
    val view = LocalView.current

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(bg.copy(alpha = 0.92f))
            .navigationBarsPadding()
    ) {
        if (activeTrack != null) {
            MiniPlayerBar(
                title = activeTrack.title,
                artist = activeTrack.artist,
                artwork = activeTrack.cover,
                isPlaying = isPlaying,
                isLiked = isLiked,
                isBuffering = isBuffering,
                positionMs = position,
                durationMs = duration,
                progress = if (duration > 0) position.toFloat() / duration else 0f,
                onToggle = onTogglePlay,
                onToggleLike = onToggleLike,
                onOpen = onOpenPlayer,
            )
        }

        // 1dp hairline between mini player / nav row and content edge
        Box(Modifier.fillMaxWidth().height(1.dp).background(hairline))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            tabs.forEach { tab ->
                val active = currentRoute == tab.route
                val badge = if (tab.route == Routes.CHATS) socialState.totalUnread else 0
                val accent = MaterialTheme.colorScheme.primary
                val textMuted = MaterialTheme.colorScheme.onSurfaceVariant

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxSize()
                        .clickable(
                            interactionSource = androidx.compose.runtime.remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                            indication = null
                        ) {
                            view.performHapticFeedback(
                                if (active) android.view.HapticFeedbackConstants.VIRTUAL_KEY
                                else android.view.HapticFeedbackConstants.LONG_PRESS
                            )
                            onTab(tab)
                        },
                    contentAlignment = Alignment.Center
                ) {
                    // active accent hairline at tab top (web ::before)
                    if (active) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                .width(22.dp)
                                .height(2.5.dp)
                                .background(accent, RoundedCornerShape(bottomStart = 3.dp, bottomEnd = 3.dp))
                        )
                    }
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(vertical = 4.dp)
                    ) {
                        Box {
                            MqIcon(
                                icon = tab.icon,
                                size = 22.dp,
                                tint = if (active) accent else textMuted.copy(alpha = 0.72f),
                                strokeWidth = if (active) 2.3f else 1.7f,
                            )
                            if (badge > 0) {
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .offset(x = 8.dp, y = (-4).dp)
                                        .height(14.dp)
                                        .clip(CircleShape)
                                        .background(accent)
                                        .padding(horizontal = 3.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        if (badge > 99) "99" else badge.toString(),
                                        style = MqType.badge,
                                        color = Color.White,
                                        maxLines = 1
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(
                            tab.label,
                            style = MqType.nav.copy(fontSize = 10.sp),
                            color = if (active) accent else textMuted.copy(alpha = 0.61f),  // web: muted@72% × label opacity .85
                            maxLines = 1
                        )
                    }
                }
            }
        }
    }
}
