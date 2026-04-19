/**
 * Shared Audio Engine
 * Provides AudioContext, AnalyserNode, and dual-audio crossfade support.
 *
 * Crossfade: Two HTMLAudioElements share one AudioContext via GainNodes.
 * When transitioning tracks, the old audio fades out while the new fades in.
 * The analyser is connected to both gain nodes for seamless visualization.
 *
 * For local files served with CORS, we use REAL frequency data from the AnalyserNode.
 * For SoundCloud streams via proxy (with CORS), we also get real data.
 */

let _audioCtx: AudioContext | null = null;
let _analyser: AnalyserNode | null = null;
let _isCorsBlocked = true; // assume blocked until we know otherwise

// Dual audio elements for crossfade
let _audioA: HTMLAudioElement | null = null;
let _audioB: HTMLAudioElement | null = null;
let _activeAudio: "A" | "B" = "A"; // which element is currently the "main" one

// GainNodes for crossfade
let _gainA: GainNode | null = null;
let _gainB: GainNode | null = null;
let _sourceA: MediaElementAudioSourceNode | null = null;
let _sourceB: MediaElementAudioSourceNode | null = null;

// Crossfade settings
let _crossfadeEnabled = true;
let _crossfadeDuration = 2.0; // seconds

function createAudioElement(): HTMLAudioElement {
  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  return audio;
}

/** Get the currently active audio element (for compatibility) */
export function getAudioElement(): HTMLAudioElement {
  if (_activeAudio === "A") {
    if (!_audioA) _audioA = createAudioElement();
    return _audioA;
  } else {
    if (!_audioB) _audioB = createAudioElement();
    return _audioB;
  }
}

/** Get the other (inactive) audio element for crossfade */
export function getInactiveAudio(): HTMLAudioElement | null {
  if (_activeAudio === "A") {
    if (!_audioB) _audioB = createAudioElement();
    return _audioB;
  } else {
    if (!_audioA) _audioA = createAudioElement();
    return _audioA;
  }
}

export function getAnalyser(): AnalyserNode | null {
  return _analyser;
}

export function getAudioContext(): AudioContext | null {
  return _audioCtx;
}

export function getAudioElementRef(): HTMLAudioElement | null {
  return _activeAudio === "A" ? _audioA : _audioB;
}

export function isCorsBlocked(): boolean {
  return _isCorsBlocked;
}

export function markCorsBlocked(blocked: boolean): void {
  _isCorsBlocked = blocked;
}

export function setCrossfadeEnabled(enabled: boolean): void {
  _crossfadeEnabled = enabled;
}

export function isCrossfadeEnabled(): boolean {
  return _crossfadeEnabled;
}

export function setCrossfadeDuration(seconds: number): void {
  _crossfadeDuration = Math.max(0.5, Math.min(8, seconds));
}

export function getCrossfadeDuration(): number {
  return _crossfadeDuration;
}

/**
 * Called once by PlayerBar to set up the Web Audio pipeline.
 * Creates two audio element slots with GainNodes for crossfade.
 * idempotent — safe to call multiple times.
 */
