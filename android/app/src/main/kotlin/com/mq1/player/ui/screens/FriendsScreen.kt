package com.mq1.player.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.data.api.Friend
import com.mq1.player.data.api.OutgoingRequest
import com.mq1.player.data.api.PendingRequest
import com.mq1.player.data.api.UserDto
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.EmptyState
import com.mq1.player.ui.components.ErrorState
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.components.SectionHeader
import com.mq1.player.ui.vm.FriendsViewModel

/**
 * F7 Friends — real backend only: list + online presence, incoming requests
 * (accept/reject), outgoing requests (cancel), remove friend, user search +
 * add, loading/empty/error/retry. Row tap → profile; chat button → messages.
 */
@Composable
fun FriendsScreen(
    onBack: () -> Unit,
    onOpenChat: (peerId: String, peerName: String) -> Unit,
    onOpenProfile: (userId: String) -> Unit
) {
    val vm: FriendsViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val snackbar = remember { androidx.compose.material3.SnackbarHostState() }

    // Fresh sync on entry (hub is already polling; this de-lags navigation)
    LaunchedEffect(Unit) { vm.retry() }
    LaunchedEffect(ui.message) {
        ui.message?.let {
            snackbar.showSnackbar(it)
            vm.consumeMessage()
        }
    }

    // UX pass 2.3.5: real status-bar inset (was fixed 52dp fake)
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
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
                "Друзья",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 4.dp)
            )
            IconButton(onClick = { vm.retry() }, modifier = Modifier.size(44.dp)) {
                Icon(Icons.Filled.Refresh, contentDescription = "Обновить")
            }
        }
        Spacer(Modifier.height(4.dp))
        OutlinedTextField(
            value = ui.query,
            onValueChange = vm::search,
            placeholder = { Text("Найти пользователя по имени") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (ui.query.isNotEmpty()) {
                    IconButton(onClick = { vm.search("") }, modifier = Modifier.size(44.dp)) {
                        Icon(Icons.Filled.Close, contentDescription = "Очистить")
                    }
                } else if (ui.searching) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp)
                    )
                }
            },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
        )

        val searching = ui.query.length >= 2

        Box(Modifier.fillMaxSize()) {
            LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                when {
                    ui.loading -> item { LoadingState(label = "Загрузка друзей…") }
                    ui.error -> item {
                        ErrorState(
                            message = "Не удалось загрузить друзей — проверьте соединение",
                            onRetry = { vm.retry() }
                        )
                    }
                    searching -> {
                        item { SectionHeader("Результаты поиска") }
                        if (ui.searching && ui.found.isEmpty()) {
                            item { LoadingState(label = "Поиск…") }
                        }
                        if (!ui.searching && ui.found.isEmpty()) {
                            item { EmptyState("Никого не найдено — попробуйте другое имя") }
                        }
                        items(ui.found, key = { "u" + it.id }) { user ->
                            UserSearchRow(
                                user = user,
                                isFriend = ui.friends.any { it.id == user.id },
                                isSent = ui.outgoing.any { it.id == user.id },
                                isReceived = ui.incoming.any { it.id == user.id },
                                busy = "u" + user.id in ui.busyIds,
                                onAdd = { vm.add(user) },
                                onOpen = { onOpenProfile(user.id) }
                            )
                        }
                    }
                    else -> {
                        if (ui.incoming.isNotEmpty()) {
                            item { SectionHeader("Входящие заявки (${ui.incoming.size})") }
                            items(ui.incoming, key = { "in" + it.requestId }) { request ->
                                IncomingRequestRow(
                                    request = request,
                                    busy = "r" + request.requestId in ui.busyIds,
                                    onAccept = { vm.accept(request) },
                                    onReject = { vm.reject(request) },
                                    onOpen = { onOpenProfile(request.id) }
                                )
                            }
                        }
                        if (ui.outgoing.isNotEmpty()) {
                            item { SectionHeader("Исходящие заявки (${ui.outgoing.size})") }
                            items(ui.outgoing, key = { "out" + it.requestId }) { request ->
                                OutgoingRequestRow(
                                    request = request,
                                    busy = "r" + request.requestId in ui.busyIds,
                                    onCancel = { vm.cancel(request) },
                                    onOpen = { onOpenProfile(request.id) }
                                )
                            }
                        }
                        item {
                            SectionHeader(
                                if (ui.incoming.isEmpty() && ui.outgoing.isEmpty()) "Мои друзья (${ui.friends.size})"
                                else "Мои друзья"
                            )
                        }
                        if (ui.friends.isEmpty()) {
                            item {
                                EmptyState(
                                    if (ui.incoming.isEmpty() && ui.outgoing.isEmpty())
                                        "Друзей пока нет — найдите пользователя через поиск выше"
                                    else "Пока никого"
                                )
                            }
                        }
                        items(ui.friends, key = { it.id }) { friend ->
                            FriendRow(
                                friend = friend,
                                online = ui.online[friend.id] == true,
                                unread = ui.unreadCounts[friend.id] ?: 0,
                                onOpenChat = { onOpenChat(friend.id, friend.username) },
                                onOpenProfile = { onOpenProfile(friend.id) },
                                onRemove = { vm.remove(friend) }
                            )
                        }
                    }
                }
            }
            androidx.compose.material3.SnackbarHost(
                hostState = snackbar,
                modifier = Modifier.align(Alignment.BottomCenter)
            )
        }
    }
}

