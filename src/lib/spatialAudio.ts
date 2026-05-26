/**
 * Spatial Audio Engine
 * Uses Web Audio API to create a spatial processing chain that positions
 * frequency bands in 3D space based on mood presets.
 *
 * Architecture:
 *   source → splitter → [band filter → panner → gain] → merger → destination
 *                                (×5 bands)
 *
 * The chain is inserted between the existing analyser output and the destination.
 * It can be enabled/disabled and transitioned between moods without disrupting playback.
 */

import { getAudioContext, getAnalyser } from "./audioEngine";

// ── Types ──

export type Mood = "chill" | "bassy" | "melodic" | "dark" | "upbeat" | "romantic" | "aggressive" | "dreamy";

export interface SpatialBand {
  name: string;
  frequency: number; // Hz
  Q: number;
  pan: number;       // -1 to 1
  gain: number;      // 0 to 2
}

export interface SpatialConfig {
  mood: Mood;
  bands: SpatialBand[];
  stereoWidth: number; // 0 to 2
}

// ── Mood Keywords (reused from recommendations route) ──

const MOOD_KEYWORDS: Record<Mood, string[]> = {
  chill: ["chill", "relax", "calm", "easy", "mellow", "smooth", "soft", "gentle", "slow", "peaceful", "serene", "laid back", "cozy"],
  bassy: ["bass", "bass boosted", "sub bass", "808", "banger", "drop", "wobble", "rattle", "slap"],
  melodic: ["melodic", "melody", "piano", "guitar", "harmonic", "orchestral", "strings", "keys", "ambient", "ethereal"],
  dark: ["dark", "grimy", "gritty", "raw", "underground", "shadow", "void", "sinister", "noir", "midnight", "dungeon"],
  upbeat: ["upbeat", "happy", "energetic", "hype", "feel good", "party", "dance", "fun", "bright", "summer", "sunny"],
  romantic: ["love", "heart", "kiss", "romance", "baby", "darling", "miss you", "together", "forever", "tender", "intimate"],
  aggressive: ["hard", "heavy", "aggressive", "intense", "brutal", "rage", "fury", "smash", "destroy", "war", "violent"],
  dreamy: ["dream", "float", "cloud", "space", "cosmic", "ethereal", "haze", "glow", "atmospheric", "euphoric", "transcend"],
};

// Genre-based mood hints
const GENRE_MOOD_MAP: Record<string, Mood> = {
  "ambient": "dreamy", "lo-fi": "chill", "lofi": "chill", "chill": "chill",
  "downtempo": "chill", "jazz": "melodic", "classical": "melodic", "piano": "melodic",
  "edm": "upbeat", "techno": "dark", "trap": "aggressive", "drum and bass": "aggressive",
  "hip-hop": "bassy", "rap": "bassy", "r&b": "romantic", "rnb": "romantic", "soul": "romantic",
  "dubstep": "bassy", "house": "upbeat", "deep house": "chill", "trance": "dreamy",
  "synthwave": "dreamy", "metal": "aggressive", "punk": "aggressive", "rock": "melodic",
  "pop": "melodic", "indie": "melodic", "bossa nova": "romantic", "blues": "dark",
  "drill": "dark", "reggaeton": "upbeat", "afrobeats": "upbeat", "folk": "melodic",
};

// ── Spatial Presets ──

