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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.MqIcon
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.theme.MqType
import com.mq1.player.ui.vm.ChatDetailViewModel

/**
 * ChatDetail — UX pass 2.3.5: fully ported to the MQ visual language
 * (was: Material OutlinedTextField + Material icons + M3 typography next
 * to the tokenized ChatsScreen — it read like a different app).
 *
 * Web parity anchors (MessengerView):
 *  - header: back arrow + 36 avatar + name (tap → profile for 1:1)
 *  - bubbles: rounded-2xl with a small tail corner (br-md mine / bl-md
 *    theirs), mine = accent fill
 *  - input: pill (rounded-full) + send = 44dp accent circle
 */
@Composable
private fun MessageBubble(content: String, fromMe: Boolean, senderName: String? = null) {
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = if (fromMe) Alignment.CenterEnd else Alignment.CenterStart
    ) {
        Column(horizontalAlignment = if (fromMe) Alignment.End else Alignment.Start) {
            if (!fromMe && !senderName.isNullOrBlank()) {
                Text(
                    senderName,
                    style = MqType.meta2,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 12.dp, bottom = 2.dp)
                )
            }
            // web bubble: rounded-2xl (16) + 4dp tail corner toward the sender
            val shape = if (fromMe) RoundedCornerShape(16.dp, 16.dp, 4.dp, 16.dp)
            else RoundedCornerShape(16.dp, 16.dp, 16.dp, 4.dp)
            Box(
                modifier = Modifier
                    .widthIn(max = 280.dp)
                    .clip(shape)
                    .background(
                        if (fromMe) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.surfaceVariant
                    )
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            ) {
                Text(
                    content,
                    style = MqType.body,
                    color = if (fromMe) MaterialTheme.colorScheme.onPrimary
                            else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

/** Direct message chat with a friend — polling every 5s while open. */
@Composable
fun ChatDetailScreen(
    peerId: String,
    peerName: String,
    onBack: () -> Unit,
    onOpenProfile: () -> Unit = {}
) {
    val vm: ChatDetailViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    var input by remember { mutableStateOf("") }
    var inputFocused by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    LaunchedEffect(peerId) { vm.load(peerId, peerName) }
    val messageCount = if (ui.isGroup) ui.groupMessages.size else ui.messages.size
    LaunchedEffect(messageCount) {
        if (messageCount > 0) listState.animateScrollToItem(messageCount - 1)
    }

    Column(
        Modifier
            .fillMaxSize()
            .imePadding()
    ) {
        // header — real status-bar inset (was: hardcoded padding(top = 44.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 4.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable(onClick = onBack)
                    .semantics { contentDescription = "Назад" },
                contentAlignment = Alignment.Center
            ) {
                MqIcon(
                    icon = MqIcons.ArrowLeft, size = 20.dp,
                    tint = MaterialTheme.colorScheme.onBackground,
                )
            }
            // F7: header tap → peer profile (groups have no profile → no tap)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(enabled = !ui.isGroup, onClick = onOpenProfile)
                    .padding(horizontal = 8.dp, vertical = 6.dp)
            ) {
                Artwork(
                    url = ui.peerAvatar,
                    sizeDp = 36,
                    corner = 18,
                    contentDescription = null
                )
                Column(Modifier.weight(1f).padding(start = 10.dp)) {
                    Text(
                        peerName,
                        style = MqType.section,
                        color = MaterialTheme.colorScheme.onBackground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (ui.isGroup) {
                        Text(
                            "${ui.memberCount} участников",
                            style = MqType.meta2,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1
                        )
                    }
                }
                if (!ui.isGroup) {
                    MqIcon(
                        icon = MqIcons.ChevronRight,
                        size = 16.dp,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            if (ui.isGroup) {
                // group chat: sender name rides each bubble (web MessageBubble);
                // own messages align right by comparing sender.id with selfId
                items(ui.groupMessages, key = { it.id }) { message ->
                    MessageBubble(
                        content = message.content,
                        fromMe = message.sender.id.isNotBlank() &&
                            message.sender.id == ui.selfId,
                        senderName = message.sender.username,
                    )
                }
            } else {
                items(ui.messages, key = { it.id }) { message ->
                    val fromMe = message.senderId != peerId // 1:1 chat: sender is either me or the peer
                    MessageBubble(content = message.content, fromMe = fromMe)
                }
            }
        }

        ui.error?.let {
            Text(
                it,
                color = MaterialTheme.colorScheme.error,
                style = MqType.meta2,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
        }

        // F11: Android Back closes the KEYBOARD first while typing —
        // only the second Back leaves the screen (standard IME behavior).
        val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
        val focusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
        androidx.activity.compose.BackHandler(enabled = inputFocused) {
            keyboard?.hide()
            focusRequester.freeFocus()
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            // web input: pill (rounded-full) on surfaceVariant
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .clip(RoundedCornerShape(50))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                BasicTextField(
                    value = input,
                    onValueChange = { input = it },
                    singleLine = true,
                    textStyle = TextStyle(
                        fontFamily = MqType.body.fontFamily,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onBackground,
                    ),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focusRequester)
                        .onFocusChanged { inputFocused = it.isFocused }
                )
                if (input.isEmpty()) {
                    Text(
                        "Сообщение…",
                        style = MqType.body,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            // web send: 44dp accent circle
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary)
                    .clickable {
                        if (input.isNotBlank()) {
                            vm.send(input.trim())
                            input = ""
                        }
                    }
                    .semantics { contentDescription = "Отправить" },
                contentAlignment = Alignment.Center
            ) {
                MqIcon(
                    icon = MqIcons.Send, size = 18.dp,
                    tint = MaterialTheme.colorScheme.onPrimary,
                )
            }
        }
    }
}
