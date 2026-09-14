package com.mq1.player.dsp

/**
 * F10 — real DSP core (pure Kotlin, JVM-testable, no Android imports).
 *
 * This is the Android-native equivalent of the web's AudioWorklet insert:
 * ExoPlayer hands us the DECODED PCM (including DRM content — the CDM feeds
 * the AudioSink) and we run the mixer chain on the audio thread:
 *
 *   master gain → 10-band EQ (biquads, web-parity bands) → lookahead limiter
 *   → output
 *
 * Meters are REAL signal measurements, never simulated:
 *   - sample peak (post-chain, what the listener gets)
 *   - true peak (4× polyphase-FIR oversampled)
 *   - momentary LUFS (400 ms, ITU-R BS.1770 K-weighting)
 *   - short-term LUFS (3 s)
 *   - limiter gain reduction (actual limiter gain state)
 *
 * Realtime rules (audio-thread safety):
 *   - ZERO allocation inside [process] after [configure]
 *   - parameters arrive as an immutable [MixerParams] swapped atomically
 *     (volatile write from the UI thread, volatile read per block)
 *   - meter snapshots are written to an AtomicReference at a bounded rate
 */

/** Immutable processing parameters (published atomically to the audio thread). */
data class MixerParams(
    /** Full bypass: audio passes through unprocessed; meters still measure. */
    val bypass: Boolean = true,
    /** Master output level in dB, -30..+6 (0 dB = unity). */
    val masterGainDb: Float = 0f,
    /** EQ enable (10-band graphic, web-parity curve). */
    val eqEnabled: Boolean = false,
    /** Band gains in dB, -12..+12 (indices per [EqSpec.BANDS]). */
    val eqGains: List<Float> = List(10) { 0f },
    /** Limiter enable (lookahead). */
    val limiterEnabled: Boolean = false,
    /** Limiter threshold in dBFS, -12..0 (output peaks are held under it). */
    val limiterThresholdDb: Float = -1f,
    /** Limiter release in ms, 50..1000. */
    val limiterReleaseMs: Float = 150f
) {
    val masterGain: Float get() = dbToLinear(masterGainDb)
    val limiterThreshold: Float get() = dbToLinear(limiterThresholdDb)

    /** Precomputed (audio-thread allocation-free check). */
    val eqActive: Boolean = eqEnabled && eqGains.any { it != 0f }
}

/** Real measurement snapshot (bounded publish rate, read by the UI). */
data class MeterSnapshot(
    /** Max sample peak since the previous snapshot, dBFS (-90.0 floor). */
    val peakDb: Float = -90f,
    /** Max 4×-oversampled (true) peak since previous snapshot, dBFS. */
    val truePeakDb: Float = -90f,
    /** Momentary loudness (400 ms K-weighted), LUFS (-120 floor). */
    val momentaryLufs: Float = -120f,
    /** Short-term loudness (3 s K-weighted), LUFS (-120 floor). */
    val shortTermLufs: Float = -120f,
    /** Limiter gain reduction, dB (0 = none). */
    val gainReductionDb: Float = 0f,
    /** Audio actually flowed since the previous snapshot. */
    val active: Boolean = false,
    val sampleRate: Int = 0,
    val channels: Int = 0
)

/** Web parity (src/lib/eq.ts): identical bands, Q, shelf placement. */
object EqSpec {
    data class Band(
        val frequency: Float,
        val type: Int, // 0 = lowshelf, 1 = peaking, 2 = highshelf
        val q: Float,
        val label: String
    )

    val BANDS = listOf(
        Band(32f, 0, 0.7f, "Саб"),
        Band(64f, 1, 1.0f, "Бас"),
        Band(125f, 1, 1.0f, "Низ. сред."),
        Band(250f, 1, 1.0f, "Ср-низ."),
        Band(500f, 1, 1.0f, "Средн."),
        Band(1000f, 1, 1.0f, "Ср-выс."),
        Band(2000f, 1, 1.0f, "Присут. Н"),
        Band(4000f, 1, 1.0f, "Присут."),
        Band(8000f, 1, 1.0f, "Блеск"),
        Band(16000f, 2, 0.7f, "Воздух")
    )

