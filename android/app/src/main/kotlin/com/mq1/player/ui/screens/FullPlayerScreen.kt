package com.mq1.player.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.Player
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.MqIcon
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.components.MqTrackContextMenu
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.components.formatDuration
import com.mq1.player.ui.theme.MqType
import com.mq1.player.ui.vm.LyricsViewModel
import com.mq1.player.ui.vm.PlayerViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * WEB PARITY Full Player — port of FullTrackViewMobile:
 *  header (chevron-down + «Сейчас играет · N» label + more)
 *  artwork 320 r8 → title 22/800 + Heart 44 · artist 14/500 + ›
 *  progress: 4dp track + 12dp thumb, cur / -remaining (mq-t-time)
 *  transport: shuffle 22 · prev 30 · play 64 accent circle · next 30 ·
 *  repeat 22
 *  secondary: lyrics · queue · speed · mixer · share (44dp, Lucide 20)
 *  queue + lyrics sheets, speed dropdown (MqType), track context menu.
 * All F8/F10/F11 behavior preserved (HLS/DRM via controller, real share
 * URL, real DSP mixer entry, lyrics seek).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FullPlayerScreen(
    onClose: () -> Unit,
    onOpenArtist: (String) -> Unit = {},
    onOpenMixer: () -> Unit = {}
) {
    val vm: PlayerViewModel = viewModel()
    val controller = vm.controller
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

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
    var menuOpen by remember { mutableStateOf(false) }
    var seekValue by remember(track?.id, duration) { mutableFloatStateOf(position.toFloat()) }
    var userSeeking by remember { mutableStateOf(false) }

    // playlists for the context menu (real repository data)
    val playlists by produceState<List<com.mq1.player.data.api.PlaylistDto>>(
        initialValue = emptyList(), menuOpen
    ) {
        if (menuOpen) {
            value = withContext(Dispatchers.IO) {
                runCatching {
                    com.mq1.player.di.ServiceLocator.playlistRepository.myPlaylists()
                }.getOrDefault(emptyList())
            }
        }
    }

    val accent = MaterialTheme.colorScheme.primary
    val text = MaterialTheme.colorScheme.onBackground
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

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
            // ── header: collapse + label + more (web) ────────────────────
            Row(
                Modifier.fillMaxWidth().height(44.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    Modifier
                        .size(44.dp)
                        .clickable(onClick = onClose),
                    contentAlignment = Alignment.Center
                ) {
                    MqIcon(
                        icon = MqIcons.ChevronDown, size = 24.dp, tint = muted,
                        modifier = Modifier.semantics { contentDescription = "Закрыть плеер" }
                    )
                }
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (isPlaying) {
                        Box(
                            Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(accent)
                        )
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(
                        "Сейчас играет · ${queue.size}",
                        style = MqType.label,
                        color = muted,
                        maxLines = 1,
                    )
                }
                Box(
                    Modifier
                        .size(44.dp)
                        .clickable(onClick = { if (track != null) menuOpen = true }),
                    contentAlignment = Alignment.Center
                ) {
                    MqIcon(
                        icon = MqIcons.MoreHorizontal, size = 20.dp, tint = muted,
                        modifier = Modifier.semantics { contentDescription = "Действия с треком" }
                    )
                }
            }

            if (track == null) {
                Spacer(Modifier.height(80.dp))
                Text(
                    "Ничего не играет",
                    style = MqType.section,
                    color = muted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            } else {
                Spacer(Modifier.height(8.dp))
                // ── artwork 320 r8 ──────────────────────────────────────
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Artwork(
                        url = track.cover, sizeDp = 320, corner = 8,
                        contentDescription = "Обложка: ${track.title}"
                    )
                }

                Spacer(Modifier.height(24.dp))

                // ── title 22/800 + Heart 44 (web: heart rides the title row)
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        track.title.ifBlank { "Без названия" },
                        style = MqType.page,
                        color = text,
                        maxLines = 2,   // web wraps long titles at 2 lines
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .weight(1f)
                            .semantics { contentDescription = "Трек: ${track.title}" }
                    )
                    val isFav = favorites.any { it.id == track.id }
                    Box(
                        Modifier
                            .size(44.dp)
                            .clickable { controller.toggleFavorite(track) }
                            .semantics { contentDescription = if (isFav) "Убрать из любимых" else "В любимые" },
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(
                            icon = MqIcons.Heart, size = 26.dp,
                            tint = if (isFav) accent else muted,
                            fill = isFav,
                        )
                    }
                }

                // ── artist 14/500 muted + › (tap → artist screen) ────────
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        track.artist.ifBlank { "Неизвестный исполнитель" },
                        style = MqType.body.copy(fontSize = 14.sp),
                        color = muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .clickable {
                                if (track.artist.isNotBlank()) onOpenArtist(track.artist)
                            }
                    )
                    MqIcon(icon = MqIcons.ChevronRight, size = 14.dp, tint = muted)
                }

                if (isBuffering) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (networkWaiting) "Ждём сеть…" else "Буферизация…",
                        style = MqType.meta2, color = muted
                    )
                }
                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.error, style = MqType.meta2)
                }

                Spacer(Modifier.height(20.dp))

                // ── progress: 4dp track, 12dp thumb, cur / -remaining ────
                if (!userSeeking) {
                    seekValue = if (duration > 0) position.toFloat() / duration else 0f
                }
                WebProgressSlider(
                    fraction = seekValue.coerceIn(0f, 1f),
                    onScrub = { userSeeking = true; seekValue = it },
                    onScrubEnd = {
                        controller.seekTo((seekValue * duration).toLong())
                        userSeeking = false
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Позиция трека" }
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        formatDuration((position / 1000).toInt()),
                        style = MqType.time, color = muted
                    )
                    val remaining = ((duration - position) / 1000).toInt().coerceAtLeast(0)
                    Text(
                        "-" + formatDuration(remaining),
                        style = MqType.time, color = muted
                    )
                }

                Spacer(Modifier.height(28.dp))

                // ── transport: shuffle · prev · play 64 · next · repeat ──
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // shuffle 22
                    Box(
                        Modifier
                            .size(44.dp)
                            .clickable { controller.setShuffle(!shuffleEnabled) }
                            .semantics { contentDescription = "Перемешать" },
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(
                            icon = MqIcons.Shuffle, size = 22.dp,
                            tint = if (shuffleEnabled) accent else muted
                        )
                    }
                    // prev 30
                    Box(
                        Modifier
                            .size(52.dp)
                            .clickable { controller.previous() }
                            .semantics { contentDescription = "Предыдущий трек" },
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(icon = MqIcons.SkipBack, size = 30.dp, tint = text)
                    }
                    // play 64 accent circle
                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .clip(CircleShape)
                            .background(accent)
                            .clickable { controller.togglePlayPause() }
                            .semantics { contentDescription = if (isPlaying) "Пауза" else "Играть" },
                        contentAlignment = Alignment.Center
                    ) {
                        if (isBuffering) {
                            com.mq1.player.ui.components.SpinLoader(
                                size = 24.dp, stroke = 2.5.dp, tint = MaterialTheme.colorScheme.onPrimary
                            )
                        } else if (isPlaying) {
                            MqIcon(
                                icon = MqIcons.Pause, size = 28.dp,
                                tint = MaterialTheme.colorScheme.onPrimary, fill = true, strokeWidth = 0f
                            )
                        } else {
                            MqIcon(
                                icon = MqIcons.Play, size = 28.dp,
                                tint = MaterialTheme.colorScheme.onPrimary, fill = true, strokeWidth = 0f,
                                modifier = Modifier.offset(x = 2.dp)
                            )
                        }
                    }
                    // next 30
                    Box(
                        Modifier
                            .size(52.dp)
                            .clickable { controller.next() }
                            .semantics { contentDescription = "Следующий трек" },
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(icon = MqIcons.SkipForward, size = 30.dp, tint = text)
                    }
                    // repeat 22 (Repeat1 when REPEAT_MODE_ONE)
                    Box(
                        Modifier
                            .size(44.dp)
                            .clickable {
                                val next = when (repeatMode) {
                                    Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ONE
                                    Player.REPEAT_MODE_ONE -> Player.REPEAT_MODE_ALL
                                    else -> Player.REPEAT_MODE_OFF
                                }
                                controller.setRepeatMode(next)
                            }
                            .semantics { contentDescription = "Повтор" },
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(
                            icon = if (repeatMode == Player.REPEAT_MODE_ONE) MqIcons.Repeat1 else MqIcons.Repeat,
                            size = 22.dp,
                            tint = if (repeatMode != Player.REPEAT_MODE_OFF) accent else muted
                        )
                    }
                }

                Spacer(Modifier.height(28.dp))

                // ── secondary: lyrics · queue · speed · mixer · share ────
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    SecondaryAction(MqIcons.Mic2, "Текст песни") {
                        lyricsOpen = true
                        track.let { lyricsVm.loadIfNeeded(it) }
                    }
                    SecondaryAction(MqIcons.ListMusic, "Очередь (${queue.size})") { queueOpen = true }
                    Box {
                        // F8: playback speed (0.5–2×, natural pitch)
                        Box(
                            Modifier
                                .size(44.dp)
                                .clickable { speedMenuOpen = true }
                                .semantics { contentDescription = "Скорость воспроизведения" },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                if (speed == 1.0f) "1×" else "${speed}×",
                                style = MqType.num,
                                color = if (speed != 1.0f) accent else muted
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
                                            style = MqType.menu,
                                            color = if (s == speed) accent else text
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
                    // F10: mixer — real DSP control surface
                    SecondaryAction(MqIcons.SlidersHorizontal, "Микшер") { onOpenMixer() }
                    SecondaryAction(MqIcons.Share2, "Поделиться") {
                        // F11: real HTTPS share URL — the public track page
                        val trackUrl = "https://mq1.vercel.app/track/" +
                            (track.scTrackId ?: track.id)
                        val share = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, "${track.artist} — ${track.title}\n$trackUrl")
                            putExtra(Intent.EXTRA_TITLE, track.title)
                        }
                        context.startActivity(Intent.createChooser(share, "Поделиться"))
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    // ── track context menu (web parity sheet) ───────────────────────────
    if (menuOpen && track != null) {
        MqTrackContextMenu(
            track = track,
            isLiked = favorites.any { it.id == track.id },
            playlists = playlists,
            onDismiss = { menuOpen = false },
            onPlay = { controller.seekToIndex(index) },
            onAddToQueue = { controller.addToQueue(listOf(track)) },
            onToggleLike = { controller.toggleFavorite(track) },
            onOpenArtist = onOpenArtist,
            onAddToPlaylist = { pid ->
                scope.launch(Dispatchers.IO) {
                    runCatching {
                        val repo = com.mq1.player.di.ServiceLocator.playlistRepository
                        val pl = repo.playlist(pid) ?: return@launch
                        if (pl.tracks.none { it.id == track.id }) {
                            repo.updateTracks(pid, pl, pl.tracks + track)
                        }
                    }
                }
            },
            onCreatePlaylistAndAdd = {
                scope.launch(Dispatchers.IO) {
                    runCatching {
                        val repo = com.mq1.player.di.ServiceLocator.playlistRepository
                        val pl = repo.create("Новый плейлист") ?: return@launch
                        repo.updateTracks(pl.id, pl, listOf(track))
                    }
                }
            },
            onRemoveFromQueue = {
                // controller: removing current item = skip (queue mutation
                // lives in the queue sheet — honest, no fake removal)
                controller.next()
            },
        )
    }

    if (queueOpen) {
        ModalBottomSheet(
            onDismissRequest = { queueOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Text(
                "Очередь · ${queue.size}",
                style = MqType.section.copy(fontSize = 16.sp),
                color = text,
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
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Text(
                "Текст песни",
                style = MqType.section.copy(fontSize = 16.sp),
                color = text,
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
                        style = MqType.body.copy(fontSize = 14.sp),
                        color = text,
                        modifier = Modifier.padding(bottom = 24.dp)
                    )
                }
            }
        }
    }
}

