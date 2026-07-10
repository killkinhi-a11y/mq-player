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

// EQ filter chain (created but not connected until user enables EQ)
let _eqFilters: BiquadFilterNode[] = [];

// Crossfade settings
let _crossfadeEnabled = true;
let _crossfadeDuration = 2.0; // seconds

// Gapless playback settings
let _gaplessEnabled = true;

// Track the preloaded track ID so we can detect if the inactive element
// already has the next track loaded and ready for instant swap.
let _gaplessPreloadedTrackId: string | null = null;

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|CriOS/i.test(navigator.userAgent) || window.innerWidth < 768;
}

function createAudioElement(): HTMLAudioElement {
  const audio = new Audio();
  // crossOrigin = "anonymous" is needed for Web Audio API analyser to work
  // (otherwise analyser returns silence on CORS-restricted streams).
  // But it can cause some streams to fail entirely on mobile if the server
  // doesn't send proper CORS headers. We keep it because SoundCloud proxy
  // sends the right headers.
  audio.crossOrigin = "anonymous";
  // Mobile: "metadata" instead of "auto" to save memory/battery.
  // Desktop: "auto" for gapless preload.
  audio.preload = isMobile() ? "metadata" : "auto";
  // Disable pip on mobile (causes flicker) — cast to any because TS doesn't
  // have this property on HTMLAudioElement yet
  (audio as any).disablePictureInPicture = true;
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
  // Mobile: disable crossfade to save memory (2 audio elements = 2x RAM)
  if (isMobile()) return false;
  return _crossfadeEnabled;
}

/**
 * Check if crossfade should be skipped for the given track format.
 * Returns true if the track is lossless and crossfade is currently enabled.
 */
export function shouldSkipCrossfade(audioUrl: string): boolean {
  if (!_crossfadeEnabled) return false;
  const lower = (audioUrl || "").toLowerCase().split("?")[0];
  const losslessExtensions = [".flac", ".wav", ".aiff", ".aif", ".alac", ".wma"];
  return losslessExtensions.some(ext => lower.endsWith(ext));
}

export function setCrossfadeDuration(seconds: number): void {
  _crossfadeDuration = Math.max(0.5, Math.min(8, seconds));
}

export function getCrossfadeDuration(): number {
  return _crossfadeDuration;
}

// ── Gapless Playback ──

export function setGaplessEnabled(enabled: boolean): void {
  _gaplessEnabled = enabled;
  if (!enabled) {
    // Discard any in-progress preload when gapless is turned off
    clearGaplessPreload();
  }
}

export function isGaplessEnabled(): boolean {
  // Mobile: disable gapless preload to save bandwidth + memory
  if (isMobile()) return false;
  return _gaplessEnabled;
}

/** Store the track ID that was preloaded into the inactive element */
export function setGaplessPreloadedTrackId(trackId: string | null): void {
  _gaplessPreloadedTrackId = trackId;
}

/** Get the track ID that was preloaded, or null if none */
export function getGaplessPreloadedTrackId(): string | null {
  return _gaplessPreloadedTrackId;
}

/** Clear the gapless preload state and reset the inactive audio element */
export function clearGaplessPreload(): void {
  _gaplessPreloadedTrackId = null;
  const inactive = getInactiveAudio();
  if (inactive) {
    inactive.pause();
    inactive.currentTime = 0;
    // Destroy any HLS instance on the inactive element
    const hls = (inactive as any)._hlsInstance;
    if (hls) {
      try { hls.destroy(); } catch {}
      delete (inactive as any)._hlsInstance;
    }
    inactive.removeAttribute("src");
    inactive.load();
  }
}

/**
 * Preload a track into the inactive audio element for gapless playback.
 * The caller is responsible for resolving the stream URL and setting up HLS
 * before calling this. This function just calls load() (not play()).
 *
 * @param audioUrl - The audio URL to preload
 * @param trackId - The track ID being preloaded (for matching later)
 * @returns The preloaded HTMLAudioElement, or null on failure
 */
export function preloadTrack(audioUrl: string, trackId: string): HTMLAudioElement | null {
  const inactive = getInactiveAudio();
  if (!inactive) return null;

  // Clean up any previous content on the inactive element
  const prevHls = (inactive as any)._hlsInstance;
  if (prevHls) {
    try { prevHls.destroy(); } catch {}
    delete (inactive as any)._hlsInstance;
  }

  inactive.pause();
  inactive.currentTime = 0;
  inactive.crossOrigin = "anonymous";
  inactive.src = audioUrl;
  inactive.load();

  _gaplessPreloadedTrackId = trackId;
  return inactive;
}

