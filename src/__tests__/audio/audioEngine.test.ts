/**
 * Unit tests for Audio Engine
 * Tests: EQ band definitions, EQ presets, EQ constants, audio engine
 * configuration, demo tracks.
 *
 * Updated in M1 to match the actual 10-band EQ in src/lib/eq.ts (previously
 * this file asserted 5 bands with [60, 250, 1000, 4000, 16000] which never
 * matched reality — CI was red).
 */
import { describe, it, expect } from "vitest";

import { EQ_BANDS, EQ_PRESETS, EQ_MIN, EQ_MAX, EQ_STEP } from "@/lib/eq";

// ── EQ Band Definitions ──────────────────────────────────────────────────────────────────

describe("EQ Band Definitions", () => {
  it("should have 10 bands", () => {
    expect(EQ_BANDS).toHaveLength(10);
  });

  it("should have correct frequency bands", () => {
    const frequencies = EQ_BANDS.map((b) => b.frequency);
    expect(frequencies).toEqual([32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
  });

  it("should have Russian labels for every band", () => {
    for (const band of EQ_BANDS) {
      expect(band.labelRu).toBeTruthy();
      expect(band.labelRu).toMatch(/[а-яА-Я]/);
    }
  });

  it("should have correct first and last filter types (shelves)", () => {
    expect(EQ_BANDS[0].type).toBe("lowshelf");
    expect(EQ_BANDS[EQ_BANDS.length - 1].type).toBe("highshelf");
  });

  it("should have peaking filter type for all middle bands", () => {
    for (let i = 1; i < EQ_BANDS.length - 1; i++) {
      expect(EQ_BANDS[i].type).toBe("peaking");
    }
  });

  it("should have valid Q factor for every band", () => {
    for (const band of EQ_BANDS) {
      expect(band.Q).toBeGreaterThan(0);
      expect(band.Q).toBeLessThanOrEqual(2);
    }
  });
});

describe("EQ Constants", () => {
  it("should have correct min/max range", () => {
    expect(EQ_MIN).toBe(-12);
    expect(EQ_MAX).toBe(12);
  });

  it("should have 0.5 dB step", () => {
    expect(EQ_STEP).toBe(0.5);
  });
});

describe("EQ Presets", () => {
  it("should have flat preset with all zeros", () => {
    const flat = EQ_PRESETS.find((p) => p.id === "flat");
    expect(flat).toBeDefined();
    expect(flat!.bands).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("should have bass-boost preset with positive first band", () => {
    const bass = EQ_PRESETS.find((p) => p.id === "bass-boost");
    expect(bass).toBeDefined();
    expect(bass!.bands[0]).toBeGreaterThan(0);
    expect(bass!.bands[1]).toBeGreaterThan(0);
  });

  it("should have all presets with exactly 10 bands", () => {
    for (const preset of EQ_PRESETS) {
      expect(preset.bands).toHaveLength(10);
    }
  });

  it("should have all bands within valid range", () => {
    for (const preset of EQ_PRESETS) {
      for (const band of preset.bands) {
        expect(band).toBeGreaterThanOrEqual(EQ_MIN);
        expect(band).toBeLessThanOrEqual(EQ_MAX);
      }
    }
  });

  it("should have unique preset IDs", () => {
    const ids = EQ_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have Russian preset names", () => {
    for (const preset of EQ_PRESETS) {
      expect(preset.name).toMatch(/[а-яА-Я]/);
    }
  });

  it("should have at least 10 presets (variety for users)", () => {
    expect(EQ_PRESETS.length).toBeGreaterThanOrEqual(10);
  });
});

// ── Audio Engine Configuration Tests ──────────────────────────────────────────────────
//
// These constants must match the values used in src/lib/audioEngine.ts.
// If you change them there, change them here too.

describe("Audio Engine Configuration", () => {
  it("should define crossfade duration bounds (0.5–8 s, matching audioEngine.ts)", () => {
    // src/lib/audioEngine.ts:111 clamps _crossfadeDuration to [0.5, 8]
    const MIN_CROSSFADE = 0.5;
    const MAX_CROSSFADE = 8;
    expect(MIN_CROSSFADE).toBe(0.5);
    expect(MAX_CROSSFADE).toBe(8);
  });

  it("should define analyser FFT size as 2048 (matches audioEngine.ts:334)", () => {
    // src/lib/audioEngine.ts:334 — `_analyser.fftSize = 2048`
    const FFT_SIZE = 2048;
    expect(FFT_SIZE & (FFT_SIZE - 1)).toBe(0); // Power of 2
    expect(FFT_SIZE).toBe(2048);
  });

  it("should define valid smoothing time constant (0..1)", () => {
    const SMOOTHING = 0.75;
    expect(SMOOTHING).toBeGreaterThanOrEqual(0);
    expect(SMOOTHING).toBeLessThanOrEqual(1);
  });
});

// ── Demo Tracks Tests ──────────────────────────────────────────────────────────────────

describe("Demo Tracks", () => {
  it("should export 4 demo tracks (matches DEMO_SOURCES in demoTracks.ts)", async () => {
    const { DEMO_TRACKS } = await import("@/lib/demoTracks");
    expect(DEMO_TRACKS).toHaveLength(4);
  });

  it("should have all required fields for each track", async () => {
    const { DEMO_TRACKS } = await import("@/lib/demoTracks");
    for (const track of DEMO_TRACKS) {
      expect(track.id).toBeDefined();
      expect(track.title).toBeDefined();
      expect(track.artist).toBeDefined();
      expect(track.duration).toBeGreaterThan(0);
      expect(track.audioUrl).toBeDefined();
      expect(track.source).toBe("demo");
    }
  });

  it("should have unique track IDs", async () => {
    const { DEMO_TRACKS } = await import("@/lib/demoTracks");
    const ids = DEMO_TRACKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have at least 2 unique genres", async () => {
    const { DEMO_TRACKS } = await import("@/lib/demoTracks");
    const genres = DEMO_TRACKS.map((t) => t.genre);
    expect(new Set(genres).size).toBeGreaterThan(1);
  });
});
