package com.mq1.player.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.data.api.UsernameCheckResponse
import com.mq1.player.data.repo.ProfileRepository
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.EmptyState
import com.mq1.player.ui.components.ErrorState
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.components.MqIcon
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.components.SectionHeader
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.theme.MqType
import com.mq1.player.ui.vm.MyProfileViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * F9 — OWN profile (full, not just an avatar screen). Real data only:
 * account from /api/user/profile + /api/auth/me, playlists from the backend,
 * likes/history from the local store (web parity), friends from SocialHub.
 * Transitions out: chat, artist, playlist, full player (track), friends,
 * settings — all preserve this screen's ViewModel state on the back stack.
 */
@Composable
fun MyProfileScreen(
    onBack: () -> Unit,
    onOpenChat: (peerId: String, peerName: String) -> Unit,
    onOpenArtist: (String) -> Unit,
    onOpenPlaylist: (id: String) -> Unit,
    onOpenFriends: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenFullPlayer: () -> Unit,
    onLogout: () -> Unit,
    playTracks: (startIndex: Int) -> Unit
) {
    val vm: MyProfileViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var editOpen by remember { mutableStateOf(false) }

    // Photo picker → bytes → VM (decode/crop/encode on IO inside the VM path)
    val imagePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            scope.launch {
                val bytes = withContext(Dispatchers.IO) {
                    runCatching {
                        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    }.getOrNull()
                }
                if (bytes != null) vm.saveAvatar(bytes)
            }
        }
    }

    LaunchedEffect(ui.message) {
        ui.message?.let {
            snackbar.showSnackbar(it)
            vm.consumeMessage()
        }
    }

    Box(Modifier.fillMaxSize()) {
        ProfileBody(
            ui = ui,
            onBack = onBack,
            onRefresh = { vm.refresh() },
            onChangeAvatar = {
                imagePicker.launch(
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                )
            },
            onEdit = { editOpen = true },
            onOpenChat = onOpenChat,
            onOpenArtist = onOpenArtist,
            onOpenPlaylist = onOpenPlaylist,
            onOpenFriends = onOpenFriends,
            onOpenSettings = onOpenSettings,
            onOpenFullPlayer = onOpenFullPlayer,
            onLogout = onLogout,
            playTracks = playTracks
        )

        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter)
        )
    }

    if (editOpen) {
        EditUsernameDialog(
            current = ui.username,
            saving = ui.savingUsername,
            onCheck = { name -> vm.checkUsername(name) },
            onSave = {
                vm.saveUsername(it)
                editOpen = false
            },
            onDismiss = { editOpen = false }
        )
    }
}

/**
 * Stateless profile body — pure function of [ui] + callbacks (unit-testable
 * in Robolectric without the ViewModel or network). Loading / error+retry /
 * empty states are explicit — no fake content. Web-parity sweep: Manrope
 * MqType scale, Lucide icons, web ProfileView geometry (112dp avatar +
 * camera badge, member-since pill, 12/700 uppercase card headers, num 20
 * stat values, #4ade80 online dots).
 */