/**
 * Perform a gapless (instant) crossfade from the current audio to the
 * preloaded inactive element. Uses a very short fade (0.1s) for
 * seamless transitions.
 */
export function crossfadeToGapless(newAudio: HTMLAudioElement): void {
  if (!_audioCtx || !_gainA || !_gainB) return;

  const oldGain = _activeAudio === "A" ? _gainA : _gainB;
  const newGain = _activeAudio === "A" ? _gainB : _gainA;
  const duration = 0.1; // instant-ish for gapless
  const now = _audioCtx.currentTime;

  // Cancel ALL previously scheduled ramps on both gain nodes.
  _gainA.gain.cancelScheduledValues(now);
  _gainB.gain.cancelScheduledValues(now);

  // Set initial gain values
  newGain.gain.setValueAtTime(0, now);
  oldGain.gain.setValueAtTime(1, now);

  // Quick ramp for gapless
  newGain.gain.linearRampToValueAtTime(1, now + duration);
  oldGain.gain.linearRampToValueAtTime(0, now + duration);

  // Capture references to the SPECIFIC old audio elements BEFORE swapping
  const oldAudioA = _audioA;
  const oldAudioB = _audioB;
  const wasActiveSlot = _activeAudio;

  // Swap active element
  if (_activeAudio === "A") {
    _activeAudio = "B";
  } else {
    _activeAudio = "A";
  }

  // Determine which element is now the "old" one (fading out)
  const fadingOutElement = wasActiveSlot === "A" ? oldAudioA : oldAudioB;

  // Stop old audio after the quick crossfade completes
  // Re-read active element inside timeout to handle rapid double-skip
  setTimeout(() => {
    const nowActive = getAudioElement();
    if (fadingOutElement && fadingOutElement !== nowActive) {
      fadingOutElement.pause();
      fadingOutElement.currentTime = 0;
      // Destroy any HLS instance on the old element
      const hls = (fadingOutElement as any)._hlsInstance;
      if (hls) { try { hls.destroy(); } catch {} delete (fadingOutElement as any)._hlsInstance; }
    }
  }, 200);

  // Clear the preload marker since we've now consumed it
  _gaplessPreloadedTrackId = null;
}

// ── Adaptive Performance ──
// Dynamically adjusts visualization quality based on device performance.
// Monitors frame times and reduces quality when FPS drops below threshold.

let _perfLevel: "high" | "medium" | "low" = "high";
let _frameTimes: number[] = [];
let _lastFrameTime = 0;
const FRAME_SAMPLE_SIZE = 30; // number of frames to average
const FPS_HIGH_THRESHOLD = 50; // above this → high quality
const FPS_LOW_THRESHOLD = 30;  // below this → low quality

/** Record a frame time for adaptive quality measurement */
export function recordFrameTime(timestamp: number): void {
  if (_lastFrameTime > 0) {
    const delta = timestamp - _lastFrameTime;
    _frameTimes.push(delta);
    if (_frameTimes.length > FRAME_SAMPLE_SIZE) {
      _frameTimes.shift();
    }
  }
  _lastFrameTime = timestamp;

  // Update performance level based on average frame time
  if (_frameTimes.length >= FRAME_SAMPLE_SIZE) {
    const avgFrameTime = _frameTimes.reduce((a, b) => a + b, 0) / _frameTimes.length;
    const avgFPS = 1000 / avgFrameTime;

    if (avgFPS >= FPS_HIGH_THRESHOLD) {
      _perfLevel = "high";
    } else if (avgFPS >= FPS_LOW_THRESHOLD) {
      _perfLevel = "medium";
    } else {
      _perfLevel = "low";
    }
  }
}

/** Get current performance level for adaptive quality */
export function getPerformanceLevel(): "high" | "medium" | "low" {
  return _perfLevel;
}

/** Get recommended visualization bar count based on performance level */
export function getAdaptiveBarCount(): number {
  switch (_perfLevel) {
    case "high": return 256;
    case "medium": return 128;
    case "low": return 64;
  }
}

