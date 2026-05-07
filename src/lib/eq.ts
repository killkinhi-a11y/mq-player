/**
 * 5-Band Parametric Equalizer Engine
 *
 * Creates BiquadFilterNodes for 5 frequency bands and inserts them
 * into the audio graph between gain nodes and analyser.
 *
 * Audio graph: source → gain → EQ chain (5 filters) → analyser → destination
 *
 * Bands:
 *   0: 60Hz  (Bass)
 *   1: 250Hz (Low Mid)
 *   2: 1kHz  (Mid)
 *   3: 4kHz  (High Mid)
 *   4: 16kHz (Treble)
 */

import { getAudioContext, getAnalyser } from "./audioEngine";

export interface EQBand {
  frequency: number;
  type: BiquadFilterType;
  Q: number;
  gain: number;
  label: string;
  labelRu: string;
}

export const EQ_BANDS: EQBand[] = [
  { frequency: 60,   type: "lowshelf",  Q: 0.7, gain: 0, label: "Bass",     labelRu: "Бас" },
  { frequency: 250,  type: "peaking",   Q: 1.0, gain: 0, label: "Low Mid",  labelRu: "Низ. сред." },
  { frequency: 1000, type: "peaking",   Q: 1.0, gain: 0, label: "Mid",      labelRu: "Средн." },
  { frequency: 4000, type: "peaking",   Q: 1.0, gain: 0, label: "High Mid", labelRu: "Выс. сред." },
  { frequency: 16000, type: "highshelf", Q: 0.7, gain: 0, label: "Treble",  labelRu: "ВЧ" },
];

export const EQ_MIN = -12;
export const EQ_MAX = 12;
export const EQ_STEP = 0.5;

export interface EQPreset {
  id: string;
  name: string;
  bands: number[]; // [bass, lowMid, mid, highMid, treble]
}

export const EQ_PRESETS: EQPreset[] = [
  { id: "flat",       name: "Плоская",       bands: [0, 0, 0, 0, 0] },
  { id: "bass-boost", name: "Бас +",         bands: [6, 3, 0, 0, 0] },
  { id: "treble",     name: "ВЧ +",          bands: [0, 0, 0, 3, 6] },
  { id: "vocal",      name: "Вокал",         bands: [-2, 0, 4, 3, 0] },
  { id: "electronic", name: "Электроника",   bands: [5, 2, -1, 2, 4] },
  { id: "rock",       name: "Рок",           bands: [4, 1, -2, 3, 4] },
  { id: "acoustic",   name: "Акустика",      bands: [3, 1, 0, 2, 3] },
  { id: "late-night", name: "Ночная",        bands: [4, 2, 0, -2, -4] },
];

let _eqFilters: BiquadFilterNode[] = [];
let _eqEnabled = false;

/** Get the array of 5 BiquadFilterNodes (empty if not yet created) */
export function getEQFilters(): BiquadFilterNode[] {
  return _eqFilters;
}

/** Whether the EQ is enabled (filters connected to graph) */
export function isEQEnabled(): boolean {
  return _eqEnabled;
}

/**
 * Create the 5 EQ filter nodes and insert them into the audio graph.
 * Must be called after initAudioEngine().
 *
 * Disconnects gain→analyser connections and rewires:
 *   gainA → filter[0] → ... → filter[4] → analyser → destination
 *   gainB → filter[0] (same chain, first filter accepts multiple inputs)
 *
 * @param gainA - GainNode for audio A
 * @param gainB - GainNode for audio B
 */
export function createEQChain(
  gainA: GainNode,
  gainB: GainNode,
  analyser: AnalyserNode,
  destination: AudioDestinationNode,
): BiquadFilterNode[] {
  const ctx = getAudioContext();
  if (!ctx) return [];

  // If filters already exist, remove them first
  if (_eqFilters.length > 0) {
    destroyEQChain(gainA, gainB, analyser, destination);
  }

  const filters: BiquadFilterNode[] = [];

  for (const band of EQ_BANDS) {
    const filter = ctx.createBiquadFilter();
    filter.type = band.type;
    filter.frequency.value = band.frequency;
    filter.Q.value = band.Q;
    filter.gain.value = 0; // start flat
    filters.push(filter);
  }

  // Connect filter chain
  // filters[0] → filters[1] → ... → filters[4] → analyser → destination
  for (let i = 0; i < filters.length - 1; i++) {
    filters[i].connect(filters[i + 1]);
  }
  filters[filters.length - 1].connect(analyser);

  _eqFilters = filters;

  // By default, keep EQ disabled — gains stay connected directly to analyser
  // User must explicitly enable it
  return filters;
}

