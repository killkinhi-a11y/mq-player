package com.mq1.player.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * MQ visual language ported from the web `themes.ts`.
 * Dark-first palettes + one light theme; user selects theme + mode
 * (system / light / dark) in Settings. Launch window background is dark
 * (themes.xml) — combined with DayNight-aware status of the activity the
 * app never flashes white on cold start (P20.3 Theme requirement).
 */
data class MqPalette(
    val id: String,
    val name: String,
    val background: Color,
    val surface: Color,
    val surfaceHigh: Color,
    val accent: Color,
    val onAccent: Color,
    val text: Color,
    val textMuted: Color,
    val outline: Color,
    val isDark: Boolean = true
)

val Obsidian = MqPalette(
    id = "default", name = "Obsidian",
    background = Color(0xFF0E0E0E), surface = Color(0xFF1A1A1A),
    surfaceHigh = Color(0xFF252525), accent = Color(0xFFE03131),
    onAccent = Color.White, text = Color(0xFFF5F5F5),
    textMuted = Color(0xFFB8B8B8), outline = Color(0xFF333333)
)

val Abyss = MqPalette(
    id = "ocean", name = "Abyss",
    background = Color(0xFF0A1630), surface = Color(0xFF12203E),
    surfaceHigh = Color(0xFF1A2B4D), accent = Color(0xFF0EA5E9),
    onAccent = Color(0xFF04121F), text = Color(0xFFEDF4FF),
    textMuted = Color(0xFF93A5C4), outline = Color(0xFF233450)
)

val Magenta = MqPalette(
    id = "neon", name = "Magenta",
    background = Color(0xFF12101A), surface = Color(0xFF1B1826),
    surfaceHigh = Color(0xFF252133), accent = Color(0xFFF43F5E),
    onAccent = Color.White, text = Color(0xFFF6F3FA),
    textMuted = Color(0xFFB0A8C2), outline = Color(0xFF2E2940)
)

val Ember = MqPalette(
    id = "sunset", name = "Ember",
    background = Color(0xFF191210), surface = Color(0xFF241A15),
    surfaceHigh = Color(0xFF2F2320), accent = Color(0xFFF97316),
    onAccent = Color(0xFF1B0E05), text = Color(0xFFFBF3EC),
    textMuted = Color(0xFFC0A99C), outline = Color(0xFF3A2B24)
)

val Borealis = MqPalette(
    id = "aurora", name = "Borealis",
    background = Color(0xFF0A1512), surface = Color(0xFF122019),
    surfaceHigh = Color(0xFF1A2B23), accent = Color(0xFF34D399),
    onAccent = Color(0xFF03211A), text = Color(0xFFEAF6F0),
    textMuted = Color(0xFF9BB8AB), outline = Color(0xFF1F3329)
)

val Amoled = MqPalette(
    id = "black", name = "AMOLED",
    background = Color(0xFF000000), surface = Color(0xFF0A0A0A),
    surfaceHigh = Color(0xFF141414), accent = Color(0xFFE03131),
    onAccent = Color.White, text = Color(0xFFEEEEEE),
    textMuted = Color(0xFF9A9A9A), outline = Color(0xFF1E1E1E)
)

val Daylight = MqPalette(
    id = "daylight", name = "Daylight",
    background = Color(0xFFF7F8FA), surface = Color(0xFFFFFFFF),
    surfaceHigh = Color(0xFFEDEFF3), accent = Color(0xFFD9232E),
    onAccent = Color.White, text = Color(0xFF15181D),
    textMuted = Color(0xFF5D6470), outline = Color(0xFFDFE3EA),
    isDark = false
)

val mqThemes: List<MqPalette> =
    listOf(Obsidian, Abyss, Magenta, Ember, Borealis, Amoled, Daylight)

fun paletteById(id: String): MqPalette = mqThemes.firstOrNull { it.id == id } ?: Obsidian

@Composable
fun mqColorScheme(themeId: String, darkMode: String): ColorScheme {
    val systemDark = isSystemInDarkTheme()
    val dark = when (darkMode) {
        "light" -> false
        "dark" -> true
        else -> systemDark
    }
    val palette = paletteById(themeId).let {
        // A light-mode selection falls back to Daylight unless theme is Daylight itself.
        if (!dark && it.isDark && it.id != "daylight") Daylight else it
    }
    return if (palette.isDark) darkSchemeOf(palette) else lightSchemeOf(palette)
}

private fun darkSchemeOf(p: MqPalette) = darkColorScheme(
    primary = p.accent,
    onPrimary = p.onAccent,
    primaryContainer = p.accent.copy(alpha = 0.28f).compositeOver(p.surface),
    onPrimaryContainer = p.text,
    secondary = p.textMuted,
    onSecondary = p.background,
    background = p.background,
    onBackground = p.text,
    surface = p.surface,
    onSurface = p.text,
    surfaceVariant = p.surfaceHigh,
    onSurfaceVariant = p.textMuted,
    outline = p.outline,
    outlineVariant = p.outline,
    error = Color(0xFFFF6B6B),
    onError = Color(0xFF2B0A0A)
)

private fun lightSchemeOf(p: MqPalette) = lightColorScheme(
    primary = p.accent,
    onPrimary = p.onAccent,
    primaryContainer = p.accent.copy(alpha = 0.16f).compositeOver(p.surface),
    onPrimaryContainer = p.text,
    secondary = p.textMuted,
    onSecondary = p.background,
    background = p.background,
    onBackground = p.text,
    surface = p.surface,
    onSurface = p.text,
    surfaceVariant = p.surfaceHigh,
    onSurfaceVariant = p.textMuted,
    outline = p.outline,
    outlineVariant = p.outline,
    error = Color(0xFFC81E1E),
    onError = Color.White
)

private fun Color.compositeOver(base: Color): Color {
    val a = alpha
    return Color(
        red = red * a + base.red * (1 - a),
        green = green * a + base.green * (1 - a),
        blue = blue * a + base.blue * (1 - a),
        alpha = 1f
    )
}