const SPATIAL_PRESETS: Record<Mood, { bands: SpatialBand[]; stereoWidth: number }> = {
  chill: {
    stereoWidth: 1.6,
    bands: [
      { name: "Sub-bass", frequency: 60, Q: 0.8, pan: 0, gain: 1.1 },
      { name: "Bass", frequency: 200, Q: 0.9, pan: -0.2, gain: 0.9 },
      { name: "Mid", frequency: 1000, Q: 0.7, pan: 0, gain: 1.2 },
      { name: "High-mid", frequency: 4000, Q: 0.8, pan: 0.3, gain: 0.85 },
      { name: "Treble", frequency: 10000, Q: 0.6, pan: -0.25, gain: 0.95 },
    ],
  },
  upbeat: {
    stereoWidth: 1.8,
    bands: [
      { name: "Sub-bass", frequency: 60, Q: 0.8, pan: 0, gain: 1.3 },
      { name: "Bass", frequency: 200, Q: 0.9, pan: -0.1, gain: 1.2 },
      { name: "Mid", frequency: 1000, Q: 0.7, pan: 0.15, gain: 1.1 },
      { name: "High-mid", frequency: 4000, Q: 0.8, pan: 0.6, gain: 1.15 },
      { name: "Treble", frequency: 10000, Q: 0.6, pan: -0.55, gain: 1.2 },
    ],
  },
  dark: {
    stereoWidth: 0.7,
    bands: [
      { name: "Sub-bass", frequency: 60, Q: 1.0, pan: 0, gain: 1.5 },
      { name: "Bass", frequency: 200, Q: 0.9, pan: 0.05, gain: 1.4 },
      { name: "Mid", frequency: 1000, Q: 0.8, pan: 0, gain: 0.9 },
      { name: "High-mid", frequency: 4000, Q: 0.9, pan: 0.1, gain: 0.7 },
      { name: "Treble", frequency: 10000, Q: 0.7, pan: -0.1, gain: 0.6 },
    ],
  },
  dreamy: {
    stereoWidth: 2.0,
    bands: [
      { name: "Sub-bass", frequency: 60, Q: 0.6, pan: 0, gain: 0.8 },
      { name: "Bass", frequency: 200, Q: 0.7, pan: -0.4, gain: 0.85 },
      { name: "Mid", frequency: 1000, Q: 0.5, pan: 0.2, gain: 1.1 },
      { name: "High-mid", frequency: 4000, Q: 0.6, pan: -0.35, gain: 1.2 },
      { name: "Treble", frequency: 10000, Q: 0.4, pan: 0.45, gain: 1.3 },
    ],
  },
  romantic: {
    stereoWidth: 1.2,
    bands: [
      { name: "Sub-bass", frequency: 60, Q: 0.8, pan: 0, gain: 1.0 },
      { name: "Bass", frequency: 200, Q: 0.9, pan: -0.1, gain: 1.05 },
      { name: "Mid", frequency: 1000, Q: 0.7, pan: 0, gain: 1.3 },
      { name: "High-mid", frequency: 4000, Q: 0.8, pan: 0.2, gain: 1.0 },
      { name: "Treble", frequency: 10000, Q: 0.6, pan: -0.15, gain: 1.1 },
    ],
  },
  aggressive: {
    stereoWidth: 1.5,
    bands: [
      { name: "Sub-bass", frequency: 60, Q: 0.9, pan: -0.5, gain: 1.4 },
      { name: "Bass", frequency: 200, Q: 1.0, pan: 0.4, gain: 1.3 },
      { name: "Mid", frequency: 1000, Q: 0.8, pan: 0, gain: 1.2 },
      { name: "High-mid", frequency: 4000, Q: 0.9, pan: 0.6, gain: 1.3 },
      { name: "Treble", frequency: 10000, Q: 0.7, pan: -0.55, gain: 1.1 },
    ],
  },
  bassy: {
    stereoWidth: 1.0,
    bands: [
      { name: "Sub-bass", frequency: 60, Q: 1.0, pan: 0, gain: 1.6 },
      { name: "Bass", frequency: 200, Q: 0.9, pan: 0, gain: 1.5 },
      { name: "Mid", frequency: 1000, Q: 0.8, pan: 0.1, gain: 0.9 },
      { name: "High-mid", frequency: 4000, Q: 0.8, pan: -0.2, gain: 0.8 },
      { name: "Treble", frequency: 10000, Q: 0.7, pan: 0.15, gain: 0.85 },
    ],
  },
  melodic: {
    stereoWidth: 1.3,
    bands: [
      { name: "Sub-bass", frequency: 60, Q: 0.8, pan: 0, gain: 0.9 },
      { name: "Bass", frequency: 200, Q: 0.9, pan: -0.15, gain: 1.0 },
      { name: "Mid", frequency: 1000, Q: 0.6, pan: 0, gain: 1.4 },
      { name: "High-mid", frequency: 4000, Q: 0.7, pan: 0.25, gain: 1.15 },
      { name: "Treble", frequency: 10000, Q: 0.5, pan: -0.2, gain: 1.2 },
    ],
  },
};

