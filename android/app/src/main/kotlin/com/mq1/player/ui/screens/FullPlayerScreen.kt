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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
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
import kotlinx.coroutines.flow.first
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

    // P1 web parity: More sheet (volume / speed / sleep timer / EQ) +
    // playlist picker + history panel + shared track context menu
    var queueOpen by remember { mutableStateOf(false) }
    var lyricsOpen by remember { mutableStateOf(false) }
    var moreOpen by remember { mutableStateOf(false) }
    var playlistPickerOpen by remember { mutableStateOf(false) }
    var historyOpen by remember { mutableStateOf(false) }
    val menu = remember { com.mq1.player.ui.components.TrackMenuState() }
    var seekValue by remember(track?.id, duration) { mutableFloatStateOf(position.toFloat()) }
    var userSeeking by remember { mutableStateOf(false) }

    val volumePercent by controller.volumePercent.collectAsState()
    val sleepKind by controller.sleepKind.collectAsState()
    val sleepRemainingMs by controller.sleepRemainingMs.collectAsState()
    val dislikedIds by controller.dislikedIds.collectAsState()

    // playlists for the picker sheet (real repository data)
    val playlists by produceState<List<com.mq1.player.data.api.PlaylistDto>>(
        initialValue = emptyList(), playlistPickerOpen
    ) {
        if (playlistPickerOpen) {
            value = withContext(Dispatchers.IO) {
                com.mq1.player.di.ServiceLocator.playlistRepository.myPlaylists()
                    .getOrDefault(emptyList())
            }
        }
    }

    // web «Недавно играло» panel — last 5 unique history tracks
    val recentHistory by produceState<List<com.mq1.player.data.api.Track>>(
        initialValue = emptyList(), historyOpen
    ) {
        if (historyOpen) {
            value = withContext(Dispatchers.IO) {
                com.mq1.player.di.ServiceLocator.localStore.history.first().take(5)
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
                        .clip(CircleShape)
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
                        .clip(CircleShape)
                        .clickable(onClick = { moreOpen = true }),
                    contentAlignment = Alignment.Center
                ) {
                    MqIcon(
                        icon = MqIcons.MoreHorizontal, size = 20.dp, tint = muted,
                        modifier = Modifier.semantics { contentDescription = "Ещё" }
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
                // ── artwork 320 r8 — web gestures: drag down = close,
                //    horizontal drag = next/prev (FullTrackViewMobile) ───
                var dragX by remember { mutableFloatStateOf(0f) }
                var dragY by remember { mutableFloatStateOf(0f) }
                Box(
                    Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    Artwork(
                        url = track.cover, sizeDp = 320, corner = 8,
                        contentDescription = "Обложка: ${track.title}",
                        modifier = Modifier
                            .offset(x = (dragX * 0.25f).dp, y = (dragY * 0.35f).dp)
                            .pointerInput(Unit) {
                                detectDragGestures(
                                    onDragEnd = {
                                        // web thresholds: down >80dp dominant; |x| >60dp dominant
                                        val dx = dragX
                                        val dy = dragY
                                        when {
                                            dy > 80.dp.toPx() && dy > kotlin.math.abs(dx) * 1.5f -> onClose()
                                            dx < -60.dp.toPx() && kotlin.math.abs(dx) > kotlin.math.abs(dy) * 2f -> controller.next()
                                            dx > 60.dp.toPx() && kotlin.math.abs(dx) > kotlin.math.abs(dy) * 2f -> controller.previous()
                                        }
                                        dragX = 0f; dragY = 0f
                                    },
                                    onDragCancel = { dragX = 0f; dragY = 0f }
                                ) { change, dragAmount ->
                                    change.consume()
                                    dragX += dragAmount.x
                                    dragY += dragAmount.y
                                }
                            }
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
                            .clip(CircleShape)
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
                            .clip(CircleShape)
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
                            .clip(CircleShape)
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
                            .clip(CircleShape)
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

                // ── secondary row — web FullTrackViewMobile parity:
                //    Не нравится · В плейлист · Текст · Очередь · История · Поделиться
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val isDislikedNow = dislikedIds.contains(track.scTrackId?.toString() ?: track.id)
                    SecondaryAction(MqIcons.ThumbsDown, "Не нравится", tint = if (isDislikedNow) accent else muted) {
                        // web: dislike → auto-next when it was the current track
                        controller.dislike(track)
                        if (index in queue.indices && queue[index].id == track.id) controller.next()
                    }
                    SecondaryAction(MqIcons.ListMusic, "В плейлист") { playlistPickerOpen = true }
                    SecondaryAction(MqIcons.Mic2, "Текст песни") {
                        lyricsOpen = true
                        track.let { lyricsVm.loadIfNeeded(it) }
                    }
                    SecondaryAction(MqIcons.ListMusic, "Очередь (${queue.size})") { queueOpen = true }
                    SecondaryAction(MqIcons.Clock, "История") { historyOpen = true }
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

    // ── shared track context menu (web parity MenuCore sheet) ──────────
    com.mq1.player.ui.components.TrackMenuHost(
        state = menu,
        controller = controller,
        onOpenArtist = onOpenArtist,
    )

    // ── queue sheet — REAL removal + per-row menu (web mobile panel) ───
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
            if (queue.isEmpty()) {
                com.mq1.player.ui.components.EmptyState("Очередь пуста")
            } else {
                LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
                    itemsIndexed(queue, key = { _, t -> t.id }) { i, t ->
                        TrackRow(
                            track = t,
                            isPlaying = i == index,
                            isFavorite = favorites.any { it.id == t.id },
                            onPlay = { controller.seekToIndex(i) },
                            onFavorite = { controller.toggleFavorite(t) },
                            onMenu = { menu.open(t, queueIndex = i, isCurrent = i == index) }
                        )
                    }
                }
            }
        }
    }

    // ── «Недавно играло» panel (web mobile history panel) ────────────
    if (historyOpen) {
        ModalBottomSheet(
            onDismissRequest = { historyOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Text(
                "Недавно играло",
                style = MqType.section.copy(fontSize = 16.sp),
                color = text,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )
            if (recentHistory.isEmpty()) {
                com.mq1.player.ui.components.EmptyState("История пуста")
            } else {
                LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
                    itemsIndexed(recentHistory, key = { _, t -> t.id }) { i, t ->
                        TrackRow(
                            track = t,
                            isPlaying = track?.id == t.id,
                            isFavorite = favorites.any { it.id == t.id },
                            onPlay = {
                                val q = controller.currentQueue
                                controller.playQueue(q + listOf(t), startIndex = q.size)
                            },
                            onFavorite = { controller.toggleFavorite(t) },
                            onMenu = { menu.open(t, isCurrent = track?.id == t.id) }
                        )
                    }
                }
            }
        }
    }

    // ── «В плейлист» picker sheet (web inline playlist picker) ──────
    if (playlistPickerOpen && track != null) {
        ModalBottomSheet(
            onDismissRequest = { playlistPickerOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Text(
                "Добавить в плейлист",
                style = MqType.section.copy(fontSize = 16.sp),
                color = text,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )
            if (playlists.isEmpty()) {
                Text(
                    "Нет плейлистов",
                    style = MqType.body,
                    color = muted,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                )
            }
            LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
                items(playlists, key = { it.id }) { pl ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable {
                                scope.launch(Dispatchers.IO) {
                                    val ok = runCatching {
                                        val repo = com.mq1.player.di.ServiceLocator.playlistRepository
                                        val full = repo.playlist(pl.id) ?: error("Плейлист недоступен")
                                        if (full.tracks.none { it.id == track.id }) {
                                            repo.updateTracks(pl.id, full, full.tracks + track).getOrThrow()
                                        }
                                    }.isSuccess
                                    withContext(Dispatchers.Main) {
                                        android.widget.Toast.makeText(
                                            context,
                                            if (ok) "Добавлено в плейлист" else "Не удалось добавить в плейлист",
                                            android.widget.Toast.LENGTH_SHORT
                                        ).show()
                                    }
                                }
                                playlistPickerOpen = false
                            }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        MqIcon(icon = MqIcons.ListMusic, size = 18.dp, tint = muted)
                        Text(
                            pl.name,
                            style = MqType.track,
                            color = text,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            "${pl.trackCount} трек(ов)",
                            style = MqType.meta,
                            color = muted
                        )
                    }
                }
                item {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable {
                                val t = track
                                scope.launch(Dispatchers.IO) {
                                    val ok = runCatching {
                                        val repo = com.mq1.player.di.ServiceLocator.playlistRepository
                                        val name = t.artist.takeIf { it.isNotBlank() } ?: "Новый плейлист"
                                        val pl = repo.create(name).getOrThrow()
                                        repo.updateTracks(pl.id, pl, listOf(t)).getOrThrow()
                                    }.isSuccess
                                    withContext(Dispatchers.Main) {
                                        android.widget.Toast.makeText(
                                            context,
                                            if (ok) "Плейлист создан" else "Не удалось создать плейлист",
                                            android.widget.Toast.LENGTH_SHORT
                                        ).show()
                                    }
                                }
                                playlistPickerOpen = false
                            }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        MqIcon(icon = MqIcons.Plus, size = 18.dp, tint = accent)
                        Text("Новый плейлист", style = MqType.track, color = text)
                    }
                }
            }
        }
    }

    // ── More sheet (web FullTrackViewMobile ⋯): громкость · скорость ·
    //    таймер сна · эквалайзер ───────────────────────────────────
    if (moreOpen) {
        ModalBottomSheet(
            onDismissRequest = { moreOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.padding(horizontal = 16.dp)) {
                if (track != null) {
                    Text(
                        track.title.ifBlank { "Без названия" },
                        style = MqType.track.copy(fontSize = 15.sp),
                        color = text,
                        maxLines = 1, overflow = TextOverflow.Ellipsis
                    )
                    Text(track.artist, style = MqType.meta, color = muted, maxLines = 1)
                    Spacer(Modifier.height(10.dp))
                }

                // Громкость (web more-sheet slider 0–100 %)
                Text("Громкость", style = MqType.label, color = muted)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MqIcon(icon = MqIcons.Volume2, size = 18.dp, tint = muted)
                    Slider(
                        value = volumePercent,
                        onValueChange = { controller.setVolume(it) },
                        valueRange = 0f..100f,
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 8.dp)
                            .semantics { contentDescription = "Громкость" }
                    )
                    Text("${volumePercent.toInt()}%", style = MqType.num, color = muted)
                }

                Spacer(Modifier.height(14.dp))

                // Скорость (web pills 0.5×–2×)
                Text("Скорость", style = MqType.label, color = muted)
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f).forEach { s ->
                        val selected = kotlin.math.abs(speed - s) < 0.01f
                        Box(
                            Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    if (selected) accent.copy(alpha = 0.18f)
                                    else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
                                )
                                .clickable { controller.setPlaybackSpeed(s) }
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                if (s == 1.0f) "1×" else "${s}×",
                                style = MqType.menu,
                                color = if (selected) accent else muted
                            )
                        }
                    }
                }

                Spacer(Modifier.height(14.dp))

                // Таймер сна — web 5/10/15/30/45/60 + «До конца трека» (P1)
                Text("Таймер сна", style = MqType.label, color = muted)
                if (sleepKind != com.mq1.player.player.PlaybackController.SleepKind.NONE) {
                    val remaining = (sleepRemainingMs / 1000).coerceAtLeast(0)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MqIcon(icon = MqIcons.Timer, size = 16.dp, tint = accent)
                        Spacer(Modifier.width(6.dp))
                        Text(
                            when (sleepKind) {
                                com.mq1.player.player.PlaybackController.SleepKind.END_OF_TRACK ->
                                    "До конца трека"
                                else -> {
                                    val m = remaining / 60
                                    val s = remaining % 60
                                    "Осталось %d:%02d".format(m, s)
                                }
                            },
                            style = MqType.body,
                            color = accent
                        )
                    }
                }
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf(5, 10, 15, 30, 45, 60).forEach { min ->
                        Box(
                            Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                                .clickable { controller.startSleepTimer(min) }
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("${min}м", style = MqType.menu, color = muted)
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(10.dp))
                            .background(
                                if (sleepKind == com.mq1.player.player.PlaybackController.SleepKind.END_OF_TRACK)
                                    accent.copy(alpha = 0.18f)
                                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
                            )
                            .clickable { controller.startSleepEndOfTrack() }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "До конца трека",
                            style = MqType.menu,
                            color = if (sleepKind == com.mq1.player.player.PlaybackController.SleepKind.END_OF_TRACK) accent else muted
                        )
                    }
                    if (sleepKind != com.mq1.player.player.PlaybackController.SleepKind.NONE) {
                        Box(
                            Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0xFFEF4444).copy(alpha = 0.14f))
                                .clickable { controller.cancelSleepTimer() }
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("Отменить", style = MqType.menu, color = Color(0xFFEF4444))
                        }
                    }
                }

                Spacer(Modifier.height(14.dp))

                // Эквалайзер → Микшер (real DSP)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .clickable { moreOpen = false; onOpenMixer() }
                        .padding(horizontal = 12.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    MqIcon(icon = MqIcons.SlidersHorizontal, size = 18.dp, tint = muted)
                    Spacer(Modifier.width(12.dp))
                    Text("Эквалайзер", style = MqType.track, color = text, modifier = Modifier.weight(1f))
                    Text("10 полос · лимитер", style = MqType.meta, color = muted)
                }
                Spacer(Modifier.height(18.dp))
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
private fun SecondaryAction(
    icon: com.mq1.player.ui.components.LucideIcon,
    label: String,
    tint: Color? = null,
    onClick: () -> Unit
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center
    ) {
        MqIcon(icon = icon, size = 20.dp, tint = tint ?: muted)
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
