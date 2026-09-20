package com.mq1.player.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import coil.compose.AsyncImage
import com.mq1.player.ui.components.LucideIcon
import com.mq1.player.ui.components.MqIcon
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.components.SpinLoader
import com.mq1.player.ui.components.WebPrimaryButton
import com.mq1.player.ui.theme.MqType
import com.mq1.player.ui.vm.ChatsViewModel
import com.mq1.player.ui.vm.ChatRowUi

/**
 * Chats hub — exact port of the web MessengerView contacts-list panel
 * (mobile): rounded messenger card, header (Чаты + count + Друзья/группа/
 * новый чат), search input, chat rows (44dp round avatars, online dots,
 * unread chips, time badges) and the web empty/loading/error states.
 */
@Composable
fun ChatsScreen(
    onOpenChat: (peerId: String, peerName: String) -> Unit,
    onOpenFriends: () -> Unit = {}
) {
    val vm: ChatsViewModel = viewModel()
    val ui by vm.ui.collectAsState()

    LaunchedEffect(Unit) { vm.refresh() }

    // web «Новая группа» — name + member checkboxes → POST /api/group-chats
    var groupDialogOpen by remember { mutableStateOf(false) }
    var groupName by remember { mutableStateOf("") }
    val groupMembers = remember { androidx.compose.runtime.mutableStateListOf<String>() }
    var groupError by remember { mutableStateOf<String?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    ChatsBody(
        ui = ui,
        onOpenChat = onOpenChat,
        onOpenFriends = onOpenFriends,
        // web «Новый чат» opens the contact picker → Android friends screen
        onNewChat = onOpenFriends,
        onNewGroup = { groupDialogOpen = true; groupError = null },
        onRetry = { vm.refresh() }
    )

    if (groupDialogOpen) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { groupDialogOpen = false },
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
            title = { Text("Новая группа", style = MqType.section, color = MaterialTheme.colorScheme.onBackground) },
            text = {
                Column {
                    Text("Название группы", style = MqType.label, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(6.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surface)
                            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp)
                    ) {
                        androidx.compose.foundation.text.BasicTextField(
                            value = groupName,
                            onValueChange = { groupName = it },
                            singleLine = true,
                            textStyle = MqType.body.copy(color = MaterialTheme.colorScheme.onBackground),
                            modifier = Modifier.fillMaxWidth()
                        )
                        if (groupName.isEmpty()) {
                            Text("Например: Музыкальный чилл", style = MqType.body, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        if (ui.friends.isEmpty()) "Нет друзей для добавления" else "Участники",
                        style = MqType.label,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Column(Modifier.heightIn(max = 240.dp).verticalScroll(rememberScrollState())) {
                        ui.friends.forEach { f ->
                            val checked = f.id in groupMembers
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable {
                                        if (checked) groupMembers.remove(f.id)
                                        else groupMembers.add(f.id)
                                    }
                                    .padding(horizontal = 8.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    Modifier
                                        .size(20.dp)
                                        .clip(CircleShape)
                                        .background(
                                            if (checked) MaterialTheme.colorScheme.primary
                                            else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (checked) MqIcon(icon = MqIcons.Check, size = 12.dp, tint = Color.White)
                                }
                                Text(
                                    f.username,
                                    style = MqType.track,
                                    color = MaterialTheme.colorScheme.onBackground,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                    groupError?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, style = MqType.meta2, color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                Text(
                    "Создать",
                    style = MqType.meta.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold),
                    color = if (groupName.isNotBlank()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable(enabled = groupName.isNotBlank()) {
                            val name = groupName.trim()
                            if (name.isEmpty()) return@clickable
                            scope.launch {
                                vm.createGroup(name, groupMembers.toList()) { ok ->
                                    if (ok) {
                                        groupDialogOpen = false
                                        groupName = ""
                                        groupMembers.clear()
                                    } else {
                                        groupError = "Не удалось создать группу"
                                    }
                                }
                            }
                        }
                        .padding(8.dp)
                )
            },
            dismissButton = {
                Text(
                    "Отмена",
                    style = MqType.meta,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { groupDialogOpen = false }
                        .padding(8.dp)
                )
            }
        )
    }
}

/**
 * Stateless chats body — pure function of [ui] + callbacks (Robolectric
 * screenshot fixtures drive it directly, MyProfileScreenTest pattern).
 */
@Composable
internal fun ChatsBody(
    ui: ChatsViewModel.ChatsUi,
    onOpenChat: (peerId: String, peerName: String) -> Unit,
    onOpenFriends: () -> Unit,
    onNewGroup: () -> Unit = {},
    onNewChat: () -> Unit = {},
    onRetry: () -> Unit = {}
) {
    var query by remember { mutableStateOf("") }

    // web sortedChats: pinned first, then by last activity (desc)
    val visible = remember(ui.rows, query) {
        val q = query.trim().lowercase()
        val filtered = if (q.isEmpty()) ui.rows
            else ui.rows.filter { it.name.lowercase().contains(q) }
        filtered.sortedWith(
            compareByDescending<ChatRowUi> { it.pinned }
                .thenByDescending { it.lastTimeMillis }
        )
    }

    // UX pass 2.3.5: real status-bar inset (was fixed 52dp fake)
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        // web: p-3 page wrapper → r-3xl messenger card (card bg + thin border)
        Box(Modifier.fillMaxSize().padding(12.dp)) {
            Column(
                Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(24.dp))
                    .background(chatsSurface)
                    .border(1.dp, chatsBorder, RoundedCornerShape(24.dp))
            ) {
                // ── Header (web: p-4 flex justify-between border-b) ──────────
                Row(
                    Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Чаты",
                        style = MqType.page.copy(fontSize = 18.sp, fontWeight = FontWeight.W700),
                        color = chatsText,
                        modifier = Modifier.weight(1f)
                    )
                    if (ui.rows.isNotEmpty()) {
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(50))
                                .background(chatsText.copy(alpha = 0.06f))
                                .padding(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Text(
                                ui.rows.size.toString(),
                                style = MqType.meta,
                                color = chatsMuted
                            )
                        }
                    }
                    Spacer(Modifier.width(6.dp))
                    // Friends entry (web: Contact icon pill — Lucide Contact
                    // not extracted → UserPlus, closest glyph)
                    Box(
                        Modifier
                            .height(40.dp)
                            .clip(CircleShape)
                            .background(chatsText.copy(alpha = 0.06f))
                            .clickable(onClick = onOpenFriends)
                            .semantics { contentDescription = "Друзья" }
                            .padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(icon = MqIcons.UserPlus, size = 16.dp, tint = chatsMuted)
                    }
                    Spacer(Modifier.width(6.dp))
                    // New group (web: Users icon, 44dp round)
                    Box(
                        Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(chatsText.copy(alpha = 0.06f))
                            .clickable(onClick = onNewGroup)
                            .semantics { contentDescription = "Новая группа" },
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(icon = MqIcons.Users, size = 16.dp, tint = chatsMuted)
                    }
                    Spacer(Modifier.width(6.dp))
                    // New chat (web: accent 44dp round + Plus)
                    Box(
                        Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(chatsAccent)
                            .clickable(onClick = onNewChat)
                            .semantics { contentDescription = "Новый чат" },
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(icon = MqIcons.Plus, size = 16.dp, tint = chatsOnAccent)
                    }
                }
                Hairline()
                // ── Search (web: p-3 border-b → inputBg r-xl) ────────────────
                Box(Modifier.fillMaxWidth().padding(12.dp)) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            // UX pass 2.3.5: 40dp (web h-10; was 36dp —
                            // the smallest text field in the app)
                            .height(40.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(chatsInputBg)
                            .border(1.dp, chatsBorder, RoundedCornerShape(12.dp))
                            .padding(start = 12.dp, end = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        MqIcon(icon = MqIcons.Search, size = 16.dp, tint = chatsMuted)
                        Spacer(Modifier.width(8.dp))
                        BasicTextField(
                            value = query,
                            onValueChange = { query = it },
                            singleLine = true,
                            textStyle = MqType.body.copy(
                                fontSize = 14.sp, color = chatsText
                            ),
                            modifier = Modifier.weight(1f),
                            decorationBox = { inner ->
                                Box(Modifier.fillMaxWidth()) {
                                    if (query.isEmpty()) {
                                        Text(
                                            "Поиск чатов",
                                            style = MqType.meta,
                                            color = chatsMuted
                                        )
                                    }
                                    inner()
                                }
                            }
                        )
                    }
                }
                Hairline()
                // ── List ─────────────────────────────────────────────────────
                Box(Modifier.fillMaxSize()) {
                    when {
                        ui.error && ui.rows.isEmpty() -> ChatsErrorState(onRetry)
                        ui.loading && ui.rows.isEmpty() -> {
                            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                SpinLoader(
                                    size = 20.dp,
                                    stroke = 2.dp,
                                    tint = chatsMuted
                                )
                            }
                        }
                        visible.isEmpty() -> ChatsEmptyState(
                            searched = query.trim().isNotEmpty(),
                            onFindFriends = onOpenFriends
                        )
                        else -> LazyColumn(Modifier.fillMaxSize()) {
                            items(visible, key = { it.id }) { row ->
                                ChatRow(row = row, onClick = { onOpenChat(row.id, row.name) })
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Web chat row: p-3, 44dp avatar + name/track + last/meta + time + unread.
 *  UX pass 2.3.4: ripple clipped to the web row radius (10). */
@Composable
private fun ChatRow(row: ChatRowUi, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box {
            ChatAvatar(
                name = row.name,
                id = row.id,
                url = row.avatar,
                isGroup = row.isGroup,
                size = 44
            )
            if (row.online) {
                // web: w-3 h-3 dot, #4ade80 + 2px card ring
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF4ADE80))
                        .border(2.dp, chatsSurface, CircleShape)
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    row.name,
                    style = MqType.track,
                    color = chatsText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                row.lastTime?.let {
                    Text(
                        it,
                        style = MqType.meta2,
                        color = if (row.pinned) chatsAccent else chatsMuted
                    )
                }
            }
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    chatRowSubtitle(row),
                    style = MqType.meta,
                    color = chatsMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                if (row.unread > 0) {
                    Box(
                        Modifier
                            .height(18.dp)
                            .clip(RoundedCornerShape(50))
                            .background(chatsAccent)
                            .padding(horizontal = 5.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            if (row.unread > 99) "99+" else row.unread.toString(),
                            style = MqType.meta2.copy(fontWeight = FontWeight.W700),
                            color = chatsOnAccent
                        )
                    }
                }
            }
        }
    }
}

/** Web fallbacks: last message → «N участников» → «в сети» → «был(а) недавно». */
private fun chatRowSubtitle(row: ChatRowUi): String = when {
    row.lastText != null -> row.lastText
    row.isGroup -> "${row.memberCount} участников"
    row.online -> "в сети"
    else -> "был(а) недавно"
}

/** Web empty state (web: MessageCircle 40 @40%, «Пока пусто», CTA pill). */
@Composable
private fun ChatsEmptyState(searched: Boolean, onFindFriends: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(48.dp))
        MqIcon(
            icon = MqIcons.MessageCircle,
            size = 40.dp,
            tint = chatsMuted.copy(alpha = 0.4f)
        )
        Text(
            if (searched) "Ничего не найдено" else "Пока пусто",
            style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.W600),
            color = chatsText,
            modifier = Modifier.padding(top = 12.dp)
        )
        Text(
            if (searched) "Попробуйте другой запрос" else "Найдите друзей — и здесь появятся чаты",
            style = MqType.meta,
            color = chatsMuted,
            modifier = Modifier.padding(top = 4.dp)
        )
        if (!searched) {
            Spacer(Modifier.height(16.dp))
            WebPrimaryButton(onClick = onFindFriends) {
                MqIcon(icon = MqIcons.UserPlus, size = 14.dp, tint = chatsOnAccent)
                Spacer(Modifier.width(6.dp))
                Text("Найти друзей", style = MqType.btn, color = chatsOnAccent)
            }
        }
    }
}

/** Web recoverable error state — full-card, retry keeps the hub polling. */
@Composable
private fun ChatsErrorState(onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(48.dp))
        MqIcon(
            icon = MqIcons.MessageCircle,
            size = 40.dp,
            tint = chatsMuted.copy(alpha = 0.4f)
        )
        Text(
            "Не удалось загрузить чаты",
            style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.W600),
            color = chatsText,
            modifier = Modifier.padding(top = 12.dp)
        )
        Text(
            "Проверьте подключение и попробуйте снова",
            style = MqType.meta,
            color = chatsMuted,
            modifier = Modifier.padding(top = 4.dp)
        )
        Spacer(Modifier.height(16.dp))
        WebPrimaryButton(onClick = onRetry) { Text("Повторить", style = MqType.btn, color = chatsOnAccent) }
    }
}

