package com.mq1.player.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.ErrorState
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.vm.ArtistViewModel
import com.mq1.player.ui.vm.PlayerViewModel

/** Artist screen: hero + track list; long artist names are ellipsized. */
@Composable
fun ArtistScreen(artistName: String, onBack: () -> Unit) {
    val vm: ArtistViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val queue by player.controller.queue.collectAsState()
    val currentIndex by player.controller.currentIndex.collectAsState()
    val favorites by player.favorites.collectAsState(initial = emptyList())

    LaunchedEffect(artistName) { vm.load(artistName) }

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.padding(horizontal = 4.dp)) {
            IconButton(onClick = onBack, modifier = Modifier.padding(top = 44.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 16.dp)
        ) {
            item {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Artwork(
                        url = ui.avatarTrack?.cover,
                        sizeDp = 140,
                        corner = 70
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        ui.name,
                        style = MaterialTheme.typography.headlineSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(horizontal = 24.dp)
                    )
                    Text(
                        "${ui.tracks.size} треков",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(12.dp))
                }
            }

            when {
                ui.loading -> item { LoadingState() }
                ui.error != null -> item { ErrorState(ui.error!!, onRetry = { vm.load(artistName) }) }
                else -> items(ui.tracks, key = { it.id }) { track ->
                    TrackRow(
                        track = track,
                        isPlaying = currentIndex >= 0 &&
                                queue.getOrNull(currentIndex)?.id == track.id,
                        isFavorite = favorites.any { it.id == track.id },
                        onPlay = {
                            player.controller.playQueue(ui.tracks, ui.tracks.indexOf(track))
                        },
                        onFavorite = { player.controller.toggleFavoriteForCurrent() }
                    )
                }
            }
        }
    }
}
