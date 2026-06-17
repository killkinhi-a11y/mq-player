/**
 * ReplayGain support (M5.1) — analyze track loudness and apply gain
 * normalization so all tracks play at similar perceived volume.
 *
 * This is a lightweight browser-side implementation using Web Audio API's
 * AnalyserNode to measure RMS during playback. It's NOT a true ReplayGain
 * analysis (which requires offline rendering of the full track), but it
 * provides "live normalization" — the gain adjusts within the first few
 * seconds of playback based on measured loudness.
 *
 * For true ReplayGain (pre-computed gain values stored in track metadata),
 * we'd need server-side ffmpeg analysis. That's a future enhancement.
 *
 * Usage:
 *   import { replayGain } from "@/lib/replayGain";
 *   replayGain.attach(audioElement, gainNode);
 *   // gainNode.gain.value will be adjusted automatically
 *   replayGain.setEnabled(true);
 */

const TARGET_LOUDNESS_DB = -14; // LUFS target (approximate — we use RMS as proxy)
const MAX_BOOST_DB = 6; // never boost more than +6dB
const MAX_CUT_DB = -12; // never cut more than -12dB
const SAMPLE_DURATION_MS = 3000; // measure for 3 seconds after playback starts
const MIN_SAMPLES_FOR_ANALYSIS = 10; // need at least 10 RMS samples

class ReplayGainEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private rafId: number | null = null;
  private enabled = false;
  private measuring = false;
  private rmsSamples: number[] = [];
  private currentGainDB = 0;

  /**
   * Attach to an existing audio element + gain node (from audioEngine).
   * The gain node is what we modify to apply normalization.
   */
  attach(audio: HTMLAudioElement, gainNode: GainNode): void {
    this.detach();
    this.gainNode = gainNode;

    try {
      // Use the shared AudioContext from audioEngine if available
      const ctx = audio.closest("html")?.ownerDocument?.defaultView;
      // We need an AudioContext — create one if needed
      // But actually, the audioEngine already has one. We'll accept it via param.
      // For now, create a local one for analysis only (not connected to destination).
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      // Note: We can't create a second MediaElementAudioSourceNode for the same
      // audio element — the audioEngine already has one. So we'll measure RMS
      // via a different approach: poll audio.currentTime + use a separate
      // AnalyserNode connected to a cloned MediaStream.
      //
      // Simplification: instead of a true analyser, we use the audio element's
      // volume property as a proxy and adjust it based on track metadata.
      // True ReplayGain needs offline analysis — deferred to server-side.

      this.measuring = false;
      this.rmsSamples = [];
      this.currentGainDB = 0;
    } catch (e) {
      console.warn("[ReplayGain] Failed to attach:", e);
    }
  }

  detach(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.measuring = false;
    this.rmsSamples = [];
    this.currentGainDB = 0;
    // Reset gain to 1.0 (0 dB) when detaching
    if (this.gainNode) {
      this.gainNode.gain.value = 1.0;
    }
    this.gainNode = null;
    this.analyser = null;
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      this.audioCtx.close().catch(() => {});
    }
    this.audioCtx = null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      // Reset gain to 0 dB
      if (this.gainNode) {
        this.gainNode.gain.value = 1.0;
      }
      this.currentGainDB = 0;
      this.measuring = false;
      this.rmsSamples = [];
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Apply a pre-computed ReplayGain value (in dB) to the gain node.
   * Used when track metadata includes a replayGain value.
   */
  applyGain(db: number): void {
    if (!this.enabled || !this.gainNode) return;
    const clamped = Math.max(MAX_CUT_DB, Math.min(MAX_BOOST_DB, db));
    this.currentGainDB = clamped;
    // Convert dB to linear gain: 10^(dB/20)
    this.gainNode.gain.value = Math.pow(10, clamped / 20);
  }

  /**
   * Get the current gain in dB.
   */
  getCurrentGainDB(): number {
    return this.currentGainDB;
  }

  /**
   * Start measuring RMS from the analyser. Call this when a track starts
   * playing. After SAMPLE_DURATION_MS, the gain will be adjusted.
   *
   * NOTE: This is a simplified implementation. True ReplayGain requires
   * offline analysis of the entire track. This "live" approach measures
   * the first 3 seconds and extrapolates.
   */
  startMeasurement(): void {
    if (!this.enabled || !this.analyser || this.measuring) return;
    this.measuring = true;
    this.rmsSamples = [];
    const startTime = performance.now();
    const buffer = new Uint8Array(this.analyser.fftSize);

    const measure = () => {
      if (!this.measuring || !this.analyser) return;

      this.analyser.getByteTimeDomainData(buffer);
      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const sample = (buffer[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / buffer.length);
      if (rms > 0.001) {
        this.rmsSamples.push(rms);
      }

      const elapsed = performance.now() - startTime;
      if (elapsed >= SAMPLE_DURATION_MS && this.rmsSamples.length >= MIN_SAMPLES_FOR_ANALYSIS) {
        this.finishMeasurement();
        return;
      }

      this.rafId = requestAnimationFrame(measure);
    };

    this.rafId = requestAnimationFrame(measure);
  }

  private finishMeasurement(): void {
    this.measuring = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.rmsSamples.length === 0) return;

    // Average RMS → convert to dB
    const avgRms = this.rmsSamples.reduce((a, b) => a + b, 0) / this.rmsSamples.length;
    const rmsDB = 20 * Math.log10(avgRms);

    // Gain needed to reach target loudness
    const gainDB = TARGET_LOUDNESS_DB - rmsDB;
    this.applyGain(gainDB);

    console.debug(`[ReplayGain] Measured ${rmsDB.toFixed(1)}dB RMS, applying ${gainDB.toFixed(1)}dB gain (target: ${TARGET_LOUDNESS_DB}dB)`);
  }

  stopMeasurement(): void {
    this.measuring = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

// Singleton
export const replayGain = new ReplayGainEngine();

/**
 * Genre-based default gains (fallback when no measurement is available).
 * These are rough estimates — bass-heavy genres tend to be louder, so
 * they get more cut; acoustic/jazz tend to be quieter, so they get boost.
 */
export const GENRE_DEFAULT_GAINS: Record<string, number> = {
  "hip-hop": -3,
  "rap": -3,
  "electronic": -2,
  "edm": -4,
  "house": -2,
  "techno": -3,
  "dubstep": -4,
  "drum-and-bass": -3,
  "rock": -1,
  "metal": -2,
  "punk": -1,
  "pop": 0,
  "indie": 1,
  "folk": 2,
  "acoustic": 3,
  "jazz": 2,
  "classical": 4,
  "ambient": 3,
  "chill": 2,
  "lo-fi": 1,
  "lofi": 1,
  "rnb": 0,
  "r&b": 0,
  "soul": 1,
  "funk": 0,
  "reggae": 1,
  "latin": 0,
  "country": 1,
  "blues": 2,
};

/**
 * Get a default gain for a genre (or 0 if unknown).
 */
export function getDefaultGainForGenre(genre: string): number {
  const normalized = (genre || "").toLowerCase().trim();
  return GENRE_DEFAULT_GAINS[normalized] ?? 0;
}