/** Web secondary action: 44dp target, 20dp Lucide icon, muted. */
@Composable
private fun SecondaryAction(icon: com.mq1.player.ui.components.LucideIcon, label: String, onClick: () -> Unit) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Box(
        Modifier
            .size(44.dp)
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center
    ) {
        MqIcon(icon = icon, size = 20.dp, tint = muted)
    }
}

/**
 * WEB PARITY slider — 4dp track (muted 35% base, text fill) + 12dp thumb,
 * tap + drag scrubbing (FullTrackViewMobile ProgressBar contract).
 */
@Composable
private fun WebProgressSlider(
    fraction: Float,
    onScrub: (Float) -> Unit,
    onScrubEnd: () -> Unit,
    modifier: Modifier = Modifier
) {
    val trackColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f)
    val fillColor = MaterialTheme.colorScheme.onBackground
    var widthPx by remember { mutableStateOf(0f) }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(28.dp)
            .onSizeChanged { widthPx = it.width.toFloat() }
            .pointerInput(Unit) {
                detectTapGestures { offset ->
                    if (widthPx > 0) onScrub((offset.x / widthPx).coerceIn(0f, 1f))
                    onScrubEnd()
                }
            }
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { offset ->
                        if (widthPx > 0) onScrub((offset.x / widthPx).coerceIn(0f, 1f))
                    },
                    onDragEnd = { onScrubEnd() }
                ) { change, _ ->
                    if (widthPx > 0) onScrub((change.position.x / widthPx).coerceIn(0f, 1f))
                }
            }
    ) {
        // 4dp track
        Box(
            Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(trackColor)
        ) {
            Box(
                Modifier
                    .fillMaxWidth(fraction)
                    .height(4.dp)
                    .background(fillColor)
            )
        }
        // 12dp thumb at the fill edge
        val density = androidx.compose.ui.platform.LocalDensity.current
        Box(
            Modifier
                .align(Alignment.CenterStart)
                .offset(x = with(density) { ((fraction * widthPx) - 6.dp.toPx()).coerceAtLeast(0f).toDp() })
                .size(12.dp)
                .clip(CircleShape)
                .background(fillColor)
        )
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
    val accent = MaterialTheme.colorScheme.primary
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

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
                style = if (isCurrent) MqType.track.copy(fontSize = 16.sp) else MqType.body,
                color = if (isCurrent) accent else muted,
                textAlign = TextAlign.Start,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = line.text.isNotBlank()) { onSeek((line.time * 1000).toLong()) }
                    .padding(vertical = 8.dp)
            )
        }
    }
}
