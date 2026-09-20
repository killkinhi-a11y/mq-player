@file:OptIn(ExperimentalLayoutApi::class)

package com.mq1.player.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.center
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.data.api.Track
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.ErrorState
import com.mq1.player.ui.components.LucideIcon
import com.mq1.player.ui.components.MqIcon
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.theme.MqType
import com.mq1.player.ui.vm.PlayerViewModel
import com.mq1.player.ui.vm.SearchViewModel

/**
 * WEB PARITY search — exact port of SearchView.tsx mobile (375px) composition:
 *
 *  ┌ header: «Поиск» mq-t-display 26/800
 *  ├ search bar: h48 r14 surface bg + hairline border, Search 18 left,
 *  │ placeholder «Искать треки, артисты, альбомы...», X clear 28 circle
 *  ├ mobile action row (right-aligned): «Фильтры» + «Файлы» h44 r12
 *  ├ genre chips (collapsible): «Все» + 8 genres, pill r-full 12/600
 *  ├ recent queries: «Недавние запросы» + «Очистить», clock chips r12
 *  ├ results head: «Результаты» 20/700 + count + «Играть все» accent pill
 *  ├ loading: 5 skeleton rows (art 44 + 2 lines + duration)
 *  ├ no-results: mq-empty dashed card + 4 trending retry chips
 *  ├ results: shared TrackRow list
 *  └ idle hero: 88×88 r28 gradient Headphones chip, «Что послушаем?»,
 *     «Популярные запросы» + 7 trending chips (Поп…Джаз)
 *
 * SearchBody is stateless (fixture-renderable for parity screenshots);
 * SearchScreen wires the live ViewModels into it.
 */
@Composable
fun SearchScreen(onOpenArtist: (String) -> Unit) {
    val vm: SearchViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val queue by player.controller.queue.collectAsState()
    val currentIndex by player.controller.currentIndex.collectAsState()
    val favorites by player.favorites.collectAsState(initial = emptyList())
    val context = androidx.compose.ui.platform.LocalContext.current

    // P0: shared web-parity context menu on every result row
    val menu = remember { com.mq1.player.ui.components.TrackMenuState() }

    // web «Загрузить файлы»: local audio via SAF → playable tracks
    val filePicker = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (uris.isNotEmpty()) {
            val local = uris.mapNotNull { uri ->
                runCatching {
                    val name = runCatching {
                        context.contentResolver.query(uri, null, null, null, null)?.use { c ->
                            val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                            if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
                        }
                    }.getOrNull() ?: "Трек"
                    val title = name.substringBeforeLast('.')
                    Track(
                        id = "local-$uri",
                        title = title,
                        artist = "Локальный файл",
                        audioUrl = uri.toString(),
                        source = "local"
                    )
                }.getOrNull()
            }
            if (local.isNotEmpty()) player.controller.playQueue(local, 0)
        }
    }

    // Animation pass: gate EQ bars on actual playback (Home pattern) —
    // search rows previously kept dancing while paused.
    val isActuallyPlaying by player.controller.isPlaying.collectAsState()
    SearchBody(
        ui = ui,
        playingTrackId = if (isActuallyPlaying) queue.getOrNull(currentIndex)?.id else null,
        favorites = favorites,
        onQueryChange = vm::onQueryChange,
        onGenreChange = vm::onGenreChange,
        onClearHistory = vm::clearHistory,
        onRemoveHistoryItem = vm::removeHistoryItem,
        onPlayQueue = { q, i -> player.controller.playQueue(q, i) },
        onFavorite = { player.controller.toggleFavorite(it) },
        onOpenArtist = onOpenArtist,
        onTrackMenu = { track -> menu.open(track, isCurrent = track.id == queue.getOrNull(currentIndex)?.id) },
        onPickFiles = { filePicker.launch("audio/*") },
        onRetry = { vm.onQueryChange(ui.query) },
    )

    com.mq1.player.ui.components.TrackMenuHost(
        state = menu,
        controller = player.controller,
        onOpenArtist = onOpenArtist,
    )
}

