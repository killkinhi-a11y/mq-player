package com.mq1.player.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.ErrorState
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.vm.UserProfileViewModel

/**
 * F7: public user profile — REAL /api/users/{id}. Actions by friendship
 * state: add / cancel / accept / message / remove. Entry points: Friends
 * rows, user search, chat detail header.
 */
@Composable
fun UserProfileScreen(
    userId: String,
    onBack: () -> Unit,
    onOpenChat: (peerId: String, peerName: String) -> Unit,
    onOpenMyProfile: () -> Unit = {}
) {
    val vm: UserProfileViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val snackbar = remember { androidx.compose.material3.SnackbarHostState() }

    LaunchedEffect(userId) { vm.load(userId) }
    LaunchedEffect(ui.message) {
        ui.message?.let {
            snackbar.showSnackbar(it)
            vm.consumeMessage()
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
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
                IconButton(onClick = { vm.refresh() }, modifier = Modifier.size(44.dp)) {
                    Icon(Icons.Filled.Refresh, contentDescription = "Обновить")
                }
            }

            when {
                ui.loading -> LoadingState(label = "Загрузка профиля…")
                ui.error != null -> ErrorState(
                    message = ui.error ?: "Профиль недоступен",
                    onRetry = { vm.refresh() }
                )
                else -> Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Spacer(Modifier.height(16.dp))
                    Box {
                        Artwork(
                            url = ui.user.avatar,
                            sizeDp = 104,
                            corner = 52,
                            contentDescription = ui.user.username
                        )
                        if (ui.online) {
                            Box(
                                modifier = Modifier
                                    .size(20.dp)
                                    .align(Alignment.BottomEnd)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.primary)
                                    .border(3.dp, MaterialTheme.colorScheme.background, CircleShape)
                            )
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(
                        ui.user.username,
                        style = MaterialTheme.typography.headlineSmall,
                        textAlign = TextAlign.Center
                    )
                    Spacer(Modifier.height(6.dp))
                    val lastSeen = ui.lastSeen
                    Text(
                        when {
                            ui.online -> "В сети"
                            lastSeen != null -> "Был(а) в сети " + formatLastSeen(lastSeen)
                            else -> "Не в сети"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (ui.online) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(24.dp))

                    when (ui.friendship.status) {
                        "friends" -> {
                            Button(
                                onClick = { onOpenChat(ui.user.id, ui.user.username) },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Filled.ChatBubble, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.padding(horizontal = 3.dp))
                                Text("Написать сообщение")
                            }
                            if (ui.busy) {
                                Spacer(Modifier.height(12.dp))
                                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                            } else {
                                TextButton(onClick = { vm.removeFriend() }) {
                                    Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Text("Удалить из друзей")
                                }
                            }
                        }
                        "outgoing" -> {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(vertical = 8.dp)
                            ) {
                                Icon(
                                    Icons.Filled.HourglassEmpty, contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(18.dp)
                                )
                                Text(
                                    "Заявка отправлена — ожидает подтверждения",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(start = 6.dp)
                                )
                            }
                            if (ui.busy) {
                                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                            } else {
                                TextButton(onClick = { vm.cancelRequest() }) { Text("Отменить заявку") }
                            }
                        }
                        "incoming" -> {
                            Text(
                                "${ui.user.username} хочет добавить вас в друзья",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center
                            )
                            Spacer(Modifier.height(12.dp))
                            if (ui.busy) {
                                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                            } else {
                                FilledTonalButton(
                                    onClick = { vm.acceptRequest() },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Text("Принять заявку")
                                }
                                TextButton(onClick = { vm.removeFriend() }) { Text("Отклонить") }
                            }
                        }
                        "self" -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "Это ваш профиль",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(12.dp))
                            Button(
                                onClick = onOpenMyProfile,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Открыть мой профиль")
                            }
                        }
                        else -> { // "none"
                            if (ui.busy) {
                                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                            } else {
                                Button(
                                    onClick = { vm.addFriend() },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Icon(Icons.Filled.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Text("Добавить в друзья")
                                }
                            }
                        }
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

/** Web parity format (FriendsView.formatLastSeen). */
internal fun formatLastSeen(iso: String): String {
    val t = runCatching { java.time.Instant.parse(iso) }.getOrNull() ?: return ""
    val diffMin = java.time.Duration.between(t, java.time.Instant.now()).toMinutes()
    return when {
        diffMin < 1 -> "только что"
        diffMin < 60 -> "$diffMin мин назад"
        diffMin < 60 * 24 -> "${diffMin / 60} ч назад"
        diffMin < 60 * 24 * 7 -> "${diffMin / (60 * 24)} дн. назад"
        else -> java.time.format.DateTimeFormatter.ofPattern("d MMM")
            .withLocale(java.util.Locale("ru"))
            .format(java.time.ZonedDateTime.ofInstant(t, java.time.ZoneId.systemDefault()))
    }
}
