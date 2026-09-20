package com.mq1.player.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.mq1.player.dsp.EqSpec
import com.mq1.player.dsp.MeterSnapshot
import com.mq1.player.dsp.MixerParams
import com.mq1.player.ui.components.SectionHeader
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import com.mq1.player.ui.theme.MqType
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.components.MqIcon

/**
 * F10 — native Android mixer control surface (NOT a web imitation):
 *  - Meters: REAL DSP measurements (peak / true-peak / LUFS / GR) — silence
 *    shows the floor, never an animation
 *  - Master gain fader (dB scale, -30..+6)
 *  - 10-band EQ: 2×5 vertical fader grid, full-size touch targets, drag +
 *    double-tap-reset (web-parity bands/presets)
 *  - Lookahead limiter (threshold/release)
 *  - Presets, full reset, bypass — all persisted
 *
 * Touch targets: every interactive element ≥ 44dp (faders 56×188dp, chips
 * and switches 44dp+). Visual density stays compact where safe.
 */
@Composable
fun MixerScreen(onBack: () -> Unit) {
    val mixer = com.mq1.player.di.ServiceLocator.mixerEngine
    val params by mixer.params.collectAsState()
    val meters by mixer.meters.collectAsState()

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        // ── Header ──────────────────────────────────────────────────────
        // UX pass 2.3.5: real status-bar inset (was fixed 52dp fake)
        Spacer(Modifier.statusBarsPadding())
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(44.dp).clickable(onClick = onBack),
                contentAlignment = Alignment.Center
            ) {
                MqIcon(
                    icon = MqIcons.ArrowLeft, size = 22.dp,
                    tint = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.semantics { contentDescription = "Назад" }
                )
            }
            Column(Modifier.weight(1f).padding(start = 4.dp)) {
                Text(
                    "Эквалайзер",
                    style = MqType.page,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Text(
                    "10 полос · обработка " + if (params.bypass) "выкл" else "вкл",
                    style = MqType.meta2,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            // Bypass — 44dp row switch
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .height(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { mixer.setBypass(!params.bypass) }
                    .padding(horizontal = 8.dp)
                    .semantics { contentDescription = if (params.bypass) "Обработка выключена" else "Обработка включена" }
            ) {
                Text(
                    if (params.bypass) "Обход" else "Активно",
                    style = MqType.btn,
                    color = if (params.bypass) MaterialTheme.colorScheme.onSurfaceVariant
                    else MaterialTheme.colorScheme.primary
                )
                Spacer(Modifier.width(6.dp))
                Switch(
                    checked = !params.bypass,
                    onCheckedChange = { mixer.setBypass(!it) }
                )
            }
            IconButton(
                onClick = { mixer.reset() },
                modifier = Modifier
                    .size(44.dp)
                    .semantics { contentDescription = "Сбросить микшер" }
            ) {
                MqIcon(
                    icon = MqIcons.RefreshCw, size = 20.dp,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // ── EQ ──────────────────────────────────────────────────────────
        Spacer(Modifier.height(16.dp))
        SectionHeader(
            title = "Эквалайзер · 10 полос",
            trailing = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.height(44.dp)
                ) {
                    Text("Вкл", style = MqType.meta,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Switch(
                        checked = params.eqEnabled,
                        onCheckedChange = { mixer.setEqEnabled(it) }
                    )
                }
            }
        )
        if (params.eqEnabled) {
            // 2 rows × 5 faders: 56dp wide each (≥44dp target), 160dp track
            Column(Modifier.padding(horizontal = 12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    EqSpec.BANDS.take(5).forEachIndexed { i, band ->
                        EqFader(
                            label = band.label,
                            gain = params.eqGains.getOrElse(i) { 0f },
                            onGain = { mixer.setEqBand(i, it) },
                            onReset = { mixer.setEqBand(i, 0f) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    EqSpec.BANDS.drop(5).forEachIndexed { i, band ->
                        EqFader(
                            label = band.label,
                            gain = params.eqGains.getOrElse(i + 5) { 0f },
                            onGain = { mixer.setEqBand(i + 5, it) },
                            onReset = { mixer.setEqBand(i + 5, 0f) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
            // presets
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                EqSpec.PRESETS.forEach { (name, gains) ->
                    val active = params.eqGains == gains
                    val accent = MaterialTheme.colorScheme.primary
                    val card = MaterialTheme.colorScheme.surface
                    val border = MaterialTheme.colorScheme.outline
                    Box(
                        Modifier
                            .height(44.dp)
                            .clip(RoundedCornerShape(22.dp))
                            .background(if (active) accent.copy(alpha = 0.16f) else card)
                            .border(
                                1.dp,
                                if (active) accent.copy(alpha = 0.4f) else border.copy(alpha = 0.4f),
                                RoundedCornerShape(22.dp)
                            )
                            .clickable { mixer.applyPreset(gains) }
                            .padding(horizontal = 14.dp),
                        contentAlignment = androidx.compose.ui.Alignment.Center
                    ) {
                        Text(
                            name,
                            style = MqType.meta,
                            color = if (active) accent else MaterialTheme.colorScheme.onBackground
                        )
                    }
                }
            }
        }

        // ── Meters (real DSP data) ──────────────────────────────────────
        Spacer(Modifier.height(12.dp))
        MeterPanel(meters)

        // ── Master ──────────────────────────────────────────────────────
        Spacer(Modifier.height(16.dp))
        SectionHeader("Общий уровень")
        Column(Modifier.padding(horizontal = 20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Мастер",
                    style = MqType.body,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    formatDb(params.masterGainDb),
                    style = MqType.track,
                    color = if (params.masterGainDb != 0f) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "${mixer.masterGainPercent()} %",
                    style = MqType.meta,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            // Fader with 44dp tall interaction area
            Slider(
                value = params.masterGainDb,
                onValueChange = { mixer.setMasterGainDb(it) },
                valueRange = -30f..6f,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .semantics { contentDescription = "Общая громкость, децибелы" }
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("-30 dB", style = MqType.meta2,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("0 dB", style = MqType.meta2,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("+6 dB", style = MqType.meta2,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // ── Limiter ─────────────────────────────────────────────────────
        Spacer(Modifier.height(16.dp))
        SectionHeader(
            title = "Лимитер",
            trailing = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.height(44.dp)
                ) {
                    Text("Вкл", style = MqType.meta,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Switch(
                        checked = params.limiterEnabled,
                        onCheckedChange = { mixer.setLimiterEnabled(it) }
                    )
                }
            }
        )
        if (params.limiterEnabled) {
            Column(Modifier.padding(horizontal = 20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Порог", style = MqType.body,
                        modifier = Modifier.weight(1f))
                    Text(formatDb(params.limiterThresholdDb),
                        style = MqType.track)
                }
                Slider(
                    value = params.limiterThresholdDb,
                    onValueChange = { mixer.setLimiterThreshold(it) },
                    valueRange = -12f..0f,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp)
                        .semantics { contentDescription = "Порог лимитера, децибелы" }
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Восстановление", style = MqType.body,
                        modifier = Modifier.weight(1f))
                    Text(
                        "${params.limiterReleaseMs.roundToInt()} мс",
                        style = MqType.track
                    )
                }
                Slider(
                    value = params.limiterReleaseMs,
                    onValueChange = { mixer.setLimiterRelease(it) },
                    valueRange = 50f..1000f,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp)
                        .semantics { contentDescription = "Время восстановления лимитера" }
                )
            }
        }

        Spacer(Modifier.height(32.dp))
    }
}

// ── Meters panel ─────────────────────────────────────────────────────────────

@Composable
private fun MeterPanel(meters: MeterSnapshot) {
    Card(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MqIcon(
                    icon = MqIcons.AudioLines, size = 20.dp,
                    tint = if (meters.active) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "Измерения",
                    style = MqType.btn,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.weight(1f))
                if (!meters.active) {
                    Text(
                        "тишина",
                        style = MqType.meta,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Text(
                        "${meters.sampleRate} Гц · ${meters.channels} кан.",
                        style = MqType.meta2,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            DbMeterRow("Пик", meters.peakDb, -60f..0f)
            DbMeterRow("Истинный пик", meters.truePeakDb, -60f..0f)
            DbMeterRow("LUFS (мгнов.)", meters.momentaryLufs, -60f..0f)
            DbMeterRow("LUFS (3 с)", meters.shortTermLufs, -60f..0f)
            // GR: inverse direction (0 dB = no reduction)
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(44.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Снижение усиления", style = MqType.body,
                    modifier = Modifier.weight(1f))
                Text(
                    if (meters.gainReductionDb > 0.05f) "-${"%.1f".format(meters.gainReductionDb)} dB"
                    else "0 dB",
                    style = MaterialTheme.typography.titleSmall,
                    color = if (meters.gainReductionDb > 0.05f) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

/** Horizontal dB meter row: label + value + bar (real data only). */
@Composable
private fun DbMeterRow(label: String, db: Float, range: ClosedFloatingPointRange<Float>) {
    Row(
        Modifier
            .fillMaxWidth()
            .height(44.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            label,
            style = MqType.body,
            modifier = Modifier.width(118.dp)
        )
        Text(
            if (db <= -89.9f) "—" else "${"%.1f".format(db)}",
            style = MqType.btn,
            textAlign = TextAlign.End,
            modifier = Modifier.width(56.dp),
            color = when {
                db > -0.2f -> MaterialTheme.colorScheme.error
                db > -6f -> MaterialTheme.colorScheme.primary
                else -> MaterialTheme.colorScheme.onSurface
            }
        )
        LinearDbBar(db, range, Modifier.weight(1f))
    }
}

@Composable
private fun LinearDbBar(db: Float, range: ClosedFloatingPointRange<Float>, modifier: Modifier) {
    val fraction = ((db - range.start) / (range.endInclusive - range.start))
        .coerceIn(0f, 1f)
    Box(
        modifier
            .height(8.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Box(
            Modifier
                .fillMaxWidth(fraction)
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(
                    if (fraction > 0.95f) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.primary
                )
        )
    }
}

// ── Vertical EQ fader (native control, full hitbox) ─────────────────────────

@Composable
private fun EqFader(
    label: String,
    gain: Float,
    onGain: (Float) -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier
) {
    val density = LocalDensity.current
    val trackHeight = 150.dp
    val trackHeightPx = with(density) { trackHeight.toPx() }
    val range = 24f // -12..+12

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            formatSignedDb(gain),
            style = MqType.meta2,
            color = if (gain > 0.05f || gain < -0.05f) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(2.dp))
        Box(
            Modifier
                .width(52.dp)
                .height(trackHeight)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .border(
                    1.dp,
                    MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                    RoundedCornerShape(8.dp)
                )
                .pointerInput(Unit) {
                    detectTapGestures(onDoubleTap = { onReset() })
                }
                .pointerInput(Unit) {
                    detectDragGestures { change, dragAmount ->
                        change.consume()
                        val deltaDb = (-dragAmount.y / trackHeightPx) * range
                        onGain(gain + deltaDb)
                    }
                }
                .semantics {
                    contentDescription = "Полоса $label, ${formatSignedDb(gain)}. Двойное нажатие — сброс."
                }
        ) {
            // center (0 dB) line
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .align(Alignment.Center)
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
            )
            // fill from center to the thumb position (top-anchored)
            val centerPx = trackHeightPx / 2f
            val offsetPx = (gain / 12f) * centerPx
            val barTop = (centerPx - offsetPx).coerceIn(0f, trackHeightPx) // thumb from top
            val fillHeightPx = abs(barTop - centerPx).coerceIn(0f, trackHeightPx)

            if (fillHeightPx > 1f) {
                val fillTopDp = with(density) { minOf(barTop, centerPx).toDp() }
                val fillHeightDp = with(density) { fillHeightPx.toDp() }
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(fillHeightDp)
                        .align(Alignment.TopStart)
                        .padding(top = fillTopDp)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.55f))
                )
            }
            // thumb
            val thumbTopDp = with(density) { barTop.toDp() } - 11.dp
            Box(
                Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = thumbTopDp.coerceIn(0.dp, trackHeight - 22.dp))
                    .width(40.dp)
                    .height(22.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(MaterialTheme.colorScheme.primary)
                    .border(2.dp, MaterialTheme.colorScheme.surface, RoundedCornerShape(6.dp))
            ) {
                Box(
                    Modifier
                        .align(Alignment.Center)
                        .width(24.dp)
                        .height(2.dp)
                        .background(MaterialTheme.colorScheme.onPrimary)
                )
            }
        }
        Spacer(Modifier.height(2.dp))
        Text(
            label,
            style = MqType.meta2,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            maxLines = 1
        )
    }
}

private fun formatDb(db: Float): String = when {
    db <= -89.9f -> "0 %"
    db >= 0.05f -> "+${db.roundToInt()} dB"
    db <= -0.05f -> "${db.roundToInt()} dB"
    else -> "0 dB"
}

private fun formatSignedDb(db: Float): String = when {
    abs(db) < 0.05f -> "0"
    db > 0 -> "+%.1f".format(Locale.US, db)
    else -> "%.1f".format(Locale.US, db)
}
