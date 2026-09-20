package com.mq1.player.ui.components

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mq1.player.data.api.PlaylistDto
import com.mq1.player.data.api.Track
import com.mq1.player.ui.theme.MqType

/**
 * WEB PARITY context menu — port of ContextMenu.tsx + MenuCore's mobile
 * bottom-sheet mode.
 *
 * P0 REWORK (parity-1): the old hand-rolled overlay composed a fixed-height
 * 844.dp scrim and a TOP-anchored sheet inline in the layout — it clipped,
 * mis-positioned and layered under real sheets. This version rides the
 * window-layered [ModalBottomSheet]: correct bottom anchoring, full-screen
 * scrim, outside-tap / back / swipe-to-dismiss, safe areas and z-ordering
 * above every other sheet — the exact contract the web MenuCore guarantees.
 *
 * Visual spec (unchanged from web): sheet full-width bottom-anchored, r16 top
 * corners, bg card, p6, max 72% height; grabber 36×4 r2; header 48 art r8 +
 * title 14/600 + "artist · m:ss" muted; items 48dp min, r8, p10/12, gap12,
 * icon 18 muted, label 13/500; destructive → error red; separators 7/14/7/44.
 *
 * Only REAL actions render (no fake entries):
 *  Воспроизвести · Добавить в очередь · Добавить в плейлист (→ sub-page +
 *  Новый плейлист) · Похожие треки · Лайк/Убрать лайк · Не нравится/Убрать
 *  дизлайк · Перейти к артисту · Подписаться/Отписаться (artist) ·
 *  Поделиться (Android share intent) · Копировать название («title — artist»)
 *  · Скачать (current track only) · contextual: Убрать из очереди (REAL
 *  removal by index) / Убрать из плейлиста (destructive).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MqTrackContextMenu(
    track: Track,
    isLiked: Boolean,
    playlists: List<PlaylistDto>,
    onDismiss: () -> Unit,
    onPlay: () -> Unit,
    onAddToQueue: () -> Unit,
    onToggleLike: () -> Unit,
    onOpenArtist: (String) -> Unit,
    onAddToPlaylist: (playlistId: String) -> Unit,
    onCreatePlaylistAndAdd: () -> Unit,
    isDisliked: Boolean = false,
    isSubscribed: Boolean = false,
    queueIndex: Int? = null,
    canDownload: Boolean = false,
    onDislike: (() -> Unit)? = null,
    onSimilar: (() -> Unit)? = null,
    onToggleSubscription: (() -> Unit)? = null,
    onRemoveFromQueue: ((Int) -> Unit)? = null,
    onRemoveFromPlaylist: (() -> Unit)? = null,
    onDownload: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var page by remember { mutableStateOf("root") }
    val accent = MaterialTheme.colorScheme.primary
    val text = MaterialTheme.colorScheme.onBackground
    val textMuted = MaterialTheme.colorScheme.onSurfaceVariant
    val hairline = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
    // UX pass 2.3.5: scheme error (was hardcoded #EF4444 — light themes
    // define error as C92A2A, so the sheet's red disagreed with every
    // other red on the same screen).
    val error = MaterialTheme.colorScheme.error

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.surface,
        scrimColor = Color.Black.copy(alpha = 0.45f),
        dragHandle = {
            // web grabber: 36×4 r2 edge-strong.
            // P0 fix: the old modifier order applied 10dp of vertical padding
            // INSIDE a 4dp-high box → negative content height → the grabber
            // never painted. Padding must wrap the sized element (M3 default
            // dragHandle does exactly this).
            Box(
                Modifier
                    .padding(top = 4.dp, bottom = 8.dp)
                    .width(36.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(MaterialTheme.colorScheme.outline)
            )
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 560.dp) // web sheet cap 72vh
                .verticalScroll(rememberScrollState())
                .padding(6.dp)
        ) {
            // Animation pass: sub-page slide (forward: from end; back: to
            // end) — the playlists picker previously hard-swapped in place.
            AnimatedContent(
                targetState = page,
                transitionSpec = {
                    val spec = androidx.compose.animation.core.tween<IntOffset>(
                        220, easing = androidx.compose.animation.core.FastOutSlowInEasing
                    )
                    if (targetState == "playlists") {
                        (slideInHorizontally(spec) { it / 3 } + fadeIn(tween(180))) togetherWith
                            (slideOutHorizontally(spec) { -it / 4 } + fadeOut(tween(160)))
                    } else {
                        (slideInHorizontally(spec) { -it / 4 } + fadeIn(tween(180))) togetherWith
                            (slideOutHorizontally(spec) { it / 3 } + fadeOut(tween(160)))
                    }
                },
                label = "menuPage"
            ) { currentPage ->
                Column {
            if (currentPage == "root") {
                // ── header: art 48 r8 + title + artist · duration ────────────
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(start = 10.dp, end = 10.dp, top = 8.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Artwork(url = track.cover, sizeDp = 48, corner = 8, contentDescription = null)
                    Column {
                        Text(
                            track.title.ifBlank { "Без названия" },
                            style = MqType.track.copy(fontSize = 14.sp),
                            color = text,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            if (track.durationInt > 0) "${track.artist} · ${formatDuration(track.durationInt)}"
                            else track.artist,
                            style = MqType.meta,
                            color = textMuted,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                SheetSeparator(hairline)

                // ── Playback group ──────────────────────────────────────────
                SheetItem(MqIcons.Play, "Воспроизвести", text, textMuted) { onPlay(); onDismiss() }
                SheetItem(MqIcons.ListPlus, "Добавить в очередь", text, textMuted) { onAddToQueue(); onDismiss() }
                onSimilar?.let { similar ->
                    SheetItem(MqIcons.Radio, "Похожие треки", text, textMuted) { similar(); onDismiss() }
                }

                // ── Library group ───────────────────────────────────────────
                SheetSeparator(hairline)
                SheetItem(MqIcons.ListMusic, "Добавить в плейлист", text, textMuted) { page = "playlists" }
                SheetItem(
                    MqIcons.Heart, if (isLiked) "Убрать лайк" else "Лайк",
                    if (isLiked) accent else text, textMuted
                ) { onToggleLike(); onDismiss() }
                onDislike?.let { dislike ->
                    SheetItem(
                        MqIcons.ThumbsDown, if (isDisliked) "Убрать дизлайк" else "Не нравится",
                        if (isDisliked) accent else text, textMuted
                    ) { dislike(); onDismiss() }
                }

                // ── Navigate group ──────────────────────────────────────────
                SheetSeparator(hairline)
                SheetItem(MqIcons.User, "Перейти к артисту", text, textMuted) {
                    onOpenArtist(track.artist); onDismiss()
                }
                onToggleSubscription?.let { toggle ->
                    SheetItem(
                        MqIcons.UserCheck, if (isSubscribed) "Отписаться от артиста" else "Подписаться на артиста",
                        text, textMuted
                    ) { toggle(); onDismiss() }
                }

                // ── Share group ─────────────────────────────────────────────
                SheetSeparator(hairline)
                SheetItem(MqIcons.Share2, "Поделиться", text, textMuted) {
                    runCatching {
                        val trackUrl = "https://mq1.vercel.app/track/" +
                            (track.scTrackId?.toString() ?: track.id)
                        context.startActivity(
                            Intent.createChooser(
                                Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(
                                        Intent.EXTRA_TEXT,
                                        "Слушайте «${track.title}» — ${track.artist} на MQ Player\n$trackUrl"
                                    )
                                },
                                "Поделиться"
                            )
                        )
                    }
                    onDismiss()
                }
                SheetItem(MqIcons.FileText, "Копировать название", text, textMuted) {
                    // web: copies "title — artist"
                    clipboard.setText(AnnotatedString("${track.title} — ${track.artist}"))
                    onDismiss()
                }
                // web downloads the ACTIVE stream — only offer it where a
                // stream is actually available (current track)
                if (canDownload && onDownload != null) {
                    SheetItem(MqIcons.Download, "Скачать", text, textMuted) {
                        onDownload(); onDismiss()
                    }
                }

                // ── contextual destructive ──────────────────────────────────
                if (queueIndex != null && onRemoveFromQueue != null) {
                    SheetSeparator(hairline)
                    SheetItem(MqIcons.Trash2, "Убрать из очереди", error, error) {
                        onRemoveFromQueue(queueIndex); onDismiss()
                    }
                }
                if (onRemoveFromPlaylist != null) {
                    SheetSeparator(hairline)
                    SheetItem(MqIcons.Trash2, "Убрать из плейлиста", error, error) {
                        onRemoveFromPlaylist(); onDismiss()
                    }
                }
                // bottom inset so the last item clears the gesture bar
                Box(Modifier.height(12.dp))
            } else {
                // ── playlists sub-page ──────────────────────────────────────
                // UX pass 2.3.5: BACK affordance — the sub-page previously
                // had none, and the system back gesture killed the WHOLE
                // sheet (web parity: ContextMenu sub-page has a Back row).
                SheetItem(MqIcons.ArrowLeft, "Назад", text, textMuted) {
                    page = "root"
                }
                Text(
                    "Добавить в плейлист",
                    style = MqType.label,
                    color = textMuted,
                    modifier = Modifier.padding(start = 10.dp, top = 4.dp, bottom = 4.dp)
                )
                if (playlists.isEmpty()) {
                    Text(
                        "Нет плейлистов",
                        style = MqType.body.copy(fontSize = 14.sp),
                        color = textMuted,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)
                    )
                }
                playlists.forEach { pl ->
                    SheetItem(MqIcons.ListMusic, pl.name, text, textMuted) {
                        onAddToPlaylist(pl.id); onDismiss()
                    }
                }
                SheetSeparator(hairline)
                SheetItem(MqIcons.Plus, "Новый плейлист", text, textMuted) {
                    onCreatePlaylistAndAdd(); onDismiss()
                }
                Box(Modifier.height(12.dp))
            }
                }
            }
        }
    }
}

@Composable
private fun SheetItem(
    icon: LucideIcon,
    label: String,
    labelColor: Color,
    iconTint: Color,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            // UX pass 2.3.5: min-height instead of fixed height — long
            // playlist names wrapped nowhere (48dp hard clipped them).
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        MqIcon(icon = icon, size = 18.dp, tint = iconTint)
        Text(
            label,
            style = MqType.menu.copy(fontSize = 14.sp),
            color = labelColor,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun SheetSeparator(color: Color) {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(start = 44.dp, end = 14.dp, top = 7.dp, bottom = 7.dp)
            .height(1.dp)
            .background(color)
    )
}
