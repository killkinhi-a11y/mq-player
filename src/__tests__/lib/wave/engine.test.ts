/**
 * Wave engine tests (§32): candidate generation, ranking, diversity,
 * cold start, deterministic mode. Also encodes the algorithm quality-gate
 * scenarios A–F (§37).
 */

import { describe, it, expect } from "vitest";
import {
  getWaveRecommendations,
  buildWaveProfile,
  applySessionEvent,
  createWaveMemory,
  rememberWaveTrack,
  dedupCandidates,
  WAVE_CONFIG,
  type WaveCandidate,
  type WaveTrackMinimal,
  type WaveProfile,
  type WaveSeed,
} from "@/lib/wave";

/* ── Fixtures ── */

function mkTrack(i: number, overrides: Partial<WaveTrackMinimal> = {}): WaveTrackMinimal & { id: string } {
  return {
    id: `t${i}`,
    title: `Track ${i}`,
    artist: `Artist ${String.fromCharCode(65 + (i % 26))}`,
    album: `Album ${(i % 10) + 1}`,
    duration: 200,
    genre: "indie",
    cover: "https://cover",
    scTrackId: 1000 + i,
    scIsFull: true,
    ...overrides,
  } as WaveTrackMinimal & { id: string };
}

const NOW = 1730000000000;

function candidate(track: WaveTrackMinimal, channel: WaveCandidate["channel"], seedRef?: string): WaveCandidate<WaveTrackMinimal> {
  return { track, channel, seedRef };
}

function profileOf(over: Partial<WaveProfile> = {}): WaveProfile {
  return {
    ...buildWaveProfile({}, WAVE_CONFIG),
    ...over,
  } as WaveProfile;
}

/* ── Candidate generation ── */

describe("wave candidate generation (§5)", () => {
  it("keeps the highest-priority channel attribution on dedup", () => {
    const t = mkTrack(1);
    const { unique, duplicateCount } = dedupCandidates([
      candidate(t, "exploration"),
      candidate(t, "similar_track", "Seed Title"),
      candidate(t, "taste"),
    ]);
    expect(unique).toHaveLength(1);
    expect(duplicateCount).toBe(2);
    expect(unique[0].channel).toBe("similar_track");
    expect(unique[0].seedRef).toBe("Seed Title");
  });

  it("hard-excludes excluded ids and memory tracks", () => {
    const seedTrack = mkTrack(0, { artist: "Seed Artist", genre: "indie" });
    const memory = rememberWaveTrack(createWaveMemory(), mkTrack(5), NOW, WAVE_CONFIG);
    const result = getWaveRecommendations({
      seed: { kind: "track", scTrackId: seedTrack.scTrackId, artist: "Seed Artist", genre: "indie", label: "Seed" },
      profile: profileOf(),
      candidates: [
        candidate(mkTrack(5), "similar_track"), // in memory → filtered (hard)
        candidate(mkTrack(6), "similar_track"), // excluded by id → filtered (hard)
        candidate(mkTrack(7), "similar_track"),
      ],
      excludeIds: ["t6"],
      memory,
      randomSeed: 42,
      now: NOW,
    });
    expect(result.tracks.map((t) => t.track.id)).toEqual(["t7"]);
    expect(result.meta.filtered_count).toBe(2); // hard-filtered (memory + excludeIds)
  });

  it("reports per-channel candidates in meta (all channels enter the pool)", () => {
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf(),
      candidates: [
        candidate(mkTrack(1), "similar_track"),
        candidate(mkTrack(2), "similar_artist"),
        candidate(mkTrack(3), "taste"),
        candidate(mkTrack(4), "recent_favorites"),
        candidate(mkTrack(5), "recent_listening"),
        candidate(mkTrack(6), "exploration"),
      ],
      randomSeed: 7,
      now: NOW,
    });
    expect(result.meta.candidate_count).toBe(6);
    expect(result.meta.ranked_count).toBe(6);
    // The exploration candidate is flagged for the exploration quota.
    const exploration = result.tracks.find((t) => t.channel === "exploration");
    expect(exploration?.exploration).toBe(true);
  });
});

/* ── Ranking (§7) ── */

