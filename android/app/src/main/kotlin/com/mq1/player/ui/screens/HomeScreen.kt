package com.mq1.player.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.data.api.PlaylistDto
import com.mq1.player.data.api.Track
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.EmptyState
import com.mq1.player.ui.components.ErrorState
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.components.SectionHeader
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.vm.HomeViewModel
import com.mq1.player.ui.vm.PlayerViewModel

/**
 * Android Home — compact, thumb-friendly, musical (P20.3):
 * greeting + Wave start card + continue listening + playlists shelf +
 * fresh recommendations list. Everything reachable with one thumb swipe.
 */
@Composable
fun HomeScreen(
    onOpenFullPlayer: () -> Unit,
    onOpenArtist: (String) -> Unit,
    onOpenPlaylist: (String) -> Unit
) {
    val vm: HomeViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val queue by player.controller.queue.collectAsState()
    val currentIndex by player.controller.currentIndex.collectAsState()
    val favorites by player.favorites.collectAsState(initial = emptyList())

    val greeting = rememberGreeting()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Spacer(Modifier.height(52.dp))
                Text(greeting, style = MaterialTheme.typography.headlineSmall)
                Text(
                    "MQ · музыка для вас",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(16.dp))
                WaveStartCard(loading = ui.loading) { vm.startWave { batch ->
                    player.controller.startWave(batch)
                    onOpenFullPlayer()
                } }
            }
        }

        if (ui.history.isNotEmpty()) {
            item { SectionHeader("Продолжить слушать") }
            items(ui.history, key = { "h" + it.id }) { track ->
                TrackRow(
                    track = track,
                    isPlaying = currentIndex >= 0 &&
                            queue.getOrNull(currentIndex)?.id == track.id &&
                            player.controller.isPlaying.value,
                    isFavorite = favorites.any { it.id == track.id },
                    onPlay = {
                        player.controller.playQueue(ui.history, ui.history.indexOf(track))
                    },
                    onFavorite = { player.controller.toggleFavoriteForCurrent() }
                )
            }
        }

        if (ui.publicPlaylists.isNotEmpty()) {
            item { SectionHeader("Плейлисты") }
            item {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp)
                ) {
                    items(ui.publicPlaylists, key = { "pl" + it.id }) { playlist ->
                        PlaylistCard(playlist) { onOpenPlaylist(playlist.id) }
                    }
                }
            }
        }

        if (ui.wavePreview.isNotEmpty()) {
            item { SectionHeader("Собрали для вас") }
            items(ui.wavePreview, key = { "w" + it.id }) { track ->
                TrackRow(
                    track = track,
                    isPlaying = currentIndex >= 0 &&
                            queue.getOrNull(currentIndex)?.id == track.id,
                    isFavorite = favorites.any { it.id == track.id },
                    onPlay = {
                        player.controller.playQueue(ui.wavePreview, ui.wavePreview.indexOf(track))
                    },
                    onFavorite = { player.controller.toggleFavoriteForCurrent() }
                )
            }
        }

        item {
            when {
                ui.loading -> LoadingState()
                ui.error != null -> ErrorState(ui.error!!, onRetry = { vm.refresh() })
                ui.wavePreview.isEmpty() && ui.history.isEmpty() ->
                    EmptyState("Пока пусто — начните Волну или найдите музыку")
            }
        }
    }
}

@Composable
private fun WaveStartCard(loading: Boolean, onStart: () -> Unit) {
    Surface(
        shape = MaterialTheme.shapes.extraLarge,
        color = MaterialTheme.colorScheme.primaryContainer,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.Radio, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Волна",
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    "Бесконечный поток треков под ваш вкус",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Button(onClick = onStart, enabled = !loading) {
                Text(if (loading) "…" else "Слушать")
            }
        }
    }
}

@Composable
fun PlaylistCard(playlist: PlaylistDto, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(140.dp)
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
    ) {
        Artwork(
            url = playlist.cover.ifBlank { playlist.tracks.firstOrNull()?.cover },
            sizeDp = 140,
            corner = 12
        )
        Spacer(Modifier.height(6.dp))
        Text(
            playlist.name,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(140.dp)
        )
        Text(
            "${playlist.trackCount} треков · ${playlist.username}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun rememberGreeting(): String {
    val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
    return when (hour) {
        in 5..11 -> "Доброе утро"
        in 12..17 -> "Добрый день"
        in 18..22 -> "Добрый вечер"
        else -> "Доброй ночи"
    }
}
