@file:OptIn(ExperimentalLayoutApi::class)

package com.mq1.player.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import com.mq1.player.data.api.PlaylistDto
import com.mq1.player.data.api.Track
import com.mq1.player.di.ServiceLocator
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.ErrorState
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.components.LucideIcon
import com.mq1.player.ui.components.MqIcon
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.theme.MqType
import com.mq1.player.ui.theme.LocalMqPalette
import com.mq1.player.ui.vm.PlayerViewModel
import com.mq1.player.ui.vm.PlaylistViewModel

/**
 * WEB PARITY library — exact port of LibraryView.tsx (375px) with its lazy
 * sub-views (FavoritesView / PlaylistView grid / HistoryView):
 *
 *  ┌ header: «Библиотека» 24/700 + «N элементов в коллекции»
 *  ├ underline tab switcher: Избранное / Плейлисты / История (icon + label
 *  │ + count badge, accent underline, 48dp rows)
 *  ├ toolbar: «Поиск в библиотеке...» r12 + «Недавние» sort chip
 *  ├ FAVORITES: icon chip + «Избранное» 18/700 + «N понр. · N не понр. ·
 *  │ N подписок», pill tabs (icon + count), action bar («Найти трек...» +
 *  │ sort + shuffle), «Слушать все»/«Перемешать» pills, r16 list card /
 *  │ «Пока пусто» empty (72 r24 heart chip + «Искать музыку» CTA)
 *  ├ PLAYLISTS: header + «Создать»/«Импорт», 2-col tile grid (r16 cards,
 *  │ gradient art + ListMusic), mq-empty «Нет плейлистов», inline create
 *  │ card («Новый плейлист», Отмена/Создать)
 *  └ HISTORY: 48 r16 clock chip + «История» 20/700 + «Слушать всё»/clear,
 *     search bar, 3+2 stat cards, grouped day cards («Сегодня»…), or
 *     «История пуста» hero (96 r24 clock chip + «Начать слушать» CTA)
 *
 * LibraryBody is stateless (fixture-renderable for parity screenshots);
 * LibraryScreen wires the live ViewModels into it.
 */
@Composable
fun LibraryScreen(
    onOpenPlaylist: (String) -> Unit,
    onOpenArtist: (String) -> Unit = {},
    onGoHome: () -> Unit = {},
    initialTab: Int = 0,
) {
    val vm: PlaylistViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val queue by player.controller.queue.collectAsState()
    val currentIndex by player.controller.currentIndex.collectAsState()
    val favorites by player.favorites.collectAsState(initial = emptyList())
    val history by ServiceLocator.localStore.history.collectAsState(initial = emptyList())
    val disliked by ServiceLocator.localStore.disliked.collectAsState(initial = emptyList())
    val subscribedArtists by ServiceLocator.localStore.favoriteArtists.collectAsState(initial = emptyList())
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    var tab by remember { mutableIntStateOf(initialTab.coerceIn(0, 2)) }
    var query by remember { mutableStateOf("") }
    var sort by remember { mutableIntStateOf(0) }
    var showCreate by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }
    var newDescription by remember { mutableStateOf("") }
    var showImport by remember { mutableStateOf(false) }
    val menu = remember { com.mq1.player.ui.components.TrackMenuState() }
    val snackbar = remember { androidx.compose.material3.SnackbarHostState() }

    // P0: refresh on EVERY resume — re-entering Library after liking a track
    // or editing playlists elsewhere must show fresh data (web re-renders its
    // views on switch; restoreState previously froze the first snapshot).
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) vm.refresh()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    androidx.compose.material3.Scaffold(
        containerColor = androidx.compose.ui.graphics.Color.Transparent,
        snackbarHost = { androidx.compose.material3.SnackbarHost(snackbar) },
    ) { _ ->
        LibraryBody(
            ui = ui,
            activeTab = tab,
            favorites = favorites,
            disliked = disliked,
            subscribedArtists = subscribedArtists,
            history = history,
            playingTrackId = queue.getOrNull(currentIndex)?.id,
            favoriteIds = favorites.map { it.id }.toSet(),
            query = query,
            sort = sort,
            showCreate = showCreate,
            createName = newName,
            createDescription = newDescription,
            showImport = showImport,
            onTabChange = { tab = it; query = "" }, // web clears search on tab switch
            onQueryChange = { query = it },
            onSortChange = { sort = it },
            onCreateToggle = {
                showCreate = !showCreate
                if (!showCreate) { newName = ""; newDescription = "" }
            },
            onCreateNameChange = { newName = it },
            onCreateDescriptionChange = { newDescription = it },
            onCreateConfirm = { name ->
                vm.create(name, newDescription) { showCreate = false; newName = ""; newDescription = "" }
            },
            onImportToggle = { showImport = !showImport },
            onImportUrl = { url ->
                scope.launch {
                    val res = com.mq1.player.data.repo.PlaylistImport.importFromUrl(url)
                    snackbar.showSnackbar(res)
                    vm.refresh()
                }
                showImport = false
            },
            onImportText = { text ->
                scope.launch {
                    val res = com.mq1.player.data.repo.PlaylistImport.importFromText(text)
                    snackbar.showSnackbar(res)
                    vm.refresh()
                }
                showImport = false
            },
            onOpenPlaylist = onOpenPlaylist,
            onOpenArtist = onOpenArtist,
            onPlayQueue = { q, i -> player.controller.playQueue(q, i) },
            onAddToQueue = { player.controller.addToQueue(it) },
            onFavorite = { player.controller.toggleFavorite(it) },
            onRemoveDisliked = { scope.launch { ServiceLocator.localStore.toggleDisliked(it) } },
            onUnsubscribe = { scope.launch { ServiceLocator.localStore.toggleFavoriteArtist(it) } },
            onDislike = { player.controller.dislike(it) },
            onTrackMenu = { track -> menu.open(track) },
            onPlaylistRename = { id, name -> vm.rename(id, name) },
            onPlaylistDelete = { id -> vm.delete(id) },
            onPlaylistCover = { id, bytes ->
                scope.launch {
                    val res = com.mq1.player.data.repo.PlaylistImport.updateCover(id, bytes)
                    snackbar.showSnackbar(res)
                    vm.refresh()
                }
            },
            onClearHistory = { scope.launch { ServiceLocator.localStore.clearHistory() } },
            onGoHome = onGoHome,
        )
    }

    // shared web-parity context menu for every library track row
    com.mq1.player.ui.components.TrackMenuHost(
        state = menu,
        controller = player.controller,
        onOpenArtist = onOpenArtist,
    )

    // honest operation feedback (create/rename/delete outcomes)
    val message = ui.message
    androidx.compose.runtime.LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(it)
            vm.consumeMessage()
        }
    }
}