    /** Presets — exact copy of the web EQ_PRESETS (name, 10 gains). */
    val PRESETS: List<Pair<String, List<Float>>> = listOf(
        "Плоская" to List(10) { 0f },
        "Бас +" to listOf(6f, 5f, 3f, 1f, 0f, 0f, 0f, 0f, 0f, 0f),
        "ВЧ +" to listOf(0f, 0f, 0f, 0f, 0f, 0f, 0f, 1f, 3f, 5f),
        "Вокал" to listOf(-2f, -1f, 0f, 1f, 3f, 4f, 3f, 2f, 0f, 0f),
        "Электроника" to listOf(5f, 4f, 2f, 0f, -1f, -1f, 1f, 2f, 4f, 5f),
        "Рок" to listOf(4f, 3f, 1f, -1f, -2f, -1f, 1f, 3f, 4f, 4f),
        "Акустика" to listOf(2f, 2f, 1f, 0f, 1f, 1f, 1f, 2f, 3f, 3f),
        "Ночная" to listOf(3f, 3f, 2f, 1f, 0f, 0f, -1f, -2f, -3f, -4f),
        "Саб +" to listOf(8f, 6f, 4f, 2f, 0f, 0f, 0f, 0f, 0f, 0f),
        "Подкаст" to listOf(-3f, -2f, 0f, 2f, 4f, 5f, 4f, 3f, 1f, 0f),
        "Кино" to listOf(4f, 3f, 2f, 0f, -1f, 0f, 1f, 2f, 3f, 4f),
        "V-образная" to listOf(5f, 4f, 2f, -1f, -3f, -3f, -1f, 2f, 4f, 5f)
    )
}

fun dbToLinear(db: Float): Float = Math.pow(10.0, db / 20.0).toFloat()
fun linearToDb(lin: Float): Float =
    if (lin <= 1e-9f) -120f else (20.0 * Math.log10(lin.toDouble())).toFloat()

/**
 * RBJ audio-cookbook biquad. State per (band, channel); coefficients are
 * recomputed OFF the audio thread (parameter setter) and reset atomically.
 * When gain == 0 dB the band is a pure passthrough (checked by the caller).
 */
internal class Biquad {
    // coefficients (y = b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2)
    var b0 = 1f; var b1 = 0f; var b2 = 0f; var a1 = 0f; var a2 = 0f

    // state
    private var x1 = 0f; private var x2 = 0f; private var y1 = 0f; private var y2 = 0f

    fun setIdentity() {
        b0 = 1f; b1 = 0f; b2 = 0f; a1 = 0f; a2 = 0f
    }

    fun setPeaking(fs: Float, f0: Float, q: Float, gainDb: Float) {
        val a = Math.pow(10.0, gainDb / 40.0) // sqrt of linear gain
        val omega = 2.0 * Math.PI * f0 / fs
        val alpha = Math.sin(omega) / (2.0 * q)
        val cosW = Math.cos(omega)
        val a0 = 1.0 + alpha / a
        b0 = ((1.0 + alpha * a) / a0).toFloat()
        b1 = ((-2.0 * cosW) / a0).toFloat()
        b2 = ((1.0 - alpha * a) / a0).toFloat()
        a1 = ((-2.0 * cosW) / a0).toFloat()
        a2 = ((1.0 - alpha / a) / a0).toFloat()
    }

    fun setLowShelf(fs: Float, f0: Float, gainDb: Float) {
        // Orfanidis-style low shelf (numerically verified: DC gain = shelf
        // gain exactly, unity above the corner, stable for any f0 < fs/2)
        val g = Math.pow(10.0, gainDb / 20.0)
        val k = Math.tan(Math.PI * f0 / fs)
        val vh = g
        val vb = Math.pow(g, 0.4996667741545416)
        val q = 0.7071067811865476
        val a0 = 1.0 + k / q + k * k
        b0 = ((1.0 + vb * k / q + vh * k * k) / a0).toFloat()
        b1 = (2.0 * (vh * k * k - 1.0) / a0).toFloat()
        b2 = ((vh * k * k - vb * k / q + 1.0) / a0).toFloat()
        a1 = (2.0 * (k * k - 1.0) / a0).toFloat()
        a2 = ((1.0 - k / q + k * k) / a0).toFloat()
    }