// ── Internal State ──

let _initialized = false;
let _enabled = false;
let _currentMood: Mood = "chill";

// Audio nodes
interface BandChain {
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  gain: GainNode;
}

let _splitter: ChannelSplitterNode | null = null;
let _merger: ChannelMergerNode | null = null;
let _bandChains: BandChain[] = [];
let _inputGain: GainNode | null = null;
let _outputGain: GainNode | null = null;

// Transition state
let _transitionRAF: number = 0;
let _transitionStart = 0;
const TRANSITION_DURATION = 2.5; // seconds

// Target / current band values for smooth lerping
let _targetBands: SpatialBand[] = [];
let _currentBands: SpatialBand[] = [];
let _targetStereoWidth = 1.0;
let _currentStereoWidth = 1.0;

// ── Helpers ──

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function cloneBands(bands: SpatialBand[]): SpatialBand[] {
  return bands.map(b => ({ ...b }));
}

// ── Public API ──

export function initSpatialAudio(): boolean {
  if (_initialized) return true;

  const ctx = getAudioContext();
  const analyser = getAnalyser();
  if (!ctx || !analyser) return false;

  try {
    // Create spatial chain nodes
    _inputGain = ctx.createGain();
    _outputGain = ctx.createGain();
    _splitter = ctx.createChannelSplitter(2);
    _merger = ctx.createChannelMerger(2);

    // Create 5 band chains (one per frequency band)
    const defaultPreset = SPATIAL_PRESETS[_currentMood];
    _bandChains = [];

    for (let i = 0; i < 5; i++) {
      const band = defaultPreset.bands[i];

      const filter = ctx.createBiquadFilter();
      filter.type = i === 0 ? "lowshelf" : i === 4 ? "highshelf" : "peaking";
      filter.frequency.value = band.frequency;
      filter.Q.value = band.Q;
      filter.gain.value = 0; // flat by default — we use separate gain node for volume

      const panner = ctx.createStereoPanner();
      panner.pan.value = band.pan * (defaultPreset.stereoWidth / 2);

      const gain = ctx.createGain();
      gain.gain.value = band.gain;

      _bandChains.push({ filter, panner, gain });
    }

    // Initialize current/target bands
    _currentBands = cloneBands(defaultPreset.bands);
    _targetBands = cloneBands(defaultPreset.bands);
    _currentStereoWidth = defaultPreset.stereoWidth;
    _targetStereoWidth = defaultPreset.stereoWidth;

    _initialized = true;
    console.log("[SpatialAudio] Initialized successfully");
    return true;
  } catch (err) {
    console.error("[SpatialAudio] Init failed:", err);
    return false;
  }
}

/**
 * Enable or disable the spatial audio chain.
 * When enabling: inserts the chain between analyser → destination.
 * When disabling: reconnects analyser directly to destination.
 */