/** Get recommended canvas resolution scale based on performance level */
export function getAdaptiveCanvasScale(): number {
  switch (_perfLevel) {
    case "high": return 1.0;
    case "medium": return 0.75;
    case "low": return 0.5;
  }
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

    // Create analyser — higher fftSize = finer frequency resolution for visualization
    _analyser = ctx.createAnalyser();
    _analyser.fftSize = 2048;
    _analyser.smoothingTimeConstant = 0.75;

    // Create 10-band EQ filters (pre-create but keep disconnected until enabled)
    const eqBandDefs = [
      { frequency: 32,    type: 'lowshelf' as BiquadFilterType, Q: 0.7 },
      { frequency: 64,    type: 'peaking'  as BiquadFilterType, Q: 1.0 },
      { frequency: 125,   type: 'peaking'  as BiquadFilterType, Q: 1.0 },
      { frequency: 250,   type: 'peaking'  as BiquadFilterType, Q: 1.0 },
      { frequency: 500,   type: 'peaking'  as BiquadFilterType, Q: 1.0 },
      { frequency: 1000,  type: 'peaking'  as BiquadFilterType, Q: 1.0 },
      { frequency: 2000,  type: 'peaking'  as BiquadFilterType, Q: 1.0 },
      { frequency: 4000,  type: 'peaking'  as BiquadFilterType, Q: 1.0 },
      { frequency: 8000,  type: 'peaking'  as BiquadFilterType, Q: 1.0 },
      { frequency: 16000, type: 'highshelf' as BiquadFilterType, Q: 0.7 },
    ];
    _eqFilters = eqBandDefs.map(def => {
      const f = ctx.createBiquadFilter();
      f.type = def.type;
      f.frequency.value = def.frequency;
      f.Q.value = def.Q;
      f.gain.value = 0; // flat by default
      return f;
    });
    // Chain: filter[0] → filter[1] → ... → filter[4]
    for (let i = 0; i < _eqFilters.length - 1; i++) {
      _eqFilters[i].connect(_eqFilters[i + 1]);
    }
    // Last filter → analyser (always connected, but gains don't feed into first filter unless EQ is enabled)
    // We only connect the last filter to analyser; the chain is dormant until gains connect to filter[0]
    _eqFilters[_eqFilters.length - 1].connect(_analyser);

    // Connect: source → gain → analyser → destination
    // (EQ chain exists in parallel but is dormant — gains connect directly to analyser)
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
  if (!_audioCtx) return;
  if (_audioCtx.state === "closed") {
    // AudioContext was closed (e.g. by destroyAudioEngine or browser policy).
    // Reinitialize so subsequent playback calls don't silently fail.
    console.warn("[AudioEngine] AudioContext closed — reinitializing on resume");
    const audio = getAudioElement();
    _analyser = null; // force re-init
    initAudioEngine(audio);
    return;
  }
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume().catch(() => {});
  }
}

/**
 * Check if an audio URL or source points to a lossless format (FLAC, WAV, ALAC, AIFF).
 * Lossless formats should not use crossfade — the gain ramp can cause audible clicks
 * due to sample-accurate decoding differences between the two elements.
 */
export function isLosslessFormat(audio: HTMLAudioElement): boolean {
  const src = audio.src || audio.currentSrc || "";
  const losslessExtensions = [".flac", ".wav", ".aiff", ".aif", ".alac", ".wma"];
  const lower = src.toLowerCase().split("?")[0]; // strip query params
  return losslessExtensions.some(ext => lower.endsWith(ext));
}

/**
 * Perform a crossfade transition from the current audio to a new audio element.
 * The new audio should already be loaded and ready to play before calling this.
 * Automatically falls back to gapless (instant) crossfade for lossless formats
 * (FLAC, WAV, ALAC, AIFF) to prevent audible clicks from gain ramps.
 *
 * @param newAudio - the audio element to fade IN (the inactive one)
 * @param fadeIn - whether to fade in the new audio (default true)
 */
