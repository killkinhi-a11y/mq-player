/**
 * Skip Intelligence tests — V3 PHASE 24-27 gates.
 *
 * §25 model verification: seconds-based buckets, time decay, channelled
 * profile (artist positive / style negative), smart-queue adjustment.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  classifySkipSeconds,
  eventWeight,
  timeDecay,
  buildSkipProfile,
  skipScoreAdjustment,
  buildSkipEvent,
  appendSkipEvent,
  loadSkipEvents,
  saveSkipEvents,
  CLASS_WEIGHTS,
  POSITIVE_WEIGHTS,
  DEFAULT_HALF_LIFE_MS,
  type SkipEventV3,
} from "@/lib/listening/skipIntelligence";

beforeEach(() => {
  window.localStorage.clear();
});

function ev(partial: Partial<SkipEventV3> & { trackId: string; artist: string }): SkipEventV3 {
  return {
    startedAt: Date.now() - 30000,
    skippedAt: Date.now(),
    playedSeconds: 30,
    duration: 200,
    completionRatio: 0.15,
    skipPosition: 30,
    kind: "skip",
    ...partial,
  };
}

describe("classifySkipSeconds — §25 mandated buckets", () => {
  it("skip < 10 sec → strong negative", () => {
    expect(classifySkipSeconds(5, 200)).toBe("strong_negative");
    expect(classifySkipSeconds(0, 200)).toBe("strong_negative");
  });
  it("10–30 sec → negative", () => {
    expect(classifySkipSeconds(15, 200)).toBe("negative");
    expect(classifySkipSeconds(29, 200)).toBe("negative");
  });
  it("30–60 sec → moderate negative", () => {
    expect(classifySkipSeconds(45, 200)).toBe("moderate_negative");
  });
  it("≥60% listened → weak negative", () => {
    expect(classifySkipSeconds(130, 200)).toBe("weak_negative");
  });
  it("≥90% listened → almost neutral", () => {
    expect(classifySkipSeconds(185, 200)).toBe("almost_neutral");
  });
  it("100% → completed (positive)", () => {
    expect(classifySkipSeconds(200, 200)).toBe("completed");
    expect(classifySkipSeconds(199.5, 200)).toBe("completed");
  });
  it("unmeasurable → null (honest)", () => {
    expect(classifySkipSeconds(NaN, 200)).toBeNull();
    expect(classifySkipSeconds(-5, 200)).toBeNull();
  });
});

describe("eventWeight — decayed §25 weights", () => {
  const now = Date.now();
  it("raw weights match the §25 table", () => {
    expect(CLASS_WEIGHTS.strong_negative).toBe(-1.0);
    expect(CLASS_WEIGHTS.negative).toBe(-0.7);
    expect(CLASS_WEIGHTS.moderate_negative).toBe(-0.45);
    expect(CLASS_WEIGHTS.weak_negative).toBe(-0.25);
    expect(CLASS_WEIGHTS.almost_neutral).toBe(-0.1);
    expect(CLASS_WEIGHTS.completed).toBe(0.5);
    expect(POSITIVE_WEIGHTS.replay).toBe(0.8);
    expect(POSITIVE_WEIGHTS.favorite).toBe(1.0);
  });

  it("fresh 5-second skip ≈ −1.0", () => {
    const e = ev({ trackId: "t1", artist: "A", playedSeconds: 5, skippedAt: now });
    expect(eventWeight(e, now)).toBeCloseTo(-1.0, 2);
  });

  it("time decay: 14-day-old event halves, 28-day-old quarters", () => {
    const e = ev({ trackId: "t2", artist: "A", playedSeconds: 5, skippedAt: now });
    const w14 = eventWeight(e, now + DEFAULT_HALF_LIFE_MS);
    const w28 = eventWeight(e, now + 2 * DEFAULT_HALF_LIFE_MS);
    expect(w14).toBeCloseTo(-0.5, 2);
    expect(w28).toBeCloseTo(-0.25, 2);
  });

  it("decay function: 1.0 now, 0.5 at half-life", () => {
    expect(timeDecay(now, now)).toBeCloseTo(1, 5);
    expect(timeDecay(now, now + DEFAULT_HALF_LIFE_MS)).toBeCloseTo(0.5, 5);
  });

  it("favorite is the strongest positive; replay close behind", () => {
    expect(eventWeight(ev({ trackId: "t", artist: "A", kind: "favorite", playedSeconds: 0 }), now)).toBeCloseTo(1.0, 2);
    expect(eventWeight(ev({ trackId: "t", artist: "A", kind: "replay", playedSeconds: 0 }), now)).toBeCloseTo(0.8, 2);
  });
});

describe("buildSkipProfile — §26 channelled affinities", () => {
  const now = Date.now();
  it("THE §26 example: artist stays positive while the STYLE goes negative", () => {
    const events: SkipEventV3[] = [
      // loves Travis Scott: completions + favorite
      ev({ trackId: "s1", artist: "travis scott", kind: "complete", playedSeconds: 200, skippedAt: now }),
      ev({ trackId: "s2", artist: "travis scott", kind: "favorite", playedSeconds: 0, skippedAt: now }),
      // …but skips Acoustic/Live variants early
      ev({ trackId: "s3", artist: "travis scott", versionTag: "acoustic", playedSeconds: 6, skippedAt: now }),
      ev({ trackId: "s4", artist: "travis scott", versionTag: "live", playedSeconds: 8, skippedAt: now }),
    ];
    const p = buildSkipProfile(events, now);
    // Artist channel nets POSITIVE (completions/favorite outweigh half-weight skips)
    expect(p.artists["travis scott"]).toBeGreaterThan(0);
    // Style channel is hard NEGATIVE (full-weight skips)
    expect(p.styles["acoustic"]).toBeLessThan(-0.8);
    expect(p.styles["live"]).toBeLessThan(-0.8);
  });

  it("genres accumulate negative affinity from repeated skips", () => {
    const events: SkipEventV3[] = [
      ev({ trackId: "g1", artist: "X", genre: "ambient", playedSeconds: 5, skippedAt: now }),
      ev({ trackId: "g2", artist: "Y", genre: "ambient", playedSeconds: 8, skippedAt: now }),
    ];
    const p = buildSkipProfile(events, now);
    expect(p.genres["ambient"]).toBeLessThan(-0.4);
  });

  it("old events fade out of the profile", () => {
    const old = ev({ trackId: "o1", artist: "Z", playedSeconds: 5, skippedAt: now - 6 * DEFAULT_HALF_LIFE_MS });
    const p = buildSkipProfile([old], now);
    expect(Math.abs(p.artists["z"] ?? 0)).toBeLessThan(0.05);
  });
});

describe("skipScoreAdjustment — §27 smart queue ranking", () => {
  const now = Date.now();
  it("skipped A/B/C → near-identical D scores LOW, different-artist E scores HIGH", () => {
    const events: SkipEventV3[] = [
      ev({ trackId: "a", artist: "same artist", playedSeconds: 5, skippedAt: now }),
      ev({ trackId: "b", artist: "same artist", playedSeconds: 6, skippedAt: now }),
      ev({ trackId: "c", artist: "same artist", playedSeconds: 4, skippedAt: now }),
    ];
    const p = buildSkipProfile(events, now);
    const d = skipScoreAdjustment({ artist: "Same Artist", trackId: "d" }, p);
    const e = skipScoreAdjustment({ artist: "Completely Different" }, p);
    expect(d).toBeLessThan(-1);
    expect(e).toBe(0);
    expect(d).toBeLessThan(e);
  });

  it("positive artist is a mild pull (familiarity), scaled down by discovery", () => {
    const events = [
      ev({ trackId: "p1", artist: "beloved", kind: "favorite", playedSeconds: 0, skippedAt: now }),
    ];
    const p = buildSkipProfile(events, now);
    const familiar = skipScoreAdjustment({ artist: "Beloved" }, p, { discovery: 0 });
    const exploring = skipScoreAdjustment({ artist: "Beloved" }, p, { discovery: 1 });
    expect(familiar).toBeGreaterThan(0);
    expect(exploring).toBe(0); // full discovery mutes positive pull, keeps negatives
  });

  it("style aversion dominates the adjustment", () => {
    const events = [
      ev({ trackId: "s1", artist: "a", versionTag: "slowed", playedSeconds: 5, skippedAt: now }),
    ];
    const p = buildSkipProfile(events, now);
    const slowed = skipScoreAdjustment({ artist: "b", versionTag: "slowed" }, p);
    const normal = skipScoreAdjustment({ artist: "b" }, p);
    expect(slowed).toBeLessThan(-0.9);
    expect(normal).toBe(0);
  });
});

describe("buildSkipEvent — §24 field completeness", () => {
  it("carries every mandated field", () => {
    const e = buildSkipEvent({
      track: {
        id: "cat_sp_x_sc_y",
        artist: "Travis Scott",
        genre: "rap",
        album: "ASTRO",
        duration: 200,
        catalogProvider: "spotify",
        playbackProvider: "soundcloud",
        catalogArtistId: "0Y5tJX1MQfbPP8Q669Kov4",
        versionTag: "live",
      },
      playedSeconds: 42,
      duration: 200,
      kind: "skip",
      now: 1000000,
    });
    expect(e.trackId).toBe("cat_sp_x_sc_y");
    expect(e.artistId).toBe("0Y5tJX1MQfbPP8Q669Kov4");
    expect(e.albumId).toBe("ASTRO");
    expect(e.catalogProvider).toBe("spotify");
    expect(e.playbackProvider).toBe("soundcloud");
    expect(e.startedAt).toBe(1000000 - 42000);
    expect(e.skippedAt).toBe(1000000);
    expect(e.playedSeconds).toBe(42);
    expect(e.duration).toBe(200);
    expect(e.completionRatio).toBeCloseTo(0.21, 5);
    expect(e.skipPosition).toBe(42);
    expect(e.versionTag).toBe("live");
  });
});

describe("persistence — localStorage ring buffer", () => {
  it("append → load roundtrip, newest first, capped at 500", () => {
    const events = appendSkipEvent(ev({ trackId: "n1", artist: "A" }));
    expect(events).toHaveLength(1);
    const again = appendSkipEvent(ev({ trackId: "n2", artist: "A" }));
    expect(again).toHaveLength(2);
    expect(again[0].trackId).toBe("n2"); // newest first
    expect(loadSkipEvents()[0].trackId).toBe("n2");
  });
  it("capped ring buffer", () => {
    const many = Array.from({ length: 520 }, (_, i) => ev({ trackId: `t${i}`, artist: "A" }));
    saveSkipEvents(many);
    expect(loadSkipEvents()).toHaveLength(500);
  });
});

describe("un-measurable skips are honest no-ops", () => {
  it("weight 0 for NaN played seconds", () => {
    const e = ev({ trackId: "x", artist: "A", playedSeconds: NaN });
    expect(eventWeight(e)).toBe(0);
  });
});