/**
 * Enable the EQ — connects both gains to the first EQ filter,
 * disconnects gains from direct analyser connection.
 */
export function enableEQ(
  gainA: GainNode,
  gainB: GainNode,
  analyser: AnalyserNode,
  destination: AudioDestinationNode,
): void {
  if (_eqFilters.length === 0) {
    createEQChain(gainA, gainB, analyser, destination);
  }
  if (_eqFilters.length === 0) return;

  // Disconnect gains from direct analyser (if they were connected)
  try { gainA.disconnect(analyser); } catch {}
  try { gainB.disconnect(analyser); } catch {}

  // Connect gains to first EQ filter
  try { gainA.connect(_eqFilters[0]); } catch {}
  try { gainB.connect(_eqFilters[0]); } catch {}

  _eqEnabled = true;
}

/**
 * Disable the EQ — disconnects gains from EQ chain,
 * reconnects them directly to analyser.
 */
export function disableEQ(
  gainA: GainNode,
  gainB: GainNode,
  analyser: AnalyserNode,
  destination: AudioDestinationNode,
): void {
  if (_eqFilters.length === 0) return;

  // Disconnect gains from EQ chain
  try { gainA.disconnect(_eqFilters[0]); } catch {}
  try { gainB.disconnect(_eqFilters[0]); } catch {}

  // Reconnect gains directly to analyser
  try { gainA.connect(analyser); } catch {}
  try { gainB.connect(analyser); } catch {}

  _eqEnabled = false;
}

/**
 * Set the gain for a specific EQ band.
 * @param bandIndex - 0-4
 * @param gain - -12 to +12 dB
 */
export function setEQBand(bandIndex: number, gain: number): void {
  if (bandIndex < 0 || bandIndex >= _eqFilters.length) return;
  const clamped = Math.max(EQ_MIN, Math.min(EQ_MAX, gain));
  _eqFilters[bandIndex].gain.value = clamped;
}

/**
 * Get the current gain value of a band.
 */
export function getEQBand(bandIndex: number): number {
  if (bandIndex < 0 || bandIndex >= _eqFilters.length) return 0;
  return _eqFilters[bandIndex].gain.value;
}

/**
 * Set all EQ bands at once from an array of 5 values.
 */
export function setAllEQBands(bands: number[]): void {
  for (let i = 0; i < Math.min(bands.length, _eqFilters.length); i++) {
    const clamped = Math.max(EQ_MIN, Math.min(EQ_MAX, bands[i]));
    _eqFilters[i].gain.value = clamped;
  }
}

/**
 * Reset all bands to 0dB.
 */
export function resetEQBands(): void {
  for (const filter of _eqFilters) {
    filter.gain.value = 0;
  }
}

/**
 * Destroy the EQ chain — disconnects all filters.
 */
export function destroyEQChain(
  gainA: GainNode,
  gainB: GainNode,
  analyser: AnalyserNode,
  destination: AudioDestinationNode,
): void {
  if (_eqFilters.length === 0) return;

  // If EQ was enabled, reconnect gains directly
  if (_eqEnabled) {
    try { gainA.disconnect(_eqFilters[0]); } catch {}
    try { gainB.disconnect(_eqFilters[0]); } catch {}
    try { gainA.connect(analyser); } catch {}
    try { gainB.connect(analyser); } catch {}
  }

  // Disconnect filter chain
  for (let i = 0; i < _eqFilters.length; i++) {
    try { _eqFilters[i].disconnect(); } catch {}
  }

  _eqFilters = [];
  _eqEnabled = false;
}