describe("wave ranking (§32)", () => {
  it("ranks a favorite artist above unknown artists", () => {
    const fav = mkTrack(1, { artist: "Fav Artist" });
    const unknown = mkTrack(2, { artist: "Unknown Artist" });
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf({
        longTerm: { artists: { "fav artist": 0.8 }, genres: {}, tracks: {} },
      }),
      candidates: [candidate(fav, "taste"), candidate(unknown, "taste")],
      randomSeed: 1,
      now: NOW,
      config: { ...WAVE_CONFIG, scoring: { ...WAVE_CONFIG.scoring, maxJitter: 0 } },
    });
    expect(result.tracks[0].track.id).toBe(fav.id);
    expect(result.tracks[0].breakdown.favoriteArtist).toBeGreaterThan(0);
    expect(result.tracks[0].reason).toBe("favorite_artist");
  });

  it("ranks artists with completions above unknowns (completionAffinity)", () => {
    const completedArtist = mkTrack(1, { artist: "Completed Artist" });
    const unknown = mkTrack(2, { artist: "Unknown Artist" });
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf({
        mediumTerm: { artists: { "completed artist": 0.6 }, genres: {}, tracks: {} },
      }),
      candidates: [candidate(completedArtist, "taste"), candidate(unknown, "taste")],
      randomSeed: 1,
      now: NOW,
      config: { ...WAVE_CONFIG, scoring: { ...WAVE_CONFIG.scoring, maxJitter: 0 } },
    });
    expect(result.tracks[0].track.id).toBe(completedArtist.id);
    expect(result.tracks[0].breakdown.completionAffinity).toBeGreaterThan(0);
  });

  it("ranks recently skipped artists BELOW neutral candidates (§11 immediate)", () => {
    const skipped = mkTrack(1, { artist: "Skipped Artist" });
    const neutral = mkTrack(2, { artist: "Neutral Artist" });
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf({
        session: { artists: { "skipped artist": -0.8 }, genres: {}, tracks: {} },
      }),
      candidates: [candidate(skipped, "taste"), candidate(neutral, "taste")],
      randomSeed: 1,
      now: NOW,
      config: { ...WAVE_CONFIG, scoring: { ...WAVE_CONFIG.scoring, maxJitter: 0 } },
    });
    expect(result.tracks[0].track.id).toBe(neutral.id);
    expect(result.tracks.find((t) => t.track.id === skipped.id)!.score).toBeLessThan(
      result.tracks.find((t) => t.track.id === neutral.id)!.score,
    );
  });

  it("penalizes recently played (client history) tracks — soft, not removed", () => {
    const played = mkTrack(1, { artist: "Played Artist" });
    const fresh = mkTrack(2, { artist: "Fresh Artist" });
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf(),
      candidates: [candidate(played, "taste"), candidate(fresh, "taste")],
      recentHistoryTrackIds: [played.id], // played OUTSIDE the wave → soft penalty
      randomSeed: 1,
      now: NOW,
      config: { ...WAVE_CONFIG, scoring: { ...WAVE_CONFIG.scoring, maxJitter: 0 } },
    });
    // Both stay in the batch (soft), fresh ranks higher.
    const freshEntry = result.tracks.find((t) => t.track.id === fresh.id);
    const playedEntry = result.tracks.find((t) => t.track.id === played.id);
    expect(playedEntry).toBeDefined();
    expect(freshEntry!.score).toBeGreaterThan(playedEntry!.score);
  });

  it("seed similarity outranks generic taste matches (§6 seed influence)", () => {
    const seedRelated = mkTrack(1, { artist: "X Artist" });
    const tasteMatch = mkTrack(2, { artist: "Fav Artist" });
    const result = getWaveRecommendations({
      seed: { kind: "track", scTrackId: 999, artist: "Seed Artist", label: "Seed" },
      profile: profileOf({
        longTerm: { artists: { "fav artist": 0.5 }, genres: {}, tracks: {} },
      }),
      candidates: [candidate(seedRelated, "similar_track", "Seed"), candidate(tasteMatch, "taste")],
      randomSeed: 1,
      now: NOW,
      config: { ...WAVE_CONFIG, scoring: { ...WAVE_CONFIG.scoring, maxJitter: 0 } },
    });
    expect(result.tracks[0].track.id).toBe(seedRelated.id);
    expect(result.tracks[0].reason).toBe("similar_track");
  });
});

/* ── Diversity (§8, §32) ── */

