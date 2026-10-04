/**
 * Wave profile tests (§3, §19, §20, §28): four recency layers, layer
 * weighting, confidence → exploration, profile building from store signals.
 */

import { describe, it, expect } from "vitest";
import {
  buildWaveProfile,
  mergedAffinity,
  layerWeights,
  effectiveExplorationRate,
  clampAffinity,
  normArtist,
  normGenre,
  WAVE_CONFIG,
} from "@/lib/wave";
import type { Track } from "@/lib/musicApi";

const NOW = 1730000000000;
const DAY = 24 * 60 * 60 * 1000;

function mkTrack(id: string, artist: string, genre: string): Track {
  return {
    id,
    title: `T ${id}`,
    artist,
    album: "",
    duration: 200,
    cover: "",
    genre,
    audioUrl: "",
    source: "soundcloud",
  };
}

describe("buildWaveProfile (§3, §28 — extends existing signals)", () => {
  it("empty inputs → valid empty profile (cold start safe)", () => {
    const p = buildWaveProfile({}, WAVE_CONFIG);
    expect(p.longTerm.artists).toEqual({});
    expect(p.confidence).toBe(0);
    expect(p.language).toBe("mixed");
  });

  it("liked tracks feed the LONG-TERM layer with positive affinity", () => {
    const p = buildWaveProfile(
      { likedTracksData: [mkTrack("a", "Liked Artist", "pop"), mkTrack("b", "Liked Artist", "pop")] },
      WAVE_CONFIG,
    );
    expect(p.longTerm.artists["liked artist"]).toBeGreaterThan(0);
    expect(p.longTerm.genres["pop"]).toBeGreaterThan(0);
    expect(p.longTerm.tracks["a"]).toBeGreaterThan(0);
  });

  it("disliked artists are long-term negatives", () => {
    const p = buildWaveProfile(
      { dislikedTracksData: [mkTrack("d", "Bad Artist", "drill")] },
      WAVE_CONFIG,
    );
    expect(p.longTerm.artists["bad artist"]).toBeLessThan(0);
  });

  it("history feeds MEDIUM + RECENT layers weighted by playCount and recency", () => {
    const p = buildWaveProfile(
      {
        history: [
          { track: mkTrack("h1", "Fresh Artist", "indie"), playedAt: NOW - 1000, playCount: 1 },
          { track: mkTrack("h2", "Old Artist", "indie"), playedAt: NOW - 60 * DAY, playCount: 1 },
          { track: mkTrack("h3", "Heavy Artist", "indie"), playedAt: NOW - 2000, playCount: 5 },
        ],
        now: NOW,
      },
      WAVE_CONFIG,
    );
    // Recent > old at equal playCount.
    expect(p.recent.artists["fresh artist"] ?? 0).toBeGreaterThan(p.recent.artists["old artist"] ?? 0);
    // playCount amplifies the medium-term signal.
    expect(p.mediumTerm.artists["heavy artist"] ?? 0).toBeGreaterThan(p.mediumTerm.artists["old artist"] ?? 0);
  });

  it("taste sliders and favorite artists land in the long-term layer", () => {
    const p = buildWaveProfile(
      {
        tasteGenres: { jazz: 80, rock: 10 }, // jazz ≥ 20 counts, rock below threshold
        tasteArtists: { "slider artist": 90 },
        favoriteArtists: [{ username: "Fav One" }],
      },
      WAVE_CONFIG,
    );
    expect(p.longTerm.genres["jazz"]).toBeGreaterThan(0);
    expect(p.longTerm.genres["rock"]).toBeUndefined();
    expect(p.longTerm.artists["slider artist"]).toBeGreaterThan(0);
    expect(p.longTerm.artists["fav one"]).toBeGreaterThan(0);
  });

  it("confidence grows with signal volume (§9 → exploration adapts)", () => {
    const cold = buildWaveProfile({}, WAVE_CONFIG);
    const rich = buildWaveProfile(
      {
        likedTracksData: Array.from({ length: 6 }, (_, i) => mkTrack(`l${i}`, `A${i}`, "pop")),
        history: Array.from({ length: 10 }, (_, i) => ({
          track: mkTrack(`h${i}`, `A${i}`, "pop"),
          playedAt: NOW - i * DAY,
          playCount: 1,
        })),
        now: NOW,
      },
      WAVE_CONFIG,
    );
    expect(rich.confidence).toBeGreaterThan(cold.confidence);
    expect(effectiveExplorationRate(rich, WAVE_CONFIG)).toBeLessThan(
      effectiveExplorationRate(cold, WAVE_CONFIG),
    );
  });

  it("language detection: cyrillic-heavy → russian", () => {
    const p = buildWaveProfile(
      {
        history: Array.from({ length: 8 }, (_, i) => ({
          track: {
            ...mkTrack(`r${i}`, `Артист ${i}`, "russian rap"),
            title: `Песня ${i}`,
          },
          playedAt: NOW,
          playCount: 1,
        })),
        now: NOW,
      },
      WAVE_CONFIG,
    );
    expect(p.language).toBe("russian");
  });
});

describe("mergedAffinity layer weights (§19, §20)", () => {
  it("session weighs MORE than long-term at equal values", () => {
    const weights = layerWeights(WAVE_CONFIG);
    expect(weights.session).toBeGreaterThan(weights.longTerm);
    expect(weights.recent).toBeGreaterThan(weights.mediumTerm);

    // Base value 0.5 → merged = 0.5 × weight (below the clamp).
    const p = buildWaveProfile({}, WAVE_CONFIG);
    const profile = {
      ...p,
      longTerm: { ...p.longTerm, artists: { a: 0.5 } },
      session: { ...p.session, artists: { b: 0.5 } },
    };
    const merged = mergedAffinity(profile, WAVE_CONFIG);
    expect(merged.artists["b"]).toBeCloseTo(0.5 * weights.session, 5);
    expect(merged.artists["a"]).toBeCloseTo(0.5 * weights.longTerm, 5);
    expect(merged.artists["b"]).toBeGreaterThan(merged.artists["a"]);
  });

  it("all values stay clamped to −1..1", () => {
    const p = buildWaveProfile(
      { likedTracksData: Array.from({ length: 20 }, (_, i) => mkTrack(`x${i}`, "Same Artist", "pop")) },
      WAVE_CONFIG,
    );
    const merged = mergedAffinity(p, WAVE_CONFIG);
    for (const v of Object.values(merged.artists)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    for (const v of Object.values(merged.genres)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    expect(clampAffinity(5)).toBe(1);
    expect(clampAffinity(-5)).toBe(-1);
    expect(clampAffinity(NaN)).toBe(0);
  });
});

describe("normalizers", () => {
  it("normArtist lowercases + trims", () => {
    expect(normArtist("  Artist X ")).toBe("artist x");
    expect(normArtist(undefined)).toBe("");
  });

  it("normGenre uses the shared sanitizer (single source of truth)", () => {
    expect(normGenre("Pop")).toBe("pop");
    expect(normGenre("Religion & Spirituality")).toBeNull(); // & rejected
    expect(normGenre("Some Very Long Fake Genre Label")).toBeNull();
  });
});