@Composable
internal fun SearchBody(
    ui: SearchViewModel.SearchUi,
    playingTrackId: String?,
    favorites: List<Track>,
    onQueryChange: (String) -> Unit,
    onGenreChange: (String?) -> Unit = {},
    onClearHistory: () -> Unit = {},
    onRemoveHistoryItem: (String) -> Unit = {},
    onPlayQueue: (List<Track>, Int) -> Unit,
    onFavorite: (Track) -> Unit,
    onOpenArtist: (String) -> Unit,
    onTrackMenu: (Track) -> Unit = {},
    onPickFiles: () -> Unit = {},
    onRetry: () -> Unit = {},
) {
    val favoriteIds = remember(favorites) { favorites.map { it.id }.toSet() }
    // Quick picks — first 4 liked tracks, hidden while a query is active (web)
    val quickPicks = remember(favorites) { favorites.take(4) }
    var showFilters by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().imePadding(),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        // ── page header ─────────────────────────────────────────────────
        item {
            Column(Modifier.statusBarsPadding().padding(horizontal = 16.dp)) {
                // web: mq-t-display text-[26px] at 375px (sm: 30px);
                // gap to the search field = mb-1 + space-y-5 (+ collapsed) = 20px
                Text(
                    "Поиск",
                    style = MqType.display.copy(fontSize = 26.sp),
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.padding(bottom = 12.dp)
                )
            }
        }

        // ── search bar + mobile action row (web v72) ─────────────────────
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                WebSearchField(
                    value = ui.query,
                    placeholder = "Искать треки, артисты, альбомы...",
                    onValueChange = onQueryChange,
                )
                Spacer(Modifier.height(8.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Фильтры — accent tint while the genre row is open
                    Row(
                        modifier = Modifier
                            .height(44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (showFilters) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                                else MaterialTheme.colorScheme.surface
                            )
                            .border(
                                1.dp,
                                if (showFilters) MaterialTheme.colorScheme.primary.copy(alpha = 0.30f)
                                else MaterialTheme.colorScheme.outline,
                                RoundedCornerShape(12.dp)
                            )
                            .clickable { showFilters = !showFilters }
                            .padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        MqIcon(
                            icon = MqIcons.SlidersHorizontal, size = 16.dp,
                            tint = if (showFilters) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            "ФИЛЬТРЫ",
                            style = MqType.label,
                            color = if (showFilters) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    // Файлы — REAL local upload (web «Загрузить файлы» → SAF picker)
                    Row(
                        modifier = Modifier
                            .height(44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surface)
                            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.36f), RoundedCornerShape(12.dp))
                            .clickable(onClick = onPickFiles)
                            .padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // web Upload icon — MqIcons has no Upload; Download
                        // (same tray+arrow geometry, mirrored direction) is the
                        // closest available Lucide shape
                        MqIcon(
                            icon = MqIcons.Upload, size = 16.dp,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            "ФАЙЛЫ",
                            style = MqType.label,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                // web: sticky py-2.5 bottom (10) + space-y-5 (20) = 30px
                Spacer(Modifier.height(30.dp))
            }
        }

        // ── genre filter chips (collapsible) ────────────────────────────
        if (showFilters) {
            item {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp)
                ) {
                    item {
                        GenreChip(
                            label = "Все",
                            icon = MqIcons.ListMusic,
                            selected = ui.genre == null,
                            onClick = { onGenreChange(null) },
                        )
                    }
                    items(GENRES) { g ->
                        val (label, icon) = g
                        GenreChip(
                            label = label,
                            icon = icon,
                            selected = ui.genre == label,
                            // web: genre chips hit /api/music/genre — real
                            // genre endpoint, not text-search fallback
                            onClick = { onGenreChange(if (ui.genre == label) null else label) },
                        )
                    }
                }
                // web: chips row pb-2 (8) + space-y-5 (20) = 28px
                Spacer(Modifier.height(28.dp))
            }
        }

        // ── quick picks (4 liked tracks) ────────────────────────────────
        if (ui.query.isBlank() && quickPicks.isNotEmpty()) {
            item {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MqIcon(
                            icon = MqIcons.Sparkles, size = 16.dp,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            "Быстрый доступ",
                            style = MqType.section,
                            color = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.weight(1f)
                        )
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(androidx.compose.foundation.shape.CircleShape)
                                .clickable(onClick = onRetry),
                            contentAlignment = Alignment.Center
                        ) {
                            MqIcon(
                                icon = MqIcons.RefreshCw, size = 16.dp,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    // 2-col grid (web mobile): 343 - 8 gap → 167px columns
                    quickPicks.chunked(2).forEach { pair ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.padding(bottom = 8.dp)
                        ) {
                            pair.forEach { track ->
                                QuickPickCard(
                                    track = track,
                                    onPlay = { onPlayQueue(quickPicks, quickPicks.indexOf(track)) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(20.dp))
            }
        }

        // ── recent searches (clock chips) ───────────────────────────────
        if (ui.query.isBlank() && ui.history.isNotEmpty() && !ui.searched) {
            item {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MqIcon(
                            icon = MqIcons.Clock, size = 14.dp,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "НЕДАВНИЕ ЗАПРОСЫ",
                            // web: text-xs font-semibold uppercase tracking-wider
                            style = MqType.label.copy(
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                letterSpacing = 0.6.sp,
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f)
                        )
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable(onClick = onClearHistory)
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            MqIcon(
                                icon = MqIcons.Trash2, size = 12.dp,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "Очистить",
                                style = MqType.meta2,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(ui.history.take(12)) { q ->
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    // web chips: bg-[var(--mq-card)] + --mq-border-thin
                                    .background(MaterialTheme.colorScheme.surfaceContainer)
                                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(12.dp))
                                    .clickable { onQueryChange(q) }
                                    .padding(start = 10.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                MqIcon(
                                    icon = MqIcons.Clock, size = 12.dp,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    q,
                                    style = MqType.meta,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.width(6.dp))
                                // UX pass 2.3.4: 16dp visual inside a 32dp
                                // touch target (chip row)
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .clickable { onRemoveHistoryItem(q) },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(16.dp)
                                            .clip(CircleShape)
                                            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        MqIcon(
                                            icon = MqIcons.X, size = 10.dp,
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(20.dp))
                }
            }
        }

        // ── results head («Результаты» · count · Играть все) ─────────────
        if (ui.searched && !ui.loading && ui.results.isNotEmpty()) {
            item {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Результаты",
                        style = MqType.section.copy(fontSize = 20.sp, fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        pluralTracks(ui.results.size),
                        style = MqType.num,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(12.dp))
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(MaterialTheme.colorScheme.primary)
                            .clickable { onPlayQueue(ui.results, 0) }
                            .padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        MqIcon(icon = MqIcons.Play, size = 12.dp, tint = Color.White, fill = true, strokeWidth = 0f)
                        Text(
                            "Играть все",
                            // web: text-xs font-semibold = 12/600
                            style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                            color = Color.White,
                        )
                    }
                }
                // web: .mq-section-head margin-bottom 16px
                Spacer(Modifier.height(16.dp))
            }
        }

        // ── loading skeletons (web unified row geometry) ────────────────
        // Animation pass: gentle alpha pulse (was fully static blocks — the
        // one place a modern-app gap was obvious).
        if (ui.loading) {
            items(5) { _ ->
                // rememberInfiniteTransition must live in the composable
                // item scope (LazyListScope itself is not composable).
                val skeletonAlpha by androidx.compose.animation.core.rememberInfiniteTransition(
                    label = "searchSkeleton"
                ).animateFloat(
                    initialValue = 0.55f,
                    targetValue = 1f,
                    animationSpec = androidx.compose.animation.core.infiniteRepeatable(
                        animation = androidx.compose.animation.core.tween(
                            700, easing = androidx.compose.animation.core.FastOutSlowInEasing
                        ),
                        repeatMode = androidx.compose.animation.core.RepeatMode.Reverse
                    ),
                    label = "skeletonAlpha"
                )
                Row(
                    modifier = Modifier
                        .padding(horizontal = 16.dp, vertical = 3.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.36f), RoundedCornerShape(12.dp))
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = skeletonAlpha))
                    )
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(
                            Modifier
                                .fillMaxWidth(0.75f)
                                .height(14.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = skeletonAlpha))
                        )
                        Box(
                            Modifier
                                .fillMaxWidth(0.5f)
                                .height(12.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = skeletonAlpha))
                        )
                    }
                    Box(
                        Modifier
                            .width(40.dp)
                            .height(12.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = skeletonAlpha))
                    )
                }
            }
        }

        // ── no-results empty (mq-empty dashed) + retry chips ────────────
        if (!ui.loading && ui.searched && ui.results.isEmpty() && ui.error == null) {
            item {
                Column(
                    modifier = Modifier
                        .padding(horizontal = 16.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        // web .mq-empty: 1px dashed var(--mq-edge)
                        .mqDashedBorder(
                            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.36f),
                            cornerRadius = 12.dp,
                        )
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.55f))
                        .padding(horizontal = 24.dp, vertical = 40.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    MqIcon(
                        icon = MqIcons.Search, size = 28.dp,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Ничего не найдено",
                        style = MqType.section.copy(fontSize = 19.sp, fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Попробуйте изменить запрос или выбрать другой жанр",
                        style = MqType.body,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    // web: gap-10 uniform + chips row mt-2 → 18px after the hint
                    Spacer(Modifier.height(18.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        TRENDING_SEARCHES.take(4).forEach { term ->
                            // web retry chips: bg var(--mq-surface-2) = --mq-card
                            Text(
                                term,
                                style = MqType.meta,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(MaterialTheme.colorScheme.surfaceContainer)
                                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.36f), RoundedCornerShape(50))
                                    .clickable { onQueryChange(term) }
                                    .padding(horizontal = 14.dp, vertical = 6.dp)
                            )
                        }
                    }
                }
            }
        }

        // ── results (shared TrackRow) ───────────────────────────────────
        if (!ui.loading && ui.results.isNotEmpty()) {
            item {
                Text(
                    "ТРЕКИ · ${ui.results.size}",
                    style = MqType.track.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.7.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
                )
            }
            items(ui.results, key = { it.id }) { track ->
                TrackRow(
                    track = track,
                    isPlaying = playingTrackId == track.id,
                    isFavorite = track.id in favoriteIds,
                    onPlay = { onPlayQueue(ui.results, ui.results.indexOf(track)) },
                    onFavorite = { onFavorite(track) },
                    onMenu = { onTrackMenu(track) },
                    onOpenArtist = onOpenArtist,
                    modifier = Modifier.padding(horizontal = 8.dp)
                )
            }
        }

        // ── error state ─────────────────────────────────────────────────
        if (ui.error != null) {
            item { ErrorState(ui.error!!, onRetry = onRetry) }
        }

        // ── idle hero (web default empty state) ─────────────────────────
        if (!ui.searched && !ui.loading && ui.error == null && ui.history.isEmpty()) {
            item { SearchIdleHero(onQueryChange = onQueryChange) }
        }

        // ── trending chips (web shows these when history exists) ────────
        if (!ui.searched && !ui.loading && ui.error == null && ui.history.isNotEmpty()) {
            item { TrendingSection(onQueryChange = onQueryChange) }
        }
    }
}

