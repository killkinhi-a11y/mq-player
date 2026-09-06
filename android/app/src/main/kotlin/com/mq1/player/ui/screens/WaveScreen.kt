package com.mq1.player.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.vm.PlayerViewModel
import com.mq1.player.ui.vm.WaveViewModel

/**
 * Wave — endless personalized radio (full Android citizen, P20.3).
 * Shows the current queue with honest recommendation reasons and
 * one-tap "next by Wave".
 */
@Composable
fun WaveScreen(onOpenFullPlayer: () -> Unit) {
    val vm: WaveViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val queue by player.controller.queue.collectAsState()
    val currentIndex by player.controller.currentIndex.collectAsState()
    val isPlaying by player.controller.isPlaying.collectAsState()
    val favorites by player.favorites.collectAsState(initial = emptyList())

    val active = queue.getOrNull(currentIndex)
    val upcoming = if (currentIndex >= 0) queue.drop(currentIndex + 1) else queue

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Spacer(Modifier.height(52.dp))
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.Radio, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.padding(4.dp))
                    Text("Волна", style = MaterialTheme.typography.headlineMedium)
                }
                Text(
                    "Поток треков, подобранных под ваш вкус",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(16.dp))

                if (active != null) {
                    Surface(
                        shape = MaterialTheme.shapes.large,
                        color = MaterialTheme.colorScheme.surface
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text(
                                "Сейчас играет",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                "${active.artist} — ${active.title}",
                                style = MaterialTheme.typography.titleLarge,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                            active.reason?.let { reason ->
                                Spacer(Modifier.height(6.dp))
                                AssistChip(
                                    onClick = {},
                                    label = { Text(reasonLabel(reason)) }
                                )
                            }
                            Spacer(Modifier.height(12.dp))
                            Row {
                                Button(onClick = { vm.next() }) {
                                    Icon(Icons.Filled.SkipNext, contentDescription = null)
                                    Spacer(Modifier.padding(4.dp))
                                    Text("Другой трек")
                                }
                                Spacer(Modifier.padding(4.dp))
                                Button(onClick = onOpenFullPlayer) {
                                    Text(if (isPlaying) "Открыть плеер" else "Играть")
                                }
                            }
                        }
                    }
                } else {
                    Button(
                        onClick = { vm.start() },
                        enabled = !ui.loading,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(if (ui.loading) "Подбираем…" else "Включить Волну")
                    }
                }
                ui.error?.let {
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                }
                Spacer(Modifier.height(8.dp))
            }
        }

        if (upcoming.isNotEmpty()) {
            item {
                com.mq1.player.ui.components.SectionHeader("Далее по Волне (${upcoming.size})")
            }
            items(upcoming, key = { it.id }) { track ->
                TrackRow(
                    track = track,
                    isPlaying = false,
                    isFavorite = favorites.any { it.id == track.id },
                    onPlay = {
                        player.controller.seekToIndex(queue.indexOf(track))
                    },
                    onFavorite = { player.controller.toggleFavoriteForCurrent() }
                )
            }
        }
    }
}

private fun reasonLabel(reason: String): String = when {
    reason.contains("related_current") -> "Похоже на текущий трек"
    reason.contains("related_history") -> "Похоже на вашу историю"
    reason.contains("related_to_liked") -> "По вашим лайкам"
    reason.contains("liked_artist") -> "Любимый исполнитель"
    reason.contains("artist_match") -> "Совпадение по исполнителю"
    reason.contains("discovery") -> "Новое для вас"
    else -> reason
}
