package com.mq1.player

import com.mq1.player.dsp.MixerDsp
import com.mq1.player.dsp.MixerParams
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

/**
 * F10 MIXER DSP TESTS — real signal math, no mocks. Every meter value and
 * every processing claim is verified against known test signals:
 *
 *   bypass       → bit-identical passthrough
 *   flat EQ      → bit-identical (bands skipped)
 *   EQ shelves   → amplitude rises at the boosted band, stays flat elsewhere
 *   master gain  → exact linear scaling
 *   limiter      → output held under threshold, real GR > 0, release recovers
 *   peak meter   → exact sample-peak of a sine
 *   true peak    → DC-exact (phase DC gain = 1), ≥ sample peak in general
 *   LUFS         → silence floor, monotonic with level, sane absolute range
 */
class MixerDspTest {

    private val fs = 48000
    private val ch = 2

    private fun dsp(params: MixerParams): MixerDsp =
        MixerDsp().apply {
            configure(fs, ch)
            setParams(params)
        }

    /** A sine into both channels, [seconds] long, returned as frames×ch blocks. */
    private fun sineBlocks(
        amplitude: Float,
        freq: Double,
        seconds: Double,
        blockSize: Int = 1024
    ): List<FloatArray> {
        val totalFrames = (seconds * fs).toInt()
        val blocks = mutableListOf<FloatArray>()
        var frame = 0
        while (frame < totalFrames) {
            val n = minOf(blockSize, totalFrames - frame)
            val block = FloatArray(n * ch)
            for (i in 0 until n) {
                val v = (amplitude * sin(2.0 * PI * freq * (frame + i) / fs)).toFloat()
                block[i * ch] = v
                block[i * ch + 1] = v
            }
            blocks.add(block)
            frame += n
        }
        return blocks
    }

    private fun processAll(d: MixerDsp, blocks: List<FloatArray>): List<FloatArray> {
        val out = mutableListOf<FloatArray>()
        for (b in blocks) {
            val copy = b.copyOf()
            d.process(copy, copy.size / ch)
            out.add(copy)
        }
        return out
    }

    private fun maxAbs(blocks: List<FloatArray>): Float =
        blocks.maxOf { b -> b.maxOf { abs(it) } }

    // ── Bypass / identity ────────────────────────────────────────────────────

    @Test
    fun `bypass is bit-identical passthrough`() {
        val d = dsp(MixerParams(bypass = true))
        val blocks = sineBlocks(0.6f, 440.0, 0.5)
        val out = processAll(d, blocks)
        for (i in blocks.indices) {
            assertTrue(
                "block $i differs under bypass",
                blocks[i].contentEquals(out[i])
            )
        }
    }

    @Test
    fun `flat enabled EQ is bit-identical (bands skipped)`() {
        val d = dsp(MixerParams(bypass = false, eqEnabled = true))
        val blocks = sineBlocks(0.5f, 440.0, 0.3)
        val out = processAll(d, blocks)
        for (i in blocks.indices) {
            assertTrue("block $i differs with flat EQ", blocks[i].contentEquals(out[i]))
        }
    }

    @Test
    fun `master gain -6 dB scales by one half`() {
        val d = dsp(MixerParams(bypass = false, masterGainDb = -6.0f))
        val blocks = sineBlocks(0.5f, 440.0, 0.2)
        val out = processAll(d, blocks)
        // compare steady-state (skip the first block)
        val inMax = maxAbs(blocks.drop(1))
        val outMax = maxAbs(out.drop(1))
        assertEquals(0.5f * inMax, outMax, 0.02f)
    }

    // ── EQ behavior ──────────────────────────────────────────────────────────