export function crossfadeTo(newAudio: HTMLAudioElement, fadeIn: boolean = true): void {
  if (!_audioCtx || !_gainA || !_gainB) return;

  // ── If crossfade is disabled, do an instant switch instead ──
  if (!_crossfadeEnabled) {
    cancelCrossfade();
    // Instant switch: new audio full volume, old audio silent
    const now = _audioCtx.currentTime;
    _gainA.gain.cancelScheduledValues(now);
    _gainB.gain.cancelScheduledValues(now);
    const newGain = _activeAudio === "A" ? _gainB : _gainA;
    const oldGain = _activeAudio === "A" ? _gainA : _gainB;
    newGain.gain.setValueAtTime(1, now);
    oldGain.gain.setValueAtTime(0, now);
    _activeAudio = _activeAudio === "A" ? "B" : "A";
    return;
  }

  // ── Skip crossfade for lossless formats to prevent clicks ──
  const currentAudio = getAudioElement();
  const isLossless = isLosslessFormat(currentAudio) || isLosslessFormat(newAudio);
  if (isLossless && _crossfadeEnabled) {
    // Use gapless (instant) crossfade instead — no gain ramp = no clicks
    crossfadeToGapless(newAudio);
    return;
  }

  const oldGain = _activeAudio === "A" ? _gainA : _gainB;
  const newGain = _activeAudio === "A" ? _gainB : _gainA;
  const duration = _crossfadeDuration;
  const now = _audioCtx.currentTime;

  // Cancel ALL previously scheduled ramps on both gain nodes.
  _gainA.gain.cancelScheduledValues(now);
  _gainB.gain.cancelScheduledValues(now);

  // Set initial gain values
  newGain.gain.setValueAtTime(fadeIn ? 0 : 1, now);
  oldGain.gain.setValueAtTime(1, now);

  // Ramp gains
  if (fadeIn) {
    newGain.gain.linearRampToValueAtTime(1, now + duration);
    oldGain.gain.linearRampToValueAtTime(0, now + duration);
  } else {
    // Instant switch (no fade)
    newGain.gain.setValueAtTime(1, now);
    oldGain.gain.setValueAtTime(0, now);
  }

  // Capture references to the SPECIFIC old audio elements BEFORE swapping
  // This prevents the race condition where getAudioElement() returns the NEW
  // element after the swap, causing the wrong audio to be paused
  const oldAudioA = _audioA;
  const oldAudioB = _audioB;
  const wasActiveSlot = _activeAudio;

  // Swap active element
  if (_activeAudio === "A") {
    _activeAudio = "B";
  } else {
    _activeAudio = "A";
  }

  // Determine which element is now the "old" one (fading out)
  const fadingOutElement = wasActiveSlot === "A" ? oldAudioA : oldAudioB;

  // Stop old audio after crossfade completes
  // Re-read active element inside timeout to handle rapid double-skip
  setTimeout(() => {
    const nowActive = getAudioElement();
    if (fadingOutElement && fadingOutElement !== nowActive) {
      fadingOutElement.pause();
      fadingOutElement.currentTime = 0;
      // Destroy any HLS instance on the old element to stop buffering
      const hls = (fadingOutElement as any)._hlsInstance;
      if (hls) { try { hls.destroy(); } catch {} delete (fadingOutElement as any)._hlsInstance; }
    }
  }, (duration + 0.1) * 1000);
}

/**
 * Cancel any ongoing crossfade — set active gain to 1, inactive to 0 immediately.
 */
export function cancelCrossfade(): void {
  if (!_audioCtx || !_gainA || !_gainB) return;
  const now = _audioCtx.currentTime;
  // Cancel on BOTH gains unconditionally (not just active/inactive)
  // to handle cases where swap already happened but stale ramps remain
  _gainA.gain.cancelScheduledValues(now);
  _gainB.gain.cancelScheduledValues(now);
  const activeGain = _activeAudio === "A" ? _gainA : _gainB;
  const inactiveGain = _activeAudio === "A" ? _gainB : _gainA;
  activeGain.gain.setValueAtTime(1, now);
  inactiveGain.gain.setValueAtTime(0, now);
}

