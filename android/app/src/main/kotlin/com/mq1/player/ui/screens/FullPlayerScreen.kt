package com.mq1.player.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.Player
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.components.formatDuration
import com.mq1.player.ui.vm.PlayerViewModel

/**
 * Full Player — artwork, long-title-safe title/artist, seek, transport,
 * shuffle/repeat, favorite, share, queue sheet, volume. Background playback
 * is owned by MqPlaybackService; this screen is pure UI over its state.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FullPlayerScreen(onClose: () -> Unit) {
    val vm: PlayerViewModel = viewModel()
    val controller = vm.controller
    val context = LocalContext.current

    val queue by controller.queue.collectAsState()
    val index by controller.currentIndex.collectAsState()
    val isPlaying by controller.isPlaying.collectAsState()
    val isBuffering by controller.isBuffering.collectAsState()
    val position by controller.positionMs.collectAsState()
    val duration by controller.durationMs.collectAsState()
    val error by controller.error.collectAsState()
    val networkWaiting by controller.networkWaiting.collectAsState()
    val favorites by vm.favorites.collectAsState(initial = emptyList())
    val track = queue.getOrNull(index)

    var queueOpen by remember { mutableStateOf(false) }
    var seekValue by remember(track?.id, duration) { mutableFloatStateOf(position.toFloat()) }
    var userSeeking by remember { mutableStateOf(false) }

    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
        ) {
            // Top bar: back + queue
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onClose, modifier = Modifier.size(44.dp)) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Закрыть плеер")
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { queueOpen = true }, modifier = Modifier.size(44.dp)) {
                    Icon(Icons.AutoMirrored.Filled.QueueMusic, contentDescription = "Очередь (${queue.size})")
                }
            }

            if (track == null) {
                Spacer(Modifier.height(80.dp))
                Text(
                    "Ничего не играет",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            } else {
                // Artwork
                Box(
                    Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    Artwork(url = track.cover, sizeDp = 320, corner = 24,
                        contentDescription = "Обложка: ${track.title}")
                }

                Spacer(Modifier.height(20.dp))

                // Title / artist — LONG-TITLE-SAFE (maxLines=1 + ellipsis, full weight)
                Text(
                    track.title.ifBlank { "Без названия" },
                    style = MaterialTheme.typography.headlineSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    track.artist.ifBlank { "Неизвестный исполнитель" },
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clickable { onClose() } // nav back → search artist
                )

                Spacer(Modifier.height(8.dp))
                if (isBuffering) {
                    Text(
                        if (networkWaiting) "Ждём сеть…" else "Буферизация…",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.labelMedium)
                }

                Spacer(Modifier.height(16.dp))

                // Seek
                if (!userSeeking) {
                    seekValue = if (duration > 0) position.toFloat() / duration else 0f
                }
                Slider(
                    value = seekValue.coerceIn(0f, 1f),
                    onValueChange = {
                        userSeeking = true
                        seekValue = it
                    },
                    onValueChangeFinished = {
                        controller.seekTo((seekValue * duration).toLong())
                        userSeeking = false
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Позиция трека" }
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(formatDuration((position / 1000).toInt()),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(formatDuration((duration / 1000).toInt()),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }

                Spacer(Modifier.height(8.dp))

                // Transport
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = { controller.setShuffle(!controller.shuffleEnabled()) },
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(Icons.Filled.Shuffle, contentDescription = "Перемешать",
                            tint = if (controller.shuffleEnabled())
                                MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = controller::previous, modifier = Modifier.size(52.dp)) {
                        Icon(Icons.Filled.SkipPrevious, contentDescription = "Предыдущий трек",
                            modifier = Modifier.size(36.dp))
                    }
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .background(
                                MaterialTheme.colorScheme.primary,
                                MaterialTheme.shapes.extraLarge
                            )
                            .clickable { controller.togglePlayPause() }
                            .semantics { contentDescription = if (isPlaying) "Пауза" else "Играть" },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(40.dp)
                        )
                    }
                    IconButton(onClick = controller::next, modifier = Modifier.size(52.dp)) {
                        Icon(Icons.Filled.SkipNext, contentDescription = "Следующий трек",
                            modifier = Modifier.size(36.dp))
                    }
                    IconButton(
                        onClick = {
                            val next = when (controller.repeatMode()) {
                                Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ONE
                                Player.REPEAT_MODE_ONE -> Player.REPEAT_MODE_ALL
                                else -> Player.REPEAT_MODE_OFF
                            }
                            controller.setRepeatMode(next)
                        },
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            Icons.Filled.Repeat, contentDescription = "Повтор",
                            tint = if (controller.repeatMode() != Player.REPEAT_MODE_OFF)
                                MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                // Favorite + share
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val isFav = favorites.any { it.id == track.id }
                    IconButton(onClick = { controller.toggleFavoriteForCurrent() },
                        modifier = Modifier.size(44.dp)) {
                        Icon(
                            if (isFav) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = if (isFav) "Убрать из любимых" else "В любимые",
                            tint = if (isFav) MaterialTheme.colorScheme.primary
                                   else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    IconButton(onClick = {
                        val share = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT,
                                "Слушаю в MQ: ${track.artist} — ${track.title}")
                        }
                        context.startActivity(Intent.createChooser(share, "Поделиться"))
                    }, modifier = Modifier.size(44.dp)) {
                        Icon(Icons.Filled.Share, contentDescription = "Поделиться",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    if (queueOpen) {
        ModalBottomSheet(
            onDismissRequest = { queueOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ) {
            Text(
                "Очередь · ${queue.size}",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )
            LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
                itemsIndexed(queue, key = { _, t -> t.id }) { i, t ->
                    TrackRow(
                        track = t,
                        isPlaying = i == index,
                        isFavorite = favorites.any { it.id == t.id },
                        onPlay = { controller.seekToIndex(i) },
                        onFavorite = { controller.toggleFavoriteForCurrent() }
                    )
                }
            }
        }
    }
}