@Composable
internal fun LibraryBody(
    ui: PlaylistViewModel.PlaylistUi,
    activeTab: Int,
    favorites: List<Track>,
    history: List<Track>,
    playingTrackId: String?,
    favoriteIds: Set<String>,
    query: String,
    sort: Int,
    disliked: List<Track> = emptyList(),
    subscribedArtists: List<String> = emptyList(),
    showCreate: Boolean = false,
    createName: String = "",
    createDescription: String = "",
    showImport: Boolean = false,
    onTabChange: (Int) -> Unit,
    onQueryChange: (String) -> Unit,
    onSortChange: (Int) -> Unit,
    onCreateToggle: () -> Unit = {},
    onCreateNameChange: (String) -> Unit = {},
    onCreateDescriptionChange: (String) -> Unit = {},
    onCreateConfirm: (String) -> Unit = {},
    onImportToggle: () -> Unit = {},
    onImportUrl: (String) -> Unit = {},
    onImportText: (String) -> Unit = {},
    onOpenPlaylist: (String) -> Unit,
    onOpenArtist: (String) -> Unit = {},
    onPlayQueue: (List<Track>, Int) -> Unit,
    onAddToQueue: (List<Track>) -> Unit = {},
    onFavorite: (Track) -> Unit,
    onRemoveDisliked: (Track) -> Unit = {},
    onUnsubscribe: (String) -> Unit = {},
    onDislike: (Track) -> Unit = {},
    onTrackMenu: (Track) -> Unit = {},
    onPlaylistRename: (String, String) -> Unit = { _, _ -> },
    onPlaylistDelete: (String) -> Unit = {},
    onPlaylistCover: (String, ByteArray) -> Unit = { _, _ -> },
    onClearHistory: () -> Unit = {},
    onGoHome: () -> Unit = {},
) {
    val playlists = ui.mine + ui.public
    val filteredFavorites = remember(favorites, query, sort) {
        var list = favorites.filter {
            query.isBlank() || it.title.contains(query, true) || it.artist.contains(query, true)
        }
        when (sort) {
            1 -> list = list.sortedBy { it.title.lowercase() }
            2 -> list = list.sortedBy { it.artist.lowercase() }
        }
        list
    }
    val filteredHistory = remember(history, query, sort) {
        var list = history.filter {
            query.isBlank() || it.title.contains(query, true) || it.artist.contains(query, true)
        }
        when (sort) {
            1 -> list = list.sortedBy { it.title.lowercase() }
            2 -> list = list.sortedBy { it.artist.lowercase() }
        }
        list
    }
    val filteredPlaylists = remember(playlists, query) {
        playlists.filter { query.isBlank() || it.name.contains(query, true) }
    }

    // favorites sub-tab / batch-selection state (hoisted so the LazyColumn
    // content re-executes when they change)
    var favSubTab by remember { mutableIntStateOf(0) }
    var favBatchMode by remember { mutableStateOf(false) }
    val favSelection = remember { androidx.compose.runtime.mutableStateListOf<String>() }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        // ── header ──────────────────────────────────────────────────────
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Spacer(Modifier.height(52.dp))
                Text(
                    "Библиотека",
                    style = MqType.page.copy(fontSize = 24.sp, fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "${favorites.size + playlists.size + history.size} элементов в коллекции",
                    style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.Normal),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(16.dp))
            }
        }

        // ── underline tab switcher ──────────────────────────────────────
        item {
            LibraryTabBar(
                activeTab = activeTab,
                favCount = favorites.size,
                plCount = playlists.size,
                histCount = history.size,
                onTabChange = onTabChange,
            )
            Spacer(Modifier.height(16.dp))
        }

        // ── search + sort toolbar ───────────────────────────────────────
        item {
            Row(
                Modifier.padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        // web: bg var(--mq-card) + --mq-border-thin
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.CenterStart
                ) {
                    Row(
                        Modifier.fillMaxSize().padding(start = 12.dp, end = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        MqIcon(
                            icon = MqIcons.Search, size = 16.dp,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Box(Modifier.weight(1f)) {
                            BasicTextField(
                                value = query,
                                onValueChange = onQueryChange,
                                singleLine = true,
                                textStyle = TextStyle(
                                    fontFamily = MqType.body.fontFamily,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onBackground,
                                ),
                                modifier = Modifier.fillMaxWidth()
                            )
                            if (query.isEmpty()) {
                                Text(
                                    "Поиск в библиотеке...",
                                    style = TextStyle(
                                        fontFamily = MqType.body.fontFamily,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    ),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                        if (query.isNotEmpty()) {
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
                                    .clickable { onQueryChange("") },
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
                // web <select> Недавние / По названию / По артисту
                Row(
                    modifier = Modifier
                        .height(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(12.dp))
                        .clickable { onSortChange((sort + 1) % 3) }
                        .padding(horizontal = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        when (sort) { 1 -> "По названию"; 2 -> "По артисту"; else -> "Недавние" },
                        // web: text-xs font-medium = 12/500
                        style = MqType.meta.copy(fontWeight = FontWeight.Medium),
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    MqIcon(
                        icon = MqIcons.ChevronDown, size = 14.dp,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        // ── tab content ─────────────────────────────────────────────────
        when (activeTab) {
            0 -> favoritesTab(
                favorites = filteredFavorites,
                disliked = disliked,
                subscribedArtists = subscribedArtists,
                likedCount = favorites.size,
                query = query,
                playingTrackId = playingTrackId,
                favoriteIds = favoriteIds,
                sort = sort,
                subTab = favSubTab,
                batchMode = favBatchMode,
                selection = favSelection,
                onSubTabChange = { favSubTab = it },
                onBatchModeChange = { favBatchMode = it },
                onQueryChange = onQueryChange,
                onSortChange = onSortChange,
                onPlayQueue = onPlayQueue,
                onFavorite = onFavorite,
                onRemoveDisliked = onRemoveDisliked,
                onUnsubscribe = onUnsubscribe,
                onOpenArtist = onOpenArtist,
                onTrackMenu = onTrackMenu,
                onGoHome = onGoHome,
            )
            1 -> playlistsTab(
                ui = ui,
                playlists = filteredPlaylists,
                showCreate = showCreate,
                createName = createName,
                createDescription = createDescription,
                showImport = showImport,
                onCreateToggle = onCreateToggle,
                onCreateNameChange = onCreateNameChange,
                onCreateDescriptionChange = onCreateDescriptionChange,
                onCreateConfirm = onCreateConfirm,
                onImportToggle = onImportToggle,
                onImportUrl = onImportUrl,
                onImportText = onImportText,
                onOpenPlaylist = onOpenPlaylist,
                onPlayQueue = onPlayQueue,
                onAddToQueue = onAddToQueue,
                onPlaylistRename = onPlaylistRename,
                onPlaylistDelete = onPlaylistDelete,
                onPlaylistCover = onPlaylistCover,
            )
            else -> historyTab(
                history = filteredHistory,
                query = query,
                playingTrackId = playingTrackId,
                favoriteIds = favoriteIds,
                onQueryChange = onQueryChange,
                onPlayQueue = onPlayQueue,
                onFavorite = onFavorite,
                onTrackMenu = onTrackMenu,
                onClearHistory = onClearHistory,
                onGoHome = onGoHome,
            )
        }
    }
}

// ── tab bar ───────────────────────────────────────────────────────────────

@Composable
private fun LibraryTabBar(
    activeTab: Int,
    favCount: Int,
    plCount: Int,
    histCount: Int,
    onTabChange: (Int) -> Unit,
) {
    val tabs = listOf(
        Triple(MqIcons.Heart, "Избранное", favCount),
        Triple(MqIcons.ListMusic, "Плейлисты", plCount),
        Triple(MqIcons.Clock, "История", histCount),
    )
    Column(
        Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
    ) {
        Row(Modifier.fillMaxWidth()) {
            tabs.forEachIndexed { i, (icon, label, count) ->
                val active = activeTab == i
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .clickable { onTabChange(i) },
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(
                        Modifier.weight(1f).fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        MqIcon(
                            icon = icon, size = 16.dp,
                            tint = if (active) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            label,
                            // web: text-sm font-medium = 14/500
                            style = MqType.body.copy(
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                            ),
                            color = if (active) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (count > 0) {
                            Spacer(Modifier.width(6.dp))
                            Text(
                                count.toString(),
                                style = MqType.meta2.copy(fontWeight = FontWeight.SemiBold),
                                color = if (active) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(
                                        if (active) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                                        else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f)
                                    )
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                }
            }
        }
        // bottom hairline + 2dp accent underline inside the active third
        // web: border-b 1px thin (22%) + h-0.5 (2px) accent indicator
        Box(
            Modifier
                .fillMaxWidth()
                .height(2.dp)
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .align(Alignment.BottomCenter)
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.22f))
            )
            Row(Modifier.fillMaxSize()) {
                tabs.forEachIndexed { i, _ ->
                    Box(Modifier.weight(1f).fillMaxHeight()) {
                        if (activeTab == i) {
                            Box(
                                Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 8.dp)
                                    .background(
                                        MaterialTheme.colorScheme.primary,
                                        RoundedCornerShape(50)
                                    )
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── FAVORITES (FavoritesView port) ────────────────────────────────────────

private fun LazyListScope.favoritesTab(
    favorites: List<Track>,
    disliked: List<Track>,
    subscribedArtists: List<String>,
    likedCount: Int,
    query: String,
    playingTrackId: String?,
    favoriteIds: Set<String>,
    sort: Int,
    subTab: Int,
    batchMode: Boolean,
    selection: MutableList<String>,
    onSubTabChange: (Int) -> Unit,
    onBatchModeChange: (Boolean) -> Unit,
    onQueryChange: (String) -> Unit,
    onSortChange: (Int) -> Unit,
    onPlayQueue: (List<Track>, Int) -> Unit,
    onFavorite: (Track) -> Unit,
    onRemoveDisliked: (Track) -> Unit,
    onUnsubscribe: (String) -> Unit,
    onOpenArtist: (String) -> Unit,
    onTrackMenu: (Track) -> Unit,
    onGoHome: () -> Unit,
) {
    // P0: the three web sub-tabs really switch now (Понравившиеся /
    // Не понравившиеся / Подписки) — state hoisted into LibraryBody so the
    // LazyColumn content re-executes on change.
    // web double padding: LibraryView p-16 + FavoritesView p-16 → content at 32
    item {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                // 40×40 r12 icon chip (web: color-mix accent 12% + border-thin)
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    MqIcon(icon = MqIcons.Heart, size = 18.dp, tint = LikedRed)
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        "Избранное",
                        style = MqType.section.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Text(
                        "$likedCount понр. · ${disliked.size} не понр. · ${subscribedArtists.size} подписок",
                        style = MqType.meta2,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                // web batch-mode toggle (visible when the list is non-empty)
                if (favorites.isNotEmpty()) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (batchMode) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                                else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f)
                            )
                            .clickable {
                                onBatchModeChange(!batchMode)
                                if (!batchMode) selection.clear()
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(
                            icon = MqIcons.SlidersHorizontal, size = 14.dp,
                            tint = if (batchMode) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }

    // pill tabs (Понравившиеся / Не понравившиеся / Подписки — icons + counts)
    item {
        FavPillTabs(
            liked = likedCount,
            disliked = disliked.size,
            subs = subscribedArtists.size,
            active = subTab,
            onSelect = { onSubTabChange(it); selection.clear() },
        )
    }

    // action bar: «Найти трек...» + sort + shuffle
    item {
        Row(
            Modifier
                .padding(horizontal = 16.dp)
                .padding(bottom = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .height(40.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f))
                    .border(
                        if (query.isNotEmpty()) 1.5.dp else 1.dp,
                        if (query.isNotEmpty()) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.outline,
                        RoundedCornerShape(16.dp)
                    )
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                MqIcon(
                    icon = MqIcons.Search, size = 14.dp,
                    tint = if (query.isNotEmpty()) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Box(Modifier.weight(1f)) {
                    BasicTextField(
                        value = query,
                        onValueChange = onQueryChange,
                        singleLine = true,
                        textStyle = TextStyle(
                            fontFamily = MqType.body.fontFamily,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onBackground,
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (query.isEmpty()) {
                        Text(
                            "Найти трек...",
                            style = TextStyle(
                                fontFamily = MqType.body.fontFamily,
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            ),
                            maxLines = 1,
                        )
                    }
                }
                if (query.isNotEmpty()) {
                    Box(
                        modifier = Modifier
                            .size(20.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.10f))
                            .clickable { onQueryChange("") },
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(
                            icon = MqIcons.X, size = 12.dp,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            // sort (web ArrowDownUp → ArrowUpRight in MqIcons)
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        if (sort != 0) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f)
                    )
                    .clickable { onSortChange((sort + 1) % 3) },
                contentAlignment = Alignment.Center
            ) {
                MqIcon(
                    icon = MqIcons.ArrowUpRight, size = 14.dp,
                    tint = if (sort != 0) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // shuffle — web disabled:opacity-30 when the list is empty
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f))
                    .alpha(if (favorites.isNotEmpty()) 1f else 0.3f)
                    .clickable(enabled = favorites.isNotEmpty()) {
                        onPlayQueue(favorites.shuffled(), 0)
                    },
                contentAlignment = Alignment.Center
            ) {
                MqIcon(
                    icon = MqIcons.Shuffle, size = 14.dp,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    // stats bar («Слушать все» + «Перемешать» + total time)
    if (favorites.isNotEmpty()) {
        item {
            Row(
                Modifier
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.primary)
                        .clickable { onPlayQueue(favorites, 0) }
                        .padding(horizontal = 20.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    MqIcon(icon = MqIcons.Play, size = 14.dp, tint = Color.White, fill = true, strokeWidth = 0f)
                    Text(
                        "Слушать все",
                        // web: text-xs font-semibold = 12/600, color --mq-text
                        style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                }
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f))
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(50))
                        .clickable { onPlayQueue(favorites.shuffled(), 0) }
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    MqIcon(icon = MqIcons.Shuffle, size = 14.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        "Перемешать",
                        style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.weight(1f))
                val total = favorites.sumOf { it.duration }
                if (total > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        MqIcon(icon = MqIcons.Timer, size = 12.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            formatTotal(total.toInt()),
                            style = MqType.meta2,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }

    // track list card / empty state — content depends on the ACTIVE pill
    // (web FavoritesView: Понравившиеся / Не понравившиеся / Подписки)
    item {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    // web: bg --mq-card + border-thin + shadow-xs
                    .background(MaterialTheme.colorScheme.surfaceContainer)
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(16.dp))
            ) {
                when (subTab) {
                    0 -> {
                        if (favorites.isEmpty()) {
                            FavoritesEmptyState(onGoHome = onGoHome)
                        } else {
                            favorites.forEachIndexed { i, track ->
                                SelectableTrackRow(
                                    track = track,
                                    selected = track.id in selection,
                                    batchMode = batchMode,
                                    onToggleSelect = {
                                        if (track.id in selection) selection.remove(track.id)
                                        else selection.add(track.id)
                                    },
                                    isPlaying = playingTrackId == track.id,
                                    isFavorite = track.id in favoriteIds,
                                    onPlay = { onPlayQueue(favorites, i) },
                                    onFavorite = { onFavorite(track) },
                                    onMenu = { onTrackMenu(track) },
                                )
                                if (i < favorites.lastIndex) {
                                    RowSeparator()
                                }
                            }
                        }
                    }
                    1 -> {
                        // «Не понравившиеся» — web: play + «Убрать из списка»
                        if (disliked.isEmpty()) {
                            Column(
                                Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 48.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                MqIcon(icon = MqIcons.ThumbsDown, size = 28.dp, tint = DislikedOrange)
                                Spacer(Modifier.height(10.dp))
                                Text(
                                    "Пока пусто",
                                    style = MqType.section.copy(fontSize = 17.sp, fontWeight = FontWeight.Bold),
                                    color = MaterialTheme.colorScheme.onBackground,
                                )
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    "Дизлайкните трек — и он больше не попадётся в рекомендациях.",
                                    style = MqType.body,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        } else {
                            Text(
                                "Эти треки исключены из рекомендаций и радиостанций",
                                style = MqType.meta2,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                            )
                            disliked.forEachIndexed { i, track ->
                                TrackRow(
                                    track = track,
                                    isPlaying = playingTrackId == track.id,
                                    isFavorite = false,
                                    onPlay = { onPlayQueue(disliked, i) },
                                    onFavorite = null,
                                    onMenu = { onTrackMenu(track) },
                                )
                                Row(
                                    Modifier.fillMaxWidth().padding(end = 8.dp),
                                    horizontalArrangement = Arrangement.End
                                ) {
                                    Text(
                                        "Убрать из списка",
                                        style = MqType.meta.copy(color = LikedRed),
                                        color = LikedRed,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable { onRemoveDisliked(track) }
                                            .padding(horizontal = 10.dp, vertical = 6.dp),
                                    )
                                }
                                if (i < disliked.lastIndex) RowSeparator()
                            }
                        }
                    }
                    else -> {
                        // «Подписки» — web: artist rows with «Открыть артиста» / «Отписаться»
                        if (subscribedArtists.isEmpty()) {
                            Column(
                                Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 48.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                MqIcon(icon = MqIcons.Users, size = 28.dp, tint = SubsPurple)
                                Spacer(Modifier.height(10.dp))
                                Text(
                                    "Пока пусто",
                                    style = MqType.section.copy(fontSize = 17.sp, fontWeight = FontWeight.Bold),
                                    color = MaterialTheme.colorScheme.onBackground,
                                )
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    "Подпишитесь на артистов — и они появятся здесь",
                                    style = MqType.body,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        } else {
                            subscribedArtists.forEachIndexed { i, artist ->
                                Row(
                                    Modifier
                                        .fillMaxWidth()
                                        .clickable { onOpenArtist(artist) }
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Box(
                                        Modifier
                                            .size(44.dp)
                                            .clip(CircleShape)
                                            .background(SubsPurple.copy(alpha = 0.16f)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            artist.take(1).uppercase(),
                                            style = MqType.track.copy(fontSize = 16.sp),
                                            color = SubsPurple,
                                        )
                                    }
                                    Text(
                                        artist,
                                        style = MqType.track,
                                        color = MaterialTheme.colorScheme.onBackground,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.weight(1f),
                                    )
                                    Text(
                                        "Отписаться",
                                        style = MqType.meta,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable { onUnsubscribe(artist) }
                                            .padding(horizontal = 10.dp, vertical = 6.dp),
                                    )
                                }
                                if (i < subscribedArtists.lastIndex) RowSeparator()
                            }
                        }
                    }
                }
            }
        }
    }

    // web batch bar: «Выбрано: N» + «В плейлист» + «Удалить»
    if (batchMode && subTab == 0 && selection.isNotEmpty()) {
        item {
            Row(
                Modifier
                    .padding(horizontal = 16.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    "Выбрано: ${selection.size}",
                    style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    "Снять все",
                    style = MqType.meta,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { selection.clear() }
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                )
                Text(
                    "Удалить",
                    style = MqType.meta,
                    color = LikedRed,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable {
                            favorites.filter { it.id in selection }.forEach(onFavorite) // un-like
                            selection.clear()
                        }
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun RowSeparator() {
    Box(
        Modifier
            .padding(start = 66.dp, end = 16.dp)
            .height(1.dp)
            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f))
    )
}

/** Track row with an optional batch-selection checkbox (web «Выбрать несколько»). */
@Composable
private fun SelectableTrackRow(
    track: Track,
    selected: Boolean,
    batchMode: Boolean,
    onToggleSelect: () -> Unit,
    isPlaying: Boolean,
    isFavorite: Boolean,
    onPlay: () -> Unit,
    onFavorite: () -> Unit,
    onMenu: () -> Unit,
) {
    if (batchMode) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { onToggleSelect() }
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(
                        if (selected) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f)
                    ),
                contentAlignment = Alignment.Center
            ) {
                if (selected) {
                    MqIcon(icon = MqIcons.Check, size = 14.dp, tint = Color.White)
                }
            }
            Text(
                track.title.ifBlank { "Без названия" },
                style = MqType.track,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                track.artist,
                style = MqType.meta,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    } else {
        TrackRow(
            track = track,
            isPlaying = isPlaying,
            isFavorite = isFavorite,
            onPlay = onPlay,
            onFavorite = onFavorite,
            onMenu = onMenu,
        )
    }
}

/** web: 0 не понр. / 0 подписок — disliked & subscriptions are web-only lists. */
private val LikedRed = Color(0xFFEF4444)
private val DislikedOrange = Color(0xFFF97316)
private val SubsPurple = Color(0xFF8B5CF6)

/** Web-parity pill switcher — all three lists are live on Android now. */
@Composable
private fun FavPillTabs(
    liked: Int,
    disliked: Int,
    subs: Int,
    active: Int,
    onSelect: (Int) -> Unit,
) {
    val pills = listOf(
        Triple(MqIcons.Heart, liked, LikedRed),
        Triple(MqIcons.ThumbsDown, disliked, DislikedOrange),
        Triple(MqIcons.Users, subs, SubsPurple),
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            // web: rounded-xl, bg --mq-card + border-thin
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(12.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        pills.forEachIndexed { i, (icon, count, color) ->
            val isActive = i == active
            Row(
                modifier = Modifier
                    .weight(1f)
                    .height(36.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isActive) color.copy(alpha = 0.20f) else Color.Transparent)
                    .clickable { onSelect(i) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                MqIcon(icon = icon, size = 14.dp, tint = if (isActive) color else MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(6.dp))
                Text(
                    count.toString(),
                    style = MqType.meta2.copy(fontWeight = FontWeight.Bold),
                    color = if (isActive) color else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(
                            if (isActive) color.copy(alpha = 0.13f)
                            else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f)
                        )
                        .padding(horizontal = 6.dp, vertical = 1.dp)
                )
            }
        }
    }
}

/** Web favorites empty state (red heart chip + «Искать музыку» CTA). */
@Composable
private fun FavoritesEmptyState(onGoHome: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 64.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(72.dp),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(LikedRed.copy(alpha = 0.08f))
                    .border(1.dp, LikedRed.copy(alpha = 0.12f), RoundedCornerShape(24.dp)),
                contentAlignment = Alignment.Center
            ) {
                MqIcon(icon = MqIcons.Heart, size = 32.dp, tint = LikedRed.copy(alpha = 0.35f))
            }
            // web: pulsing dot at -top-1 -right-1 (w-5, mid-animation alpha)
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 4.dp, y = (-4).dp)
                    .size(20.dp)
                    .background(LikedRed.copy(alpha = 0.14f), CircleShape)
            )
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "Пока пусто",
            style = MqType.track.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "Лайкните трек — и он окажется здесь. Чем больше лайков, тем точнее рекомендации.",
            style = MqType.meta,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(240.dp)
        )
        Spacer(Modifier.height(16.dp))
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.primary)
                .clickable(onClick = onGoHome)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            MqIcon(icon = MqIcons.Music, size = 14.dp, tint = MaterialTheme.colorScheme.onBackground)
            Text(
                "Искать музыку",
                // web: text-xs font-semibold, color --mq-text
                style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onBackground,
            )
        }
        Spacer(Modifier.height(16.dp))
        // web: pulsing opacity 0.3–0.6 → static mid value
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.alpha(0.45f),
        ) {
            MqIcon(icon = MqIcons.Sparkles, size = 12.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                "Рекомендации подстраиваются под ваши предпочтения",
                style = MqType.meta2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ── PLAYLISTS (PlaylistView grid port) ────────────────────────────────────

private fun LazyListScope.playlistsTab(
    ui: PlaylistViewModel.PlaylistUi,
    playlists: List<PlaylistDto>,
    showCreate: Boolean,
    createName: String,
    createDescription: String,
    showImport: Boolean,
    onCreateToggle: () -> Unit,
    onCreateNameChange: (String) -> Unit,
    onCreateDescriptionChange: (String) -> Unit,
    onCreateConfirm: (String) -> Unit,
    onImportToggle: () -> Unit,
    onImportUrl: (String) -> Unit,
    onImportText: (String) -> Unit,
    onOpenPlaylist: (String) -> Unit,
    onPlayQueue: (List<Track>, Int) -> Unit,
    onAddToQueue: (List<Track>) -> Unit,
    onPlaylistRename: (String, String) -> Unit,
    onPlaylistDelete: (String) -> Unit,
    onPlaylistCover: (String, ByteArray) -> Unit,
) {
    item {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Плейлисты",
                        style = MqType.page.copy(fontSize = 24.sp),
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        if (playlists.isNotEmpty()) pluralPlaylists(playlists.size)
                        else "Создайте свою коллекцию",
                        style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.Normal),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.primary)
                        .clickable(onClick = onCreateToggle)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    MqIcon(icon = MqIcons.Plus, size = 14.dp, tint = Color.White)
                    Text(
                        "Создать",
                        // web: text-xs font-semibold = 12/600, color #fff
                        style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                        color = Color.White,
                    )
                }
                Spacer(Modifier.width(8.dp))
                // Импорт — web import dialog (URL / текст), real actions
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        // web: bg --mq-card + border-thin
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(12.dp))
                        .clickable(onClick = onImportToggle)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    MqIcon(icon = MqIcons.Download, size = 14.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        "Импорт",
                        style = MqType.meta.copy(fontWeight = FontWeight.Medium),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
        }
    }

    // inline create card (web showCreate panel)
    if (showCreate) {
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        // web: bg --mq-card + border-thin + shadow-card
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(16.dp))
                        .padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Новый плейлист",
                            style = MqType.section.copy(fontSize = 16.sp),
                            color = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.weight(1f)
                        )
                        Box(
                            modifier = Modifier.size(32.dp).clickable(onClick = onCreateToggle),
                            contentAlignment = Alignment.Center
                        ) {
                            MqIcon(icon = MqIcons.X, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    TextEntry(
                        value = createName,
                        onValueChange = onCreateNameChange,
                        placeholder = "Название",
                    )
                    TextEntry(
                        value = createDescription,
                        onValueChange = onCreateDescriptionChange,
                        placeholder = "Описание (необязательно)",
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.05f))
                                .clickable(onClick = onCreateToggle),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "Отмена",
                                // web: text-sm font-medium = 14/500
                                style = MqType.body.copy(fontSize = 14.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(
                                    if (createName.isNotBlank()) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f)
                                )
                                .clickable(enabled = createName.isNotBlank()) {
                                    onCreateConfirm(createName.trim())
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "Создать",
                                style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
                                color = if (createName.isNotBlank()) Color.White
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }

    // ── import dialog (web PlaylistView: режимы «URL» / «Импорт текстом») ─
    if (showImport) {
        item {
            var mode by remember { mutableIntStateOf(0) } // 0 = URL, 1 = текст
            var urlText by remember { mutableStateOf("") }
            var linesText by remember { mutableStateOf("") }
            Column(Modifier.padding(horizontal = 16.dp)) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(16.dp))
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Импорт плейлиста",
                            style = MqType.section.copy(fontSize = 16.sp),
                            color = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.weight(1f)
                        )
                        Box(
                            modifier = Modifier.size(32.dp).clickable(onClick = onImportToggle),
                            contentAlignment = Alignment.Center
                        ) {
                            MqIcon(icon = MqIcons.X, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("URL", "Текстом").forEachIndexed { i, label ->
                            val selected = mode == i
                            Text(
                                label,
                                style = MqType.meta.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium),
                                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(
                                        if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                                        else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.05f)
                                    )
                                    .clickable { mode = i }
                                    .padding(horizontal = 14.dp, vertical = 6.dp)
                            )
                        }
                    }
                    if (mode == 0) {
                        TextEntry(
                            value = urlText,
                            onValueChange = { urlText = it },
                            placeholder = "https://... (ссылка на плейлист)",
                        )
                        Text(
                            "Вставьте ссылку на плейлист (Spotify, YouTube, VK и др.)",
                            style = MqType.meta2,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        TextEntry(
                            value = linesText,
                            onValueChange = { linesText = it },
                            placeholder = "Исполнитель — Название (по одному на строку)",
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.05f))
                                .clickable(onClick = onImportToggle),
                            contentAlignment = Alignment.Center
                        ) { Text("Отмена", style = MqType.body.copy(fontSize = 14.sp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.primary)
                                .clickable {
                                    if (mode == 0) onImportUrl(urlText) else onImportText(linesText)
                                },
                            contentAlignment = Alignment.Center
                        ) { Text("Импортировать", style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold), color = Color.White) }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }

    // grid / empty / loading
    if (playlists.isEmpty()) {
        item {
            if (ui.loading) {
                LoadingState()
            } else {
                Column(
                    Modifier
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
                    MqIcon(icon = MqIcons.ListMusic, size = 28.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Нет плейлистов",
                        style = MqType.section.copy(fontSize = 19.sp, fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        // web EmptyState description (PlaylistView passes it
                        // explicitly, overriding the default wording)
                        "Создайте свой первый плейлист или импортируйте существующий",
                        style = MqType.body,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(18.dp))
                    Text(
                        "Создать плейлист",
                        style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
                        color = Color.White,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(MaterialTheme.colorScheme.primary)
                            .clickable(onClick = onCreateToggle)
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }
            }
        }
    } else {
        // 2-col grid (web grid-cols-2 gap-3): 343 - 12 → ~165px columns
        playlists.chunked(2).forEach { pair ->
            item {
                Row(
                    Modifier
                        .padding(horizontal = 16.dp)
                        .padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    pair.forEach { pl ->
                        PlaylistTile(
                            playlist = pl,
                            modifier = Modifier.weight(1f),
                            onOpen = { onOpenPlaylist(pl.id) },
                            onPlay = {
                                val tracks = pl.tracks
                                if (tracks.isNotEmpty()) onPlayQueue(tracks, 0)
                            },
                            onShuffle = {
                                val tracks = pl.tracks
                                if (tracks.isNotEmpty()) onPlayQueue(tracks.shuffled(), 0)
                            },
                            onAddToQueue = { if (pl.tracks.isNotEmpty()) onAddToQueue(pl.tracks) },
                            onRename = { newName -> onPlaylistRename(pl.id, newName) },
                            onDelete = { onPlaylistDelete(pl.id) },
                            onCoverPicked = { bytes -> onPlaylistCover(pl.id, bytes) },
                        )
                    }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }

    if (ui.error != null && playlists.isEmpty()) {
        item { ErrorState(ui.error!!) }
    }
}

/** Web PlaylistTile: r16 card p12, square r12 art, name, meta.
 *  P0 rework: REAL cover image when the playlist has one (MqUrls-resolved);
 *  deterministic gradient otherwise (web fallback). Real tile menu
 *  (открыть/воспроизвести/перемешать/в очередь/переименовать/сменить обложку/
 *  удалить) and a working cover picker. */
@Composable
private fun PlaylistTile(
    playlist: PlaylistDto,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit,
    onPlay: () -> Unit,
    onShuffle: () -> Unit = {},
    onAddToQueue: () -> Unit = {},
    onRename: (String) -> Unit = {},
    onDelete: () -> Unit = {},
    onCoverPicked: (ByteArray) -> Unit = {},
) {
    val accent = MaterialTheme.colorScheme.primary
    val text = MaterialTheme.colorScheme.onBackground
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val error = Color(0xFFEF4444)
    var menuOpen by remember { mutableStateOf(false) }
    var renameOpen by remember { mutableStateOf(false) }
    var renameText by remember { mutableStateOf(playlist.name) }
    var confirmDelete by remember { mutableStateOf(false) }

    // web: cover upload → file input → base64 (local) — Android: photo picker
    val context = androidx.compose.ui.platform.LocalContext.current
    val coverPicker = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.GetContent()
    ) { uri ->
        uri?.let {
            runCatching {
                val bytes = context.contentResolver.openInputStream(it)?.use { s -> s.readBytes() }
                bytes?.let(onCoverPicked)
            }
        }
    }

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            // web: bg --mq-card + border hairline (22%)
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(16.dp))
            .clickable(onClick = onOpen)
            .padding(12.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(12.dp))
                .background(gradientCover(playlist.name)),
            contentAlignment = Alignment.Center
        ) {
            if (playlist.cover.isNotBlank()) {
                // P0: real cover image (MqUrls resolves origin-relative URLs)
                coil.compose.AsyncImage(
                    model = com.mq1.player.data.MqUrls.absolute(playlist.cover),
                    contentDescription = "Обложка плейлиста ${playlist.name}",
                    modifier = Modifier.matchParentSize(),
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop
                )
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    MqIcon(icon = MqIcons.ListMusic, size = 36.dp, tint = Color.White.copy(alpha = 0.6f))
                    Spacer(Modifier.height(4.dp))
                    Text(
                        playlist.trackCount.toString(),
                        style = MqType.meta2.copy(fontWeight = FontWeight.Medium),
                        color = Color.White.copy(alpha = 0.4f),
                    )
                }
                // web: cover-upload overlay (below sm always visible)
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .background(Color.Black.copy(alpha = 0.6f)),
                    contentAlignment = Alignment.Center
                ) {
                    androidx.compose.foundation.layout.Box(
                        Modifier
                            .clickable { coverPicker.launch("image/*") }
                            .padding(28.dp)
                    ) {
                        MqIcon(icon = MqIcons.Camera, size = 20.dp, tint = Color.White)
                    }
                }
            }
            if (playlist.trackCount > 0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(8.dp)
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(accent)
                        .clickable(onClick = onPlay),
                    contentAlignment = Alignment.Center
                ) {
                    MqIcon(icon = MqIcons.Play, size = 16.dp, tint = Color.White, fill = true, strokeWidth = 0f)
                }
            }
            // web tile menu trigger — REAL menu now
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
                    .size(28.dp)
                    .background(Color.Black.copy(alpha = 0.6f), CircleShape)
                    .clickable { menuOpen = true },
                contentAlignment = Alignment.Center
            ) {
                MqIcon(icon = MqIcons.MoreHorizontal, size = 14.dp, tint = Color.White)
            }
            androidx.compose.material3.DropdownMenu(
                expanded = menuOpen,
                onDismissRequest = { menuOpen = false }
            ) {
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text("Открыть", style = MqType.menu, color = text) },
                    onClick = { menuOpen = false; onOpen() }
                )
                androidx.compose.material3.DropdownMenuItem(
                    text = {
                        Text(
                            if (playlist.trackCount > 0) "Воспроизвести · ${playlist.trackCount}"
                            else "Воспроизвести",
                            style = MqType.menu,
                            color = if (playlist.trackCount > 0) text else muted
                        )
                    },
                    enabled = playlist.trackCount > 0,
                    onClick = { menuOpen = false; onPlay() }
                )
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text("Перемешать и играть", style = MqType.menu, color = text) },
                    enabled = playlist.trackCount > 0,
                    onClick = { menuOpen = false; onShuffle() }
                )
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text("Добавить в очередь", style = MqType.menu, color = text) },
                    enabled = playlist.trackCount > 0,
                    onClick = { menuOpen = false; onAddToQueue() }
                )
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text("Переименовать", style = MqType.menu, color = text) },
                    onClick = { menuOpen = false; renameOpen = true }
                )
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text("Сменить обложку", style = MqType.menu, color = text) },
                    onClick = { menuOpen = false; coverPicker.launch("image/*") }
                )
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text("Удалить плейлист", style = MqType.menu, color = error) },
                    onClick = { menuOpen = false; confirmDelete = true }
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(
            playlist.name.ifBlank { "Без названия" },
            style = MqType.track,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                "${playlist.trackCount} треков",
                style = MqType.meta2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val total = playlist.tracks.sumOf { it.duration }
            if (total > 0) {
                MqIcon(icon = MqIcons.Clock, size = 10.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                Text(
                    formatTotal(total.toInt()),
                    style = MqType.meta2,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                )
            }
        }
    }

    // web inline rename (✓/✕)
    if (renameOpen) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { renameOpen = false },
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
            title = { Text("Переименовать плейлист", style = MqType.section, color = text) },
            text = {
                TextEntry(
                    value = renameText,
                    onValueChange = { renameText = it },
                    placeholder = "Название",
                )
            },
            confirmButton = {
                Text(
                    "Сохранить",
                    style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                    color = accent,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable {
                            if (renameText.isNotBlank()) onRename(renameText.trim())
                            renameOpen = false
                        }
                        .padding(8.dp)
                )
            },
            dismissButton = {
                Text(
                    "Отмена",
                    style = MqType.meta,
                    color = muted,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { renameOpen = false }
                        .padding(8.dp)
                )
            }
        )
    }

    // web delete confirm (destructive)
    if (confirmDelete) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmDelete = false },
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
            title = { Text("Удалить плейлист?", style = MqType.section, color = text) },
            text = { Text("«${playlist.name}» будет удалён безвозвратно.", style = MqType.body, color = muted) },
            confirmButton = {
                Text(
                    "Удалить",
                    style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                    color = error,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable {
                            confirmDelete = false
                            onDelete()
                        }
                        .padding(8.dp)
                )
            },
            dismissButton = {
                Text(
                    "Отмена",
                    style = MqType.meta,
                    color = muted,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { confirmDelete = false }
                        .padding(8.dp)
                )
            }
        )
    }
}

