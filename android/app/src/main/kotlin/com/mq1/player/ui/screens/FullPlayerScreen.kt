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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Lyrics
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.mq1.player.ui.vm.LyricsViewModel
import com.mq1.player.ui.vm.PlayerViewModel

/**
 * Full Player — artwork, long-title-safe title/artist, seek, transport,
 * shuffle/repeat, favorite, share, queue sheet, volume. Background playback
 * is owned by MqPlaybackService; this screen is pure UI over its state.
 * Hierarchy (P6 spec): artwork → track identity → progress → transport →
 * secondary actions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FullPlayerScreen(
    onClose: () -> Unit,
    onOpenArtist: (String) -> Unit = {}
) {
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
    val shuffleEnabled by controller.shuffleEnabled.collectAsState()
    val repeatMode by controller.repeatMode.collectAsState()
    val speed by controller.speed.collectAsState()
    val favorites by vm.favorites.collectAsState(initial = emptyList())
    val track = queue.getOrNull(index)

    val lyricsVm: LyricsViewModel = viewModel()
    val lyricsUi by lyricsVm.ui.collectAsState()

    var queueOpen by remember { mutableStateOf(false) }
    var lyricsOpen by remember { mutableStateOf(false) }
    var speedMenuOpen by remember { mutableStateOf(false) }
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
            // Top bar: back + lyrics + queue
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onClose, modifier = Modifier.size(44.dp)) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Закрыть плеер")
                }
                Spacer(Modifier.weight(1f))
                IconButton(
                    onClick = {
                        lyricsOpen = true
                        track?.let { lyricsVm.loadIfNeeded(it) }
                    },
                    modifier = Modifier.size(44.dp)
                ) {
                    Icon(Icons.Filled.Lyrics, contentDescription = "Текст песни")
                }
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
                    modifier = Modifier.clickable {
                        // Open the artist screen (same behavior as the web player)
                        if (track.artist.isNotBlank()) onOpenArtist(track.artist)
                    }
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
                        onClick = { controller.setShuffle(!shuffleEnabled) },
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(Icons.Filled.Shuffle, contentDescription = "Перемешать",
                            tint = if (shuffleEnabled)
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
                            val next = when (repeatMode) {
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
                            tint = if (repeatMode != Player.REPEAT_MODE_OFF)
                                MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                // Favorite + speed + share
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val isFav = favorites.any { it.id == track.id }
                    IconButton(onClick = { controller.toggleFavorite(track) },
                        modifier = Modifier.size(44.dp)) {
                        Icon(
                            if (isFav) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = if (isFav) "Убрать из любимых" else "В любимые",
                            tint = if (isFav) MaterialTheme.colorScheme.primary
                                   else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    // F8: playback speed (0.5–2×, natural pitch)
                    Box {
                        androidx.compose.material3.TextButton(
                            onClick = { speedMenuOpen = true },
                            modifier = Modifier.height(44.dp),
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                                horizontal = 12.dp, vertical = 6.dp
                            )
                        ) {
                            Text(
                                if (speed == 1.0f) "1×" else "${speed}×",
                                style = MaterialTheme.typography.labelLarge,
                                color = if (speed != 1.0f) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        DropdownMenu(
                            expanded = speedMenuOpen,
                            onDismissRequest = { speedMenuOpen = false }
                        ) {
                            listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f).forEach { s ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            if (s == 1.0f) "1× (обычная)" else "${s}×",
                                            color = if (s == speed) MaterialTheme.colorScheme.primary
                                                    else MaterialTheme.colorScheme.onSurface
                                        )
                                    },
                                    onClick = {
                                        controller.setPlaybackSpeed(s)
                                        speedMenuOpen = false
                                    }
                                )
                            }
                        }
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
                        onFavorite = { controller.toggleFavorite(t) }
                    )
                }
            }
        }
    }

    // F8: lyrics sheet — real data only (loading / synced / plain / not found)
    if (lyricsOpen) {
        ModalBottomSheet(
            onDismissRequest = { lyricsOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ) {
            Text(
                "Текст песни",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )
            when {
                lyricsUi.loading -> com.mq1.player.ui.components.LoadingState(label = "Ищем текст…")
                lyricsUi.unavailable -> com.mq1.player.ui.components.EmptyState(
                    "Текст для этого трека не найден"
                )
                lyricsUi.synced -> SyncedLyricsList(
                    lines = lyricsUi.lines,
                    positionMs = position,
                    onSeek = { controller.seekTo(it) }
                )
                else -> Column(
                    Modifier
                        .fillMaxWidth()
                        .height(420.dp)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp)
                ) {
                    Text(
                        lyricsUi.plainText,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(bottom = 24.dp)
                    )
                }
            }
        }
    }
}

/** Synced lyrics: current line highlighted + auto-scrolled, tap line → seek. */
@Composable
private fun SyncedLyricsList(
    lines: List<com.mq1.player.data.api.LyricLine>,
    positionMs: Long,
    onSeek: (Long) -> Unit
) {
    val listState = rememberLazyListState()
    val positionSec = positionMs / 1000.0
    val currentIndex = lines.indexOfLast { it.time <= positionSec }

    // Auto-scroll: keep the current line roughly centered.
    LaunchedEffect(currentIndex) {
        if (currentIndex >= 0) {
            runCatching { listState.animateScrollToItem(currentIndex) }
        }
    }

    LazyColumn(
        state = listState,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = 20.dp, vertical = 8.dp
        ),
        modifier = Modifier.height(440.dp)
    ) {
        itemsIndexed(lines, key = { i, _ -> i }) { i, line ->
            val isCurrent = i == currentIndex
            Text(
                line.text.ifBlank { "♪" },
                style = if (isCurrent) MaterialTheme.typography.titleMedium
                        else MaterialTheme.typography.bodyLarge,
                color = if (isCurrent) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Start,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = line.text.isNotBlank()) { onSeek((line.time * 1000).toLong()) }
                    .padding(vertical = 8.dp)
            )
        }
    }
}