/**
 * Get frequency data — uses real AnalyserNode data when available,
 * falls back to simulation when CORS blocks real data.
 * Always returns animated data when audio is playing (never all-zeros).
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
    // Gentle exponential decay toward zero for smooth silence
    for (let i = 0; i < dataArray.length; i++) {
      dataArray[i] = Math.floor(dataArray[i] * 0.82);
    }
    return dataArray;
  }

  if (analyser) {
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];

    if (sum > 0) {
      if (_isCorsBlocked) _isCorsBlocked = false;
      // Pass raw data through — the analyser's built-in smoothingTimeConstant
      // handles temporal smoothing. PlayerBar will do its own additional smoothing.
      return dataArray;
    }

    if (activeAudio && activeAudio.currentTime > 0.5 && activeAudio.readyState >= 2) {
      _isCorsBlocked = true;
    }
  }

  // Simulated fallback — clean envelope with beat detection simulation
  // Produces smooth, realistic-looking frequency data without random spikes
  const now = performance.now() / 1000;
  const bufLen = dataArray.length;
  const t = now + (activeAudio?.currentTime || 0) * 0.3;
  const bpm = 2.1; // simulated BPM
  const beatT = t * bpm;
  const beatFrac = beatT % 1;
  // Smooth beat envelope: sharp attack, exponential decay
  const beatEnv = beatFrac < 0.05 ? Math.pow(1 - beatFrac / 0.05, 0.5) : Math.exp(-beatFrac * 4);
  // Sub-beat accent (offbeat, softer)
  const offBeatFrac = (beatT + 0.5) % 1;
  const offBeatEnv = offBeatFrac < 0.04 ? Math.pow(1 - offBeatFrac / 0.04, 0.6) * 0.5 : 0;
  const totalBeatEnv = Math.min(1, beatEnv + offBeatEnv);

  for (let i = 0; i < bufLen; i++) {
    const freq = i / bufLen;
    // Logarithmic frequency envelope — more bass energy, natural rolloff
    const logFreq = Math.max(0, 1 - Math.log(1 + freq * 20) / Math.log(21));
    // Band-specific envelopes with smooth transitions (no hard edges)
    const bassBand = Math.exp(-freq * freq * 80) * totalBeatEnv;
    const lowMidBand = Math.exp(-Math.pow(freq - 0.15, 2) * 30) * (0.4 + 0.2 * totalBeatEnv);
    const midBand = Math.exp(-Math.pow(freq - 0.3, 2) * 20) * (0.25 + 0.15 * totalBeatEnv);
    const highBand = Math.exp(-Math.pow(freq - 0.55, 2) * 15) * (0.12 + 0.08 * totalBeatEnv);
    const trebleBand = Math.exp(-Math.pow(freq - 0.8, 2) * 10) * (0.06 + 0.04 * totalBeatEnv);
    const combined = bassBand + lowMidBand + midBand + highBand + trebleBand;
    const value = Math.max(0, Math.min(255, combined * 255 * logFreq));
    dataArray[i] = Math.floor(value);
  }

  return dataArray;
}

/**
 * Get time-domain (waveform) data from the AnalyserNode.
 * Returns a Uint8Array with values 0–255 centered at 128 (silence).
 * Falls back to a flat line at 128 when no analyser is available.
 */
export function getTimeDomainData(dataArray: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  if (!dataArray.length) return dataArray;

  const analyser = _analyser;
  if (analyser) {
    analyser.getByteTimeDomainData(dataArray);
    return dataArray;
  }

  // No analyser — fill with silence (128 = center)
  dataArray.fill(128);
  return dataArray;
}

/**
 * Reset CORS state — call when switching audio sources
 * so we re-test if real frequency data is available.
 */
export function resetCorsState(): void {
  _isCorsBlocked = true;
}

// ── EQ Audio Graph Management ──

/** Get the pre-created EQ filter nodes (5 BiquadFilters) */
export function getEQFilters(): BiquadFilterNode[] {
  return _eqFilters;
}

/** Get gainA and gainB for EQ rewiring */
export function getGainNodes(): { gainA: GainNode | null; gainB: GainNode | null } {
  return { gainA: _gainA, gainB: _gainB };
}

/** Enable EQ: disconnect gains from analyser, connect gains to first EQ filter */
export function enableEQ(): void {
  if (!_gainA || !_gainB || !_analyser || _eqFilters.length === 0) return;
  try { _gainA.disconnect(_analyser); } catch {}
  try { _gainB.disconnect(_analyser); } catch {}
  try { _gainA.connect(_eqFilters[0]); } catch {}
  try { _gainB.connect(_eqFilters[0]); } catch {}
}

/** Disable EQ: disconnect gains from EQ chain, reconnect to analyser */
export function disableEQ(): void {
  if (!_gainA || !_gainB || !_analyser || _eqFilters.length === 0) return;
  try { _gainA.disconnect(_eqFilters[0]); } catch {}
  try { _gainB.disconnect(_eqFilters[0]); } catch {}
  try { _gainA.connect(_analyser); } catch {}
  try { _gainB.connect(_analyser); } catch {}
}

/** Set a single EQ band gain (-12 to +12 dB) */
export function setEQBand(bandIndex: number, gain: number): void {
  if (bandIndex < 0 || bandIndex >= _eqFilters.length) return;
  _eqFilters[bandIndex].gain.value = Math.max(-12, Math.min(12, gain));
}