@Composable
internal fun ProfileBody(
    ui: MyProfileViewModel.ProfileUi,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onChangeAvatar: () -> Unit,
    onEdit: () -> Unit,
    onOpenChat: (peerId: String, peerName: String) -> Unit,
    onOpenArtist: (String) -> Unit,
    onOpenPlaylist: (id: String) -> Unit,
    onOpenFriends: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenFullPlayer: () -> Unit,
    onLogout: () -> Unit,
    playTracks: (startIndex: Int) -> Unit
) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        // ── Header ──────────────────────────────────────────────────────
        Spacer(Modifier.height(52.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clickable(onClick = onBack)
                    .semantics { contentDescription = "Назад" },
                contentAlignment = Alignment.Center
            ) {
                MqIcon(icon = MqIcons.ArrowLeft, size = 20.dp, tint = MaterialTheme.colorScheme.onBackground)
            }
            Text(
                "Профиль",
                style = MqType.page,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 4.dp)
            )
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clickable(onClick = onRefresh)
                    .semantics { contentDescription = "Обновить профиль" },
                contentAlignment = Alignment.Center
            ) {
                MqIcon(icon = MqIcons.RefreshCw, size = 18.dp, tint = MaterialTheme.colorScheme.onBackground)
            }
        }

        when {
            ui.loading -> LoadingState(label = "Загрузка профиля…")

            ui.error != null -> ErrorState(
                message = ui.error ?: "Профиль недоступен",
                onRetry = onRefresh
            )

            else -> {
                // ── Identity (web: 112dp avatar + camera badge + name + sub) ─
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Spacer(Modifier.height(16.dp))
                    Box {
                        // web: w-28 round; no avatar → surface-2 + User glyph
                        if (ui.avatar.isNullOrBlank()) {
                            Box(
                                Modifier
                                    .size(112.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                                    .border(
                                        1.dp,
                                        MaterialTheme.colorScheme.outline.copy(alpha = 0.6f),
                                        CircleShape
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                MqIcon(
                                    icon = MqIcons.User,
                                    size = 56.dp,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        } else {
                            Artwork(
                                url = ui.avatar,
                                sizeDp = 112,
                                corner = 56,
                                contentDescription = "Аватар: ${ui.username}"
                            )
                        }
                        if (ui.savingAvatar) {
                            CircularProgressIndicator(
                                strokeWidth = 3.dp,
                                modifier = Modifier
                                    .size(112.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.background.copy(alpha = 0.5f))
                            )
                        } else {
                            // web mq-avatar-edit-badge: 34dp visual, FULL 44dp hitbox
                            Box(
                                modifier = Modifier
                                    .size(44.dp)
                                    .align(Alignment.BottomEnd)
                                    .clickable(onClick = onChangeAvatar)
                                    .semantics {
                                        contentDescription = "Изменить аватар"
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(34.dp)
                                        .clip(CircleShape)
                                        .background(MaterialTheme.colorScheme.primary)
                                        .border(
                                            3.dp,
                                            MaterialTheme.colorScheme.background,
                                            CircleShape
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    MqIcon(
                                        icon = MqIcons.Camera,
                                        size = 16.dp,
                                        tint = MaterialTheme.colorScheme.onPrimary
                                    )
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    // web: mq-t-display text-[23px]
                    Text(
                        ui.username.ifBlank { "…" },
                        style = MqType.display.copy(fontSize = 23.sp),
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    // web: telegram/email under the name (12px muted)
                    (ui.telegramUsername?.takeIf { it.isNotBlank() }?.let { "@$it" }
                        ?: ui.email)?.let {
                        Text(
                            it,
                            style = MqType.meta,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                    memberSince(ui.createdAt)?.let {
                        // web: pill (text@4% bg, thin border, Calendar 12 + meta2)
                        Spacer(Modifier.height(12.dp))
                        Row(
                            Modifier
                                .clip(RoundedCornerShape(50))
                                .background(
                                    MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f)
                                )
                                .border(
                                    1.dp,
                                    MaterialTheme.colorScheme.outline.copy(alpha = 0.22f),
                                    RoundedCornerShape(50)
                                )
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            MqIcon(
                                icon = MqIcons.Clock,
                                size = 12.dp,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                "Участник с $it",
                                style = MqType.meta2,
                                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.85f)
                            )
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    // web-styled outline button (r12, 44dp, hairline border)
                    Box(
                        Modifier
                            .height(44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .border(
                                1.dp,
                                MaterialTheme.colorScheme.outline.copy(alpha = 0.36f),
                                RoundedCornerShape(12.dp)
                            )
                            .clickable(onClick = onEdit)
                            .padding(horizontal = 16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "Редактировать профиль",
                            style = MqType.btn,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                    }
                }

                // ── Stats — web 2×2 grid (Треки / Часы / Топ жанр / Лайки) ──
                Spacer(Modifier.height(20.dp))
                val hours = (ui.history.sumOf { it.duration } / 3600.0).let {
                    if (it >= 1.0) it.toInt().toString() + " ч" else "<1 ч"
                }
                val topGenre = ui.likes.mapNotNull { it.genre.takeIf(String::isNotBlank) }
                    .groupingBy { it }.eachCount().maxByOrNull { it.value }?.key ?: "—"
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        StatCard("Треки прослушано", ui.history.size.toString(), MqIcons.Music, Modifier.weight(1f))
                        StatCard("Часов музыки", hours, MqIcons.Headphones, Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        StatCard("Топ жанр", topGenre, MqIcons.Flame, Modifier.weight(1f))
                        StatCard("Лайков", ui.likes.size.toString(), MqIcons.Heart, Modifier.weight(1f))
                    }
                }

                // ── Account state (web «Аккаунт» card rows) ────────────────
                if (ui.email != null || ui.telegramUsername != null || ui.confirmed != null) {
                    Spacer(Modifier.height(16.dp))
                    SectionCard("АККАУНТ") {
                        ui.email?.let {
                            AccountRow(label = "Email", value = it)
                        }
                        ui.telegramUsername?.takeIf { it.isNotBlank() }?.let {
                            Spacer(Modifier.height(8.dp))
                            AccountRow(label = "Telegram", value = "@$it")
                        }
                        ui.confirmed?.let { confirmed ->
                            Spacer(Modifier.height(8.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "Статус", style = MqType.meta,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(Modifier.weight(1f))
                                if (confirmed) {
                                    MqIcon(
                                        icon = MqIcons.Check,
                                        size = 14.dp,
                                        tint = MaterialTheme.colorScheme.primary
                                    )
                                    Text(
                                        " подтверждён",
                                        style = MqType.trackSm,
                                        color = MaterialTheme.colorScheme.onBackground
                                    )
                                } else {
                                    Text(
                                        " не подтверждён",
                                        style = MqType.trackSm,
                                        color = MaterialTheme.colorScheme.error
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Row {
                            Text(
                                "Роль", style = MqType.meta,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.weight(1f))
                            Text(
                                roleName(ui.role), style = MqType.trackSm,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                        }
                    }
                }

                // ── Top artists (derived from likes) → Artist screen ──────
                if (ui.topArtists.isNotEmpty()) {
                    Spacer(Modifier.height(16.dp))
                    SectionHeader("ЛЮБИМЫЕ ИСПОЛНИТЕЛИ", icon = MqIcons.Users)
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 20.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(ui.topArtists) { artist ->
                            // web artist chip: r-full, accent@8-15% bg, accent border
                            Box(
                                Modifier
                                    .height(44.dp)
                                    .clip(RoundedCornerShape(50))
                                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                                    .border(
                                        1.dp,
                                        MaterialTheme.colorScheme.primary.copy(alpha = 0.25f),
                                        RoundedCornerShape(50)
                                    )
                                    .clickable { onOpenArtist(artist) }
                                    .padding(horizontal = 14.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    artist,
                                    style = MqType.trackSm,
                                    color = MaterialTheme.colorScheme.onBackground,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }

                // ── Friends → Chat ───────────────────────────────────────
                Spacer(Modifier.height(16.dp))
                SectionHeader(
                    title = "ДРУЗЬЯ",
                    icon = MqIcons.Users,
                    trailing = {
                        Box(
                            Modifier
                                .height(44.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .clickable(onClick = onOpenFriends)
                                .padding(horizontal = 12.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("Все", style = MqType.btn, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                )
                if (ui.friends.isEmpty()) {
                    EmptyState("Друзей пока нет — добавьте из поиска")
                } else {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 20.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(ui.friends, key = { it.id }) { friend ->
                            val isOnline = ui.online[friend.id] == true
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier
                                    .width(72.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .clickable { onOpenChat(friend.id, friend.username) }
                                    .padding(vertical = 8.dp)
                                    .semantics {
                                        contentDescription =
                                            "Друг: ${friend.username}, " +
                                                if (isOnline) "в сети" else "не в сети"
                                    }
                            ) {
                                Box {
                                    Artwork(url = friend.avatar, sizeDp = 56, corner = 28)
                                    if (isOnline) {
                                        // web online dot: #4ade80 + 2dp card ring
                                        Box(
                                            Modifier
                                                .size(14.dp)
                                                .align(Alignment.BottomEnd)
                                                .clip(CircleShape)
                                                .background(Color(0xFF4ADE80))
                                                .border(
                                                    2.dp,
                                                    MaterialTheme.colorScheme.background,
                                                    CircleShape
                                                )
                                        )
                                    }
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    friend.username,
                                    style = MqType.meta2,
                                    color = MaterialTheme.colorScheme.onBackground,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }

                // ── Likes → Full Player ──────────────────────────────────
                Spacer(Modifier.height(16.dp))
                SectionHeader("ЛАЙКИ · ${ui.likes.size}", icon = MqIcons.Heart)
                if (ui.likes.isEmpty()) {
                    EmptyState("Лайканных треков пока нет")
                } else {
                    val shown = ui.likes.take(10)
                    shown.forEachIndexed { _, track ->
                        TrackRow(
                            track = track,
                            isPlaying = false,
                            isFavorite = true,
                            onPlay = {
                                playTracks(ui.likes.indexOfFirst { it.id == track.id }
                                    .coerceAtLeast(0))
                                onOpenFullPlayer()
                            }
                        )
                    }
                    if (ui.likes.size > shown.size) {
                        Text(
                            "… и ещё ${ui.likes.size - shown.size}",
                            style = MqType.meta,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
                        )
                    }
                }

                // ── My playlists → Playlist screen ────────────────────────
                Spacer(Modifier.height(16.dp))
                SectionHeader("МОИ ПЛЕЙЛИСТЫ · ${ui.playlists.size}", icon = MqIcons.ListMusic)
                if (ui.playlists.isEmpty()) {
                    EmptyState("Плейлистов пока нет — создайте в Библиотеке")
                } else {
                    ui.playlists.take(10).forEach { pl ->
                        PlaylistRow(
                            name = pl.name,
                            trackCount = pl.trackCount,
                            cover = pl.cover,
                            onClick = { onOpenPlaylist(pl.id) }
                        )
                    }
                }

                // ── Recent activity (history) ─────────────────────────────
                if (ui.history.isNotEmpty()) {
                    Spacer(Modifier.height(16.dp))
                    SectionHeader("НЕДАВНЯЯ АКТИВНОСТЬ", icon = MqIcons.History)
                    ui.history.take(5).forEach { track ->
                        TrackRow(
                            track = track,
                            isPlaying = false,
                            isFavorite = ui.likes.any { it.id == track.id },
                            onPlay = {
                                playTracks(0)
                                onOpenFullPlayer()
                            }
                        )
                    }
                }

                // ── Actions (web «Действия» card rows) ─────────────────────
                Spacer(Modifier.height(24.dp))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        Modifier
                            .weight(1f)
                            .height(44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .border(
                                1.dp,
                                MaterialTheme.colorScheme.outline.copy(alpha = 0.36f),
                                RoundedCornerShape(12.dp)
                            )
                            .clickable(onClick = onOpenSettings)
                            .padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            MqIcon(
                                icon = MqIcons.Settings,
                                size = 16.dp,
                                tint = MaterialTheme.colorScheme.onBackground
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "Настройки",
                                style = MqType.btn,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                        }
                    }
                    Box(
                        Modifier
                            .weight(1f)
                            .height(44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .border(
                                1.dp,
                                MaterialTheme.colorScheme.error.copy(alpha = 0.5f),
                                RoundedCornerShape(12.dp)
                            )
                            .clickable(onClick = onLogout)
                            .padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "Выйти",
                            style = MqType.btn,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

/** "Участник с …" from createdAt (ISO). */
internal fun memberSince(iso: String?): String? {
    val t = runCatching { java.time.Instant.parse(iso) }.getOrNull() ?: return null
    // "d MMMM" (format pattern) → genitive month in Russian: "15 января 2026"
    return java.time.format.DateTimeFormatter.ofPattern("d MMMM yyyy")
        .withLocale(java.util.Locale("ru"))
        .format(java.time.ZonedDateTime.ofInstant(t, java.time.ZoneId.systemDefault()))
}

private fun roleName(role: String): String = when (role) {
    "admin" -> "Администратор"
    "moderator" -> "Модератор"
    else -> "Слушатель"
}

/** Web stat card: r12 card + mq-t-num 20 value + meta2 label. */
@Composable
private fun StatCard(
    label: String,
    value: String,
    icon: com.mq1.player.ui.components.LucideIcon,
    modifier: Modifier = Modifier,
) {
    // web stats card: r16, p16, icon chip 44 r12 accent@12%, num 20sp, meta-2 label
    Row(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        val accent = MaterialTheme.colorScheme.primary
        Box(
            Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(accent.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            MqIcon(icon = icon, size = 20.dp, tint = accent)
        }
        Column {
            Text(
                value,
                style = MqType.num.copy(fontSize = 20.sp, lineHeight = 20.sp),
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
            )
            Text(
                label,
                style = MqType.meta2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
    }
}

/** Account card row: meta label (muted) left, trackSm value right. */
@Composable
private fun AccountRow(label: String, value: String) {
    Row {
        Text(
            label, style = MqType.meta,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.weight(1f))
        Text(
            value, style = MqType.trackSm,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1, overflow = TextOverflow.Ellipsis
        )
    }
}

/** Web card: r12, surface bg + edge border, 12/700 uppercase header row. */
@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(
                1.dp,
                MaterialTheme.colorScheme.outline.copy(alpha = 0.36f),
                RoundedCornerShape(12.dp)
            )
    ) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            MqIcon(
                icon = MqIcons.User,
                size = 14.dp,
                tint = MaterialTheme.colorScheme.primary
            )
            Text(
                title,
                style = MqType.label,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
            content()
        }
    }
}

@Composable
private fun PlaylistRow(
    name: String,
    trackCount: Int,
    cover: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Artwork(url = cover, sizeDp = 48, corner = 8)
        Column(Modifier.weight(1f)) {
            Text(
                name, style = MqType.track,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1, overflow = TextOverflow.Ellipsis
            )
            Text(
                "$trackCount треков",
                style = MqType.meta,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/** Server availability verdict for the username being checked. */
private data class CheckVerdict(val available: Boolean, val error: String?)

/**
 * Username edit dialog — same contract as the web: local validation (regex,
 * length, reserved), debounced server availability check, then save.
 */
@Composable
private fun EditUsernameDialog(
    current: String,
    saving: Boolean,
    onCheck: suspend (String) -> UsernameCheckResponse?,
    onSave: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var name by remember { mutableStateOf(current) }
    // null | "checking" | CheckVerdict — network failure leaves no verdict
    // (null) so the user can still attempt the save server-side.
    var status by remember { mutableStateOf<Any?>(null) }

    val localError = ProfileRepository.validateUsername(name)

    // Debounced availability check (500ms — same as web)
    LaunchedEffect(name) {
        if (localError != null || name == current) {
            status = null
            return@LaunchedEffect
        }
        delay(500)
        status = "checking"
        val resp = onCheck(name)
        status = resp?.let { CheckVerdict(it.available, it.error) }
    }

    AlertDialog(
        onDismissRequest = if (saving) ({}) else onDismiss,
        title = { Text("Имя пользователя") },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { if (it.length <= 20) name = it },
                    singleLine = true,
                    label = { Text("Имя (2-20 символов)") },
                    isError = localError != null || (status as? CheckVerdict)?.available == false,
                    supportingText = {
                        val msg = localError ?: when (val st = status) {
                            "checking" -> "Проверяем…"
                            is CheckVerdict -> if (st.available) "Имя свободно"
                            else st.error ?: "Имя занято"
                            else -> null
                        }
                        if (msg != null) Text(msg)
                    }
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(name.trim()) },
                enabled = !saving && localError == null &&
                    name != current && (status as? CheckVerdict)?.available != false
            ) {
                if (saving) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp, modifier = Modifier.size(18.dp)
                    )
                } else {
                    Text("Сохранить")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Отмена") }
        }
    )
}
