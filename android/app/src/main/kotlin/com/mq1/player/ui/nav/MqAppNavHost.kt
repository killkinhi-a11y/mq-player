package com.mq1.player.ui.nav

import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.ui.components.MiniPlayerBar
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
    const val LIBRARY = "library"
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
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    Tab(Routes.HOME, "Главная", Icons.Filled.Home),
    Tab(Routes.SEARCH, "Поиск", Icons.Filled.Search),
    Tab(Routes.WAVE, "Волна", Icons.Filled.Radio),
    Tab(Routes.LIBRARY, "Библиотека", Icons.Filled.LibraryMusic),
    Tab(Routes.CHATS, "Чаты", Icons.Filled.ChatBubble)
)

@Composable
fun MqAppNavHost(
    startDestination: String,
    onLogout: () -> Unit,
    navController: NavHostController = rememberNavController()
) {
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    val showChrome = currentRoute in tabs.map { it.route }
    val player: PlayerViewModel = viewModel()

    // F7: shared social state — Chats tab unread badge
    val socialState by com.mq1.player.di.ServiceLocator.socialHub.state.collectAsState()

    val queue by player.controller.queue.collectAsState()
    val index by player.controller.currentIndex.collectAsState()
    // F9: favorites for the profile's play-from-likes action
    val likes by player.favorites.collectAsState(initial = emptyList())
    val isPlaying by player.controller.isPlaying.collectAsState()
    val position by player.controller.positionMs.collectAsState()
    val duration by player.controller.durationMs.collectAsState()
    val openPlayerRequest by player.controller.openPlayerRequest.collectAsState()
    val activeTrack = queue.getOrNull(index)

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
                Column {
                    if (activeTrack != null) {
                        MiniPlayerBar(
                            title = activeTrack.title,
                            artist = activeTrack.artist,
                            artwork = activeTrack.cover,
                            isPlaying = isPlaying,
                            progress = if (duration > 0) position.toFloat() / duration else 0f,
                            onToggle = player.controller::togglePlayPause,
                            onNext = player.controller::next,
                            onOpen = { navController.navigate(Routes.FULL_PLAYER) }
                        )
                    }
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                        tabs.forEach { tab ->
                            val badgeCount = if (tab.route == Routes.CHATS) socialState.totalUnread else 0
                            NavigationBarItem(
                                selected = currentRoute == tab.route,
                                onClick = {
                                    navController.navigate(tab.route) {
                                        popUpTo(Routes.HOME) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = {
                                    if (badgeCount > 0) {
                                        androidx.compose.material3.BadgedBox(
                                            badge = {
                                                androidx.compose.material3.Badge {
                                                    Text(if (badgeCount > 99) "99+" else badgeCount.toString())
                                                }
                                            }
                                        ) { Icon(tab.icon, contentDescription = tab.label) }
                                    } else {
                                        Icon(tab.icon, contentDescription = tab.label)
                                    }
                                },
                                label = { Text(tab.label) }
                            )
                        }
                    }
                }
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
                        onOpenFullPlayer = { navController.navigate(Routes.FULL_PLAYER) },
                        onOpenArtist = { name -> navController.navigate(Routes.artist(name)) },
                        onOpenPlaylist = { id -> navController.navigate(Routes.playlist(id)) },
                        onOpenSettings = { navController.navigate(Routes.SETTINGS) }
                    )
                }
                composable(Routes.SEARCH) {
                    SearchScreen(onOpenArtist = { name -> navController.navigate(Routes.artist(name)) })
                }
                composable(Routes.WAVE) {
                    WaveScreen(onOpenFullPlayer = { navController.navigate(Routes.FULL_PLAYER) })
                }
                composable(Routes.LIBRARY) {
                    LibraryScreen(onOpenPlaylist = { id -> navController.navigate(Routes.playlist(id)) })
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
                        onOpenProfile = { navController.navigate(Routes.MY_PROFILE) }
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