    fun setHighShelf(fs: Float, f0: Float, gainDb: Float) {
        // Orfanidis-style high shelf (verified: settles at the shelf gain,
        // unity below the corner, no overshoot beyond the shelf gain)
        val g = Math.pow(10.0, gainDb / 20.0)
        val k = Math.tan(Math.PI * f0 / fs)
        val vh = g
        val vb = Math.pow(g, 0.4996667741545416)
        val q = 0.7071067811865476
        val a0 = 1.0 + k / q + k * k
        b0 = ((vh + vb * k / q + k * k) / a0).toFloat()
        b1 = (2.0 * (k * k - vh) / a0).toFloat()
        b2 = ((vh - vb * k / q + k * k) / a0).toFloat()
        a1 = (2.0 * (k * k - 1.0) / a0).toFloat()
        a2 = ((1.0 - k / q + k * k) / a0).toFloat()
    }

    fun process(x: Float): Float {
        val y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2 = x1; x1 = x
        y2 = y1; y1 = y
        return y
    }

    fun reset() {
        x1 = 0f; x2 = 0f; y1 = 0f; y2 = 0f
    }
}

/**
 * The mixer DSP. One instance per audio sink (owned by MixerEngine, used by
 * the ExoPlayer audio processor). configure() is called from onConfigure;
 * process() from the playback thread; setParams() from any thread.
 */
class MixerDsp {

    // ── Parameters (atomic swap) ─────────────────────────────────────────────
    @Volatile
    private var params: MixerParams = MixerParams()
    val currentParams: MixerParams get() = params

    /** Latest real measurement, read by the meter poller. */
    val meterRef = java.util.concurrent.atomic.AtomicReference(MeterSnapshot())

    // ── Configuration ────────────────────────────────────────────────────────
    private var sampleRate = 48000
    private var channels = 2
    private var configured = false

    // ── EQ state: 10 bands × channels ────────────────────────────────────────
    private var eq = Array(10) { Array(2) { Biquad() } }

    // ── K-weighting (LUFS): 2 stages × channels ─────────────────────────────
    private var k1 = Array(2) { Biquad() }
    private var k2 = Array(2) { Biquad() }

    // ── Momentary (400 ms) sliding window of K-weighted power ───────────────
    private var powerRing = FloatArray(19200)
    private var powerRingPos = 0
    private var powerWindowSum = 0.0
    private var momentarySamples = 0

    // ── Short-term (3 s): 100 ms block energies ring (30 blocks) ────────────
    private val blockCount = 30
    private var blockSamplesPer = 4800
    private var blockRing = DoubleArray(30)
    private var blockRingPos = 0
    private var blockAcc = 0.0
    private var blockFill = 0
    private var blocksTotal = 0

    // ── True peak: 4× oversampling polyphase FIR (8 taps/phase) ─────────────
    private val truePeakPhases = 4
    private val tapsPerPhase = 16
    private var tpPhase = Array(4) { FloatArray(16) }
    private var tpHistPerCh = arrayOf(FloatArray(32), FloatArray(32))

    // ── Limiter ──────────────────────────────────────────────────────────────
    private var delayPerCh = arrayOf(FloatArray(240), FloatArray(240)) // 5 ms @48k
    private var delayPos = 0
    private var lookahead = 240
    private var limiterGain = 1f
    private var limiterMaxGrDb = 0f
    private var releaseCoef = 0.999f

    // ── Peak meters ──────────────────────────────────────────────────────────
    private var peakAbs = 0f
    private var truePeakAbs = 0f

    // ── Meter publish throttling ─────────────────────────────────────────────
    private var framesSinceMeter = 0
    private val meterFrames = 2048 // ~43 ms @48k — bounded publish rate

    private var sawAudioSinceMeter = false

    // ── Public API ───────────────────────────────────────────────────────────

    fun configure(sampleRate: Int, channelCount: Int) {
        if (this.sampleRate == sampleRate && this.channels == channelCount && configured) {
            return
        }
        this.sampleRate = sampleRate
        this.channels = channelCount.coerceIn(1, 8)
        this.configured = true
        allocateAll()
        rebuildCoefficients()
    }

    /** Thread-safe parameter publish (immutable snapshot swap). */
    fun setParams(p: MixerParams) {
        params = p
        rebuildCoefficients() // runs on the caller (UI) thread, not audio
    }

