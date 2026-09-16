package com.mq1.player.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.mq1.player.data.MqUrls
import com.mq1.player.data.api.Track
import com.mq1.player.ui.theme.MqType

/**
 * Artwork with deterministic gradient placeholder — no layout shift while
 * the image loads, fixed size everywhere.
 */
@Composable
fun Artwork(
    url: String?,
    sizeDp: Int,
    modifier: Modifier = Modifier,
    corner: Int = 8,
    contentDescription: String? = null
) {
    val shape = RoundedCornerShape(corner.dp)
    // P0 fix: backend covers are origin-relative ("/api/music/soundcloud/
    // image-proxy?...") — resolve against API_BASE exactly like the web
    // browser does, otherwise Coil can never load them.
    val resolvedUrl = remember(url) { MqUrls.absolute(url) }
    Box(
        modifier = modifier
            .size(sizeDp.dp)
            .clip(shape)
            .background(placeholderGradient(url.hashCode())),
        contentAlignment = Alignment.Center
    ) {
        if (resolvedUrl != null) {
            AsyncImage(
                model = coil.request.ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current)
                    .data(resolvedUrl)
                    .crossfade(true)
                    .size(sizeDp.coerceAtMost(512))
                    .build(),
                contentDescription = contentDescription,
                modifier = Modifier.size(sizeDp.dp).clip(shape),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop
            )
        } else {
            MqIcon(
                icon = MqIcons.Music,
                size = (sizeDp / 2.5).dp,
                tint = Color.White.copy(alpha = 0.7f)
            )
        }
    }
}

private fun placeholderGradient(seed: Int): Brush {
    val hue = ((seed % 360) + 360) % 360
    val c1 = Color.hsv(hue.toFloat(), 0.45f, 0.28f)
    val c2 = Color.hsv(((hue + 40) % 360).toFloat(), 0.4f, 0.38f)
    return Brush.linearGradient(listOf(c1, c2))
}

/**
 * LONG-TITLE-SAFE track row (P20.6).
 *
 * Invariants, verified by the automated regression matrix
 * (50/100/147/300 chars, no-space, RTL, emoji, long-artist):
 *   1. artwork fixed-size (48dp) — never scales
 *   2. title & artist: weight(1f) + maxLines=1 + Ellipsis — the ONLY text
 *      truncation primitive; row width never grows
 *   3. action targets fixed-size (44-48dp), always visible & clickable
 *   4. Row uses fixed structure — no wrap_content traps, no horizontal
 *      scroll; RTL-safe via start/end semantics
 *   5. duration fixed column, never overlapped
 */
@Composable
fun TrackRow(
    track: Track,
    isPlaying: Boolean,
    isFavorite: Boolean,
    onPlay: () -> Unit,
    onFavorite: (() -> Unit)? = null,
    onMenu: (() -> Unit)? = null,
    onOpenArtist: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onPlay)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // web list row: 50×50 art, r8
        Artwork(url = track.cover, sizeDp = 50, corner = 8)

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            // mq-t-track 14/600
            Text(
                text = track.title.ifBlank { "Без названия" },
                style = MqType.track,
                color = if (isPlaying) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.semantics {
                    contentDescription = "Трек: ${track.title}"
                }
            )
            // mq-t-artist 13/500 — web rows link the artist name
            Text(
                text = track.artist.ifBlank { "Неизвестный исполнитель" },
                style = MqType.artist,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = if (onOpenArtist != null && track.artist.isNotBlank()) {
                    Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .clickable { onOpenArtist(track.artist) }
                        .semantics { contentDescription = "Артист: ${track.artist}" }
                } else Modifier
            )
        }

        if (onMenu == null) {
            // mq-t-num tabular — duration only when no menu button (web rows
            // in the compact list keep duration; hero/menu rows drop it)
            Text(
                text = formatDuration(track.durationInt),
                style = MqType.num,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp)
            )
        }

        if (onFavorite != null) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(50))
                    .clickable(onClick = onFavorite)
                    .semantics { contentDescription = "Нравится: ${track.title}" },
                contentAlignment = Alignment.Center
            ) {
                MqIcon(
                    icon = MqIcons.Heart,
                    size = 18.dp,
                    tint = if (isFavorite) MaterialTheme.colorScheme.primary
                           else MaterialTheme.colorScheme.onSurfaceVariant,
                    fill = isFavorite,
                )
            }
        }

        if (onMenu != null) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(50))
                    .clickable(onClick = onMenu)
                    .semantics { contentDescription = "Меню трека" },
                contentAlignment = Alignment.Center
            ) {
                MqIcon(
                    icon = MqIcons.MoreHorizontal,
                    size = 20.dp,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** 125 → "2:05" */
fun formatDuration(totalSeconds: Int): String {
    val s = totalSeconds.coerceAtLeast(0)
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, sec) else "%d:%02d".format(m, sec)
}

/** Deterministic gradient cover for playlists (web fallback when a
 *  playlist has no uploaded cover — parity with PlaylistArtwork.tsx). */
fun gradientCover(seed: Int): Brush = placeholderGradient(seed)