export function enableSpatialAudio(enabled: boolean): void {
  if (!_initialized) {
    if (enabled) {
      const ok = initSpatialAudio();
      if (!ok) return;
    } else {
      return;
    }
  }

  const ctx = getAudioContext();
  const analyser = getAnalyser();
  if (!ctx || !analyser || !_splitter || !_merger || !_inputGain || !_outputGain) return;

  if (enabled === _enabled) return;

  try {
    // Disconnect analyser from destination (if currently connected)
    try { analyser.disconnect(ctx.destination); } catch { /* may not be connected */ }

    if (enabled) {
      // Build the spatial chain:
      // analyser → inputGain → splitter → [filter → panner → gain] → merger → outputGain → destination
      analyser.connect(_inputGain);
      _inputGain.connect(_splitter);

      for (let i = 0; i < _bandChains.length; i++) {
        const chain = _bandChains[i];
        _splitter.connect(chain.filter, 0);
        _splitter.connect(chain.filter, 1);

        chain.filter.connect(chain.panner);
        chain.panner.connect(chain.gain);

        // Connect to both channels of merger
        chain.gain.connect(_merger, 0, 0);
        chain.gain.connect(_merger, 0, 1);
      }

      _merger.connect(_outputGain);
      _outputGain.connect(ctx.destination);

      // Start transition animation loop
      startTransitionLoop();
      console.log("[SpatialAudio] Enabled");
    } else {
      // Disconnect the spatial chain
      stopTransitionLoop();
      disconnectChain();

      // Reconnect analyser directly to destination
      analyser.connect(ctx.destination);
      console.log("[SpatialAudio] Disabled");
    }

    _enabled = enabled;
  } catch (err) {
    console.error("[SpatialAudio] Toggle error:", err);
    // Fallback: reconnect analyser directly
    try {
      disconnectChain();
      analyser.connect(ctx.destination);
    } catch { /* ignore */ }
    _enabled = false;
  }
}

function disconnectChain(): void {
  if (!_inputGain || !_splitter || !_merger || !_outputGain) return;
  try {
    _inputGain.disconnect();
    _splitter.disconnect();
    _merger.disconnect();
    _outputGain.disconnect();
    for (const chain of _bandChains) {
      try {
        chain.filter.disconnect();
        chain.panner.disconnect();
        chain.gain.disconnect();
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export function isSpatialAudioEnabled(): boolean {
  return _enabled;
}

/**
 * Transition to a new mood preset with smooth interpolation.
 */
export function setMoodPreset(mood: Mood): void {
  _currentMood = mood;
  const preset = SPATIAL_PRESETS[mood];

  if (!_enabled || _bandChains.length === 0) {
    // Just update targets — they'll be applied when enabled
    _targetBands = cloneBands(preset.bands);
    _targetStereoWidth = preset.stereoWidth;
    _currentBands = cloneBands(preset.bands);
    _currentStereoWidth = preset.stereoWidth;
    return;
  }

  // Start smooth transition
  _transitionStart = performance.now();
  _targetBands = cloneBands(preset.bands);
  _targetStereoWidth = preset.stereoWidth;

  // Make sure transition loop is running
  startTransitionLoop();
}

function startTransitionLoop(): void {
  if (_transitionRAF) return;
  _transitionStart = performance.now();
  animateTransition();
}

function stopTransitionLoop(): void {
  if (_transitionRAF) {
    cancelAnimationFrame(_transitionRAF);
    _transitionRAF = 0;
  }
}

function animateTransition(): void {
  if (!_enabled) {
    _transitionRAF = 0;
    return;
  }

  const now = performance.now();
  const elapsed = (now - _transitionStart) / 1000;
  const t = Math.min(1, elapsed / TRANSITION_DURATION);
  const eased = easeInOutCubic(t);

  // Interpolate band parameters
  let needsUpdate = t < 1;
  for (let i = 0; i < _bandChains.length; i++) {
    const chain = _bandChains[i];
    const current = _currentBands[i];
    const target = _targetBands[i];

    const pan = lerp(current.pan, target.pan, eased);
    const gain = lerp(current.gain, target.gain, eased);

    chain.panner.pan.value = pan * (_currentStereoWidth / 2);
    chain.gain.gain.value = gain;

    if (t >= 1) {
      // Snap current to target when done
      _currentBands[i] = { ..._targetBands[i] };
    }
  }

  // Interpolate stereo width
  _currentStereoWidth = lerp(
    _currentBands.length > 0 ? _currentStereoWidth : _targetStereoWidth,
    _targetStereoWidth,
    eased,
  );

  if (needsUpdate) {
    _transitionRAF = requestAnimationFrame(animateTransition);
  } else {
    // Transition complete — snap final values
    for (let i = 0; i < _bandChains.length; i++) {
      const chain = _bandChains[i];
      const target = _targetBands[i];
      chain.panner.pan.value = target.pan * (_targetStereoWidth / 2);
      chain.gain.gain.value = target.gain;
      _currentBands[i] = { ...target };
    }
    _currentStereoWidth = _targetStereoWidth;
    _transitionRAF = 0;
  }
}

/**
 * Detect mood from track metadata (title + genre).
 * Uses keyword matching and genre-based heuristics.
 */
export function detectMoodFromTrack(title: string, genre: string): Mood {
  const text = `${title} ${genre}`.toLowerCase();

  // First check genre for a direct match
  const genreLower = genre.toLowerCase().trim();
  for (const [genreKw, mood] of Object.entries(GENRE_MOOD_MAP)) {
    if (genreLower.includes(genreKw) || genreKw.includes(genreLower)) {
      return mood;
    }
  }

  // Score each mood by keyword matches
  const scores: Record<string, number> = {};
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        score += 1;
      }
    }
    if (score > 0) scores[mood] = score;
  }

  // Return the mood with the highest score, or default to melodic
  const entries = Object.entries(scores);
  if (entries.length === 0) return "melodic";

  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0] as Mood;
}

