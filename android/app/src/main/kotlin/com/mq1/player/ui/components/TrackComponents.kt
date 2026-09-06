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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.mq1.player.data.api.Track

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
    Box(
        modifier = modifier
            .size(sizeDp.dp)
            .clip(shape)
            .background(placeholderGradient(url.hashCode())),
        contentAlignment = Alignment.Center
    ) {
        if (!url.isNullOrBlank()) {
            AsyncImage(
                model = coil.request.ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current)
                    .data(url)
                    .crossfade(true)
                    .size(sizeDp.coerceAtMost(512))
                    .build(),
                contentDescription = contentDescription,
                modifier = Modifier.size(sizeDp.dp).clip(shape),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop
            )
        } else {
            Icon(
                Icons.Filled.MusicNote,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.7f),
                modifier = Modifier.size((sizeDp / 2.5).dp)
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
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onPlay)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Artwork(url = track.cover, sizeDp = 48)

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = track.title.ifBlank { "Без названия" },
                style = MaterialTheme.typography.bodyLarge,
                color = if (isPlaying) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.semantics {
                    contentDescription = "Трек: ${track.title}"
                }
            )
            Text(
                text = track.artist.ifBlank { "Неизвестный исполнитель" },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        Text(
            text = formatDuration(track.durationInt),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp)
        )

        if (onFavorite != null) {
            IconButton(
                onClick = onFavorite,
                modifier = Modifier
                    .size(44.dp)
                    .semantics { contentDescription = "Нравится: ${track.title}" }
            ) {
                Icon(
                    imageVector = if (isFavorite) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder,
                    contentDescription = null,
                    tint = if (isFavorite) MaterialTheme.colorScheme.primary
                           else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        if (onMenu != null) {
            IconButton(
                onClick = onMenu,
                modifier = Modifier.size(44.dp)
            ) {
                Icon(
                    Icons.Filled.MoreVert,
                    contentDescription = "Меню трека",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
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
