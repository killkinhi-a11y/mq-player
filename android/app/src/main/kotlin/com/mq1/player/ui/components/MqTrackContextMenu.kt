package com.mq1.player.ui.components

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
 * WEB PARITY context menu — exact port of ContextMenu.tsx + MenuCore's
 * mobile bottom-sheet mode:
 *
 *  scrim rgba(0,0,0,0.45) · sheet full-width bottom-anchored, r16 top
 *  corners, bg card, edge-strong border, p6, max 72% height
 *  grabber 36×4 r2 edge-strong (m4/6)
 *  header: 48 art r8 + title 14/600 + "artist · m:ss" 12/400 muted +
 *  hairline separator
 *  items: 48dp min, r8, p10/12, gap12, icon 18 muted, label mq-t-menu
 *  13/500; destructive → error red; separators 7/14/7/44
 *
 * Only REAL actions render (no fake entries):
 *  Воспроизвести · Добавить в очередь · Добавить в плейлист (→ playlist
 *  sub-page + Новый плейлист) · Лайк/Убрать лайк · Перейти к артисту ·
 *  Поделиться (Android share intent) · Копировать название (clipboard) ·
 *  contextual: Убрать из очереди / Убрать из плейлиста (destructive).
 */
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
    onRemoveFromQueue: (() -> Unit)? = null,
    onRemoveFromPlaylist: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var page by remember { mutableStateOf("root") }
    val accent = MaterialTheme.colorScheme.primary
    val text = MaterialTheme.colorScheme.onBackground
    val textMuted = MaterialTheme.colorScheme.onSurfaceVariant
    val hairline = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
    val error = Color(0xFFEF4444)
    val surface = MaterialTheme.colorScheme.surface
    val border = MaterialTheme.colorScheme.outline

    // scrim
    Box(
        Modifier
            .fillMaxWidth()
            .height(844.dp)
            .background(Color.Black.copy(alpha = 0.45f))
            .clickable(onClick = onDismiss)
    )

    // sheet
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
            .background(surface)
            .padding(6.dp),
    ) {
        // grabber 36×4 r2
        Box(
            Modifier
                .width(36.dp)
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(border)
                .align(Alignment.CenterHorizontally)
                .padding(top = 4.dp, bottom = 6.dp)
        )

        if (page == "root") {
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

            // ── Library group ───────────────────────────────────────────
            SheetSeparator(hairline)
            SheetItem(MqIcons.ListMusic, "Добавить в плейлист", text, textMuted) { page = "playlists" }
            SheetItem(
                MqIcons.Heart, if (isLiked) "Убрать лайк" else "Лайк",
                if (isLiked) accent else text, textMuted
            ) { onToggleLike(); onDismiss() }

            // ── Navigate group ──────────────────────────────────────────
            SheetSeparator(hairline)
            SheetItem(MqIcons.User, "Перейти к артисту", text, textMuted) {
                onOpenArtist(track.artist); onDismiss()
            }

            // ── Share group ─────────────────────────────────────────────
            SheetSeparator(hairline)
            SheetItem(MqIcons.Share2, "Поделиться", text, textMuted) {
                runCatching {
                    context.startActivity(
                        Intent.createChooser(
                            Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(
                                    Intent.EXTRA_TEXT,
                                    "Слушайте «${track.title}» — ${track.artist} на MQ Player"
                                )
                            },
                            "Поделиться"
                        )
                    )
                }
                onDismiss()
            }
            SheetItem(MqIcons.FileText, "Копировать название", text, textMuted) {
                clipboard.setText(AnnotatedString(track.title))
                onDismiss()
            }

            // ── contextual destructive ──────────────────────────────────
            if (onRemoveFromQueue != null || onRemoveFromPlaylist != null) {
                SheetSeparator(hairline)
                if (onRemoveFromQueue != null) {
                    SheetItem(MqIcons.Trash2, "Убрать из очереди", error, error) {
                        onRemoveFromQueue(); onDismiss()
                    }
                }
                if (onRemoveFromPlaylist != null) {
                    SheetItem(MqIcons.Trash2, "Убрать из плейлиста", error, error) {
                        onRemoveFromPlaylist(); onDismiss()
                    }
                }
            }
        } else {
            // ── playlists sub-page ──────────────────────────────────────
            Text(
                "Добавить в плейлист",
                style = MqType.label,
                color = textMuted,
                modifier = Modifier.padding(start = 10.dp, top = 8.dp, bottom = 4.dp)
            )
            playlists.forEach { pl ->
                SheetItem(MqIcons.ListMusic, pl.name, text, textMuted) {
                    onAddToPlaylist(pl.id); onDismiss()
                }
            }
            SheetSeparator(hairline)
            SheetItem(MqIcons.Plus, "Новый плейлист", text, textMuted) {
                onCreatePlaylistAndAdd(); onDismiss()
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
            .height(48.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        MqIcon(icon = icon, size = 18.dp, tint = iconTint)
        Text(
            label,
            style = MqType.menu.copy(fontSize = 14.sp),
            color = labelColor,
            maxLines = 1,
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
