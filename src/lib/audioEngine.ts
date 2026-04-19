/**
 * Shared Audio Engine
 * Provides a single AudioContext, AnalyserNode, and source for the entire app.
 * PlayerBar creates the audio element; FullTrackView and PiPPlayer reuse the analyser.
 *
 * For local files served with CORS, we use REAL frequency data from the AnalyserNode.
 * For SoundCloud streams (no CORS), we fall back to simulated frequency data.
 */

let _audioCtx: AudioContext | null = null;
let _analyser: AnalyserNode | null = null;
let _source: MediaElementAudioSourceNode | null = null;
let _audio: HTMLAudioElement | null = null;
let _isCorsBlocked = true; // assume blocked until we know otherwise

export function getAudioElement(): HTMLAudioElement {
  if (!_audio) {
    _audio = new Audio();
    _audio.crossOrigin = "anonymous";
    _audio.preload = "auto";
  }
  return _audio;
}

export function getAnalyser(): AnalyserNode | null {
  return _analyser;
}

export function getAudioContext(): AudioContext | null {
  return _audioCtx;
}

export function getAudioElementRef(): HTMLAudioElement | null {
  return _audio;
}

export function isCorsBlocked(): boolean {
  return _isCorsBlocked;
}

export function markCorsBlocked(blocked: boolean): void {
  _isCorsBlocked = blocked;
}

/**
 * Called once by PlayerBar to set up the Web Audio pipeline.
 * idempotent — safe to call multiple times.
 */
export function initAudioEngine(audio: HTMLAudioElement): AnalyserNode | null {
  if (_analyser) return _analyser;

  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);
    analyser.connect(ctx.destination);

    _audioCtx = ctx;
    _analyser = analyser;
    _source = source;
    _audio = audio;

    return analyser;
  } catch {
    return null;
  }
}

export function resumeAudioContext(): void {
  if (_audioCtx?.state === "suspended") {
    _audioCtx.resume().catch(() => {});
  }
}

/**
 * Get frequency data — uses real AnalyserNode data when available,
 * falls back to simulation when CORS blocks real data.
 *
 * Strategy:
 *  1. Always attempt to read real frequency data from the AnalyserNode.
 *  2. If we get non-zero values and audio is playing → real data available (CORS OK).
 *  3. If all zeros and audio has been playing a while → CORS is blocked, simulate.
 *  4. When paused/ended → fade out whatever is currently in the array.
 */
export function getFrequencyData(dataArray: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  if (!dataArray.length) return dataArray;

  const audio = _audio;
  const analyser = _analyser;

  if (!audio || audio.paused || audio.ended) {
    // Fade out when paused
    for (let i = 0; i < dataArray.length; i++) {
      dataArray[i] = Math.floor(dataArray[i] * 0.85);
    }
    return dataArray;
  }

  // ── Step 1: Always try to get real frequency data from the AnalyserNode ──
  if (analyser) {
    analyser.getByteFrequencyData(dataArray);

    // Check if we got real data by summing all values
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];

    if (sum > 0) {
      // Real frequency data is available!
      // Once we see non-zero data, mark CORS as unblocked
      if (_isCorsBlocked) {
        _isCorsBlocked = false;
      }

      // Apply gentle smoothing for visual appeal (moving average across bins)
      const temp = new Uint8Array(dataArray.length);
      for (let i = 0; i < dataArray.length; i++) {
        const prev = i > 0 ? dataArray[i - 1] : dataArray[i];
        const curr = dataArray[i];
        const next = i < dataArray.length - 1 ? dataArray[i + 1] : dataArray[i];
        temp[i] = Math.round(curr * 0.5 + prev * 0.25 + next * 0.25);
      }
      dataArray.set(temp);
      return dataArray;
    }

    // All zeros — check if audio has been playing long enough to trust the result
    if (audio.currentTime > 0.5 && audio.readyState >= 2) {
      // Audio is actively playing but analyser returns nothing → CORS blocked
      _isCorsBlocked = true;
    }
  }

  // ── Step 2: No real data available (CORS blocked or analyser missing) → simulate ──
  const now = performance.now() / 1000;
  const bufLen = dataArray.length;
  const t = now + (audio.currentTime || 0) * 0.3;

  for (let i = 0; i < bufLen; i++) {
    const freq = i / bufLen;

    // Bass frequencies (0-0.15): strong, pulsing
    const bassEnvelope = Math.max(0, 1 - freq * 7);
    const bassPulse = 0.6 + 0.4 * Math.sin(t * 3.5 + Math.floor(t * 2.2) * 1.7);
    const bass = bassEnvelope * bassPulse;

    // Low-mid (0.1-0.35): medium presence
    const lowMidEnv = Math.max(0, Math.min(1, (freq - 0.1) * 5)) * Math.max(0, 1 - (freq - 0.15) * 4);
    const lowMid = lowMidEnv * (0.4 + 0.3 * Math.sin(t * 5.3 + i * 0.15));

    // High-mid (0.3-0.6): moderate, varied
    const highMidEnv = Math.max(0, Math.min(1, (freq - 0.3) * 4)) * Math.max(0, 1 - (freq - 0.4) * 5);
    const highMid = highMidEnv * (0.3 + 0.25 * Math.sin(t * 7.1 + i * 0.25));

    // Treble (0.6-1.0): subtle shimmer
    const trebleEnv = Math.max(0, freq - 0.6) * 2.5;
    const treble = trebleEnv * (0.15 + 0.15 * Math.sin(t * 11.3 + i * 0.4));

    // Combine all bands
    const combined = bass + lowMid + highMid + treble;

    // Add subtle noise for organic feel
    const noise = 0.06 * Math.sin(t * 17.3 + i * 2.1) + 0.04 * Math.sin(t * 23.7 + i * 3.3);

    // Occasional "beat drops"
    const beatPhase = (t * 2.2) % 1;
    const beat = beatPhase < 0.08 ? (1 - beatPhase / 0.08) * 0.3 * bassEnvelope : 0;

    const value = Math.max(0, Math.min(255, (combined + noise + beat) * 220));
    dataArray[i] = Math.floor(value);
  }

  // Boost higher frequencies for more visual presence at right side
  for (let i = Math.floor(bufLen * 0.6); i < bufLen; i++) {
    const boost = 1.0 + ((i - bufLen * 0.6) / (bufLen * 0.4)) * 0.8;
    dataArray[i] = Math.min(255, Math.floor(dataArray[i] * boost));
  }

  return dataArray;
}

/**
 * Reset CORS state — call when switching from SoundCloud to local file
 * so we re-test if real frequency data is available.
 */
export function resetCorsState(): void {
  _isCorsBlocked = true;
}