describe("wave diversity (§8)", () => {
  it("enforces artist spacing — no mono-artist wall", () => {
    // 10 tracks by the same artist, ranked by score — the batch must not
    // put the same artist next to itself (spacing ladder relaxes ONLY
    // under the per-batch artist cap = 2).
    const sameArtist = Array.from({ length: 10 }, (_, i) =>
      candidate(mkTrack(i, { artist: "Same Artist" }), "taste"),
    );
    const others = Array.from({ length: 10 }, (_, i) =>
      candidate(mkTrack(100 + i, { artist: `Other ${i}` }), "taste"),
    );
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf(),
      candidates: [...sameArtist, ...others],
      randomSeed: 3,
      now: NOW,
    });
    const artists = result.tracks.map((t) => t.track.artist);
    const sameCount = artists.filter((a) => a === "Same Artist").length;
    expect(sameCount).toBeLessThanOrEqual(WAVE_CONFIG.diversity.maxPerArtistPerBatch);
    // No two adjacent picks share an artist.
    for (let i = 1; i < artists.length; i++) {
      expect(artists[i]).not.toBe(artists[i - 1]);
    }
  });

  it("never outputs duplicate track ids", () => {
    const dup = mkTrack(1);
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf(),
      candidates: [candidate(dup, "similar_track"), candidate(dup, "taste"), candidate(mkTrack(2), "taste")],
      randomSeed: 5,
      now: NOW,
    });
    const ids = result.tracks.map((t) => t.track.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("caps album concentration per batch (mixed pool)", () => {
    // Mixed pool: 8 tracks share an album (indie), 8 pop tracks live
    // elsewhere → the shared album must not dominate the batch.
    const albumTracks = Array.from({ length: 8 }, (_, i) =>
      candidate(mkTrack(i, { artist: `Ar${i}`, album: "One Album", genre: "indie" }), "taste"),
    );
    const others = Array.from({ length: 8 }, (_, i) =>
      candidate(mkTrack(100 + i, { artist: `Ot${i}`, album: `Other ${i}`, genre: "pop" }), "taste"),
    );
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf(),
      candidates: [...albumTracks, ...others],
      randomSeed: 5,
      now: NOW,
    });
    const albumCount = result.tracks.filter((t) => t.track.album === "One Album").length;
    expect(albumCount).toBeLessThanOrEqual(WAVE_CONFIG.fatigue.albumMaxPerBatch);
  });

  it("caps genre concentration per batch (mixed pool)", () => {
    // 12 techno + 8 indie → techno must not exceed its per-batch cap.
    const genreTracks = Array.from({ length: 12 }, (_, i) =>
      candidate(mkTrack(i, { artist: `Ar${i}`, genre: "techno" }), "taste"),
    );
    const others = Array.from({ length: 8 }, (_, i) =>
      candidate(mkTrack(100 + i, { artist: `Ot${i}`, genre: "indie" }), "taste"),
    );
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf(),
      candidates: [...genreTracks, ...others],
      randomSeed: 5,
      now: NOW,
    });
    const genrePicks = result.tracks.filter((t) => t.track.genre === "techno").length;
    expect(genrePicks).toBeLessThanOrEqual(WAVE_CONFIG.fatigue.genreMaxPerBatch);
  });

  it("a HOMOGENEOUS pool still ships a viable batch (§35 graceful)", () => {
    // The whole pool is one genre/album — caps relax instead of starving.
    const mono = Array.from({ length: 12 }, (_, i) =>
      candidate(mkTrack(i, { artist: `Ar${i}`, genre: "techno", album: "One" }), "taste"),
    );
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf(),
      candidates: mono,
      randomSeed: 5,
      now: NOW,
    });
    expect(result.tracks.length).toBeGreaterThanOrEqual(6); // viable, not starved
  });

  it("still fills the batch from a mono-artist pool (§35 graceful)", () => {
    const mono = Array.from({ length: 8 }, (_, i) =>
      candidate(mkTrack(i, { artist: "Only Artist" }), "taste"),
    );
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf(),
      candidates: mono,
      randomSeed: 5,
      now: NOW,
      batchSize: 6,
    });
    // Relaxed picks keep the wave alive instead of returning an empty batch.
    expect(result.tracks.length).toBeGreaterThan(0);
    expect(result.meta.artist_fatigue_count).toBeGreaterThan(0);
  });
});

