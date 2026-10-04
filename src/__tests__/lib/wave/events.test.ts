/**
 * Wave listening-event pipeline tests (§4, §11, §32):
 * skip classification by depth, event → signal mapping, session profile
 * application (real-time personalization), replay detection.
 */

import { describe, it, expect } from "vitest";
import {
  classifySkip,
  eventSignal,
  isRealSkip,
  isReplay,
  listenedFraction,
  buildWaveProfile,
  applySessionEvent,
  WAVE_CONFIG,
} from "@/lib/wave";

const NOW = 1730000000000;

describe("skip classification by listening depth (§4)", () => {
  it("< 10% listened → strong_negative", () => {
    expect(classifySkip(5, 200, WAVE_CONFIG)).toBe("strong_negative");
    expect(classifySkip(0, 200, WAVE_CONFIG)).toBe("strong_negative");
  });

  it("10–30% → negative", () => {
    expect(classifySkip(30, 200, WAVE_CONFIG)).toBe("negative");
    expect(classifySkip(59, 200, WAVE_CONFIG)).toBe("negative");
  });

  it("30–70% → neutral (gave it a chance)", () => {
    expect(classifySkip(70, 200, WAVE_CONFIG)).toBe("neutral");
    expect(classifySkip(100, 200, WAVE_CONFIG)).toBe("neutral");
  });

  it("70–95% → positive (nearly finished)", () => {
    expect(classifySkip(150, 200, WAVE_CONFIG)).toBe("positive");
  });

  it("95%+ → strong_positive (not a real skip — completion)", () => {
    expect(classifySkip(196, 200, WAVE_CONFIG)).toBe("strong_positive");
    expect(classifySkip(200, 200, WAVE_CONFIG)).toBe("strong_positive");
  });

  it("unknown duration → null (no signal, never fabricated)", () => {
    expect(classifySkip(10, 0, WAVE_CONFIG)).toBeNull();
    expect(classifySkip(undefined, 200, WAVE_CONFIG)).toBeNull();
    expect(listenedFraction(NaN, 200)).toBeNull();
  });
});

describe("event → session signal mapping (§4)", () => {
  it("early skip is a strong negative signal", () => {
    const s = eventSignal(
      { type: "track_skipped", trackId: "a", artist: "X", genre: "trap", position: 4, duration: 200, at: NOW },
      WAVE_CONFIG,
    );
    expect(s?.kind).toBe("negative");
    expect(s?.strength).toBe(WAVE_CONFIG.feedback.signal.skipStrongNegative);
  });

  it("completion is positive", () => {
    const s = eventSignal({ type: "play_completed", trackId: "a", at: NOW }, WAVE_CONFIG);
    expect(s?.kind).toBe("positive");
  });

  it("replay is the STRONGEST positive signal", () => {
    const s = eventSignal({ type: "track_replayed", trackId: "a", at: NOW }, WAVE_CONFIG);
    expect(s?.strength).toBe(1.0);
  });

  it("like / unliked / playlist add map correctly", () => {
    expect(eventSignal({ type: "track_liked", trackId: "a", at: NOW }, WAVE_CONFIG)?.kind).toBe("positive");
    expect(eventSignal({ type: "track_unliked", trackId: "a", at: NOW }, WAVE_CONFIG)?.kind).toBe("negative");
    expect(eventSignal({ type: "track_added_to_playlist", trackId: "a", at: NOW }, WAVE_CONFIG)?.kind).toBe("positive");
  });

  it("context events (wave_started, play_started) carry no taste signal", () => {
    expect(eventSignal({ type: "wave_started", trackId: "x", at: NOW }, WAVE_CONFIG)).toBeNull();
    expect(eventSignal({ type: "play_started", trackId: "x", at: NOW }, WAVE_CONFIG)).toBeNull();
  });

  it("isRealSkip: 95% skip is NOT a real skip; 5% is", () => {
    expect(
      isRealSkip({ type: "track_skipped", trackId: "a", position: 198, duration: 200, at: NOW }, WAVE_CONFIG),
    ).toBe(false);
    expect(
      isRealSkip({ type: "track_skipped", trackId: "a", position: 6, duration: 200, at: NOW }, WAVE_CONFIG),
    ).toBe(true);
    expect(isRealSkip({ type: "track_liked", trackId: "a", at: NOW }, WAVE_CONFIG)).toBe(false);
  });
});

describe("applySessionEvent — real-time profile updates (§11, §17, §18)", () => {
  const base = buildWaveProfile({}, WAVE_CONFIG);

  it("an early skip pushes the artist NEGATIVE in the session layer", () => {
    const p = applySessionEvent(
      base,
      { type: "track_skipped", trackId: "t1", artist: "Skipped Guy", genre: "drill", position: 3, duration: 200, at: NOW },
      WAVE_CONFIG,
    );
    expect(p.session.artists["skipped guy"]).toBeLessThan(0);
    expect(p.session.genres["drill"]).toBeLessThan(0);
    // Immutability: input profile untouched.
    expect(base.session.artists["skipped guy"]).toBeUndefined();
  });

  it("a completion pushes the artist positive", () => {
    const p = applySessionEvent(
      base,
      { type: "play_completed", trackId: "t1", artist: "Finished Guy", genre: "ambient", position: 200, duration: 200, at: NOW },
      WAVE_CONFIG,
    );
    expect(p.session.artists["finished guy"]).toBeGreaterThan(0);
  });

  it("more_like_this registers a boost cluster (§17)", () => {
    const p = applySessionEvent(
      base,
      { type: "more_like_this", trackId: "t1", artist: "Boosted", genre: "lofi", at: NOW },
      WAVE_CONFIG,
    );
    expect(p.boost.artists).toContain("boosted");
    expect(p.boost.genres).toContain("lofi");
  });

  it("less_like_this suppresses WITHOUT destroying long-term taste (§18)", () => {
    const withLongTerm = {
      ...base,
      longTerm: { ...base.longTerm, artists: { ...base.longTerm.artists, "meh guy": 0.8 } },
    };
    const p = applySessionEvent(
      withLongTerm,
      { type: "less_like_this", trackId: "t1", artist: "Meh Guy", genre: "pop", at: NOW },
      WAVE_CONFIG,
    );
    expect(p.suppress.artists).toContain("meh guy");
    // The long-term affinity survives the temporary suppression.
    expect(p.longTerm.artists["meh guy"]).toBe(0.8);
  });

  it("multiple skips accumulate and clamp to −1 (repeated skip = stronger signal)", () => {
    let p = base;
    for (let i = 0; i < 3; i++) {
      p = applySessionEvent(
        p,
        { type: "track_skipped", trackId: "t1", artist: "Again Guy", position: 5, duration: 200, at: NOW + i },
        WAVE_CONFIG,
      );
    }
    // 3 × (−0.8) = −2.4 clamped to −1 — bounded, never explodes.
    expect(p.session.artists["again guy"]).toBe(-1);
  });
});

describe("replay detection (§4)", () => {
  it("same track restarted soon = replay", () => {
    expect(isReplay("t1", { trackId: "t1", endedAt: NOW - 60000, completed: false }, NOW)).toBe(true);
  });

  it("different track or long gap = not a replay", () => {
    expect(isReplay("t2", { trackId: "t1", endedAt: NOW - 60000, completed: false }, NOW)).toBe(false);
    expect(isReplay("t1", { trackId: "t1", endedAt: NOW - 60 * 60 * 1000, completed: false }, NOW)).toBe(false);
    expect(isReplay("t1", null, NOW)).toBe(false);
  });
});