@Composable
private fun OnlineAvatar(url: String?, online: Boolean, contentDescription: String?) {
    Box {
        Artwork(url = url, sizeDp = 48, corner = 24, contentDescription = contentDescription)
        if (online) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .align(Alignment.BottomEnd)
                    .clip(CircleShape)
                    // UX pass 2.3.5: web parity dot #4ade80 (was accent —
                    // three different online-dot values across the app)
                    .background(androidx.compose.ui.graphics.Color(0xFF4ADE80))
                    .border(2.dp, MaterialTheme.colorScheme.background, CircleShape)
            )
        }
    }
}

@Composable
private fun IncomingRequestRow(
    request: PendingRequest,
    busy: Boolean,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onOpen: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Artwork(url = request.avatar, sizeDp = 44, corner = 22, contentDescription = null)
        Column(
            Modifier
                .weight(1f)
                .padding(start = 12.dp)
        ) {
            Text(
                request.username,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                "Хочет добавить вас в друзья",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (busy) {
            CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        } else {
            FilledTonalButton(onClick = onAccept) {
                Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                Text("Принять")
            }
            TextButton(onClick = onReject) { Text("Отклонить") }
        }
    }
}

@Composable
private fun OutgoingRequestRow(
    request: OutgoingRequest,
    busy: Boolean,
    onCancel: () -> Unit,
    onOpen: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Artwork(url = request.avatar, sizeDp = 44, corner = 22, contentDescription = null)
        Column(
            Modifier
                .weight(1f)
                .padding(start = 12.dp)
        ) {
            Text(
                request.username,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                "Ожидает подтверждения",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (busy) {
            CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        } else {
            TextButton(onClick = onCancel) { Text("Отменить") }
        }
    }
}

@Composable
private fun FriendRow(
    friend: Friend,
    online: Boolean,
    unread: Int,
    onOpenChat: () -> Unit,
    onOpenProfile: () -> Unit,
    onRemove: () -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpenProfile)
            .padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box {
            OnlineAvatar(url = friend.avatar, online = online, contentDescription = friend.username)
            if (unread > 0) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.primary)
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                        .align(Alignment.TopEnd)
                ) {
                    Text(
                        unread.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                }
            }
        }
        Column(
            Modifier
                .weight(1f)
                .padding(start = 12.dp)
        ) {
            Text(
                friend.username,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                if (online) "В сети" else "Не в сети",
                style = MaterialTheme.typography.bodySmall,
                color = if (online) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Box {
            IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(44.dp)) {
                Icon(Icons.Filled.MoreVert, contentDescription = "Действия")
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text("Написать сообщение") },
                    leadingIcon = { Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null) }, // UX pass 2.3.5: was PersonAdd (wrong semantic)
                    onClick = { menuOpen = false; onOpenChat() }
                )
                DropdownMenuItem(
                    text = { Text("Профиль") },
                    leadingIcon = { Icon(Icons.Filled.Person, contentDescription = null) }, // UX pass 2.3.5: was Check (wrong semantic)
                    onClick = { menuOpen = false; onOpenProfile() }
                )
                DropdownMenuItem(
                    text = { Text("Удалить из друзей") },
                    leadingIcon = { Icon(Icons.Filled.Close, contentDescription = null) },
                    onClick = { menuOpen = false; onRemove() }
                )
            }
        }
    }
}

@Composable
private fun UserSearchRow(
    user: UserDto,
    isFriend: Boolean,
    isSent: Boolean,
    isReceived: Boolean,
    busy: Boolean,
    onAdd: () -> Unit,
    onOpen: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Artwork(url = user.avatar, sizeDp = 44, corner = 22, contentDescription = null)
        Text(
            user.username,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier
                .weight(1f)
                .padding(start = 12.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        when {
            busy -> CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            isFriend -> Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Check,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    "Уже друзья",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(start = 4.dp)
                )
            }
            isSent || isReceived -> Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.HourglassEmpty,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    if (isSent) "Отправлено" else "Заявка от него",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp)
                )
            }
            else -> Button(onClick = onAdd) {
                Icon(Icons.Filled.PersonAdd, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Добавить")
            }
        }
    }
}