/** 1 трек / 2–4 трека / 5+ треков — web plural helper. */
internal fun pluralTracks(n: Int): String = when {
    n == 1 -> "1 трек"
    n in 2..4 -> "$n трека"
    else -> "$n треков"
}

// ── web constants ─────────────────────────────────────────────────────────

/** TRENDING_SEARCHES from SearchView.tsx. */
internal val TRENDING_SEARCHES = listOf("Поп", "Рок", "Хип-хоп", "Электроника", "Инди", "R&B", "Джаз")

/** genreLabels + genreIcons from SearchView.tsx (Lucide set available in MqIcons). */
internal val GENRES: List<Pair<String, LucideIcon>> = listOf(
    "Поп" to MqIcons.Music,
    "Рок" to MqIcons.Flame,
    "Электроника" to MqIcons.Waves,
    "Хип-хоп" to MqIcons.Mic2,
    "Джаз" to MqIcons.AudioLines,
    "Классика" to MqIcons.Music,
    "R&B" to MqIcons.Heart,
    "Инди" to MqIcons.Radio,
)

// ── subcomponents ─────────────────────────────────────────────────────────

/** Web v72 search input: h48 r14, surface bg, hairline border, Search 18. */
@Composable
private fun WebSearchField(
    value: String,
    placeholder: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            // web: 1px solid var(--mq-edge) = border @36% alpha
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.36f), RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.CenterStart
    ) {
        Row(
            Modifier
                .fillMaxSize()
                .padding(start = 16.dp, end = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            MqIcon(
                icon = MqIcons.Search, size = 18.dp,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Box(Modifier.weight(1f)) {
                // focusManager hoisted — keyboardActions lambdas are not
                // composable, LocalFocusManager.current must resolve here
                val focusManager = androidx.compose.ui.platform.LocalFocusManager.current
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = true,
                    textStyle = TextStyle(
                        fontFamily = MqType.section.fontFamily,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onBackground,
                    ),
                    keyboardOptions = KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = {
                        focusManager.clearFocus()
                    }),
                    modifier = Modifier.fillMaxWidth()
                )
                if (value.isEmpty()) {
                    Text(
                        placeholder,
                        style = TextStyle(
                            fontFamily = MqType.section.fontFamily,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (value.isNotEmpty()) {
                // UX pass 2.3.5: 40dp touch target (was 28dp — the only
                // clear button missed by the 2.3.4 pass), 24dp visual.
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .clickable { onValueChange("") },
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)),
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(
                            icon = MqIcons.X, size = 14.dp,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

/** Web genre chip: px16 py10 r-full, icon 14 + 12/600 label. */
@Composable
private fun GenreChip(label: String, icon: LucideIcon, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface)
            .border(
                1.dp,
                if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                RoundedCornerShape(50)
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        MqIcon(
            icon = icon, size = 14.dp,
            tint = if (selected) Color.White else MaterialTheme.colorScheme.primary.copy(alpha = 0.75f),
        )
        Text(
            label,
            style = MqType.meta2.copy(fontWeight = FontWeight.SemiBold),
            color = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Web quick-pick card: surface r12 border, 40 art, title 12/600, artist meta2. */
@Composable
private fun QuickPickCard(track: Track, onPlay: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.36f), RoundedCornerShape(12.dp))
            .clickable(onClick = onPlay)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Artwork(url = track.cover, sizeDp = 40, corner = 8, contentDescription = null)
        Column(Modifier.weight(1f)) {
            Text(
                track.title.ifBlank { "Без названия" },
                style = MqType.meta2.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                track.artist.ifBlank { "Неизвестный исполнитель" },
                style = MqType.meta2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Web idle hero: 88×88 r28 gradient Headphones chip + accent glow halo
 *  (drawn BEHIND the chip, outside layout — web box-shadow). */
@Composable
private fun SearchIdleHero(onQueryChange: (String) -> Unit) {
    val accent = MaterialTheme.colorScheme.primary
    Column(
        Modifier
            .fillMaxWidth()
            // web: py-20 (80px) breathing room around the hero
            .padding(top = 80.dp, bottom = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                // --mq-shadow-accent: 0 4px 16px accent@25% — soft drop halo
                // painted behind, outside layout (no layout cost)
                .drawBehind {
                    val glow = 62.dp.toPx()
                    val center = androidx.compose.ui.geometry.Offset(
                        size.center.x,
                        size.center.y + 4.dp.toPx(),
                    )
                    drawCircle(
                        brush = Brush.radialGradient(
                            colors = listOf(accent.copy(alpha = 0.25f), Color.Transparent),
                            center = center,
                            radius = glow,
                        ),
                        radius = glow,
                        center = center,
                    )
                }
                .clip(RoundedCornerShape(28.dp))
                .background(
                    Brush.linearGradient(
                        listOf(accent.copy(alpha = 0.15f), accent.copy(alpha = 0.06f))
                    )
                )
                .border(1.dp, accent.copy(alpha = 0.10f), RoundedCornerShape(28.dp)),
            contentAlignment = Alignment.Center
        ) {
            MqIcon(icon = MqIcons.Headphones, size = 36.dp, tint = accent.copy(alpha = 0.6f))
        }
        // web: chip mb-5 (20) + title mb-1.5 (6) + desc mb-8 (32)
        Spacer(Modifier.height(20.dp))
        Text(
            "Что послушаем?",
            style = MqType.section.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Введите название, артиста или жанр — или выберите подсказку ниже",
            style = MqType.body.copy(fontSize = 14.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(280.dp)
        )
        Spacer(Modifier.height(32.dp))
        TrendingSectionInner(onQueryChange, centered = true)
    }
}

/** Web trending block («Популярные запросы» + wrapped chips). */
@Composable
private fun TrendingSection(onQueryChange: (String) -> Unit) {
    Column(Modifier.padding(horizontal = 16.dp)) {
        TrendingSectionInner(onQueryChange, centered = false)
    }
}

@Composable
private fun TrendingSectionInner(onQueryChange: (String) -> Unit, centered: Boolean) {
    Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            MqIcon(
                icon = MqIcons.TrendingUp, size = 14.dp,
                tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.7f),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                "ПОПУЛЯРНЫЕ ЗАПРОСЫ",
                // web: text-xs font-semibold uppercase tracking-wider
                style = MqType.label.copy(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.6.sp,
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(12.dp))
        if (centered) {
            // web idle hero: flex-wrap gap-2 justify-center (mirrors the 4+3
            // wrap the browser produces at 375px)
            TRENDING_SEARCHES.chunked(4).forEachIndexed { i, rowTerms ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(bottom = if (i < 2 - 1) 8.dp else 0.dp),
                    horizontalArrangement = Arrangement.spacedBy(
                        8.dp, Alignment.CenterHorizontally
                    ),
                ) {
                    rowTerms.forEach { term -> TrendingChip(term, onQueryChange) }
                }
            }
        } else {
            // web history variant: flex-wrap gap-2, left-aligned
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                TRENDING_SEARCHES.forEach { term -> TrendingChip(term, onQueryChange) }
            }
        }
    }
}

/** Web trending chip: px-4 py-2 r12, bg --mq-card, border-thin, 12/500. */
@Composable
private fun TrendingChip(term: String, onQueryChange: (String) -> Unit) {
    Text(
        term,
        style = MqType.meta,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            // web chips: var(--mq-card) + --mq-border-thin (22%)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(12.dp))
            .clickable { onQueryChange(term) }
            .padding(horizontal = 16.dp, vertical = 8.dp)
    )
}

/** Web .mq-empty: 1px dashed border (edge color) around a rounded card.
 *  Shared by Search + Library empty cards (same package). */
internal fun Modifier.mqDashedBorder(
    color: Color,
    cornerRadius: Dp,
    strokeWidth: Dp = 1.dp,
): Modifier = drawBehind {
    val radius = cornerRadius.toPx()
    val w = strokeWidth.toPx()
    val rect = androidx.compose.ui.geometry.CornerRadius(radius, radius)
    drawRoundRect(
        color = color,
        cornerRadius = rect,
        topLeft = androidx.compose.ui.geometry.Offset(w / 2f, w / 2f),
        size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w),
        style = Stroke(
            width = w,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f, 4f)),
        ),
    )
}