/** Set all EQ bands at once */
export function setAllEQBands(bands: number[]): void {
  for (let i = 0; i < Math.min(bands.length, _eqFilters.length); i++) {
    _eqFilters[i].gain.value = Math.max(-12, Math.min(12, bands[i]));
  }
}

/** Reset all EQ bands to 0dB */
export function resetEQBands(): void {
  for (const f of _eqFilters) f.gain.value = 0;
}

// ── Audio Effects: Compressor & Reverb ──
// Вдохновлено видео "ESSENTIALS OF SYNTHESIS" — компрессор для динамической обработки,
// реверб для пространственного эффекта. Оба эффекта подключаются в audio graph.

let _compressor: DynamicsCompressorNode | null = null;
let _compressorEnabled = false;
let _convolver: ConvolverNode | null = null;
let _convolverEnabled = false;
let _dryGain: GainNode | null = null;   // dry signal path
let _wetGain: GainNode | null = null;   // wet (reverb) signal path
let _reverbMix = 0.3; // 0 = dry, 1 = fully wet

/** Generate a synthetic impulse response for reverb */
function generateImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      // Exponential decay with noise
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

/** Enable compressor in the audio graph.
 *  Graph: gainA/B → [EQ chain] → compressor → analyser → destination
 */
export function enableCompressor(): void {
  if (!_audioCtx || !_analyser || _compressorEnabled) return;

  _compressor = _audioCtx.createDynamicsCompressor();
  _compressor.threshold.value = -24;  // Start compressing at -24 dB
  _compressor.knee.value = 30;        // Soft knee
  _compressor.ratio.value = 4;        // 4:1 compression ratio
  _compressor.attack.value = 0.003;   // Fast attack (3ms)
  _compressor.release.value = 0.25;   // 250ms release

  // Rewire: disconnect analyser from destination, insert compressor
  try { _analyser.disconnect(); } catch {}
  try { _analyser.connect(_compressor); } catch {}
  try { _compressor.connect(_audioCtx.destination); } catch {}

  _compressorEnabled = true;
}

/** Disable compressor — bypass it from the graph */
export function disableCompressor(): void {
  if (!_audioCtx || !_analyser || !_compressor || !_compressorEnabled) return;

  // Rewire: remove compressor, reconnect analyser directly
  try { _analyser.disconnect(_compressor); } catch {}
  try { _compressor.disconnect(); } catch {}
  try { _analyser.connect(_audioCtx.destination); } catch {}

  _compressorEnabled = false;
  _compressor = null;
}

/** Update compressor parameters */
export function setCompressorParams(params: {
  threshold?: number;  // -100 to 0 dB
  knee?: number;       // 0 to 40 dB
  ratio?: number;      // 1 to 20
  attack?: number;     // 0 to 1 seconds
  release?: number;    // 0 to 1 seconds
}): void {
  if (!_compressor) return;
  if (params.threshold !== undefined) _compressor.threshold.value = Math.max(-100, Math.min(0, params.threshold));
  if (params.knee !== undefined) _compressor.knee.value = Math.max(0, Math.min(40, params.knee));
  if (params.ratio !== undefined) _compressor.ratio.value = Math.max(1, Math.min(20, params.ratio));
  if (params.attack !== undefined) _compressor.attack.value = Math.max(0, Math.min(1, params.attack));
  if (params.release !== undefined) _compressor.release.value = Math.max(0, Math.min(1, params.release));
}

/** Enable reverb effect using a synthetic impulse response.
 *  Creates a parallel dry/wet mix using ConvolverNode.
 *  Graph: analyser → dryGain → destination
 *                    → convolver → wetGain → destination
 */
export function enableReverb(): void {
  if (!_audioCtx || !_analyser || _convolverEnabled) return;

  // Create dry/wet gain nodes
  _dryGain = _audioCtx.createGain();
  _wetGain = _audioCtx.createGain();
  _dryGain.gain.value = 1 - _reverbMix;
  _wetGain.gain.value = _reverbMix;

  // Create convolver with synthetic impulse response
  _convolver = _audioCtx.createConvolver();
  _convolver.buffer = generateImpulseResponse(_audioCtx, 2.5, 2.5);

  // Rewire: disconnect analyser from destination, route through dry/wet
  try { _analyser.disconnect(); } catch {}
  try { _analyser.connect(_dryGain); } catch {}
  try { _analyser.connect(_convolver); } catch {}
  try { _convolver.connect(_wetGain); } catch {}
  try { _dryGain.connect(_audioCtx.destination); } catch {}
  try { _wetGain.connect(_audioCtx.destination); } catch {}

  _convolverEnabled = true;
}

