package com.mq1.player.mixer

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.mq1.player.dsp.MeterSnapshot
import com.mq1.player.dsp.MixerDsp
import com.mq1.player.dsp.MixerParams
import com.mq1.player.player.MqAudioProcessor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val Context.mixerDataStore by preferencesDataStore(name = "mq_mixer_v1")

/**
 * F10 — single owner of the mixer state, shared by the service (audio
 * processors read the DSP directly) and the UI (params/meters flows).
 *
 *  - params: StateFlow<MixerParams>; every change is applied to the DSP
 *    immediately (atomic snapshot swap — audio thread reads it lock-free)
 *    and persisted to DataStore (debounced, survives restarts)
 *  - meters: a 100 ms poller moves real DSP snapshots (AtomicReference,
 *    written by the audio thread at a bounded rate) into a StateFlow for
 *    Compose. No audio → meters report the silence floor (honest).
 */
class MixerEngine(
    private val context: Context,
    private val scope: CoroutineScope
) {

    val dsp = MixerDsp()
    val processor = MqAudioProcessor(dsp)

    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class Persisted(
        val bypass: Boolean = true,
        val masterGainDb: Float = 0f,
        val eqEnabled: Boolean = false,
        val eqGains: List<Float> = List(10) { 0f },
        val limiterEnabled: Boolean = false,
        val limiterThresholdDb: Float = -1f,
        val limiterReleaseMs: Float = 150f
    )

    private val _params = MutableStateFlow(MixerParams())
    val params: StateFlow<MixerParams> = _params.asStateFlow()

    private val _meters = MutableStateFlow(MeterSnapshot())
    val meters: StateFlow<MeterSnapshot> = _meters.asStateFlow()

    private var persistJob: Job? = null
    private var meterJob: Job? = null

    init {
        // Restore persisted settings (once), then keep meters flowing.
        scope.launch {
            val saved = runCatching {
                context.mixerDataStore.data.firstOrNull()?.get(KEY)
                    ?.let { json.decodeFromString<Persisted>(it) }
            }.getOrNull()
            if (saved != null) {
                val restored = MixerParams(
                    bypass = saved.bypass,
                    masterGainDb = saved.masterGainDb,
                    eqEnabled = saved.eqEnabled,
                    eqGains = saved.eqGains.ifEmpty { List(10) { 0f } },
                    limiterEnabled = saved.limiterEnabled,
                    limiterThresholdDb = saved.limiterThresholdDb,
                    limiterReleaseMs = saved.limiterReleaseMs
                )
                _params.value = restored
                dsp.setParams(restored)
            }
        }
        meterJob = scope.launch {
            while (true) {
                _meters.value = dsp.meterRef.get()
                delay(100)
            }
        }
    }

    // ── Public setters (all apply immediately + persist debounced) ──────────

    fun update(transform: (MixerParams) -> MixerParams) {
        val next = transform(_params.value)
        _params.value = next
        dsp.setParams(next)
        schedulePersist()
    }

    fun setBypass(bypass: Boolean) = update { it.copy(bypass = bypass) }

    /** Master gain in dB (-30..+6; 0 dB = unity = 100 %). */
    fun setMasterGainDb(db: Float) = update { it.copy(masterGainDb = db.coerceIn(-30f, 6f)) }

    /** Master gain as linear percent (display only): 0 dB → 100 %, +6 → 200 %. */
    fun masterGainPercent(): Int =
        (com.mq1.player.dsp.dbToLinear(_params.value.masterGainDb) * 100f).toInt()

    fun setEqEnabled(enabled: Boolean) = update { it.copy(eqEnabled = enabled) }

    fun setEqBand(index: Int, gainDb: Float) = update { p ->
        val gains = p.eqGains.toMutableList()
        if (index in gains.indices) gains[index] = gainDb.coerceIn(-12f, 12f)
        p.copy(eqGains = gains)
    }

    fun setEqGains(gains: List<Float>) = update { p ->
        p.copy(eqGains = List(10) { i -> gains.getOrNull(i)?.coerceIn(-12f, 12f) ?: 0f })
    }

    fun setLimiterEnabled(enabled: Boolean) = update { it.copy(limiterEnabled = enabled) }

    fun setLimiterThreshold(db: Float) =
        update { it.copy(limiterThresholdDb = db.coerceIn(-12f, 0f)) }

    fun setLimiterRelease(ms: Float) =
        update { it.copy(limiterReleaseMs = ms.coerceIn(50f, 1000f)) }

    fun applyPreset(gains: List<Float>) = update { p ->
        p.copy(eqEnabled = true, eqGains = List(10) { i -> gains.getOrNull(i) ?: 0f })
    }

    /** Full reset: bypass off → actually everything back to defaults. */
    fun reset() {
        val next = MixerParams()
        _params.value = next
        dsp.setParams(next)
        schedulePersist()
    }

    private fun schedulePersist() {
        persistJob?.cancel()
        persistJob = scope.launch {
            delay(600) // debounce rapid UI changes
            val p = _params.value
            runCatching {
                context.mixerDataStore.edit { prefs ->
                    prefs[KEY] = json.encodeToString(
                        Persisted(
                            bypass = p.bypass,
                            masterGainDb = p.masterGainDb,
                            eqEnabled = p.eqEnabled,
                            eqGains = p.eqGains,
                            limiterEnabled = p.limiterEnabled,
                            limiterThresholdDb = p.limiterThresholdDb,
                            limiterReleaseMs = p.limiterReleaseMs
                        )
                    )
                }
            }
        }
    }

    companion object {
        private val KEY = stringPreferencesKey("mixer_params_v1")
    }
}