/* ── Cold start (§10) ── */

describe("wave cold start (§10)", () => {
  it("an empty profile does not break the wave — exploration is boosted", () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      candidate(mkTrack(i, { artist: `New Artist ${i}` }), i < 4 ? "exploration" : "taste"),
    );
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf(), // empty profile
      candidates,
      randomSeed: 9,
      now: NOW,
    });
    expect(result.tracks.length).toBeGreaterThan(0);
    expect(result.meta.exploration_count).toBeGreaterThan(0);
  });
});

/* ── Determinism (§23, §32) ── */

describe("wave deterministic mode (§23)", () => {
  const candidates = Array.from({ length: 30 }, (_, i) =>
    candidate(mkTrack(i, { artist: `Artist ${i % 7}` }), "taste" as const),
  );

  it("identical inputs + randomSeed → identical ranking", () => {
    const run = () =>
      getWaveRecommendations({
        seed: { kind: "taste", label: "x" },
        profile: profileOf({ longTerm: { artists: { "artist 1": 0.5 }, genres: {}, tracks: {} } }),
        candidates,
        randomSeed: 12345,
        now: NOW,
      });
    const a = run();
    const b = run();
    expect(a.tracks.map((t) => t.track.id)).toEqual(b.tracks.map((t) => t.track.id));
    expect(a.tracks.map((t) => t.score)).toEqual(b.tracks.map((t) => t.score));
    expect(a.meta.deterministic).toBe(true);
  });

  it("meta reports deterministic=false without an explicit seed", () => {
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf(),
      candidates: candidates.slice(0, 5),
      now: NOW,
    });
    expect(result.meta.deterministic).toBe(false);
  });
});

/* ── Algorithm quality gate scenarios (§37) ── */

