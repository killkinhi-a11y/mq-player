package com.mq1.player.ui.wave

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Kotlin port of src/components/mq/wave-ambient-palette.ts (pure colour math
 * of the web WAVE liquid scene). Golden cases: shared/test-fixtures/wave-palette.cases.json.
 * Channels are 0..255 doubles (like the web Float32 uniforms).
 */
data class WavePalette(val c1: DoubleArray3, val c2: DoubleArray3, val c3: DoubleArray3, val hl: DoubleArray3) {
    fun toCss(): Map<String, String> = mapOf("c1" to hex(c1), "c2" to hex(c2), "c3" to hex(c3), "hl" to hex(hl))

    companion object {
        const val PALETTE_LERP_MS = 950
        const val DEFAULT_ANCHOR_HUE = 226
        val DEFAULT = WavePalette(DoubleArray3(7.0, 11.0, 22.0), DoubleArray3(18.0, 36.0, 72.0), DoubleArray3(38.0, 30.0, 84.0), DoubleArray3(214.0, 226.0, 255.0))
        private const val COLD_HUE = 226.0 / 360.0

        fun hex(c: DoubleArray3): String = "#" + listOf(c.r, c.g, c.b).joinToString("") {
            jsRound(it).coerceIn(0, 255).toString(16).padStart(2, '0')
        }

        /** JS Math.round (half up, also for negatives) — Kotlin roundToInt is half-even-ish for .5 on negatives. */
        private fun jsRound(v: Double): Int = kotlin.math.floor(v + 0.5).toInt()

        fun hexToRgb(hex: String): DoubleArray3 {
            val m = Regex("^#?([0-9a-fA-F]{6})$").find(hex.trim()) ?: return DoubleArray3(0.0, 0.0, 0.0)
            val n = m.groupValues[1].toInt(16)
            return DoubleArray3(((n shr 16) and 255).toDouble(), ((n shr 8) and 255).toDouble(), (n and 255).toDouble())
        }

        fun rgbToHsl(r: Double, g: Double, b: Double): Triple<Double, Double, Double> {
            val rn = r / 255; val gn = g / 255; val bn = b / 255
            val mx = max(rn, max(gn, bn)); val mn = min(rn, min(gn, bn))
            val l = (mx + mn) / 2
            if (mx == mn) return Triple(0.0, 0.0, l)
            val d = mx - mn
            val s = if (l > 0.5) d / (2 - mx - mn) else d / (mx + mn)
            val h = when (mx) {
                rn -> ((gn - bn) / d + (if (gn < bn) 6 else 0)) / 6
                gn -> ((bn - rn) / d + 2) / 6
                else -> ((rn - gn) / d + 4) / 6
            }
            return Triple(h, s, l)
        }

        fun hslToRgb(h: Double, s: Double, l: Double): DoubleArray3 {
            if (s == 0.0) { val v = jsRound(l * 255).toDouble(); return DoubleArray3(v, v, v) }
            val hue = ((h % 1) + 1) % 1
            val q = if (l < 0.5) l * (1 + s) else l + s - l * s
            val p = 2 * l - q
            fun f(t0: Double): Double {
                var t = t0
                if (t < 0) t += 1
                if (t > 1) t -= 1
                return when {
                    t < 1.0 / 6 -> p + (q - p) * 6 * t
                    t < 1.0 / 2 -> q
                    t < 2.0 / 3 -> p + (q - p) * (2.0 / 3 - t) * 6
                    else -> p
                }
            }
            return DoubleArray3(jsRound(f(hue + 1.0 / 3) * 255).toDouble(), jsRound(f(hue) * 255).toDouble(), jsRound(f(hue - 1.0 / 3) * 255).toDouble())
        }

        private fun clamp(v: Double, lo: Double, hi: Double) = min(hi, max(lo, v))

        private fun cap(c: DoubleArray3, maxChannel: Double): DoubleArray3 {
            val m = max(c.r, max(c.g, c.b))
            if (m <= maxChannel) return c
            val k = maxChannel / m
            return DoubleArray3(c.r * k, c.g * k, c.b * k)
        }

        fun derive(primaryHex: String?, anchorHueDeg: Double? = null): WavePalette {
            val primary = hexToRgb(primaryHex?.takeIf { it.isNotEmpty() } ?: "#3355ff")
            val (h, s, _) = rgbToHsl(primary.r, primary.g, primary.b)
            val achromatic = s < 0.16
            val anchor = if (anchorHueDeg != null && anchorHueDeg.isFinite()) (((anchorHueDeg % 360) + 360) % 360) / 360 else COLD_HUE
            val base = if (achromatic) anchor else h
            val warm = base > 30.0 / 360 && base < 75.0 / 360
            fun sat(mult: Double, lo: Double, hi: Double, extra: Double = 1.0) = clamp(clamp(s * mult, lo, hi) * extra, 0.0, 1.0)
            val c1 = hslToRgb(base, sat(0.55, 0.14, 0.42), 0.05 + 0.025 * s)
            val c2 = hslToRgb(base, sat(0.8, 0.28, 0.58, if (warm) 0.72 else 1.0), 0.185 + (if (s > 0.5) 0.045 else 0.015))
            var c3Hue = base
            if (!achromatic && base > 180.0 / 360 && base < 300.0 / 360) c3Hue = (base + 24.0 / 360) % 1
            val c3 = hslToRgb(c3Hue, sat(0.7, 0.22, 0.5, if (warm) 0.75 else 1.0), 0.125)
            val hl = hslToRgb(base, sat(0.22, 0.05, 0.18), 0.83)
            return WavePalette(cap(c1, 40.0), cap(c2, 78.0), cap(c3, 56.0), hl)
        }

        fun forHue(hueDeg: Double): WavePalette {
            val norm = ((jsRound(hueDeg) % 360) + 360) % 360
            if (norm == DEFAULT_ANCHOR_HUE) return DEFAULT
            val h = norm / 360.0
            val warm = h > 30.0 / 360 && h < 75.0 / 360
            val sat = if (warm) 0.36 else 0.46
            return WavePalette(
                cap(hslToRgb(h, 0.3, 0.062), 40.0),
                cap(hslToRgb(h, sat, 0.19), 78.0),
                cap(hslToRgb((h + 24.0 / 360) % 1, 0.38, 0.13), 56.0),
                hslToRgb(h, 0.12, 0.83),
            )
        }

        fun lerp(a: WavePalette, b: WavePalette, t: Double): WavePalette {
            fun l(x: DoubleArray3, y: DoubleArray3) = DoubleArray3(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t)
            return WavePalette(l(a.c1, b.c1), l(a.c2, b.c2), l(a.c3, b.c3), l(a.hl, b.hl))
        }
    }
}

data class DoubleArray3(val r: Double, val g: Double, val b: Double) {
    fun toArgb(alpha: Int = 255): Int =
        (alpha shl 24) or (r.roundToInt().coerceIn(0, 255) shl 16) or (g.roundToInt().coerceIn(0, 255) shl 8) or b.roundToInt().coerceIn(0, 255)
}