// ── Avatar (web MessengerView Avatar) ──────────────────────────────────────

/** Deterministic 7-color palette, byte-identical to the web AVATAR_COLORS. */
private val AvatarColors = listOf(
    0xFFE03131 to 0xFFB91C1C,
    0xFFDB2777 to 0xFF9D174D,
    0xFF9333EA to 0xFF6B21A8,
    0xFF0D9488 to 0xFF134E4A,
    0xFF65A30D to 0xFF365314,
    0xFFD97706 to 0xFF78350F,
    0xFF0891B2 to 0xFF155E75,
)
private val GroupGradient = 0xFF8B5CF6 to 0xFF6366F1

private fun avatarBrush(id: String): Brush {
    var hash = 0
    for (c in id.ifEmpty { "x" }) hash = hash * 31 + c.code
    val (a, b) = AvatarColors[Math.abs(hash) % AvatarColors.size]
    return Brush.linearGradient(listOf(Color(a), Color(b)))
}

/** Web Avatar: image, or gradient + initial (group: Users glyph, violet). */
@Composable
private fun ChatAvatar(
    name: String,
    id: String,
    url: String?,
    isGroup: Boolean,
    size: Int
) {
    val shape = CircleShape
    Box(
        Modifier
            .size(size.dp)
            .clip(shape)
            .background(
                if (isGroup) Brush.linearGradient(
                    listOf(Color(GroupGradient.first), Color(GroupGradient.second))
                ) else avatarBrush(id)
            ),
        contentAlignment = Alignment.Center
    ) {
        if (!url.isNullOrBlank()) {
            AsyncImage(
                model = url,
                contentDescription = name,
                modifier = Modifier.size(size.dp).clip(shape),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop
            )
        } else if (isGroup) {
            MqIcon(
                icon = MqIcons.Users,
                size = (size * 0.45).dp,
                tint = Color.White
            )
        } else {
            Text(
                initials(name),
                style = TextStyle(
                    fontFamily = MqType.track.fontFamily,
                    fontSize = (size * 0.4).sp,
                    fontWeight = FontWeight.W700,
                ),
                color = Color.White
            )
        }
    }
}

private fun initials(name: String): String =
    name.replace("@", "").firstOrNull()?.uppercase() ?: "?"

// ── Local colorScheme aliases (no LocalMqPalette dependency, so the body
//    also renders under a bare MaterialTheme host like SettingsDownloadTest) ─

private val chatsSurface
    @Composable get() = androidx.compose.material3.MaterialTheme.colorScheme.surfaceVariant
private val chatsText
    @Composable get() = androidx.compose.material3.MaterialTheme.colorScheme.onBackground
private val chatsMuted
    @Composable get() = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
private val chatsAccent
    @Composable get() = androidx.compose.material3.MaterialTheme.colorScheme.primary
private val chatsOnAccent
    @Composable get() = androidx.compose.material3.MaterialTheme.colorScheme.onPrimary
private val chatsBorder
    @Composable get() = androidx.compose.material3.MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)
private val chatsInputBg
    @Composable get() = androidx.compose.material3.MaterialTheme.colorScheme.surfaceVariant

@Composable
private fun Hairline() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(androidx.compose.material3.MaterialTheme.colorScheme.outline.copy(alpha = 0.22f))
    )
}