/** Disable reverb — bypass and reconnect directly */
export function disableReverb(): void {
  if (!_audioCtx || !_analyser || !_convolverEnabled) return;

  // Disconnect everything
  if (_dryGain) try { _analyser.disconnect(_dryGain); } catch {}
  if (_convolver) try { _analyser.disconnect(_convolver); } catch {}
  if (_convolver) try { _convolver.disconnect(); } catch {}
  if (_dryGain) try { _dryGain.disconnect(); } catch {}
  if (_wetGain) try { _wetGain.disconnect(); } catch {}

  // Reconnect analyser directly to destination (or through compressor if active)
  if (_compressorEnabled && _compressor) {
    try { _analyser.connect(_compressor); } catch {}
  } else {
    try { _analyser.connect(_audioCtx.destination); } catch {}
  }

  _convolverEnabled = false;
  _convolver = null;
  _dryGain = null;
  _wetGain = null;
}

/** Set reverb mix level (0 = fully dry, 1 = fully wet) */
export function setReverbMix(mix: number): void {
  _reverbMix = Math.max(0, Math.min(1, mix));
  if (_dryGain) _dryGain.gain.value = 1 - _reverbMix;
  if (_wetGain) _wetGain.gain.value = _reverbMix;
}

/** Check if compressor is enabled */
export function isCompressorEnabled(): boolean {
  return _compressorEnabled;
}

/** Check if reverb is enabled */
export function isReverbEnabled(): boolean {
  return _convolverEnabled;
}

/** Get current compressor params for UI display */
export function getCompressorParams(): {
  threshold: number; knee: number; ratio: number;
  attack: number; release: number;
} | null {
  if (!_compressor) return null;
  return {
    threshold: _compressor.threshold.value,
    knee: _compressor.knee.value,
    ratio: _compressor.ratio.value,
    attack: _compressor.attack.value,
    release: _compressor.release.value,
  };
}

/** Get current reverb mix */
export function getReverbMix(): number {
  return _reverbMix;
}

// ── Element Replacement (Firefox EME compatibility) ──
//
// In Firefox, once an audio element is connected to MediaElementAudioSourceNode
// via createMediaElementSource(), calling setMediaKeys() on it throws
// NotSupportedError. This is because Firefox routes the element through the
// Web Audio graph and the CDM can't intercept the encrypted data.
//
// The fix is a two-step process:
//   1. replaceAudioElement() — creates a fresh element WITHOUT connecting to Web Audio
//   2. setMediaKeys() — attaches DRM keys to the fresh un-captured element
//   3. connectElementToAudioGraph() — THEN creates MediaElementAudioSourceNode
//
// Registered listener callbacks are invoked on the new element so that
// PlayerBar can re-attach event listeners (timeupdate, ended, error, etc.).

const _audioListenerCallbacks: Array<(el: HTMLAudioElement) => void> = [];

/**
 * Register a callback that will be invoked whenever a new audio element
 * is created/replaced in the engine. Used to re-attach event listeners.
 * Returns an unsubscribe function to remove the callback.
 */
export function onAudioElementReplaced(callback: (el: HTMLAudioElement) => void): () => void {
  _audioListenerCallbacks.push(callback);
  return () => {
    const idx = _audioListenerCallbacks.indexOf(callback);
    if (idx >= 0) _audioListenerCallbacks.splice(idx, 1);
  };
}

/**
 * Replace an audio element with a fresh one WITHOUT connecting it to the
 * Web Audio graph. The caller must call connectElementToAudioGraph() after
 * setting MediaKeys on the returned element.
 *
 * In Firefox, createMediaElementSource() and setMediaKeys() are mutually
 * exclusive on the same element — once captured, setMediaKeys() permanently
 * throws NotSupportedError. So the order MUST be:
 *   1. replaceAudioElement()  → fresh un-captured element
 *   2. setMediaKeys()          → attach DRM keys
 *   3. connectElementToAudioGraph() → THEN connect to Web Audio
 *
 * @returns The new audio element (NOT yet connected to Web Audio)
 */
