package com.mq1.player.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.EmptyState
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.vm.ChatsViewModel
import com.mq1.player.ui.vm.PlayerViewModel

/** Chats hub: friend chats + MQ AI assistant (taste-aware, real /api/ai/chat). */
@Composable
fun ChatsScreen(
    onOpenChat: (peerId: String, peerName: String) -> Unit,
    onOpenFriends: () -> Unit = {}
) {
    val vm: ChatsViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val favorites by player.favorites.collectAsState(initial = emptyList())
    var aiInput by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { vm.refresh() }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        item {
            Spacer(Modifier.height(52.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Чаты",
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.weight(1f)
                )
                // F7: friends entry with incoming-request badge
                IconButton(
                    onClick = onOpenFriends,
                    modifier = Modifier.size(44.dp)
                ) {
                    if (ui.requestCount > 0) {
                        BadgedBox(
                            badge = {
                                Badge { Text(if (ui.requestCount > 99) "99+" else ui.requestCount.toString()) }
                            }
                        ) {
                            Icon(
                                Icons.Filled.Group,
                                contentDescription = "Друзья — ${ui.requestCount} заявок",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        Icon(
                            Icons.Filled.Group,
                            contentDescription = "Друзья",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        // AI assistant
        item {
            Surface(
                shape = MaterialTheme.shapes.large,
                color = MaterialTheme.colorScheme.surface,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        "MQ — музыкальный ассистент",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(8.dp))
                    if (ui.aiMessages.isEmpty()) {
                        Text(
                            "Спросите что послушать: «дай что-нибудь из 90-х» или «хочу лоу-фай»",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        ui.aiMessages.takeLast(6).forEach { message ->
                            Text(
                                (if (message.role == "user") "Вы: " else "MQ: ") + message.content,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(vertical = 2.dp)
                            )
                        }
                    }
                    if (ui.aiTyping) {
                        Text(
                            "MQ печатает…",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = aiInput,
                            onValueChange = { aiInput = it },
                            placeholder = { Text("Спросить MQ…") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(Modifier.width(8.dp))
                        IconButton(
                            onClick = {
                                if (aiInput.isNotBlank()) {
                                    vm.askAi(aiInput.trim())
                                    aiInput = ""
                                }
                            },
                            modifier = Modifier.size(44.dp)
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.Send,
                                contentDescription = "Отправить"
                            )
                        }
                    }
                }
            }
        }

        // AI suggested tracks
        if (ui.aiSuggested.isNotEmpty()) {
            item {
                com.mq1.player.ui.components.SectionHeader("MQ подобрал (${ui.aiSuggested.size})")
            }
            items(ui.aiSuggested, key = { "ai" + it.id }) { track ->
                TrackRow(
                    track = track,
                    isPlaying = false,
                    isFavorite = favorites.any { it.id == track.id },
                    onPlay = {
                        player.controller.playQueue(ui.aiSuggested, ui.aiSuggested.indexOf(track))
                    },
                    onFavorite = { player.controller.toggleFavorite(track) }
                )
            }
        }

        // Friend chats
        item { com.mq1.player.ui.components.SectionHeader("Друзья") }
        if (ui.friends.isEmpty()) {
            item { EmptyState("Нет друзей — найдите их через иконку друзей сверху") }
        } else {
            items(ui.friends, key = { it.id }) { friend ->
                val unread = ui.unreadCounts[friend.id] ?: 0
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenChat(friend.id, friend.username) }
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box {
                        Artwork(url = friend.avatar, sizeDp = 44, corner = 22)
                        if (unread > 0) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(MaterialTheme.colorScheme.primary)
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                                    .align(Alignment.TopEnd)
                            ) {
                                Text(
                                    if (unread > 99) "99+" else unread.toString(),
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
                            if (unread > 0) "$unread новых сообщений" else "Открыть чат",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (unread > 0) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Icon(
                        Icons.Filled.Person,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}
