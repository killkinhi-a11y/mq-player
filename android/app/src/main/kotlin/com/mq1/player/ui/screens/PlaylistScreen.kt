package com.mq1.player.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.data.api.Track
import com.mq1.player.di.ServiceLocator
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.vm.PlayerViewModel
import com.mq1.player.ui.vm.PlaylistViewModel

/** Open playlist screen — header + play/shuffle actions + track list. */
@Composable
fun PlaylistScreen(playlistId: String, onBack: () -> Unit) {
    val vm: PlaylistViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val queue by player.controller.queue.collectAsState()
    val currentIndex by player.controller.currentIndex.collectAsState()
    val favorites by player.favorites.collectAsState(initial = emptyList())
    val sessionUser by ServiceLocator.localStore.sessionUser.collectAsState(initial = null)
    var menuTrack by remember { mutableStateOf<Track?>(null) }

    LaunchedEffect(playlistId) { vm.loadById(playlistId) }
    val playlist = ui.current
    val owned = playlist != null && sessionUser != null &&
            playlist.userId == sessionUser?.userId

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.padding(horizontal = 4.dp)) {
            IconButton(onClick = onBack, modifier = Modifier.padding(top = 44.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
            }
        }

        if (playlist == null) {
            LoadingState()
            return
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 16.dp)
        ) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                ) {
                    Artwork(
                        url = playlist.cover.ifBlank { playlist.tracks.firstOrNull()?.cover },
                        sizeDp = 120,
                        corner = 12
                    )
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            playlist.name,
                            style = MaterialTheme.typography.headlineSmall,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            "${playlist.trackCount} треков · ${playlist.username}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (playlist.description.isNotBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                playlist.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        Row {
                            Button(
                                onClick = {
                                    if (playlist.tracks.isNotEmpty()) {
                                        player.controller.playQueue(playlist.tracks, 0)
                                    }
                                },
                                enabled = playlist.tracks.isNotEmpty()
                            ) {
                                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                                Spacer(Modifier.width(4.dp))
                                Text("Играть")
                            }
                            Spacer(Modifier.width(8.dp))
                            OutlinedButton(
                                onClick = {
                                    val shuffled = playlist.tracks.shuffled()
                                    player.controller.playQueue(shuffled, 0)
                                },
                                enabled = playlist.tracks.isNotEmpty()
                            ) {
                                Icon(Icons.Filled.Shuffle, contentDescription = "Перемешать и играть")
                            }
                        }
                    }
                }
            }

            items(playlist.tracks, key = { it.id }) { track ->
                // Long-title-safe row + explicit menu (no destructive surprises):
                // "Remove" is offered ONLY for playlists owned by this account,
                // behind an explicit DropdownMenu item instead of an instant action.
                Box {
                    TrackRow(
                        track = track,
                        isPlaying = currentIndex >= 0 &&
                                queue.getOrNull(currentIndex)?.id == track.id,
                        isFavorite = favorites.any { it.id == track.id },
                        onPlay = {
                            player.controller.playQueue(playlist.tracks, playlist.tracks.indexOf(track))
                        },
                        onFavorite = { player.controller.toggleFavorite(track) },
                        onMenu = { if (owned) menuTrack = track }
                    )
                    DropdownMenu(
                        expanded = menuTrack?.id == track.id,
                        onDismissRequest = { if (menuTrack?.id == track.id) menuTrack = null }
                    ) {
                        DropdownMenuItem(
                            text = { Text("Удалить из плейлиста") },
                            onClick = {
                                menuTrack = null
                                vm.removeTrack(track.id)
                            }
                        )
                    }
                }
            }
        }
    }
}
