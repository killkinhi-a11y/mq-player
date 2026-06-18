/**
 * ReplayGain support (M5.1) — normalize perceived loudness across tracks.
 *
 * This is a SIMPLIFIED implementation that uses genre-based default gains
 * rather than true RMS measurement. The reason: the audioEngine already
 * owns the MediaElementAudioSourceNode, so we can't create a second
 * AnalyserNode for the same audio element.
 *
 * True ReplayGain requires server-side ffmpeg analysis (offline rendering
 * of the full track to compute integrated loudness). That's a future
 * enhancement — for now, genre-based defaults provide reasonable
 * normalization for most use cases.
 *
 * The gain is applied by adjusting the audio element's `volume` property
 * (0.0 to 1.0). The audioEngine manages gain nodes for crossfade, so we
 * don't touch those — we just scale the base volume.
 *
 * Usage (from useAudioEngine.ts onPlaying handler):
 *   import { replayGain, getDefaultGainForGenre } from "@/lib/replayGain";
 *   if (replayGainEnabled) {
 *     replayGain.setEnabled(true);
 *     replayGain.applyGain(getDefaultGainForGenre(track.genre));
 *   }
 */

const MAX_BOOST_DB = 6;
const MAX_CUT_DB = -12;

class ReplayGainEngine {
  private enabled = false;
  private currentGainDB = 0;
  private audioElement: HTMLAudioElement | null = null;
  private baseVolume = 1.0; // user's volume (0-100 → 0-1, applied as quadratic)

  /**
   * Attach to an audio element. The engine will adjust `audio.volume`
   * based on the current gain.
   */
  attach(audio: HTMLAudioElement): void {
    this.audioElement = audio;
    this.baseVolume = audio.volume;
  }

  detach(): void {
    if (this.audioElement) {
      // Restore base volume
      this.audioElement.volume = this.baseVolume;
    }
    this.audioElement = null;
    this.currentGainDB = 0;
    this.enabled = false;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.audioElement) {
      // Restore base volume
      this.audioElement.volume = this.baseVolume;
    }
    this.currentGainDB = 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Apply a gain in dB. Adjusts the audio element's volume property.
   * Positive dB = boost (louder), negative dB = cut (quieter).
   * Clamped to [MAX_CUT_DB, MAX_BOOST_DB].
   */
  applyGain(db: number): void {
    if (!this.enabled || !this.audioElement) return;
    const clamped = Math.max(MAX_CUT_DB, Math.min(MAX_BOOST_DB, db));
    this.currentGainDB = clamped;
    // Convert dB to linear gain multiplier
    const gainMultiplier = Math.pow(10, clamped / 20);
    // Apply to audio volume (clamped to [0, 1])
    const newVolume = Math.max(0, Math.min(1, this.baseVolume * gainMultiplier));
    this.audioElement.volume = newVolume;
  }

  getCurrentGainDB(): number {
    return this.currentGainDB;
  }

  /**
   * Update the base volume (called when user changes volume slider).
   * The current gain is re-applied on top of the new base.
   */
  setBaseVolume(volume: number): void {
    this.baseVolume = Math.max(0, Math.min(1, volume));
    if (this.enabled) {
      this.applyGain(this.currentGainDB);
    } else if (this.audioElement) {
      this.audioElement.volume = this.baseVolume;
    }
  }

  // Stub — measurement is not implemented in this simplified version.
  startMeasurement(): void { /* no-op */ }
  stopMeasurement(): void { /* no-op */ }
}

// Singleton
export const replayGain = new ReplayGainEngine();

/**
 * Genre-based default gains (dB).
 * Bass-heavy genres tend to be mastered louder → cut.
 * Acoustic/jazz/classical tend to be quieter → boost.
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

export function getDefaultGainForGenre(genre: string): number {
  const normalized = (genre || "").toLowerCase().trim();
  return GENRE_DEFAULT_GAINS[normalized] ?? 0;
}