// ── web gradientCover port (PlaylistView.tsx COVER_PALETTES) ──────────────

private val CoverPalettes = listOf(
    Color(0xFF2D1B3D) to Color(0xFF0E0E0E),
    Color(0xFF1B2D3A) to Color(0xFF0E0E0E),
    Color(0xFF3D2B1B) to Color(0xFF0E0E0E),
    Color(0xFF1B3A2D) to Color(0xFF0E0E0E),
    Color(0xFF3A1B2D) to Color(0xFF0E0E0E),
    Color(0xFF2D2D1B) to Color(0xFF0E0E0E),
)

/** web hashString: h = char + (h << 5) - h (int32 wrap, abs). */
private fun hashString(s: String): Int {
    var h = 0
    for (c in s) h = c.code + ((h shl 5) - h)
    return kotlin.math.abs(h)
}

/** linear-gradient(135deg, from, to) — deterministic by playlist name. */
private fun gradientCover(name: String): Brush = Brush.linearGradient(
    listOf(CoverPalettes[hashString(name) % CoverPalettes.size].first, Color(0xFF0E0E0E)),
    start = androidx.compose.ui.geometry.Offset(0f, 0f),
    end = androidx.compose.ui.geometry.Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
)

// ── HISTORY (HistoryView port) ────────────────────────────────────────────

