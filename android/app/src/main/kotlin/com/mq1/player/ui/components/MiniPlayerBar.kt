package com.mq1.player.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mq1.player.ui.theme.MqType

/**
 * WEB PARITY — exact port of the web MobileDock mini player
 * (src/components/mq/MobileDock.tsx, "Mini player" block):
 *
 *  ┌ 3dp progress track (glass bg) + accent fill, full dock width
 *  ├ 60dp row, 12dp horizontal padding, 8dp gaps
 *  │   [38×38 cover, r6] [title mq-t-body 600 / artist mq-t-meta-2 /
 *  │   time mq-t-num tabular]  (like 44dp circle) (play 44dp accent circle)
 *
 *  - title 13/600, line-height 1.2, single-line ellipsis
 *  - artist 11/500 muted, +1dp; time 11/600 tabular muted 85%, +1dp
 *  - like: Heart 18dp, accent + filled when liked, 12% accent bg
 *  - play: accent circle 44dp, 16dp filled icon white (play optically
 *    centered +1dp), buffering → 16dp white spinner
 *  - tap anywhere on the row → Full Player
 *
 * Same long-title invariants as TrackRow (weight(1f) + ellipsis,
 * fixed-size controls).
 */
@Composable
fun MiniPlayerBar(
    title: String,
    artist: String,
    artwork: String?,
    isPlaying: Boolean,
    isLiked: Boolean,
    isBuffering: Boolean,
    positionMs: Long,
    durationMs: Long,
    progress: Float,
    onToggle: () -> Unit,
    onToggleLike: () -> Unit,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier
) {
    val accent = MaterialTheme.colorScheme.primary
    val text = MaterialTheme.colorScheme.onBackground
    val textMuted = MaterialTheme.colorScheme.onSurfaceVariant
    val trackColor = MaterialTheme.colorScheme.surfaceVariant

    Column(modifier = modifier.fillMaxWidth()) {
        // ── 3dp progress track + accent fill (web .mq-dock-progress-track) ──
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(trackColor)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(progress.coerceIn(0f, 1f))
                    .height(3.dp)
                    .background(accent)
            )
        }

        // ── 60dp content row ──────────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(60.dp)
                .clickable(onClick = onOpen)
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Artwork(url = artwork, sizeDp = 38, corner = 6, contentDescription = null)

            Spacer(Modifier.width(10.dp))

            Column(
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    title,
                    style = MqType.body.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.W600),
                    color = text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    artist,
                    style = MqType.meta2,
                    color = textMuted,
                    modifier = Modifier.padding(top = 1.dp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    timeLabel(positionMs, durationMs),
                    style = MqType.num,
                    color = textMuted.copy(alpha = 0.85f),
                    modifier = Modifier.padding(top = 1.dp),
                    maxLines = 1
                )
            }

            Spacer(Modifier.width(8.dp))

            // ── like: 44dp circle, Heart 18dp (web parity) ────────────────
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(if (isLiked) accent.copy(alpha = 0.12f) else Color.Transparent)
                    .clickable(onClick = onToggleLike),
                contentAlignment = Alignment.Center
            ) {
                MqIcon(
                    icon = MqIcons.Heart,
                    size = 18.dp,
                    tint = if (isLiked) accent else textMuted,
                    fill = isLiked,
                    strokeWidth = 2f,
                )
            }

            // ── play/pause: 44dp accent circle, 16dp filled white icon ────
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(accent)
                    .clickable(onClick = onToggle),
                contentAlignment = Alignment.Center
            ) {
                if (isBuffering) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = Color.White
                    )
                } else if (isPlaying) {
                    MqIcon(
                        icon = MqIcons.Pause,
                        size = 16.dp,
                        tint = Color.White,
                        fill = true,
                        strokeWidth = 0f,
                    )
                } else {
                    // web: ml-0.5 optical centering of the play triangle
                    MqIcon(
                        icon = MqIcons.Play,
                        size = 16.dp,
                        tint = Color.White,
                        fill = true,
                        strokeWidth = 0f,
                        modifier = Modifier.offset(x = 1.dp)
                    )
                }
            }
        }
    }
}

/** `cur / total` in the web mq-t-num tabular format. */
private fun timeLabel(positionMs: Long, durationMs: Long): String {
    val cur = (positionMs.coerceAtLeast(0L) / 1000L).toInt()
    val total = (durationMs.coerceAtLeast(0L) / 1000L).toInt()
    return if (total > 0) "${formatDuration(cur)} / ${formatDuration(total)}" else formatDuration(cur)
}