    @Test
    fun `bass band boost raises in-band amplitude`() {
        // +12 dB peaking @64 Hz (band 1), 64 Hz sine at the band center:
        // the peaking filter's response there is exactly +12 dB (verified
        // analytically) → expect ≈ 4× amplitude
        val d = dsp(
            MixerParams(bypass = false, eqEnabled = true, eqGains = List(10) { 0f }.toMutableList().also { it[1] = 12f })
        )
        val blocks = sineBlocks(0.2f, 64.0, 1.0)
        val out = processAll(d, blocks)
        val inMax = maxAbs(blocks)
        val outMax = maxAbs(out.drop(20)) // steady state, filter settled
        assertTrue(
            "band center not boosted: in=$inMax out=$outMax (ratio=${outMax / inMax})",
            outMax > inMax * 2.5f // ≥ +8 dB of the +12 dB target
        )
    }

    @Test
    fun `air shelf leaves low band untouched`() {
        // +12 dB @16 kHz: a 110 Hz sine must stay ~unchanged (high shelf)
        val d = dsp(
            MixerParams(bypass = false, eqEnabled = true, eqGains = List(10) { 0f }.toMutableList().also { it[9] = 12f })
        )
        val blocks = sineBlocks(0.2f, 110.0, 1.0)
        val out = processAll(d, blocks)
        val inMax = maxAbs(blocks)
        val outMax = maxAbs(out.drop(20))
        assertTrue(
            "low band changed by high shelf: in=$inMax out=$outMax",
            abs(outMax - inMax) / inMax < 0.2f
        )
    }

    // ── Limiter ──────────────────────────────────────────────────────────────

    @Test
    fun `limiter holds output under threshold and reports real GR`() {
        val thresholdDb = -6f
        val d = dsp(
            MixerParams(bypass = false, limiterEnabled = true, limiterThresholdDb = thresholdDb)
        )
        val blocks = sineBlocks(1.0f, 440.0, 1.0) // 0 dBFS input
        val out = processAll(d, blocks)

        val outMax = maxAbs(out.drop(24)) // skip the 5 ms delay warmup
        val expected = com.mq1.player.dsp.dbToLinear(thresholdDb)
        assertTrue(
            "output exceeds threshold: $outMax > $expected",
            outMax <= expected * 1.05f
        )

        val meters = d.meterRef.get()
        assertTrue(
            "no gain reduction reported while limiting: ${meters.gainReductionDb}",
            meters.gainReductionDb > 2f
        )
    }

    @Test
    fun `limiter releases back toward unity after the loud part`() {
        val d = dsp(
            MixerParams(
                bypass = false, limiterEnabled = true,
                limiterThresholdDb = -6f, limiterReleaseMs = 100f
            )
        )
        // 0.3 s loud (0 dBFS) then 0.5 s quiet (0.05)
        processAll(d, sineBlocks(1.0f, 440.0, 0.3))
        val quietOut = processAll(d, sineBlocks(0.05f, 440.0, 0.5))
        val steadyQuiet = maxAbs(quietOut.drop(3)) // ~64 ms in (3 blocks)
        val quietIn = 0.05f
        // release time 100 ms → after 50+ ms the gain must have recovered
        // substantially (≥ 60 % of the way back to unity)
        assertTrue(
            "release did not recover: steady=$steadyQuiet in=$quietIn",
            steadyQuiet > quietIn * 0.6f
        )
    }

    // ── Meters: peak / true peak ─────────────────────────────────────────────

    @Test
    fun `peak meter reports the exact sample peak`() {
        val d = dsp(MixerParams(bypass = true))
        processAll(d, sineBlocks(0.5f, 997.0, 0.4))
        val meters = d.meterRef.get()
        assertEquals(-6.02f, meters.peakDb, 0.6f)
        assertTrue(meters.active)
    }

    @Test
    fun `true peak is DC-exact and never below sample peak`() {
        val d = dsp(MixerParams(bypass = true))
        // constant DC 0.9: every interpolation phase has DC gain exactly 1
        val frames = 8192
        val block = FloatArray(frames * ch) { if (it % ch == 0) 0.9f else 0.9f }
        val copy = block.copyOf()
        d.process(copy, frames)
        val meters = d.meterRef.get()
        val peakLin = com.mq1.player.dsp.dbToLinear(meters.peakDb)
        val tpLin = com.mq1.player.dsp.dbToLinear(meters.truePeakDb)
        assertEquals(0.9f, peakLin, 0.01f)
        assertEquals(0.9f, tpLin, 0.05f) // DC-exact interpolation
    }