private fun LazyListScope.historyTab(
    history: List<Track>,
    query: String,
    playingTrackId: String?,
    favoriteIds: Set<String>,
    onQueryChange: (String) -> Unit,
    onPlayQueue: (List<Track>, Int) -> Unit,
    onFavorite: (Track) -> Unit,
    onTrackMenu: (Track) -> Unit = {},
    onGoHome: () -> Unit,
    onClearHistory: () -> Unit = {},
) {
    // header: 48 r16 clock chip + «История» 20/700 + «Слушать всё» / clear
    item {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    MqIcon(icon = MqIcons.Clock, size = 24.dp, tint = MaterialTheme.colorScheme.primary)
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        "История",
                        style = MqType.page.copy(fontSize = 20.sp, fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Text(
                        "${history.size} прослушиваний" +
                                " · ${history.distinctBy { it.id }.size} треков",
                        style = MqType.meta,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (history.isNotEmpty()) {
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.primary)
                            .clickable { onPlayQueue(history, 0) }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        MqIcon(icon = MqIcons.Play, size = 14.dp, tint = Color.White, fill = true, strokeWidth = 0f)
                        Text(
                            "Слушать всё",
                            // web: text-xs font-semibold, color --mq-text
                            style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    // web: clear-history trigger (#ff6b6b, red wash)
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(ClearRed.copy(alpha = 0.08f))
                            .border(1.dp, ClearRed.copy(alpha = 0.12f), RoundedCornerShape(12.dp))
                            .clickable(onClick = onClearHistory),
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(icon = MqIcons.Trash2, size = 14.dp, tint = ClearRed)
                    }
                }
            }
        }
    }

    // search bar (visible when history non-empty)
    if (history.isNotEmpty()) {
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        // web: bg --mq-card; border --mq-border (idle) / accent
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .border(
                            if (query.isNotEmpty()) 1.5.dp else 1.dp,
                            if (query.isNotEmpty()) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.outline,
                            RoundedCornerShape(12.dp)
                        )
                        .padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    MqIcon(icon = MqIcons.Search, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Box(Modifier.weight(1f)) {
                        BasicTextField(
                            value = query,
                            onValueChange = onQueryChange,
                            singleLine = true,
                            textStyle = TextStyle(
                                fontFamily = MqType.body.fontFamily,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onBackground,
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                        if (query.isEmpty()) {
                            Text(
                                "Поиск по истории (название, артист, жанр)...",
                                style = TextStyle(
                                    fontFamily = MqType.body.fontFamily,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                ),
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
    }

    // grouped day cards / empty hero
    if (history.isEmpty()) {
        item { HistoryEmptyState(onGoHome = onGoHome) }
    } else {
        // listening stats (web «Listening Stats»: 3 main + 2 secondary cards)
        item { HistoryStatsCards(history) }
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Spacer(Modifier.height(20.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // web: «Сегодня» group icon is Zap — MqIcons has no Zap;
                    // Flame is the closest energy glyph (also used on web stats)
                    MqIcon(icon = MqIcons.Flame, size = 14.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Сегодня",
                        style = MqType.track.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        history.size.toString(),
                        style = MqType.meta2.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                    Spacer(Modifier.weight(1f))
                    if (history.size > 1) {
                        Text(
                            "Играть",
                            style = MqType.meta2.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f))
                                .clickable { onPlayQueue(history, 0) }
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        // web: bg --mq-card + border hairline (22%)
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(16.dp))
                ) {
                    history.forEachIndexed { i, track ->
                        TrackRow(
                            track = track,
                            isPlaying = playingTrackId == track.id,
                            isFavorite = track.id in favoriteIds,
                            onPlay = { onPlayQueue(history, i) },
                            onFavorite = { onFavorite(track) },
                            onMenu = { onTrackMenu(track) },
                        )
                        if (i < history.lastIndex) {
                            Box(
                                Modifier
                                    .padding(start = 66.dp, end = 12.dp)
                                    .height(1.dp)
                                    .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f))
                            )
                        }
                    }
                }
            }
        }
    }
}

/** web clear-history red — #ff6b6b icon, rgba(224,49,49,…) wash. */
private val ClearRed = Color(0xFFFF6B6B)

/** Web «Listening Stats»: 3-col main cards + 2-col top artist/genre cards. */
@Composable
private fun HistoryStatsCards(history: List<Track>) {
    val accent = MaterialTheme.colorScheme.primary
    val totalSec = history.sumOf { it.duration }.toInt()
    val topArtist = history.groupingBy { it.artist }.eachCount().maxByOrNull { it.value }
    val topGenre = history.map { it.genre }.filter { it.isNotBlank() }
        .groupingBy { it }.eachCount().maxByOrNull { it.value }

    @Composable
    fun StatCard(icon: LucideIcon, value: String, valueStyleLarge: Boolean, label: String, modifier: Modifier) {
        Column(
            modifier = modifier
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surfaceContainer)
                .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(16.dp))
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(accent.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                MqIcon(icon = icon, size = 16.dp, tint = accent)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                value,
                // web: text-base / text-sm bold
                style = if (valueStyleLarge) MqType.track.copy(fontSize = 16.sp, fontWeight = FontWeight.Bold)
                else MqType.track.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                label,
                style = MqType.meta2.copy(fontWeight = FontWeight.Medium),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    Column(Modifier.padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            StatCard(icon = MqIcons.Headphones, value = history.size.toString(), valueStyleLarge = true, label = "Прослушиваний", modifier = Modifier.weight(1f))
            // web: BarChart3 icon — closest available Lucide shape is List
            StatCard(icon = MqIcons.List, value = formatTotal(totalSec), valueStyleLarge = false, label = "Время", modifier = Modifier.weight(1f))
            StatCard(icon = MqIcons.Flame, value = history.size.toString(), valueStyleLarge = true, label = "Сегодня", modifier = Modifier.weight(1f))
        }
        if (topArtist != null || topGenre != null) {
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                if (topArtist != null) {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainer)
                            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(accent.copy(alpha = 0.10f)),
                            contentAlignment = Alignment.Center
                        ) {
                            // web: Disc3 — Music is the closest MqIcons glyph
                            MqIcon(icon = MqIcons.Music, size = 14.dp, tint = accent)
                        }
                        Column(Modifier.weight(1f)) {
                            Text("Топ артист", style = MqType.meta2.copy(fontWeight = FontWeight.Medium), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                topArtist.key,
                                style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                                color = MaterialTheme.colorScheme.onBackground,
                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Text(
                            "${topArtist.value}×",
                            style = MqType.meta2.copy(fontWeight = FontWeight.Bold),
                            color = accent,
                        )
                    }
                }
                if (topGenre != null) {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainer)
                            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(accent.copy(alpha = 0.10f)),
                            contentAlignment = Alignment.Center
                        ) {
                            MqIcon(icon = MqIcons.TrendingUp, size = 14.dp, tint = accent)
                        }
                        Column(Modifier.weight(1f)) {
                            Text("Топ жанр", style = MqType.meta2.copy(fontWeight = FontWeight.Medium), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                topGenre.key,
                                style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                                color = MaterialTheme.colorScheme.onBackground,
                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Text(
                            "${topGenre.value}×",
                            style = MqType.meta2.copy(fontWeight = FontWeight.Bold),
                            color = accent,
                        )
                    }
                }
            }
        }
    }
}