export function replaceAudioElement(oldElement: HTMLAudioElement): HTMLAudioElement {
  const slot: "A" | "B" | null =
    _audioA === oldElement ? "A" :
    _audioB === oldElement ? "B" : null;

  if (!slot || !_audioCtx || !_analyser) {
    console.warn("[AudioEngine] replaceAudioElement: engine not initialized, returning original");
    return oldElement;
  }

  console.log("[AudioEngine] Replacing element in slot", slot, "(Firefox EME compatibility — no Web Audio yet)");

  // Create a fresh audio element
  const newElement = createAudioElement();

  // Disconnect old source from gain node
  const oldSource = slot === "A" ? _sourceA : _sourceB;
  if (oldSource) {
    try { oldSource.disconnect(); } catch {}
  }

  // Update internal references — but do NOT create MediaElementAudioSourceNode yet!
  // setMediaKeys() must be called first (Firefox limitation).
  if (slot === "A") {
    _audioA = newElement;
    _sourceA = null; // will be created in connectElementToAudioGraph()
  } else {
    _audioB = newElement;
    _sourceB = null; // will be created in connectElementToAudioGraph()
  }

  // Re-attach registered listener callbacks on the new element
  for (const cb of _audioListenerCallbacks) {
    try { cb(newElement); } catch (e) {
      console.error("[AudioEngine] Listener callback error on replacement:", e);
    }
  }

  return newElement;
}

/**
 * Connect an audio element to the Web Audio graph by creating a
 * MediaElementAudioSourceNode and wiring it into the appropriate gain node.
 *
 * MUST be called AFTER setMediaKeys() when dealing with encrypted content
 * (Firefox requires setMediaKeys before createMediaElementSource).
 *
 * For non-encrypted content, this is automatically done during initAudioEngine().
 */
export function connectElementToAudioGraph(element: HTMLAudioElement): void {
  const slot: "A" | "B" | null =
    _audioA === element ? "A" :
    _audioB === element ? "B" : null;

  if (!slot || !_audioCtx || !_analyser) {
    console.warn("[AudioEngine] connectElementToAudioGraph: engine not initialized or element not in a slot");
    return;
  }

  // Already connected?
  const existingSource = slot === "A" ? _sourceA : _sourceB;
  if (existingSource) {
    console.log("[AudioEngine] connectElementToAudioGraph: element already connected in slot", slot);
    return;
  }

  console.log("[AudioEngine] Connecting element in slot", slot, "to Web Audio graph");

  const newSource = _audioCtx.createMediaElementSource(element);
  const gain = slot === "A" ? _gainA : _gainB;
  if (gain) newSource.connect(gain);

  if (slot === "A") {
    _sourceA = newSource;
  } else {
    _sourceB = newSource;
  }
}

/**
 * Set the playback rate on the currently active audio element.
 * Clamps rate between 0.25 and 3.0.
 * Also sets the rate on the inactive element so crossfade transitions stay in sync.
 */
export function setAudioPlaybackRate(rate: number): void {
  const clamped = Math.max(0.25, Math.min(3.0, rate));
  if (_audioA) _audioA.playbackRate = clamped;
  if (_audioB) _audioB.playbackRate = clamped;
}

/**
 * Destroy the audio engine and release all resources.
 * Call when the player component unmounts or when switching contexts.
 * Releases AudioContext, stops audio elements, and clears all references.
 */
export function destroyAudioEngine(): void {
  // Pause and clean up audio elements
  if (_audioA) { _audioA.pause(); _audioA.removeAttribute("src"); }
  if (_audioB) { _audioB.pause(); _audioB.removeAttribute("src"); }

  // Close AudioContext to release system audio resources
  if (_audioCtx) {
    try { _audioCtx.close(); } catch {}
  }

  // Null all references
  _audioCtx = null;
  _analyser = null;
  _audioA = null;
  _audioB = null;
  _gainA = null;
  _gainB = null;
  _sourceA = null;
  _sourceB = null;
  _eqFilters = [];
  _compressor = null;
  _compressorEnabled = false;
  _convolver = null;
  _convolverEnabled = false;
  _dryGain = null;
  _wetGain = null;
  _reverbMix = 0.3;
  _activeAudio = "A";
  _isCorsBlocked = true;
  _gaplessEnabled = true;
  _gaplessPreloadedTrackId = null;
  _perfLevel = "high";
  _frameTimes = [];
  _lastFrameTime = 0;

  // Don't clear listener callbacks — they're registered by components
  // that will re-register on remount anyway
}
