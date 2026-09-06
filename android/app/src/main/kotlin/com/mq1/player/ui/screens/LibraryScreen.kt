package com.mq1.player.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.data.api.PlaylistDto
import com.mq1.player.di.ServiceLocator
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.EmptyState
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.components.SectionHeader
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.vm.PlayerViewModel
import com.mq1.player.ui.vm.PlaylistViewModel

/** Library: Playlists / Favorites / History. */
@Composable
fun LibraryScreen(onOpenPlaylist: (String) -> Unit) {
    val vm: PlaylistViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val queue by player.controller.queue.collectAsState()
    val currentIndex by player.controller.currentIndex.collectAsState()
    val favorites by player.favorites.collectAsState(initial = emptyList())
    val history by ServiceLocator.localStore.history.collectAsState(initial = emptyList())

    var tab by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) { vm.refresh() }

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(52.dp))
        Text(
            "Библиотека",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(horizontal = 16.dp)
        )
        Spacer(Modifier.height(8.dp))
        TabRow(selectedTabIndex = tab) {
            listOf("Плейлисты", "Избранное", "История").forEachIndexed { i, label ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(label) })
            }
        }

        when (tab) {
            0 -> LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
                if (ui.mine.isNotEmpty()) {
                    item { SectionHeader("Мои (${ui.mine.size})") }
                    items(ui.mine, key = { "m" + it.id }) { pl ->
                        PlaylistRow(pl) { onOpenPlaylist(pl.id) }
                    }
                }
                item { SectionHeader("Публичные") }
                if (ui.loading && ui.public.isEmpty()) item { LoadingState() }
                else if (ui.public.isEmpty()) item { EmptyState("Плейлистов пока нет") }
                else items(ui.public, key = { "p" + it.id }) { pl ->
                    PlaylistRow(pl) { onOpenPlaylist(pl.id) }
                }
            }

            1 -> LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
                if (favorites.isEmpty()) item { EmptyState("Лайкните трек — он появится здесь") }
                else items(favorites, key = { it.id }) { track ->
                    TrackRow(
                        track = track,
                        isPlaying = currentIndex >= 0 &&
                                queue.getOrNull(currentIndex)?.id == track.id,
                        isFavorite = true,
                        onPlay = {
                            player.controller.playQueue(favorites, favorites.indexOf(track))
                        },
                        onFavorite = { player.controller.toggleFavoriteForCurrent() }
                    )
                }
            }

            else -> LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
                if (history.isEmpty()) item { EmptyState("История пуста") }
                else items(history, key = { "hist" + it.id }) { track ->
                    TrackRow(
                        track = track,
                        isPlaying = false,
                        isFavorite = favorites.any { it.id == track.id },
                        onPlay = {
                            player.controller.playQueue(history, history.indexOf(track))
                        },
                        onFavorite = { player.controller.toggleFavoriteForCurrent() }
                    )
                }
            }
        }
    }
}

/** Long-title-safe playlist row (name + author ellipsized, fixed artwork). */
@Composable
private fun PlaylistRow(playlist: PlaylistDto, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Artwork(
            url = playlist.cover.ifBlank { playlist.tracks.firstOrNull()?.cover },
            sizeDp = 56,
            corner = 10
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 12.dp)
        ) {
            Text(
                playlist.name,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                "${playlist.trackCount} треков · ${playlist.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
