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
import com.mq1.player.ui.screens.PlaylistScreen
import com.mq1.player.ui.screens.SearchScreen
import com.mq1.player.ui.screens.SettingsScreen
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

    fun artist(name: String) = "artist/" + android.net.Uri.encode(name)
    fun playlist(id: String) = "playlist/$id"
    fun chat(peerId: String, peerName: String) =
        "chat/$peerId/" + android.net.Uri.encode(peerName)
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

    val queue by player.controller.queue.collectAsState()
    val index by player.controller.currentIndex.collectAsState()
    val isPlaying by player.controller.isPlaying.collectAsState()
    val position by player.controller.positionMs.collectAsState()
    val duration by player.controller.durationMs.collectAsState()
    val activeTrack = queue.getOrNull(index)

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
                            NavigationBarItem(
                                selected = currentRoute == tab.route,
                                onClick = {
                                    navController.navigate(tab.route) {
                                        popUpTo(Routes.HOME) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = { Icon(tab.icon, contentDescription = tab.label) },
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
                        onOpenPlaylist = { id -> navController.navigate(Routes.playlist(id)) }
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
                    ChatsScreen { peerId, peerName ->
                        navController.navigate(Routes.chat(peerId, peerName))
                    }
                }
                composable(Routes.FRIENDS) {
                    FriendsScreen { peerId, peerName ->
                        navController.navigate(Routes.chat(peerId, peerName))
                    }
                }
                composable(Routes.SETTINGS) {
                    SettingsScreen(
                        onLogout = onLogout,
                        onBack = { navController.popBackStack() }
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
                    FullPlayerScreen(onClose = { navController.popBackStack() })
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
                    ChatDetailScreen(peerId, peerName, onBack = { navController.popBackStack() })
                }
            }
        }
    }
}