describe("algorithm quality gate (§37)", () => {
  it("Scenario A: likes Artist A + Genre X → wave leans that way", () => {
    const likedArtistTrack = mkTrack(1, { artist: "Artist A", genre: "pop" });
    const genreXTrack = mkTrack(2, { artist: "Someone", genre: "pop" });
    const unrelated = mkTrack(3, { artist: "Someone Else", genre: "techno" });
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf({
        longTerm: { artists: { "artist a": 0.8 }, genres: { pop: 0.6 }, tracks: {} },
      }),
      candidates: [candidate(likedArtistTrack, "taste"), candidate(genreXTrack, "taste"), candidate(unrelated, "taste")],
      randomSeed: 11,
      now: NOW,
      config: { ...WAVE_CONFIG, scoring: { ...WAVE_CONFIG.scoring, maxJitter: 0 } },
    });
    const score = (id: string) => result.tracks.find((t) => t.track.id === id)!.score;
    expect(score("t1")).toBeGreaterThan(score("t3"));
    expect(score("t2")).toBeGreaterThan(score("t3"));
  });

  it("Scenario B: skipping Genre Y repeatedly → Genre Y sinks", () => {
    const genreY = mkTrack(1, { artist: "A1", genre: "drill" });
    const neutral = mkTrack(2, { artist: "A2", genre: "pop" });
    let profile = profileOf();
    for (let i = 0; i < 3; i++) {
      profile = applySessionEvent(
        profile,
        { type: "track_skipped", trackId: "prev", artist: "A1", genre: "drill", position: 5, duration: 200, at: NOW + i },
        WAVE_CONFIG,
      );
    }
    const result = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [candidate(genreY, "taste"), candidate(neutral, "taste")],
      randomSeed: 11,
      now: NOW,
      config: { ...WAVE_CONFIG, scoring: { ...WAVE_CONFIG.scoring, maxJitter: 0 } },
    });
    const score = (id: string) => result.tracks.find((t) => t.track.id === id)!.score;
    expect(score("t2")).toBeGreaterThan(score("t1"));
  });

  it("Scenario C: repeated Artist B plays raise affinity but diversity still caps it", () => {
    // Affinity: artist B is boosted everywhere…
    const profile = profileOf({
      longTerm: { artists: { "artist b": 0.9 }, genres: {}, tracks: {} },
    });
    const bTracks = Array.from({ length: 10 }, (_, i) => candidate(mkTrack(i, { artist: "Artist B" }), "taste"));
    const others = Array.from({ length: 10 }, (_, i) => candidate(mkTrack(100 + i, { artist: `O${i}` }), "taste"));
    const result = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [...bTracks, ...others],
      randomSeed: 13,
      now: NOW,
    });
    const bCount = result.tracks.filter((t) => t.track.artist === "Artist B").length;
    // High affinity ≠ mono-artist stream (§39 don't overfit).
    expect(bCount).toBeLessThanOrEqual(WAVE_CONFIG.diversity.maxPerArtistPerBatch);
    expect(bCount).toBeGreaterThan(0);
  });

  it("Scenario D: more_like_this noticeably lifts the same sound", () => {
    const sameArtistTrack = mkTrack(1, { artist: "Boosted Artist", genre: "ambient" });
    const other = mkTrack(2, { artist: "Other Artist", genre: "techno" });
    const base = profileOf();
    const boosted = applySessionEvent(
      base,
      { type: "more_like_this", trackId: "s", artist: "Boosted Artist", genre: "ambient", at: NOW },
      WAVE_CONFIG,
    );
    const run = (p: WaveProfile) =>
      getWaveRecommendations({
        seed: null,
        profile: p,
        candidates: [candidate(sameArtistTrack, "taste"), candidate(other, "taste")],
        randomSeed: 13,
        now: NOW,
        config: { ...WAVE_CONFIG, scoring: { ...WAVE_CONFIG.scoring, maxJitter: 0 } },
      });
    const before = run(base).tracks.find((t) => t.track.id === "t1")!.score;
    const after = run(boosted).tracks.find((t) => t.track.id === "t1")!.score;
    expect(after - before).toBeGreaterThanOrEqual(WAVE_CONFIG.scoring.boostedBonus * 0.9);
  });

  it("Scenario E: session taste outweighs long-term taste (§19)", () => {
    // Long-term: hip-hop. Current session: ambient.
    const profile = profileOf({
      longTerm: { artists: { "hip hopper": 0.9 }, genres: { "hip hop": 0.9 }, tracks: {} },
      session: { artists: { ambientist: 0.7 }, genres: { ambient: 0.7 }, tracks: {} },
    });
    const hipHopTrack = mkTrack(1, { artist: "Hip Hopper", genre: "hip hop" });
    const ambientTrack = mkTrack(2, { artist: "Ambientist", genre: "ambient" });
    const result = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [candidate(hipHopTrack, "taste"), candidate(ambientTrack, "taste")],
      randomSeed: 13,
      now: NOW,
      config: { ...WAVE_CONFIG, scoring: { ...WAVE_CONFIG.scoring, maxJitter: 0 } },
    });
    const score = (id: string) => result.tracks.find((t) => t.track.id === id)!.score;
    // The session layer (weight 1.35×) overtakes the long-term layer (0.5×).
    expect(score("t2")).toBeGreaterThan(score("t1"));
  });

  it("Scenario F: cold start still yields a meaningful sequence", () => {
    const candidates = Array.from({ length: 15 }, (_, i) =>
      candidate(mkTrack(i, { artist: `Cold Artist ${i}` }), i < 3 ? "exploration" : "taste"),
    );
    const result = getWaveRecommendations({
      seed: null,
      profile: profileOf(),
      candidates,
      randomSeed: 21,
      now: NOW,
    });
    expect(result.tracks.length).toBeGreaterThanOrEqual(5);
    expect(result.tracks.every((t) => !!t.reason)).toBe(true);
  });
});

/* ── Honest reasons (§15, §36) ── */

describe("honest reasons (§15, §36)", () => {
  it("every output track carries a real reason from the allowed set", () => {
    const result = getWaveRecommendations({
      seed: { kind: "track", scTrackId: 1, artist: "Seed", label: "Seed" },
      profile: profileOf(),
      candidates: Array.from({ length: 12 }, (_, i) =>
        candidate(mkTrack(i, { artist: `A${i}` }), i % 2 === 0 ? "similar_track" : "exploration"),
      ),
      randomSeed: 33,
      now: NOW,
    });
    const allowed = new Set(["similar_track", "similar_artist", "favorite_artist", "favorite_genre", "recent_listening", "taste_profile", "exploration"]);
    for (const t of result.tracks) {
      expect(allowed.has(t.reason)).toBe(true);
    }
  });
});
