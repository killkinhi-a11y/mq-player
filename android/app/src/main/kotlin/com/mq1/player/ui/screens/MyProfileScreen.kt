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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.data.api.UsernameCheckResponse
import com.mq1.player.data.repo.ProfileRepository
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.EmptyState
import com.mq1.player.ui.components.ErrorState
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.components.SectionHeader
import com.mq1.player.ui.components.TrackRow
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
 * empty states are explicit — no fake content.
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
            IconButton(onClick = onBack, modifier = Modifier.size(44.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
            }
            Text(
                "Профиль",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 4.dp)
            )
            IconButton(
                onClick = onRefresh,
                modifier = Modifier
                    .size(44.dp)
                    .semantics { contentDescription = "Обновить профиль" }
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = "Обновить")
            }
        }

        when {
            ui.loading -> LoadingState(label = "Загрузка профиля…")

            ui.error != null -> ErrorState(
                message = ui.error ?: "Профиль недоступен",
                onRetry = onRefresh
            )

            else -> {
                // ── Identity ─────────────────────────────────────────────
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Spacer(Modifier.height(16.dp))
                    Box {
                        Artwork(
                            url = ui.avatar,
                            sizeDp = 104,
                            corner = 52,
                            contentDescription = "Аватар: ${ui.username}"
                        )
                        if (ui.savingAvatar) {
                            CircularProgressIndicator(
                                strokeWidth = 3.dp,
                                modifier = Modifier
                                    .size(104.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.background.copy(alpha = 0.5f))
                            )
                        } else {
                            // Camera badge: visual 32dp, FULL 44dp hitbox
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
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .background(MaterialTheme.colorScheme.primary)
                                ) {
                                    Icon(
                                        Icons.Filled.CameraAlt,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onPrimary,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        ui.username.ifBlank { "…" },
                        style = MaterialTheme.typography.headlineSmall
                    )
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary)
                        )
                        Text(
                            "  В сети",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    memberSince(ui.createdAt)?.let {
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "Участник с $it",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(onClick = onEdit, modifier = Modifier.height(44.dp)) {
                        Icon(Icons.Filled.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Редактировать профиль")
                    }
                }

                // ── Stats ────────────────────────────────────────────────
                Spacer(Modifier.height(20.dp))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    StatCard("Плейлисты", ui.playlists.size, Modifier.weight(1f))
                    StatCard("Лайки", ui.likes.size, Modifier.weight(1f))
                    StatCard("Друзья", ui.friends.size, Modifier.weight(1f))
                }

                // ── Account state ────────────────────────────────────────
                if (ui.email != null || ui.telegramUsername != null || ui.confirmed != null) {
                    Spacer(Modifier.height(16.dp))
                    SectionCard("Аккаунт") {
                        ui.email?.let {
                            Row {
                                Text(
                                    "Email", style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(Modifier.weight(1f))
                                Text(
                                    it, style = MaterialTheme.typography.bodyMedium,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                        ui.telegramUsername?.takeIf { it.isNotBlank() }?.let {
                            Spacer(Modifier.height(6.dp))
                            Row {
                                Text(
                                    "Telegram", style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(Modifier.weight(1f))
                                Text("@$it", style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                        ui.confirmed?.let { confirmed ->
                            Spacer(Modifier.height(6.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "Статус", style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(Modifier.weight(1f))
                                if (confirmed) {
                                    Icon(
                                        Icons.Filled.Check,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        " подтверждён",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                } else {
                                    Text(
                                        " не подтверждён",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.error
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(6.dp))
                        Row {
                            Text(
                                "Роль", style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.weight(1f))
                            Text(roleName(ui.role), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }

                // ── Top artists (derived from likes) → Artist screen ──────
                if (ui.topArtists.isNotEmpty()) {
                    Spacer(Modifier.height(16.dp))
                    SectionHeader("Любимые исполнители")
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 20.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(ui.topArtists) { artist ->
                            FilledTonalButton(
                                onClick = { onOpenArtist(artist) },
                                modifier = Modifier.height(44.dp)
                            ) {
                                Text(artist, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }

                // ── Friends → Chat ───────────────────────────────────────
                Spacer(Modifier.height(16.dp))
                SectionHeader(
                    title = "Друзья",
                    trailing = {
                        TextButton(onClick = onOpenFriends, modifier = Modifier.height(44.dp)) {
                            Icon(Icons.Filled.Group, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text(" Все")
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
                                        Box(
                                            Modifier
                                                .size(14.dp)
                                                .align(Alignment.BottomEnd)
                                                .clip(CircleShape)
                                                .background(MaterialTheme.colorScheme.primary)
                                                .border(2.dp, MaterialTheme.colorScheme.background, CircleShape)
                                        )
                                    }
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    friend.username,
                                    style = MaterialTheme.typography.labelMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }

                // ── Likes → Full Player ──────────────────────────────────
                Spacer(Modifier.height(16.dp))
                SectionHeader("Лайки · ${ui.likes.size}")
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
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
                        )
                    }
                }

                // ── My playlists → Playlist screen ────────────────────────
                Spacer(Modifier.height(16.dp))
                SectionHeader("Мои плейлисты · ${ui.playlists.size}")
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
                    SectionHeader("Недавняя активность")
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

                // ── Actions ───────────────────────────────────────────────
                Spacer(Modifier.height(24.dp))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        onClick = onOpenSettings,
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp)
                    ) {
                        Icon(Icons.Filled.Settings, contentDescription = null, modifier = Modifier.size(16.dp))
                        Text(" Настройки")
                    }
                    OutlinedButton(
                        onClick = onLogout,
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp)
                    ) {
                        Text("Выйти", color = MaterialTheme.colorScheme.error)
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

@Composable
private fun StatCard(label: String, value: Int, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                value.toString(),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Card(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                title.uppercase(),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(10.dp))
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
                name, style = MaterialTheme.typography.bodyLarge,
                maxLines = 1, overflow = TextOverflow.Ellipsis
            )
            Text(
                "$trackCount треков",
                style = MaterialTheme.typography.bodyMedium,
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
