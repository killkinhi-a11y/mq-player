package com.mq1.player.player

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import com.mq1.player.dsp.MixerDsp
import java.nio.ByteBuffer

/**
 * F10 — Media3 audio processor: the bridge between ExoPlayer's AudioSink and
 * [MixerDsp]. Every decoded PCM block (including DRM content — the CDM feeds
 * the sink) passes through here, which is the Android-native equivalent of
 * the web player's AudioWorklet insert.
 *
 * Format handling: the input encoding is PRESERVED (16-bit in → 16-bit out,
 * float in → float out), so the sink behavior is unchanged. The 16-bit path
 * converts to float for DSP and back — the roundtrip is bit-exact (float32
 * represents all int16 values exactly; the limiter clamps to ±1.0 before
 * encoding).
 *
 * The bypass path is bit-transparent: when the DSP is bypassed, samples are
 * still measured (real meters) and passed through numerically unchanged.
 */
@OptIn(UnstableApi::class)
class MqAudioProcessor(
    private val dsp: MixerDsp
) : BaseAudioProcessor() {

    private var isFloat = false
    private var bytesPerSample = 2
    private var channels = 2

    // Scratch buffers — allocated on growth only (bounded, rare, never per block)
    private var floatBuf = FloatArray(4096)

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        isFloat = inputAudioFormat.encoding == C.ENCODING_PCM_FLOAT
        bytesPerSample = if (isFloat) 4 else 2
        channels = inputAudioFormat.channelCount
        dsp.configure(inputAudioFormat.sampleRate, inputAudioFormat.channelCount)
        // Keep the encoding/format unchanged — the sink sees the same audio
        // format it would see without this processor.
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val remaining = inputBuffer.remaining()
        if (remaining == 0) return

        val frameSize = bytesPerSample * channels
        val frames = remaining / frameSize
        val samples = frames * channels

        if (samples > floatBuf.size) {
            // growth only — happens at most once per max buffer size
            floatBuf = FloatArray(samples)
        }

        // ── decode interleaved input into float[] ──
        when {
            isFloat -> {
                val fb = inputBuffer.asFloatBuffer()
                fb.get(floatBuf, 0, samples)
                inputBuffer.position(inputBuffer.position() + remaining)
            }
            else -> {
                val shortView = inputBuffer.asShortBuffer()
                var i = 0
                val scale = 1f / 32768f
                while (i < samples) {
                    floatBuf[i] = shortView.get(i) * scale
                    i++
                }
                inputBuffer.position(inputBuffer.position() + remaining)
            }
        }

        // ── real DSP on the audio thread ──
        dsp.process(floatBuf, frames)

        // ── encode back into the output buffer ──
        val output = replaceOutputBuffer(remaining)
        when {
            isFloat -> {
                val fOut = output.asFloatBuffer()
                fOut.put(floatBuf, 0, samples)
                output.position(output.position() + remaining)
            }
            else -> {
                var i = 0
                while (i < samples) {
                    var v = floatBuf[i]
                    // clamp + quantize to int16 (limiter already limits, this
                    // is the last-line numerical safety)
                    if (v > 1f) v = 1f else if (v < -1f) v = -1f
                    val s = (v * 32767f).toInt()
                    output.putShort(s.toShort()) // allocate? no — ByteBuffer put
                    i++
                }
            }
        }
        output.flip()
    }

    override fun onFlush() {
        // seek/stop: reset filter and meter state, parameters survive
        dsp.flush()
    }
}