/** Web history empty hero (96 r24 clock chip + «Начать слушать» CTA). */
@Composable
private fun HistoryEmptyState(onGoHome: () -> Unit) {
    val accent = MaterialTheme.colorScheme.primary
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 80.dp, bottom = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier.size(96.dp),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .size(96.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(accent.copy(alpha = 0.10f))
                    .border(1.dp, accent.copy(alpha = 0.15f), RoundedCornerShape(24.dp)),
                contentAlignment = Alignment.Center
            ) {
                MqIcon(icon = MqIcons.Clock, size = 40.dp, tint = accent.copy(alpha = 0.45f))
            }
            // web: pulsing dot at -top-1.5 -right-1.5 (w-6, mid-animation alpha)
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 6.dp, y = (-6).dp)
                    .size(24.dp)
                    .background(accent.copy(alpha = 0.10f), CircleShape)
            )
        }
        Spacer(Modifier.height(24.dp))
        Text(
            "История пуста",
            style = MqType.section.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Здесь будут отображаться прослушанные треки. Начните слушать музыку, чтобы заполнить историю.",
            style = MqType.meta,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(280.dp)
        )
        Spacer(Modifier.height(24.dp))
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.primary)
                .clickable(onClick = onGoHome)
                .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            MqIcon(icon = MqIcons.Music, size = 14.dp, tint = MaterialTheme.colorScheme.onBackground)
            Text(
                "Начать слушать",
                // web: text-xs font-semibold, color --mq-text
                style = MqType.meta.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onBackground,
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.alpha(0.6f),
        ) {
            MqIcon(icon = MqIcons.ListMusic, size = 12.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                "История поможет вспомнить, что вы слушали",
                style = MqType.meta2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ── helpers ───────────────────────────────────────────────────────────────

/** N плейлист / плейлиста / плейлистов — web pluralRu. */
internal fun pluralPlaylists(n: Int): String = when {
    n % 10 == 1 && n % 100 != 11 -> "$n плейлист"
    n % 10 in 2..4 && n % 100 !in 12..14 -> "$n плейлиста"
    else -> "$n плейлистов"
}

/** web formatTotalDuration: 7854 → «2 ч 9 мин». */
internal fun formatTotal(seconds: Int): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return if (h > 0) "$h ч $m мин" else "$m мин"
}

/** Web input look: r12, inputBg, hairline border, 14/400. */
@Composable
private fun TextEntry(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
) {
    val inputBg = LocalMqPalette.current.inputBg
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(inputBg)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.32f), RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Box(Modifier.fillMaxWidth()) {
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = TextStyle(
                    fontFamily = MqType.body.fontFamily,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onBackground,
                ),
                modifier = Modifier.fillMaxWidth()
            )
            if (value.isEmpty()) {
                Text(
                    placeholder,
                    style = TextStyle(
                        fontFamily = MqType.body.fontFamily,
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                    maxLines = 1,
                )
            }
        }
    }
}
