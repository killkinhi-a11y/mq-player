package com.mq1.player.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.data.api.PlaylistDto
import com.mq1.player.data.api.Track
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.EmptyState
import com.mq1.player.ui.components.ErrorState
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.components.MqIcon
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.components.SectionHeader
import com.mq1.player.ui.components.SpinLoader
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.theme.MqType
import com.mq1.player.ui.vm.HomeViewModel
import com.mq1.player.ui.vm.PlayerViewModel

/**
 * WEB PARITY home — exact port of MainView.tsx mobile composition:
 *
 *  ┌ header: date label (meta-2 upper .14em) · greeting 24/600 ·
 *  │ meta line · Wave pill (h44, hidden when idle on phones)
 *  ├ MobileNowHero: 76 row — 68 art r14, eyebrow (accent now / muted rec),
 *  │ track 14/600, artist 13/500, play 44 accent + next 44 + more,
 *  │ progress = 2.5dp accent edge; EMPTY → compact Wave CTA row
 *  ├ MobileQuickRow: 4 columns (44 circle text@7%, icon 19, count badge,
 *  │ label meta-2 muted)
 *  ├ Section "Продолжить слушать" (History icon) → track rows
 *  ├ Section "Плейлисты" (ListMusic) → 140dp shelf cards
 *  └ Section "Собрали для вас" (Sparkles) → wave preview rows
 *
 * HomeBody is stateless (fixture-renderable for parity screenshots);
 * HomeScreen wires the live ViewModels into it.
 */
@Composable
fun HomeScreen(
    onOpenFullPlayer: () -> Unit,
    onOpenArtist: (String) -> Unit,
    onOpenPlaylist: (String) -> Unit,
    onOpenSettings: () -> Unit = {},
    onOpenLibraryTab: (String) -> Unit = {},
    onOpenChats: () -> Unit = {},
) {
    val vm: HomeViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val queue by player.controller.queue.collectAsState()
    val currentIndex by player.controller.currentIndex.collectAsState()
    val isPlaying by player.controller.isPlaying.collectAsState()
    val position by player.controller.positionMs.collectAsState()
    val duration by player.controller.durationMs.collectAsState()
    val favorites by player.favorites.collectAsState(initial = emptyList())
    val socialState by com.mq1.player.di.ServiceLocator.socialHub.state.collectAsState()
    val activeTrack = queue.getOrNull(currentIndex)

    // P0: shared web-parity context menu (hero ⋯ + every row ⋯)
    val menu = remember { com.mq1.player.ui.components.TrackMenuState() }

    HomeBody(
        ui = ui,
        activeTrack = activeTrack,
        isPlaying = isPlaying,
        progress = if (duration > 0) (position.toFloat() / duration).coerceIn(0f, 1f) else 0f,
        playingTrackId = if (currentIndex >= 0 && isPlaying) activeTrack?.id else null,
        favoriteIds = favorites.map { it.id }.toSet(),
        chatUnread = socialState.totalUnread,
        onOpenFullPlayer = onOpenFullPlayer,
        onOpenArtist = onOpenArtist,
        onOpenPlaylist = onOpenPlaylist,
        onOpenSettings = onOpenSettings,
        // web MobileQuickRow → view switches: favorites/history/playlists are
        // LIBRARY sub-views on mobile — NOT pseudo playlist ids
        onOpenFavorites = { onOpenLibraryTab("favorites") },
        onOpenHistory = { onOpenLibraryTab("history") },
        onOpenPlaylists = { onOpenLibraryTab("playlists") },
        onOpenChats = onOpenChats,
        onPlayQueue = { q, i -> player.controller.playQueue(q, i) },
        onFavorite = { player.controller.toggleFavorite(it) },
        onTrackMenu = { track -> menu.open(track, isCurrent = track.id == activeTrack?.id) },
        onStartWave = {
            vm.startWave { batch ->
                player.controller.startWave(batch)
                onOpenFullPlayer()
            }
        },
        onRetry = { vm.refresh() },
        onNext = player.controller::next,
        onTogglePlay = player.controller::togglePlayPause,
    )

    com.mq1.player.ui.components.TrackMenuHost(
        state = menu,
        controller = player.controller,
        onOpenArtist = onOpenArtist,
    )
}

