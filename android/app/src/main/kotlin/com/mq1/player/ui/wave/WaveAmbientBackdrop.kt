package com.mq1.player.ui.wave

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.mq1.player.ui.theme.LocalMqPalette

/**
 * Static Compose counterpart of the web WAVE liquid scene
 * (WaveAmbientBackground.tsx). Same palette math (WavePalette ⇄
 * wave-ambient-palette.ts), same theme inputs (ambient.waveBase / waveHue),
 * same 950 ms palette cross-fade. Deliberately NOT a shader: no WebGL /
 * per-frame work on Android — three soft light pools over the dark base.
 *
 * @param primaryHex dominant artwork colour when known; null → theme anchor hue.
 */
@Composable
fun WaveAmbientBackdrop(primaryHex: String?, modifier: Modifier = Modifier) {
    val theme = LocalMqPalette.current
    val target = if (primaryHex != null) WavePalette.derive(primaryHex, theme.waveHue.toDouble())
                 else WavePalette.forHue(theme.waveHue.toDouble())
    val spec = tween<Color>(WavePalette.PALETTE_LERP_MS)
    val c1 by animateColorAsState(Color(target.c1.toArgb()), spec, label = "wave-c1")
    val c2 by animateColorAsState(Color(target.c2.toArgb()), spec, label = "wave-c2")
    val c3 by animateColorAsState(Color(target.c3.toArgb()), spec, label = "wave-c3")
    val hl by animateColorAsState(Color(target.hl.toArgb()), spec, label = "wave-hl")
    val base = theme.waveBase
    Canvas(modifier.fillMaxSize()) {
        drawRect(Brush.verticalGradient(listOf(c1, base)))
        val r = size.maxDimension
        drawRect(Brush.radialGradient(listOf(c2.copy(alpha = 0.55f), Color.Transparent), Offset(size.width * 0.18f, size.height * 0.12f), r * 0.75f))
        drawRect(Brush.radialGradient(listOf(c3.copy(alpha = 0.45f), Color.Transparent), Offset(size.width * 0.92f, size.height * 0.38f), r * 0.6f))
        drawRect(Brush.radialGradient(listOf(hl.copy(alpha = 0.06f), Color.Transparent), Offset(size.width * 0.5f, 0f), r * 0.5f))
    }
}
