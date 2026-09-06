package com.mq1.player.ui.screens

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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Person
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
fun ChatsScreen(onOpenChat: (peerId: String, peerName: String) -> Unit) {
    val vm: ChatsViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    var aiInput by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { vm.refresh() }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        item {
            Spacer(Modifier.height(52.dp))
            Text(
                "Чаты",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
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
                val queueState by player.controller.queue.collectAsState()
                TrackRow(
                    track = track,
                    isPlaying = false,
                    isFavorite = false,
                    onPlay = {
                        player.controller.playQueue(ui.aiSuggested, ui.aiSuggested.indexOf(track))
                    }
                )
            }
        }

        // Friend chats
        item { com.mq1.player.ui.components.SectionHeader("Друзья") }
        if (ui.friends.isEmpty()) {
            item { EmptyState("Нет друзей — добавьте их во вкладке Друзья") }
        } else {
            items(ui.friends, key = { it.id }) { friend ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenChat(friend.id, friend.username) }
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Artwork(url = friend.avatar, sizeDp = 44, corner = 22)
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
                            "Открыть чат",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
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
