package com.mq1.player.ui.screens

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
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.ui.components.EmptyState
import com.mq1.player.ui.components.ErrorState
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.vm.PlayerViewModel
import com.mq1.player.ui.vm.SearchViewModel

/** Fast search with debounced queries and long-title-safe result rows. */
@Composable
fun SearchScreen(onOpenArtist: (String) -> Unit) {
    val vm: SearchViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val queue by player.controller.queue.collectAsState()
    val currentIndex by player.controller.currentIndex.collectAsState()
    val favorites by player.favorites.collectAsState(initial = emptyList())

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(52.dp))
        OutlinedTextField(
            value = ui.query,
            onValueChange = vm::onQueryChange,
            placeholder = { Text("Трек или исполнитель") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = "Поиск") },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
        )
        Spacer(Modifier.height(8.dp))

        when {
            ui.loading -> LoadingState()
            ui.error != null -> ErrorState(ui.error!!)
            ui.searched && ui.results.isEmpty() -> EmptyState("Ничего не найдено")
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 16.dp)
            ) {
                items(ui.results, key = { it.id }) { track ->
                    TrackRow(
                        track = track,
                        isPlaying = currentIndex >= 0 &&
                                queue.getOrNull(currentIndex)?.id == track.id,
                        isFavorite = favorites.any { it.id == track.id },
                        onPlay = {
                            player.controller.playQueue(ui.results, ui.results.indexOf(track))
                        },
                        onFavorite = { player.controller.toggleFavoriteForCurrent() }
                    )
                }
            }
        }
    }
}