@Composable
internal fun HomeBody(
    ui: HomeViewModel.HomeUi,
    activeTrack: Track?,
    isPlaying: Boolean,
    progress: Float,
    playingTrackId: String?,
    favoriteIds: Set<String>,
    chatUnread: Int = 0,
    onOpenFullPlayer: () -> Unit,
    onOpenArtist: (String) -> Unit,
    onOpenPlaylist: (String) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenFavorites: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenPlaylists: () -> Unit = {},
    onOpenChats: () -> Unit,
    onPlayQueue: (List<Track>, Int) -> Unit,
    onFavorite: (Track) -> Unit,
    onTrackMenu: (Track) -> Unit = {},
    onStartWave: () -> Unit,
    onNext: () -> Unit,
    onTogglePlay: () -> Unit,
    onRetry: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        // ── header ──────────────────────────────────────────────────────
        item {
            // UX pass 2.3.5: real status-bar inset (was fixed 52dp fake)
            Column(Modifier.statusBarsPadding().padding(horizontal = 16.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            currentDateLabel(),
                            style = MqType.meta2.copy(letterSpacing = 1.2.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            greeting(),
                            style = MqType.page.copy(fontSize = 24.sp, lineHeight = 30.sp),
                            color = MaterialTheme.colorScheme.onBackground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            metaLine(),
                            style = MqType.meta.copy(fontSize = 12.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    // UX pass 2.3.5: STABLE header meaning — Settings is
                    // ALWAYS reachable from Home (previously the icon vanished
                    // whenever a track played: same slot, changing semantics,
                    // two hops to Settings mid-session). WavePill appears
                    // beside it only while something plays.
                    IconButton44(onOpenSettings) {
                        MqIcon(
                            icon = MqIcons.Settings,
                            size = 22.dp,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (activeTrack != null) {
                        WavePill(onStartWave = onStartWave, compact = true)
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }

        // ── now-playing hero / wave CTA ─────────────────────────────────
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                MobileNowHero(
                    track = activeTrack,
                    fallback = ui.wavePreview.firstOrNull(),
                    isPlaying = isPlaying,
                    progress = progress,
                    onToggle = onTogglePlay,
                    onNext = onNext,
                    onOpen = onOpenFullPlayer,
                    onOpenArtist = onOpenArtist,
                    onMore = {
                        // hero ⋯ opens the real track context menu
                        (activeTrack ?: ui.wavePreview.firstOrNull())?.let(onTrackMenu)
                    },
                )
                Spacer(Modifier.height(16.dp))
            }
        }

        // ── quick actions ───────────────────────────────────────────────
        item {
            MobileQuickRow(
                likedCount = favoriteIds.size,
                historyCount = ui.history.size,
                playlistCount = ui.publicPlaylists.size,
                chatCount = chatUnread,
                onFavorites = onOpenFavorites,
                onHistory = onOpenHistory,
                onPlaylists = onOpenPlaylists,
                onChats = onOpenChats,
            )
            Spacer(Modifier.height(8.dp))
        }

        // ── wave preview / recommendations ──────────────────────────────
        if (ui.wavePreview.isNotEmpty()) {
            item { SectionHeader("Для вас", icon = MqIcons.Sparkles) }
            items(ui.wavePreview, key = { "w" + it.id }) { track ->
                TrackRow(
                    track = track,
                    isPlaying = playingTrackId == track.id,
                    isFavorite = track.id in favoriteIds,
                    onPlay = { onPlayQueue(ui.wavePreview, ui.wavePreview.indexOf(track)) },
                    onFavorite = { onFavorite(track) },
                    onMenu = { onTrackMenu(track) },
                )
            }
        }

        // ── continue listening ──────────────────────────────────────────
        if (ui.history.isNotEmpty()) {
            item { SectionHeader("Продолжить слушать", icon = MqIcons.History) }
            items(ui.history, key = { "h" + it.id }) { track ->
                TrackRow(
                    track = track,
                    isPlaying = playingTrackId == track.id,
                    isFavorite = track.id in favoriteIds,
                    onPlay = { onPlayQueue(ui.history, ui.history.indexOf(track)) },
                    onFavorite = { onFavorite(track) },
                    onMenu = { onTrackMenu(track) },
                )
            }
        }

        // ── playlists shelf ─────────────────────────────────────────────
        if (ui.publicPlaylists.isNotEmpty()) {
            item { SectionHeader("Плейлисты", icon = MqIcons.ListMusic) }
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

        // ── states ──────────────────────────────────────────────────────
        item {
            when {
                ui.loading -> LoadingState()
                ui.error != null -> ErrorState(ui.error!!, onRetry = onRetry)
                ui.wavePreview.isEmpty() && ui.history.isEmpty() ->
                    EmptyState("Пока пусто — начните Волну или найдите музыку")
            }
        }
    }
}

/** Web Wave pill: h44 r-full, card bg + thin border, Waves icon + label. */
@Composable
private fun WavePill(onStartWave: () -> Unit, compact: Boolean) {
    Row(
        modifier = Modifier
            .height(44.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onStartWave)
            .padding(start = 12.dp, end = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        MqIcon(icon = MqIcons.Waves, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Волна", style = MqType.label, color = MaterialTheme.colorScheme.onBackground)
    }
}

/**
 * MobileNowHero — web 76dp row: 68 art r14 · eyebrow · title · artist ·
 * transport (play 44 accent circle + next + more) · 2.5dp progress edge.
 */
@Composable
private fun MobileNowHero(
    track: Track?,
    fallback: Track?,
    isPlaying: Boolean,
    progress: Float,
    onToggle: () -> Unit,
    onNext: () -> Unit,
    onOpen: () -> Unit,
    onOpenArtist: (String) -> Unit,
    onMore: () -> Unit,
) {
    val hero = track ?: fallback ?: return WaveHeroCta(onOpen = onOpen)
    val isNow = track != null
    val accent = MaterialTheme.colorScheme.primary

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(80.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .clickable(onClick = onOpen)
                .padding(start = 10.dp, end = 8.dp, top = 6.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Artwork(url = hero.cover, sizeDp = 68, corner = 14, contentDescription = null)
            Column(Modifier.weight(1f)) {
                Text(
                    if (isNow) (if (isPlaying) "Сейчас играет" else "Пауза") else "Подобрано для тебя",
                    style = MqType.label,
                    color = if (isNow) accent else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    hero.title.ifBlank { "Без названия" },
                    style = MqType.track,
                    color = MaterialTheme.colorScheme.onBackground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    hero.artist.ifBlank { "Неизвестный исполнитель" },
                    style = MqType.artist,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clickable { onOpenArtist(hero.artist) },
                )
            }
            // play 44 accent circle
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(accent)
                    .clickable(onClick = onToggle),
                contentAlignment = Alignment.Center
            ) {
                if (isPlaying) {
                    MqIcon(icon = MqIcons.Pause, size = 18.dp, tint = Color.White, fill = true, strokeWidth = 0f)
                } else {
                    MqIcon(
                        icon = MqIcons.Play, size = 18.dp, tint = Color.White,
                        fill = true, strokeWidth = 0f, modifier = Modifier.offset(x = 1.dp)
                    )
                }
            }
            if (isNow) {
                Box(
                    modifier = Modifier.size(44.dp).clip(CircleShape).clickable(onClick = onNext),
                    contentAlignment = Alignment.Center
                ) {
                    MqIcon(
                        icon = MqIcons.SkipForward, size = 20.dp,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Box(
                modifier = Modifier.size(44.dp).clip(CircleShape).clickable(onClick = onMore),
                contentAlignment = Alignment.Center
            ) {
                MqIcon(
                    icon = MqIcons.MoreHorizontal, size = 20.dp,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        // 2.5dp progress edge
        if (isNow) {
            Box(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .height(2.5.dp)
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(progress)
                        .height(2.5.dp)
                        .background(accent)
                )
            }
        }
    }
}

/** Empty hero → compact Wave CTA (web HeroWaveCTA compact, 76 row). */
@Composable
private fun WaveHeroCta(onOpen: () -> Unit) {
    val accent = MaterialTheme.colorScheme.primary
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(76.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(
                Brush.linearGradient(
                    listOf(accent.copy(alpha = 0.10f), accent.copy(alpha = 0.04f))
                )
            )
            .clickable(onClick = onOpen)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(accent.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center
            ) {
                MqIcon(icon = MqIcons.Waves, size = 20.dp, tint = accent)
            }
            Column {
                Text("Волна", style = MqType.track, color = MaterialTheme.colorScheme.onBackground)
                Text(
                    "Бесконечный поток под ваш вкус",
                    style = MqType.meta,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
    }
}

/** Web MobileQuickRow: 4-col grid, 44 circle text@7%, badge 16, label meta-2. */
@Composable
private fun MobileQuickRow(
    likedCount: Int,
    historyCount: Int,
    playlistCount: Int,
    chatCount: Int,
    onFavorites: () -> Unit,
    onHistory: () -> Unit,
    onPlaylists: () -> Unit,
    onChats: () -> Unit,
) {
    val items = listOf(
        Triple(MqIcons.Heart, "Избранное", likedCount to onFavorites),
        Triple(MqIcons.History, "История", historyCount to onHistory),
        Triple(MqIcons.ListMusic, "Плейлисты", playlistCount to onPlaylists),
        Triple(MqIcons.MessageCircle, "Чаты", chatCount to onChats),
    )
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        items.forEach { (icon, label, countAndAction) ->
            val (count, action) = countAndAction
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = action)
                    .padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Box {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.07f)),
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(icon = icon, size = 19.dp, tint = MaterialTheme.colorScheme.onBackground)
                    }
                    if (count > 0) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .offset(x = 4.dp, y = (-4).dp)
                                .height(16.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary)
                                .padding(horizontal = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                if (count > 99) "99+" else count.toString(),
                                style = MqType.badge,
                                color = Color.White,
                            )
                        }
                    }
                }
                Text(
                    label,
                    style = MqType.meta2,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun IconButton44(onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) { content() }
}

@Composable
fun PlaylistCard(playlist: PlaylistDto, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(140.dp)
            .clip(RoundedCornerShape(12.dp))
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
            style = MqType.trackSm,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(140.dp)
        )
        Text(
            "${playlist.trackCount} треков · ${playlist.username}",
            style = MqType.meta2,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

private fun greeting(): String {
    val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
    return when (hour) {
        in 5..11 -> "Доброе утро"
        in 12..17 -> "Добрый день"
        in 18..22 -> "Добрый вечер"
        else -> "Доброй ночи"
    }
}

/** "воскресенье, 13 сентября" — web currentDate() (ru-RU weekday, day, month). */
internal fun currentDateLabel(): String {
    val locale = java.util.Locale("ru", "RU")
    val date = java.util.Calendar.getInstance().time
    val weekday = java.text.DateFormatSymbols(locale).weekdays[java.util.Calendar.getInstance()
        .get(java.util.Calendar.DAY_OF_WEEK)].lowercase(locale)
    val day = java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_MONTH)
    val month = java.text.DateFormatSymbols(locale).months[
            java.util.Calendar.getInstance().get(java.util.Calendar.MONTH)].lowercase(locale)
    return "$weekday, $day $month"
}

/** Web meta line under the greeting. */
private fun metaLine(): String = "Начни с Волны — она подберёт музыку под вкус"