/**
 * Get the current spatial configuration for visualization.
 */
export function getCurrentSpatialConfig(): SpatialConfig | null {
  if (!_initialized) return null;

  return {
    mood: _currentMood,
    bands: cloneBands(_currentBands),
    stereoWidth: _currentStereoWidth,
  };
}

/**
 * Get current frequency band levels (0-255) for visualization.
 * Uses the existing AnalyserNode to compute average levels per band.
 */
export function getFrequencyBandLevels(): number[] {
  const analyser = getAnalyser();
  if (!analyser) return [0, 0, 0, 0, 0];

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const sampleRate = getAudioContext()?.sampleRate || 44100;
  const fftSize = analyser.fftSize;
  const binWidth = sampleRate / fftSize;

  // Band frequency ranges (approximate for fftSize=512)
  const bandRanges = [
    { start: 20, end: 80 },      // Sub-bass
    { start: 80, end: 300 },     // Bass
    { start: 300, end: 2000 },   // Mid
    { start: 2000, end: 6000 },  // High-mid
    { start: 6000, end: 20000 }, // Treble
  ];

  const levels: number[] = [];
  for (const range of bandRanges) {
    const startBin = Math.max(0, Math.floor(range.start / binWidth));
    const endBin = Math.min(bufferLength - 1, Math.floor(range.end / binWidth));
    let sum = 0;
    let count = 0;
    for (let i = startBin; i <= endBin; i++) {
      sum += dataArray[i];
      count++;
    }
    levels.push(count > 0 ? Math.round(sum / count) : 0);
  }

  return levels;
}

/**
 * Get the list of available moods with their display info.
 */
export function getAvailableMoods(): { mood: Mood; label: string; icon: string; color: string }[] {
  return [
    { mood: "chill", label: "Chill", icon: "🌿", color: "#4ade80" },
    { mood: "upbeat", label: "Upbeat", icon: "⚡", color: "#fbbf24" },
    { mood: "dark", label: "Dark", icon: "🌑", color: "#6b7280" },
    { mood: "dreamy", label: "Dreamy", icon: "✨", color: "#a78bfa" },
    { mood: "romantic", label: "Romantic", icon: "💗", color: "#f472b6" },
    { mood: "aggressive", label: "Aggressive", icon: "🔥", color: "#ef4444" },
    { mood: "bassy", label: "Bassy", icon: "🔊", color: "#f97316" },
    { mood: "melodic", label: "Melodic", icon: "🎵", color: "#38bdf8" },
  ];
}

/**
 * Get the current mood.
 */
export function getCurrentMood(): Mood {
  return _currentMood;
}