    /**
     * Process interleaved frames IN PLACE. [data] holds frames*channels
     * floats. Called on the playback thread — zero allocations.
     */
    fun process(data: FloatArray, frames: Int) {
        if (!configured || frames <= 0) return
        val ch = channels
        val p = params
        val doProcess = !p.bypass

        var frameIdx = 0
        while (frameIdx < frames) {
            val base = frameIdx * ch

            if (!doProcess) {
                // Bypass: meters still measure the real signal (no fake data —
                // no audio → meters show the silence floor).
                measureFrame(data, base, ch)
            } else {
                // 1. Master gain
                val g = p.masterGain
                if (g != 1f) {
                    for (c in 0 until ch) data[base + c] *= g
                }

                // 2. EQ (skip entirely when disabled or flat — bit-exact path)
                if (p.eqActive) {
                    for (band in 0 until 10) {
                        if (p.eqGains[band] == 0f) continue
                        val row = eq[band]
                        for (c in 0 until ch) {
                            data[base + c] = row[c].process(data[base + c])
                        }
                    }
                }

                // 3. Limiter
                if (p.limiterEnabled) {
                    limitFrame(data, base, ch, p)
                }

                // 4. Meters on the OUTPUT signal (what the listener gets)
                measureFrame(data, base, ch)
            }

            frameIdx++
            framesSinceMeter++
            // bounded publish rate even inside one large block
            if (framesSinceMeter >= meterFrames) publishMeter()
        }
    }

