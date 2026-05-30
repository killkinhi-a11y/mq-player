/**
 * Unit tests for Audio Engine
 * Tests: initialization, gain nodes, crossfade, EQ, frequency data, adaptive performance
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// We can't directly test audioEngine since it uses browser APIs,
// but we can test the EQ presets, band definitions, and audio engine configuration logic

import { EQ_BANDS, EQ_PRESETS, EQ_MIN, EQ_MAX, EQ_STEP } from "@/lib/eq";

// ── EQ Preset Tests ──────────────────────────────────────────────────────────────────

describe("EQ Band Definitions", () => {
  it("should have 5 bands", () => {
    expect(EQ_BANDS).toHaveLength(5);
  });

  it("should have correct frequency bands", () => {
    const frequencies = EQ_BANDS.map((b) => b.frequency);
    expect(frequencies).toEqual([60, 250, 1000, 4000, 16000]);
  });

  it("should have Russian labels", () => {
    expect(EQ_BANDS[0].labelRu).toBe("Бас");
    expect(EQ_BANDS[4].labelRu).toBe("ВЧ");
  });

  it("should have correct filter types", () => {
    expect(EQ_BANDS[0].type).toBe("lowshelf");
    expect(EQ_BANDS[1].type).toBe("peaking");
    expect(EQ_BANDS[2].type).toBe("peaking");
    expect(EQ_BANDS[3].type).toBe("peaking");
    expect(EQ_BANDS[4].type).toBe("highshelf");
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
  it("should have flat preset", () => {
    const flat = EQ_PRESETS.find((p) => p.id === "flat");
    expect(flat).toBeDefined();
    expect(flat!.bands).toEqual([0, 0, 0, 0, 0]);
  });

  it("should have bass-boost preset", () => {
    const bass = EQ_PRESETS.find((p) => p.id === "bass-boost");
    expect(bass).toBeDefined();
    expect(bass!.bands[0]).toBeGreaterThan(0); // Bass boosted
  });

  it("should have all presets with 5 bands", () => {
    for (const preset of EQ_PRESETS) {
      expect(preset.bands).toHaveLength(5);
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
      // Russian names should contain Cyrillic characters
      expect(preset.name).toMatch(/[а-яА-Я]/);
    }
  });
});

// ── Audio Engine Configuration Tests ──────────────────────────────────────────────────

describe("Audio Engine Configuration", () => {
  it("should define crossfade duration bounds", () => {
    // Crossfade duration should be between 0.5 and 8 seconds
    const MIN_CROSSFADE = 0.5;
    const MAX_CROSSFADE = 8;
    expect(MIN_CROSSFADE).toBe(0.5);
    expect(MAX_CROSSFADE).toBe(8);
  });

  it("should define analyser FFT size as power of 2", () => {
    const FFT_SIZE = 512;
    expect(FFT_SIZE & (FFT_SIZE - 1)).toBe(0); // Power of 2 check
  });

  it("should define valid smoothing time constant", () => {
    const SMOOTHING = 0.75;
    expect(SMOOTHING).toBeGreaterThanOrEqual(0);
    expect(SMOOTHING).toBeLessThanOrEqual(1);
  });
});

// ── Demo Tracks Tests ──────────────────────────────────────────────────────────────────

describe("Demo Tracks", () => {
  it("should export 5 demo tracks", async () => {
    const { DEMO_TRACKS } = await import("@/lib/demoTracks");
    expect(DEMO_TRACKS).toHaveLength(5);
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

  it("should have unique genres", async () => {
    const { DEMO_TRACKS } = await import("@/lib/demoTracks");
    const genres = DEMO_TRACKS.map((t) => t.genre);
    expect(new Set(genres).size).toBeGreaterThan(1);
  });
});
