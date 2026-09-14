package com.mq1.player.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mq1.player.ui.theme.MqType

/**
 * WEB PARITY shared states — Manrope type scale + Lucide icons
 * (Loader2 spin / WifiOff / SearchX), web "mq-state" hierarchy.
 */

/** Loading state — web Loader2 spinner, deterministic height. */
@Composable
fun LoadingState(modifier: Modifier = Modifier, label: String = "Загрузка…") {
    Column(
        modifier = modifier.fillMaxWidth().height(220.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        SpinLoader(size = 36.dp, stroke = 3.dp, tint = MaterialTheme.colorScheme.primary)
        Text(
            label,
            style = MqType.body,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 12.dp)
        )
    }
}

/** Lucide Loader2 with the web .mq-spin rotation. */
@Composable
fun SpinLoader(size: androidx.compose.ui.unit.Dp, stroke: androidx.compose.ui.unit.Dp, tint: Color) {
    val transition = rememberInfiniteTransition(label = "spin")
    val angle by transition.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing)),
        label = "angle"
    )
    Box(Modifier.size(size).rotate(angle)) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxWidth().height(size)) {
            drawArc(
                color = tint,
                startAngle = -90f,
                sweepAngle = 300f,
                useCenter = false,
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = stroke.toPx()),
            )
        }
    }
}

/** Error state with retry — user-comprehensible messages (P20.8). */
@Composable
fun ErrorState(
    message: String,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null
) {
    Column(
        modifier = modifier.fillMaxWidth().height(220.dp).padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        MqIcon(
            icon = MqIcons.WifiOff,
            size = 40.dp,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            message,
            style = MqType.body.copy(fontSize = 15.sp),
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.padding(top = 12.dp)
        )
        if (onRetry != null) {
            Box(modifier = Modifier.padding(top = 16.dp)) {
                WebPrimaryButton(onRetry) { Text("Повторить") }
            }
        }
    }
}

/** Web primary button look (accent bg, r12, 44dp, mq-t-btn). */
@Composable
fun WebPrimaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit
) {
    Row(
        modifier = modifier
            .height(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(
                if (enabled) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
            )
            .clickable(enabled = enabled, onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
        content = content
    )
}

/** Empty state — Lucide SearchX, mq-t-body. */
@Composable
fun EmptyState(message: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().height(180.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        MqIcon(
            icon = MqIcons.SearchX,
            size = 36.dp,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            message,
            style = MqType.body,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 10.dp)
        )
    }
}

/**
 * WEB PARITY section header — port of MainView `Section`:
 * 28×28 icon chip (r12, accent@12% bg + accent@18% inset ring,
 * 14dp Lucide icon) + title mq-text-headline 16/600 + trailing action.
 */
@Composable
fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    icon: LucideIcon? = null,
    trailing: (@Composable () -> Unit)? = null
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (icon != null) {
            val accent = MaterialTheme.colorScheme.primary
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(accent.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                MqIcon(icon = icon, size = 14.dp, tint = accent)
            }
            Spacer(Modifier.width(10.dp))
        }
        Text(
            title,
            style = MqType.section.copy(fontSize = 16.sp),
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        trailing?.invoke()
    }
}