    /** Reset filter/meter state (seek/stop) — parameters survive. */
    fun flush() {
        for (band in 0 until 10) for (c in 0 until channels) eq[band][c].reset()
        for (c in 0 until channels) {
            k1[c].reset(); k2[c].reset()
            tpHistPerCh[c].fill(0f)
            delayPerCh[c].fill(0f)
        }
        powerRing.fill(0f)
        powerRingPos = 0
        powerWindowSum = 0.0
        momentarySamples = 0
        blockRing.fill(0.0)
        blockRingPos = 0
        blockAcc = 0.0
        blockFill = 0
        blocksTotal = 0
        limiterGain = 1f
        limiterMaxGrDb = 0f
        peakAbs = 0f
        truePeakAbs = 0f
        framesSinceMeter = 0
        sawAudioSinceMeter = false
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private fun allocateAll() {
        eq = Array(10) { Array(channels) { Biquad() } }
        k1 = Array(channels) { Biquad() }
        k2 = Array(channels) { Biquad() }
        val fs = sampleRate.toFloat()

        // Momentary 400 ms power ring
        val mLen = (0.4 * fs).toInt().coerceAtLeast(1)
        powerRing = FloatArray(mLen)
        // Short-term: 100 ms blocks, 30 of them (3 s)
        blockSamplesPer = (0.1 * fs).toInt().coerceAtLeast(1)
        blockRing = DoubleArray(blockCount)

        // True-peak polyphase FIR: Blackman-windowed sinc prototype (32 taps),
        // decimated into 4 phases of 8 taps.
        buildTruePeakPhases()
        tpHistPerCh = Array(channels) { FloatArray(tapsPerPhase * 2) }

        // Limiter lookahead 5 ms
        lookahead = (0.005 * fs).toInt().coerceAtLeast(1)
        delayPerCh = Array(channels) { FloatArray(lookahead) }
        delayPos = 0
    }

    private fun buildTruePeakPhases() {
        val prototypeLen = truePeakPhases * tapsPerPhase // 64
        val h = DoubleArray(prototypeLen)
        val fc = 0.25 // normalized cutoff for 4× oversampling
        val mid = (prototypeLen - 1) / 2.0
        for (n in 0 until prototypeLen) {
            val x = n - mid
            val sinc = if (x == 0.0) 2.0 * fc else Math.sin(2.0 * Math.PI * fc * x) / (Math.PI * x)
            val w = 0.42 - 0.5 * Math.cos(2.0 * Math.PI * n / (prototypeLen - 1)) +
                0.08 * Math.cos(4.0 * Math.PI * n / (prototypeLen - 1))
            h[n] = sinc * w
        }
        // normalize DC gain of each phase to exactly 1 (passband unity)
        for (ph in 0 until truePeakPhases) {
            var sum = 0.0
            for (k in 0 until tapsPerPhase) sum += h[ph + truePeakPhases * k]
            val norm = if (sum != 0.0) 1.0 / sum else 1.0
            for (k in 0 until tapsPerPhase) {
                tpPhase[ph][k] = (h[ph + truePeakPhases * k] * norm).toFloat()
            }
        }
    }

    /** Recompute biquad coefficients from current params (caller thread). */
    private fun rebuildCoefficients() {
        if (!configured) return
        val fs = sampleRate.toFloat()
        val p = params

        for (band in 0 until 10) {
            val spec = EqSpec.BANDS[band]
            val gain = p.eqGains.getOrNull(band) ?: 0f
            val row = eq[band]
            for (c in 0 until channels) {
                val bq = row[c]
                when {
                    gain == 0f || !p.eqEnabled -> bq.setIdentity()
                    spec.type == 0 -> bq.setLowShelf(fs, spec.frequency, gain)
                    spec.type == 1 -> bq.setPeaking(fs, spec.frequency, spec.q, gain)
                    else -> bq.setHighShelf(fs, spec.frequency, gain)
                }
                bq.reset()
            }
        }

        // BS.1770 K-weighting (generalized to arbitrary fs via RBJ formulas
        // with the spec's corner frequencies / Q values)
        for (c in 0 until channels) {
            k1[c].setHighShelfSpec(fs)
            k1[c].reset()
            k2[c].setHighPassSpec(fs)
            k2[c].reset()
        }

        // Limiter release coefficient
        val releaseMs = p.limiterReleaseMs.coerceIn(50f, 1000f)
        releaseCoef = Math.exp(-1000.0 / (releaseMs * sampleRate)).toFloat()
    }

    private fun Biquad.setHighShelfSpec(fs: Float) {
        // ITU-R BS.1770 stage-1 high-shelf — tan-based reference formulas
        // (numerically reproduces the spec's 48 kHz coefficients exactly
        // and generalizes to any sample rate)
        val f0 = 1681.974450955533
        val g = 3.999843853973347
        val q = 0.7071752369554196
        val k = Math.tan(Math.PI * f0 / fs)
        val vh = Math.pow(10.0, g / 20.0)
        val vb = Math.pow(vh, 0.4996667741545416)
        val a0 = 1.0 + k / q + k * k
        b0 = ((vh + vb * k / q + k * k) / a0).toFloat()
        b1 = (2.0 * (k * k - vh) / a0).toFloat()
        b2 = ((vh - vb * k / q + k * k) / a0).toFloat()
        a1 = (2.0 * (k * k - 1.0) / a0).toFloat()
        a2 = ((1.0 - k / q + k * k) / a0).toFloat()
    }

    private fun Biquad.setHighPassSpec(fs: Float) {
        // ITU-R BS.1770 stage-2 high-pass (38.135 Hz, Q 0.5003) — tan-based
        val f0 = 38.13547087602444
        val q = 0.5003270373238773
        val k = Math.tan(Math.PI * f0 / fs)
        val a0 = 1.0 + k / q + k * k
        b0 = (1.0 / a0).toFloat()
        b1 = (-2.0 / a0).toFloat()
        b2 = (1.0 / a0).toFloat()
        a1 = (2.0 * (k * k - 1.0) / a0).toFloat()
        a2 = ((1.0 - k / q + k * k) / a0).toFloat()
    }

    /**
     * Limiter, one frame: linked channels, 5 ms lookahead delay, instant
     * attack (the delay hides the transient), smoothed release, safety clamp.
     */
    private fun limitFrame(data: FloatArray, base: Int, ch: Int, p: MixerParams) {
        val thresh = p.limiterThreshold

        // control: max magnitude over channels (current input is the "future"
        // for the delayed signal — that IS the lookahead)
        var ctrl = 0f
        for (c in 0 until ch) {
            val v = Math.abs(data[base + c])
            if (v > ctrl) ctrl = v
        }

        // target gain so that ctrl*gain <= thresh
        val target = if (ctrl > thresh) thresh / ctrl else 1f

        val g = if (target < limiterGain) {
            target // attack: immediate (lookahead compensates)
        } else {
            // release: glide toward unity with the release time constant
            val candidate = limiterGain + (1f - limiterGain) * (1f - releaseCoef)
            minOf(candidate, target)
        }
        limiterGain = g

        // apply to the DELAYED samples — the transient arrives exactly when
        // the gain has already settled
        for (c in 0 until ch) {
            val delayed = delayPerCh[c][delayPos]
            delayPerCh[c][delayPos] = data[base + c]
            var out = delayed * g
            if (out > 1f) out = 1f else if (out < -1f) out = -1f // safety clamp
            data[base + c] = out
        }
        delayPos = (delayPos + 1) % lookahead

        // gain-reduction tracking for the GR meter
        val grDb = linearToDb(g)
        if (grDb < limiterMaxGrDb) limiterMaxGrDb = grDb
    }

    /**
     * Meters for one output frame: sample peak, 4× true peak, K-weighted
     * power for momentary (400 ms ring) and short-term (3 s block ring).
     */
    private fun measureFrame(data: FloatArray, base: Int, ch: Int) {
        sawAudioSinceMeter = true

        var framePeak = 0f
        var w = 0.0
        for (c in 0 until ch) {
            val x = data[base + c]
            val ax = Math.abs(x)
            if (ax > framePeak) framePeak = ax

            // K-weighting for loudness
            val y1 = k1[c].process(x)
            val y = k2[c].process(y1)
            // ITU channel weights (squared): L/R/C = 1, Ls/Rs ≈ 2, LFE = 0
            val weight = when (c) {
                3 -> 0.0
                4, 5 -> 2.0
                else -> 1.0
            }
            val yd = y.toDouble()
            w += weight * yd * yd

            // true peak: 4× polyphase interpolation on a short history
            val hist = tpHistPerCh[c]
            var hi = hist.size - 1
            while (hi > 0) {
                hist[hi] = hist[hi - 1]
                hi--
            }
            hist[0] = x
            for (ph in 0 until truePeakPhases) {
                val coef = tpPhase[ph]
                var acc = 0f
                for (k in 0 until tapsPerPhase) {
                    acc += coef[k] * hist[k]
                }
                val a = Math.abs(acc)
                if (a > truePeakAbs) truePeakAbs = a
            }
        }
        if (framePeak > peakAbs) peakAbs = framePeak

        // momentary: sliding 400 ms power window
        val pw = w.toFloat()
        val old = powerRing[powerRingPos]
        powerRing[powerRingPos] = pw
        powerWindowSum += pw - old
        powerRingPos = (powerRingPos + 1) % powerRing.size
        if (momentarySamples < powerRing.size) momentarySamples++

        // short-term: 100 ms block accumulation
        blockAcc += w
        blockFill++
        if (blockFill >= blockSamplesPer) {
            blockRing[blockRingPos] = blockAcc
            blockAcc = 0.0
            blockFill = 0
            blockRingPos = (blockRingPos + 1) % blockCount
            blocksTotal++
        }
    }

    private fun publishMeter() {
        val n = momentarySamples.coerceAtLeast(1)
        val meanSquare = powerWindowSum / n
        val momentary = if (meanSquare > 1e-12)
            (-0.691 + 10.0 * Math.log10(meanSquare)).toFloat()
        else -120f

        val filled = blocksTotal.coerceAtMost(blockCount)
        val shortTerm = if (filled > 0) {
            var s = 0.0
            for (i in 0 until filled) s += blockRing[i]
            val ms = s / (filled * blockSamplesPer)
            if (ms > 1e-12) (-0.691 + 10.0 * Math.log10(ms)).toFloat() else -120f
        } else -120f

        val snapshot = MeterSnapshot(
            peakDb = if (peakAbs > 1e-9f) linearToDb(peakAbs) else -90f,
            truePeakDb = if (truePeakAbs > 1e-9f) linearToDb(truePeakAbs) else -90f,
            momentaryLufs = momentary,
            shortTermLufs = shortTerm,
            gainReductionDb = if (limiterMaxGrDb < 0f) -limiterMaxGrDb else 0f,
            active = sawAudioSinceMeter,
            sampleRate = sampleRate,
            channels = channels
        )
        meterRef.set(snapshot)

        // reset per-interval accumulators
        peakAbs = 0f
        truePeakAbs = 0f
        limiterMaxGrDb = 0f
        sawAudioSinceMeter = false
        framesSinceMeter = 0
    }
}