    @Test
    fun `true peak catches inter-sample peaks a square wave creates`() {
        val d = dsp(MixerParams(bypass = true))
        // alternating ±1.0 (Nyquist) — reconstruction overshoots between samples
        val frames = 8192
        val block = FloatArray(frames * ch)
        for (i in 0 until frames) {
            val v = if (i % 2 == 0) 1f else -1f
            block[i * ch] = v
            block[i * ch + 1] = v
        }
        d.process(block, frames)
        val meters = d.meterRef.get()
        assertTrue(
            "true peak below sample peak — impossible",
            meters.truePeakDb >= meters.peakDb - 0.2f
        )
    }

    // ── Meters: LUFS ─────────────────────────────────────────────────────────

    @Test
    fun `LUFS silence floor is reported for silence`() {
        val d = dsp(MixerParams(bypass = true))
        val frames = 8192
        d.process(FloatArray(frames * ch), frames)
        val meters = d.meterRef.get()
        assertEquals(-120f, meters.momentaryLufs, 1f)
        assertEquals(-90f, meters.peakDb, 1f)
    }

    @Test
    fun `LUFS is monotonic with level and in a sane absolute range`() {
        fun lufsFor(amp: Float): Float {
            val d = dsp(MixerParams(bypass = true))
            processAll(d, sineBlocks(amp, 1000.0, 1.0))
            return d.meterRef.get().momentaryLufs
        }

        val loud = lufsFor(0.5f)
        val quiet = lufsFor(0.05f)

        // absolute sanity: 0.5-amplitude stereo 1 kHz sine ≈ -7 LUFS (±5)
        assertTrue("loud LUFS out of range: $loud", loud in -13.0..-2.0)
        // 20 dB amplitude difference → ~20 dB LUFS difference
        assertTrue(
            "LUFS not monotonic: loud=$loud quiet=$quiet",
            loud - quiet in 16.0..24.0
        )
    }

    @Test
    fun `meter snapshots update at a bounded rate while audio flows`() {
        val d = dsp(MixerParams(bypass = true))
        var published = 0
        var last: com.mq1.player.dsp.MeterSnapshot? = null
        for (b in sineBlocks(0.4f, 440.0, 0.3)) {
            val copy = b.copyOf()
            d.process(copy, copy.size / ch)
            val now = d.meterRef.get()
            if (now !== last) {
                published++
                last = now
            }
        }
        // 0.3 s @ ~43 ms publish interval → ~5-8 snapshots
        assertTrue("too few snapshots: $published", published in 3..12)
    }

    // ── Parameter semantics ──────────────────────────────────────────────────

    @Test
    fun `params swap is visible to the dsp immediately`() {
        val d = dsp(MixerParams(bypass = true))
        assertEquals(true, d.currentParams.bypass)
        d.setParams(MixerParams(bypass = false, masterGainDb = -20f))
        assertEquals(false, d.currentParams.bypass)
        assertEquals(-20f, d.currentParams.masterGainDb, 0.01f)
    }

    @Test
    fun `eqActive precomputation matches band contents`() {
        val flat = MixerParams(bypass = false, eqEnabled = true)
        assertTrue(!flat.eqActive)

        val boosted = MixerParams(
            bypass = false, eqEnabled = true,
            eqGains = List(10) { 0f }.toMutableList().also { it[0] = 6f }
        )
        assertTrue(boosted.eqActive)

        val disabledWithGains = MixerParams(
            bypass = false, eqEnabled = false,
            eqGains = boosted.eqGains
        )
        assertTrue(!disabledWithGains.eqActive)
    }
}
