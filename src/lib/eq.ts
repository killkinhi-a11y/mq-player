/**
 * 10-Band Parametric Equalizer — Data Definitions
 *
 * This module exports ONLY the data: band definitions, presets, constants,
 * and TypeScript interfaces. The actual EQ runtime functions
 * (enableEQ/disableEQ/setEQBand/setAllEQBands/resetEQBands/getEQFilters/
 * createEQChain/destroyEQChain/isEQEnabled/getEQBand) live in
 * src/lib/audioEngine.ts and operate on the active audio graph.
 *
 * Previously this file duplicated those functions (calling them via a
 * separate _eqFilters[] array here) — they were never called by anything
 * except tests, while useAppStore and EqualizerView used the audioEngine.ts
 * versions. The duplicate was removed in M3.3 to eliminate the
 * "which EQ am I actually controlling?" ambiguity.
 *
 * Audio graph: source → gain → EQ chain (10 filters) → analyser → destination
 *
 * Bands (10 полос для тонкого контроля):
 *   0:  32Hz   (Sub Bass)
 *   1:  64Hz   (Bass)
 *   2:  125Hz  (Low Mid)
 *   3:  250Hz  (Mid-Low)
 *   4:  500Hz  (Mid)
 *   5:  1kHz   (Mid-High)
 *   6:  2kHz   (Presence Low)
 *   7:  4kHz   (Presence)
 *   8:  8kHz   (Brilliance)
 *   9:  16kHz  (Air)
 */

export interface EQBand {
  frequency: number;
  type: BiquadFilterType;
  Q: number;
  gain: number;
  label: string;
  labelRu: string;
}

export const EQ_BANDS: EQBand[] = [
  { frequency: 32,    type: "lowshelf",  Q: 0.7, gain: 0, label: "Sub Bass",   labelRu: "Саб" },
  { frequency: 64,    type: "peaking",   Q: 1.0, gain: 0, label: "Bass",       labelRu: "Бас" },
  { frequency: 125,   type: "peaking",   Q: 1.0, gain: 0, label: "Low Mid",    labelRu: "Низ. сред." },
  { frequency: 250,   type: "peaking",   Q: 1.0, gain: 0, label: "Mid-Low",    labelRu: "Ср-низ." },
  { frequency: 500,   type: "peaking",   Q: 1.0, gain: 0, label: "Mid",        labelRu: "Средн." },
  { frequency: 1000,  type: "peaking",   Q: 1.0, gain: 0, label: "Mid-High",   labelRu: "Ср-выс." },
  { frequency: 2000,  type: "peaking",   Q: 1.0, gain: 0, label: "Presence L", labelRu: "Присут. Н" },
  { frequency: 4000,  type: "peaking",   Q: 1.0, gain: 0, label: "Presence",   labelRu: "Присут." },
  { frequency: 8000,  type: "peaking",   Q: 1.0, gain: 0, label: "Brilliance", labelRu: "Блеск" },
  { frequency: 16000, type: "highshelf", Q: 0.7, gain: 0, label: "Air",        labelRu: "Воздух" },
];

export const EQ_MIN = -12;
export const EQ_MAX = 12;
export const EQ_STEP = 0.5;

export interface EQPreset {
  id: string;
  name: string;
  bands: number[]; // 10 values
}

export const EQ_PRESETS: EQPreset[] = [
  { id: "flat",        name: "Плоская",       bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "bass-boost",  name: "Бас +",         bands: [6, 5, 3, 1, 0, 0, 0, 0, 0, 0] },
  { id: "treble",      name: "ВЧ +",          bands: [0, 0, 0, 0, 0, 0, 1, 3, 5, 6] },
  { id: "vocal",       name: "Вокал",         bands: [-2, -1, 0, 1, 3, 4, 3, 2, 0, 0] },
  { id: "electronic",  name: "Электроника",   bands: [5, 4, 2, 0, -1, -1, 1, 2, 4, 5] },
  { id: "rock",        name: "Рок",           bands: [4, 3, 1, -1, -2, -1, 1, 3, 4, 4] },
  { id: "acoustic",    name: "Акустика",      bands: [2, 2, 1, 0, 1, 1, 1, 2, 3, 3] },
  { id: "late-night",  name: "Ночная",        bands: [3, 3, 2, 1, 0, 0, -1, -2, -3, -4] },
  { id: "bass-heavy",  name: "Саб +",         bands: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: "podcast",     name: "Подкаст",       bands: [-3, -2, 0, 2, 4, 5, 4, 3, 1, 0] },
  { id: "cinematic",   name: "Кино",          bands: [4, 3, 2, 0, -1, 0, 1, 2, 3, 4] },
  { id: "v-shape",     name: "V-образная",    bands: [5, 4, 2, -1, -3, -3, -1, 2, 4, 5] },
];