export function initAudioEngine(audio: HTMLAudioElement): AnalyserNode | null {
  if (_analyser) return _analyser;

  try {
    const ctx = new AudioContext();

    // Create both audio elements
    _audioA = audio; // use the passed-in element as A
    _audioA.crossOrigin = "anonymous";
    _audioB = createAudioElement();

    // Create gain nodes
    _gainA = ctx.createGain();
    _gainB = ctx.createGain();

    // Create media element sources
    _sourceA = ctx.createMediaElementSource(_audioA);
    _sourceB = ctx.createMediaElementSource(_audioB);

    // Create analyser
    _analyser = ctx.createAnalyser();
    _analyser.fftSize = 512;
    _analyser.smoothingTimeConstant = 0.85;

    // Connect: source → gain → analyser → destination
    _sourceA.connect(_gainA);
    _sourceB.connect(_gainB);
    _gainA.connect(_analyser);
    _gainB.connect(_analyser);
    _analyser.connect(ctx.destination);

    // Start with A active, B silent
    _gainA.gain.value = 1.0;
    _gainB.gain.value = 0.0;

    _audioCtx = ctx;

    return _analyser;
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
 * Perform a crossfade transition from the current audio to a new audio element.
 * The new audio should already be loaded and ready to play before calling this.
 *
 * @param newAudio - the audio element to fade IN (the inactive one)
 * @param fadeIn - whether to fade in the new audio (default true)
 */
export function crossfadeTo(newAudio: HTMLAudioElement, fadeIn: boolean = true): void {
  if (!_audioCtx || !_gainA || !_gainB) return;

  const oldGain = _activeAudio === "A" ? _gainA : _gainB;
  const newGain = _activeAudio === "A" ? _gainB : _gainA;
  const duration = _crossfadeDuration;
  const startTime = _audioCtx.currentTime;

  // Set initial gain values
  newGain.gain.setValueAtTime(fadeIn ? 0 : 1, startTime);
  oldGain.gain.setValueAtTime(1, startTime);

  // Ramp gains
  if (fadeIn) {
    newGain.gain.linearRampToValueAtTime(1, startTime + duration);
    oldGain.gain.linearRampToValueAtTime(0, startTime + duration);
  } else {
    // Instant switch (no fade)
    newGain.gain.setValueAtTime(1, startTime);
    oldGain.gain.setValueAtTime(0, startTime);
  }

  // Swap active element
  if (_activeAudio === "A") {
    _activeAudio = "B";
  } else {
    _activeAudio = "A";
  }

  // Stop old audio after crossfade completes
  const oldAudio = _activeAudio === "A" ? _audioA : _audioB;
  setTimeout(() => {
    if (oldAudio && oldAudio !== getAudioElement()) {
      oldAudio.pause();
      // Don't set src="" — keeps it ready for next crossfade
    }
  }, (duration + 0.1) * 1000);
}

/**
 * Cancel any ongoing crossfade — set active gain to 1, inactive to 0 immediately.
 */
export function cancelCrossfade(): void {
  if (!_audioCtx || !_gainA || !_gainB) return;
  const now = _audioCtx.currentTime;
  const activeGain = _activeAudio === "A" ? _gainA : _gainB;
  const inactiveGain = _activeAudio === "A" ? _gainB : _gainA;
  activeGain.gain.cancelScheduledValues(now);
  inactiveGain.gain.cancelScheduledValues(now);
  activeGain.gain.setValueAtTime(1, now);
  inactiveGain.gain.setValueAtTime(0, now);
}

/**
 * Get frequency data — uses real AnalyserNode data when available,
 * falls back to simulation when CORS blocks real data.
 */
export function getFrequencyData(dataArray: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  if (!dataArray.length) return dataArray;

  const audioA = _audioA;
  const audioB = _audioB;
  const activeAudio = getAudioElement();
  const analyser = _analyser;

  // Check if any audio is playing
  const isPlaying = (audioA && !audioA.paused && !audioA.ended) || (audioB && !audioB.paused && !audioB.ended);

  if (!isPlaying) {
    for (let i = 0; i < dataArray.length; i++) {
      dataArray[i] = Math.floor(dataArray[i] * 0.85);
    }
    return dataArray;
  }

  if (analyser) {
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];

    if (sum > 0) {
      if (_isCorsBlocked) _isCorsBlocked = false;

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

    if (activeAudio && activeAudio.currentTime > 0.5 && activeAudio.readyState >= 2) {
      _isCorsBlocked = true;
    }
  }

  // Simulated fallback
  const now = performance.now() / 1000;
  const bufLen = dataArray.length;
  const t = now + (activeAudio?.currentTime || 0) * 0.3;

  for (let i = 0; i < bufLen; i++) {
    const freq = i / bufLen;
    const bassEnvelope = Math.max(0, 1 - freq * 7);
    const bassPulse = 0.6 + 0.4 * Math.sin(t * 3.5 + Math.floor(t * 2.2) * 1.7);
    const bass = bassEnvelope * bassPulse;
    const lowMidEnv = Math.max(0, Math.min(1, (freq - 0.1) * 5)) * Math.max(0, 1 - (freq - 0.15) * 4);
    const lowMid = lowMidEnv * (0.4 + 0.3 * Math.sin(t * 5.3 + i * 0.15));
    const highMidEnv = Math.max(0, Math.min(1, (freq - 0.3) * 4)) * Math.max(0, 1 - (freq - 0.4) * 5);
    const highMid = highMidEnv * (0.3 + 0.25 * Math.sin(t * 7.1 + i * 0.25));
    const trebleEnv = Math.max(0, freq - 0.6) * 2.5;
    const treble = trebleEnv * (0.15 + 0.15 * Math.sin(t * 11.3 + i * 0.4));
    const combined = bass + lowMid + highMid + treble;
    const noise = 0.06 * Math.sin(t * 17.3 + i * 2.1) + 0.04 * Math.sin(t * 23.7 + i * 3.3);
    const beatPhase = (t * 2.2) % 1;
    const beat = beatPhase < 0.08 ? (1 - beatPhase / 0.08) * 0.3 * bassEnvelope : 0;
    const value = Math.max(0, Math.min(255, (combined + noise + beat) * 220));
    dataArray[i] = Math.floor(value);
  }

  for (let i = Math.floor(bufLen * 0.6); i < bufLen; i++) {
    const boost = 1.0 + ((i - bufLen * 0.6) / (bufLen * 0.4)) * 0.8;
    dataArray[i] = Math.min(255, Math.floor(dataArray[i] * boost));
  }

  return dataArray;
}

/**
 * Reset CORS state — call when switching audio sources
 * so we re-test if real frequency data is available.
 */
export function resetCorsState(): void {
  _isCorsBlocked = true;
}
