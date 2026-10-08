/**
 * FullLengthSourceResolver tests — V3 PHASE 4/6 gates.
 *
 * Preview = FAIL. Full track = PASS (user §6).
 */

import { describe, it, expect } from "vitest";
import {
  validateFullLength,
  isNormalPlayable,
  previewLabel,
  capabilitiesFor,
} from "@/lib/playback/fullLength";

const CATALOG_3_46 = { durationSec: 226 }; // Goosebumps
const CATALOG_SHORT = { durationSec: 30 }; // a genuinely short song

describe("validateFullLength", () => {
  it("full-length candidate → ok", () => {
    const v = validateFullLength(CATALOG_3_46, { durationSec: 226, isPreview: false });
    expect(v).toEqual({ isFullLength: true, reason: "ok" });
  });

  it("provider-flagged preview (SNIP) → REJECT even with plausible duration", () => {
    const v = validateFullLength(CATALOG_3_46, { durationSec: 226, isPreview: true });
    expect(v.isFullLength).toBe(false);
    expect(v.reason).toBe("provider-flagged-preview");
  });

  it("~30s teaser → REJECT (short-duration)", () => {
    const v = validateFullLength(CATALOG_3_46, { durationSec: 30, isPreview: false });
    expect(v.isFullLength).toBe(false);
    expect(v.reason).toBe("short-duration");
  });

  it("31-35s promo cut → REJECT", () => {
    for (const d of [31, 33, 35]) {
      expect(validateFullLength(CATALOG_3_46, { durationSec: d, isPreview: false }).isFullLength).toBe(false);
    }
  });

  it("SNIP ratio — 28-45% of a >=60s catalog → REJECT", () => {
    const v = validateFullLength(CATALOG_3_46, { durationSec: 85, isPreview: false });
    expect(v.isFullLength).toBe(false);
    expect(v.reason).toBe("snip-ratio");
  });

  it("short ORIGINAL song (30s catalog, 30s candidate) is NOT a preview", () => {
    const v = validateFullLength(CATALOG_SHORT, { durationSec: 30, isPreview: false });
    expect(v.isFullLength).toBe(true);
  });

  it("unknown duration (0) passes to stream-stage validation (honest)", () => {
    const v = validateFullLength(CATALOG_3_46, { durationSec: 0, isPreview: false });
    expect(v.isFullLength).toBe(true);
  });

  it("boundary: 36s against 226s catalog → REJECTED as a hard fragment (Free Mode §2)", () => {
    // 2026-10-08 live prod case: SC serves 45s/60s SNIP cuts that slipped
    // under the 0.28 ratio window (45/206 = 0.22). Rule 2b: any sub-minute
    // candidate for a 90s+ catalog song is never the full track.
    const v = validateFullLength(CATALOG_3_46, { durationSec: 36, isPreview: false });
    expect(v.isFullLength).toBe(false);
    expect(v.reason).toBe("short-duration");
  });

  it("genuinely short song: 45s candidate with 45s catalog → full (not a fragment)", () => {
    const v = validateFullLength({ durationSec: 45 }, { durationSec: 45, isPreview: false });
    expect(v.isFullLength).toBe(true);
  });

  it("58s interlude against 62s catalog → full (catalog itself is short)", () => {
    const v = validateFullLength({ durationSec: 62 }, { durationSec: 58, isPreview: false });
    expect(v.isFullLength).toBe(true);
  });
});

describe("isNormalPlayable", () => {
  it("full-length candidate with sane duration → true", () => {
    expect(isNormalPlayable(CATALOG_3_46, { durationSec: 226, isPreview: false })).toBe(true);
  });
  it("preview → false", () => {
    expect(isNormalPlayable(CATALOG_3_46, { durationSec: 30, isPreview: false })).toBe(false);
    expect(isNormalPlayable(CATALOG_3_46, { durationSec: 226, isPreview: true })).toBe(false);
  });
  it("absurdly short (<20s) → false", () => {
    expect(isNormalPlayable(CATALOG_3_46, { durationSec: 12, isPreview: false })).toBe(false);
  });
});

describe("previewLabel — honest disclosure", () => {
  it("full → «Полный трек»", () => {
    expect(previewLabel({ isFullLength: true, reason: "ok" })).toBe("Полный трек");
  });
  it("previews are labelled as previews, never as playback", () => {
    expect(previewLabel({ isFullLength: false, reason: "provider-flagged-preview" })).toMatch(/Превью/);
    expect(previewLabel({ isFullLength: false, reason: "short-duration" })).toMatch(/Превью/);
    expect(previewLabel({ isFullLength: false, reason: "snip-ratio" })).toMatch(/Превью/);
  });
});

describe("provider capabilities (PHASE 4 contract)", () => {
  it("soundcloud/audius/local advertise full-length + seek + waveform + queue + background", () => {
    for (const p of ["soundcloud", "audius", "local"] as const) {
      const c = capabilitiesFor(p);
      expect(c.supportsFullLength).toBe(true);
      expect(c.supportsSeek).toBe(true);
      expect(c.supportsWaveform).toBe(true);
      expect(c.supportsQueue).toBe(true);
      expect(c.supportsBackgroundPlay).toBe(true);
    }
  });
  it("spotify-official: full length + seek + queue, but NO raw waveform (SDK gives no stream)", () => {
    const c = capabilitiesFor("spotify-official");
    expect(c.supportsFullLength).toBe(true);
    expect(c.supportsSeek).toBe(true);
    expect(c.supportsWaveform).toBe(false);
  });
});
