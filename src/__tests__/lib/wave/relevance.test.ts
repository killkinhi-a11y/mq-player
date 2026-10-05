/**
 * V2 RELEVANCE GATE tests (PART 16 — the 10 MANDATORY cases).
 *
 * Philosophy under test: RELEVANCE > EXPLORATION.
 *   • A candidate with no link to THIS user's taste/history/context is
 *     rejected — even exploration, even with perfect quality priors.
 *   • Cultural clusters are PERSONAL: foreign for a RU/EU user, native for
 *     a user who actually listens to that culture. NEVER a blacklist.
 */

import { describe, it, expect } from "vitest";
import {
  getWaveRecommendations,
  buildWaveProfile,
  applySessionEvent,
  effectiveExplorationRate,
  scoreCandidate,
  detectCulturalCluster,
  WAVE_CONFIG,
  type WaveCandidate,
  type WaveTrackMinimal,
  type WaveProfile,
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

/** A CONFIDENT, RICH RU/EU profile — strict-gate territory (richness ≥ 3). */
function richWesternProfile(): WaveProfile {
  return profileOf({
    longTerm: {
      artists: { "artist a": 0.8, "artist b": 0.7, "artist c": 0.6 },
      genres: { pop: 0.6, "indie rock": 0.5, electronic: 0.4 },
      tracks: {},
    },
    recentArtists: ["artist a", "artist b"],
    language: "mixed",
    clusters: { latin: 8, cyrillic: 6 },
  });
}

const NO_JITTER = { ...WAVE_CONFIG, scoring: { ...WAVE_CONFIG.scoring, maxJitter: 0 } };

/* ════════════════════════════════════════════════════════════════════════ */

describe("V2 relevance gate — cultural / language (PART 8)", () => {
  it("1. unrelated cultural candidate is REJECTED (Hindi rap for a RU/EU user)", () => {
    const hindiRap = mkTrack(50, {
      title: "क्या बात है",
      artist: "यश रैपर",
      genre: "hip hop",
    });
    const normalTrack = mkTrack(1, { artist: "Artist A", genre: "pop" });
    const result = getWaveRecommendations({
      seed: null,
      profile: richWesternProfile(),
      candidates: [
        candidate(normalTrack, "taste"),
        candidate(hindiRap, "taste"), // zero affinity AND foreign cluster
        candidate(hindiRap, "exploration"), // even exploration must not save it
      ],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    expect(result.tracks.map((t) => t.track.id)).toContain("t1");
    expect(result.tracks.map((t) => t.track.id)).not.toContain("t50");
    expect(result.meta.relevance_rejected_count).toBeGreaterThanOrEqual(1);
    const blocked = (result.gate || []).find((g) => g.candidate.track.id === "t50");
    expect(blocked?.verdict.blockedBy).toBe("foreign_cluster");
  });

  it("2. unrelated genre is REJECTED when the profile is rich (anchor-less candidate)", () => {
    const unrelated = mkTrack(60, { artist: "Stranger", genre: "techno" }); // no affinity anywhere
    const likedArtistTrack = mkTrack(1, { artist: "Artist A", genre: "pop" });
    const genreTrack = mkTrack(2, { artist: "Someone New", genre: "indie rock" });
    const result = getWaveRecommendations({
      seed: null,
      profile: richWesternProfile(), // richness 6 → strict gate
      candidates: [
        candidate(likedArtistTrack, "taste"),
        candidate(genreTrack, "taste"),
        candidate(unrelated, "taste"),
      ],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    const ids = result.tracks.map((t) => t.track.id);
    expect(ids).toContain("t1");
    expect(ids).toContain("t2");
    expect(ids).not.toContain("t60");
    const rejected = (result.gate || []).find((g) => g.candidate.track.id === "t60");
    expect(rejected?.verdict.passed).toBe(false);
  });

  it("3. unrelated language/cultural candidate is PENALIZED in scoring (breakdown)", () => {
    const hindi = mkTrack(70, { title: "दिल की बात", artist: "गायक", genre: "pop" });
    const ctx = {
      profile: richWesternProfile(),
      seed: null,
      memory: { tracks: [], artists: [], genres: [], seeds: [], playedCount: 0 },
      config: WAVE_CONFIG,
      rng: { next: () => 0.5 } as never,
      now: NOW,
    };
    const scored = scoreCandidate(candidate(hindi, "taste"), ctx);
    expect(scored.breakdown.culturalMismatch).toBe(-WAVE_CONFIG.scoring.culturalMismatchPenalty);
    expect(scored.score).toBeLessThan(0); // the penalty dominates every quality prior

    // …but a user WITH indic history gets a MATCH bonus instead (personal, not banned)
    const desiScored = scoreCandidate(candidate(hindi, "taste"), {
      ...ctx,
      profile: profileOf({
        longTerm: { artists: { गायक: 0.6 }, genres: { pop: 0.4 }, tracks: {} },
        clusters: { indic: 4 },
      }),
    });
    expect(desiScored.breakdown.culturalMismatch).toBeUndefined();
    expect(desiScored.breakdown.clusterMatch).toBe(WAVE_CONFIG.scoring.clusterMatchBonus);
  });
});

describe("V2 relevance gate — exploration must be anchored (PART 7)", () => {
  it("4. exploration candidate WITHOUT relevance is rejected", () => {
    const floating = mkTrack(80, { artist: "Ghost Artist", genre: "polka" }); // nothing links it
    const good = mkTrack(1, { artist: "Artist A", genre: "pop" });
    const result = getWaveRecommendations({
      seed: null,
      profile: richWesternProfile(),
      candidates: [
        candidate(good, "taste"),
        candidate(floating, "exploration"),
      ],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    expect(result.tracks.map((t) => t.track.id)).not.toContain("t80");
    expect(result.meta.exploration_count).toBe(0);
  });

  it("5. RELEVANT exploration is accepted (bridge genre of a real user genre)", () => {
    // User loves hip hop → trap is a bridge genre → anchored exploration.
    const anchored = mkTrack(81, { artist: "New Trap Artist", genre: "trap" });
    const profile = profileOf({
      longTerm: {
        artists: { "hip hopper": 0.8, "beatmaker": 0.6 },
        genres: { "hip hop": 0.8 },
        tracks: {},
      },
      clusters: { latin: 5 },
    });
    const result = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [candidate(anchored, "exploration", "hip hop")],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    expect(result.tracks.map((t) => t.track.id)).toContain("t81");
    expect(result.tracks[0].relevance?.anchor).toBe("anchored_exploration");
    expect(result.tracks[0].relevance?.relevancePassed).toBe(true);
  });

  it("exploration never dominates the batch (share cap, PART 7)", () => {
    // 10 anchored exploration + 2 taste — cap is 30% of the batch.
    const profile = profileOf({
      longTerm: {
        artists: { "hip hopper": 0.8, "beatmaker": 0.6 },
        genres: { "hip hop": 0.8, trap: 0.4 },
        tracks: {},
      },
      clusters: { latin: 5 },
    });
    const explorers = Array.from({ length: 10 }, (_, i) =>
      candidate(mkTrack(100 + i, { artist: `Trap New ${i}`, genre: "trap" }), "exploration", "hip hop"),
    );
    const taste = Array.from({ length: 6 }, (_, i) =>
      candidate(mkTrack(200 + i, { artist: `Artist ${String.fromCharCode(65 + i)}`, genre: "hip hop" }), "taste"),
    );
    const result = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [...taste, ...explorers],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
      batchSize: 12,
    });
    const maxShare = WAVE_CONFIG.exploration.maxSharePerBatch;
    expect(result.meta.exploration_count).toBeLessThanOrEqual(Math.ceil(12 * maxShare) + 1);
  });
});

describe("V2 relevance gate — session context & skip learning (PART 9-10)", () => {
  it("6. recent session context OVERRIDES a weak long-term signal", () => {
    const profile = profileOf({
      longTerm: { artists: { "old artist": 0.3 }, genres: {}, tracks: {} }, // weak long-term
      session: { artists: { "live artist": 0.7 }, genres: { ambient: 0.6 }, tracks: {} },
    });
    const old = mkTrack(1, { artist: "Old Artist", genre: "pop" });
    const live = mkTrack(2, { artist: "Live Artist", genre: "ambient" });
    const result = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [candidate(old, "taste"), candidate(live, "taste")],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    const score = (id: string) => result.tracks.find((t) => t.track.id === id)!.score;
    expect(score("t2")).toBeGreaterThan(score("t1"));
    // The live-session track carries a real session signal in its verdict.
    const liveVerdict = result.tracks.find((t) => t.track.id === "t2")?.relevance;
    expect(["artist_affinity", "session_context"]).toContain(liveVerdict?.anchor);
    expect((liveVerdict?.sessionScore ?? 0)).toBeGreaterThan(0);
  });

  it("7. repeated skips REDIRECT the wave (skip streak throttles exploration)", () => {
    let profile = profileOf({
      longTerm: { artists: { "artist x": 0.6, "artist y": 0.6 }, genres: { drill: 0.5, pop: 0.5 }, tracks: {} },
      clusters: { latin: 4 },
    });
    // Skip → Skip → Skip on the drill sound (early skips = strong negatives).
    for (let i = 0; i < 3; i++) {
      profile = applySessionEvent(
        profile,
        { type: "track_skipped", trackId: `drill-${i}`, artist: "Drill Artist", genre: "drill", position: 4, duration: 200, at: NOW + i },
        WAVE_CONFIG,
      );
    }
    expect(profile.skipStreak).toBe(3);

    // Exploration rate is throttled while the streak is active (PART 10).
    const baseProfile = profileOf({
      longTerm: { artists: { "artist x": 0.6 }, genres: { drill: 0.5 }, tracks: {} },
    });
    const rateSkipped = effectiveExplorationRate(profile, WAVE_CONFIG);
    const rateBase = effectiveExplorationRate(baseProfile, WAVE_CONFIG);
    expect(rateSkipped).toBeLessThan(rateBase);
    expect(rateSkipped).toBeCloseTo(rateBase * WAVE_CONFIG.exploration.skipStreakRateMultiplier, 5);

    // The skipped sound sinks below neutral candidates — and after three
    // early skips the gate does not let it back in at all (PART 10: the
    // wave must visibly change direction, not just reshuffle).
    const drillTrack = mkTrack(1, { artist: "Drill Artist", genre: "drill" });
    const neutral = mkTrack(2, { artist: "Artist Y", genre: "pop" });
    const result = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [candidate(drillTrack, "taste"), candidate(neutral, "taste")],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    const ids = result.tracks.map((t) => t.track.id);
    expect(ids).toContain("t2");
    expect(ids).not.toContain("t1"); // fresh session negatives outvote the stale long-term like

    // …and an exploration pick from the skipped genre does not pass the gate.
    const drillExplorer = mkTrack(3, { artist: "Another Drill Artist", genre: "drill" });
    const result2 = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [candidate(neutral, "taste"), candidate(drillExplorer, "exploration")],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    expect(result2.tracks.map((t) => t.track.id)).not.toContain("t3");
  });
});

describe("V2 relevance gate — less_like_this suppresses the whole cluster (PART 10)", () => {
  it("8. less_like_this blocks the artist (hard) + album (penalty) + foreign cluster (hard)", () => {
    let profile = richWesternProfile();
    profile = applySessionEvent(
      profile,
      {
        type: "less_like_this",
        trackId: "x1",
        title: "Some Song",
        artist: "Artist A",
        genre: "pop",
        album: "Album Z",
        at: NOW,
      },
      WAVE_CONFIG,
    );
    expect(profile.suppress.artists).toContain("artist a");
    expect(profile.suppress.albums).toContain("album z");

    // Same artist → hard gate rejection.
    const sameArtist = mkTrack(1, { artist: "Artist A", genre: "pop" });
    const other = mkTrack(2, { artist: "Artist B", genre: "indie rock" });
    const result = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [candidate(sameArtist, "taste"), candidate(other, "taste")],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    expect(result.tracks.map((t) => t.track.id)).not.toContain("t1");
    const blocked = (result.gate || []).find((g) => g.candidate.track.id === "t1");
    expect(blocked?.verdict.blockedBy).toBe("suppressed_artist");

    // Same album, different artist → heavy penalty (cluster suppression).
    const sameAlbum = mkTrack(3, { artist: "Artist C", album: "Album Z", genre: "pop" });
    const scored = scoreCandidate(candidate(sameAlbum, "taste"), {
      profile,
      seed: null,
      memory: { tracks: [], artists: [], genres: [], seeds: [], playedCount: 0 },
      config: WAVE_CONFIG,
      rng: { next: () => 0.5 } as never,
      now: NOW,
    });
    expect(scored.breakdown.suppressedAlbum).toBe(-WAVE_CONFIG.scoring.suppressedAlbumPenalty);

    // less_like_this on a FOREIGN-cluster track suppresses the whole cluster.
    profile = applySessionEvent(
      profile,
      { type: "less_like_this", trackId: "x2", title: "हिंदी गाना", artist: "यश", genre: "hip hop", at: NOW },
      WAVE_CONFIG,
    );
    expect(profile.suppress.clusters).toContain("indic");
    const laterHindi = mkTrack(4, { title: "नया गाना", artist: "दूसरा गायक", genre: "pop" });
    const result2 = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [candidate(other, "taste"), candidate(laterHindi, "taste")],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    expect(result2.tracks.map((t) => t.track.id)).not.toContain("t4");
  });
});

describe("V2 relevance gate — personalization is NEVER a blacklist (PART 8)", () => {
  it("9. a personalized INDIAN music user still receives Indian music", () => {
    const desiProfile = profileOf({
      longTerm: {
        artists: { "arijit singh": 0.7, "pritam": 0.6, "shreya ghoshal": 0.6 },
        genres: { bollywood: 0.6, "indie": 0.3 },
        tracks: {},
      },
      clusters: { indic: 5, latin: 3 }, // real history with the culture
    });
    const hindiTrack = mkTrack(90, {
      title: "तेरे बिना",
      artist: "नया गायक",
      genre: "bollywood",
    });
    const result = getWaveRecommendations({
      seed: null,
      profile: desiProfile,
      candidates: [candidate(hindiTrack, "taste"), candidate(hindiTrack, "exploration")],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    expect(result.tracks.map((t) => t.track.id)).toContain("t90");
    expect(result.tracks[0].relevance?.relevancePassed).toBe(true);
    // No mismatch penalty anywhere.
    expect(result.tracks[0].breakdown.culturalMismatch).toBeUndefined();
  });

  it("10. a personalized K-pop user still receives K-pop", () => {
    const kpopProfile = profileOf({
      longTerm: {
        artists: { "newjeans": 0.8, "ive": 0.7, "aespa": 0.6 },
        genres: { "k-pop": 0.7, pop: 0.3 },
        tracks: {},
      },
      clusters: { korean: 6, latin: 2 },
    });
    const kpopTrack = mkTrack(91, {
      title: "새로운 노래",
      artist: "신인 아티스트",
      genre: "k-pop",
    });
    const result = getWaveRecommendations({
      seed: null,
      profile: kpopProfile,
      candidates: [candidate(kpopTrack, "taste"), candidate(kpopTrack, "exploration")],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    expect(result.tracks.map((t) => t.track.id)).toContain("t91");
    expect(result.tracks[0].relevance?.relevancePassed).toBe(true);
    expect(result.tracks[0].breakdown.clusterMatch).toBe(WAVE_CONFIG.scoring.clusterMatchBonus);
  });
});

describe("V2 relevance gate — detector & degradation sanity", () => {
  it("cultural cluster detector: scripts + genre tokens (no false positives on latin/cyrillic)", () => {
    expect(detectCulturalCluster("Кому что", "Ночной клуб", "pop")).toBe("cyrillic");
    expect(detectCulturalCluster("Normal Song", "The Band", "indie")).toBe("latin");
    expect(detectCulturalCluster("Vaaste", "Dhvani", "bollywood")).toBe("indic"); // genre token
    expect(detectCulturalCluster(" dynamite", "BTS", "k-pop")).toBe("korean");
    expect(detectCulturalCluster("يا حبيبي", "فنان", "arabic")).toBe("arabic");
    expect(detectCulturalCluster("普通の歌", "歌手", "pop")).toBe("japanese"); // kana の → japanese
    expect(detectCulturalCluster("中文歌曲", "歌手", "pop")).toBe("cjk"); // pure Han → cjk
    // The USER'S exact complaint, found in live QA: romanized Hindi song with
    // a FAKE genre tag — only the phrase marker catches it.
    expect(detectCulturalCluster("Achi Lagti Ho", "Sohaib Jutt", "classic rock")).toBe("indic");
    // Vietnamese pop with Latin script + distinctive diacritics.
    expect(detectCulturalCluster("Em Mới Là Người Yêu Anh", "Thomiz", "indie")).toBe("vietnamese");
  });

  it("romanized Hindi track with a fake genre tag is REJECTED even as anchored exploration (live-QA regression)", () => {
    // Rock/post-punk user; “classic rock” is a legit bridge genre — but the
    // track itself is Hindi pop masquerading under it.
    const profile = profileOf({
      longTerm: {
        artists: { "molchat doma": 0.8, "joy division": 0.7, "tame impala": 0.6 },
        genres: { rock: 0.7, "post punk": 0.6, "indie rock": 0.5 },
        tracks: {},
      },
      clusters: { latin: 6, cyrillic: 4 },
    });
    const fakeRock = mkTrack(95, {
      title: "Achi Lagti Ho",
      artist: "Sohaib Jutt",
      genre: "classic rock", // bridge of “rock” — would otherwise anchor
    });
    const realRock = mkTrack(96, { artist: "Some Rock Band", genre: "classic rock" });
    const result = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [candidate(realRock, "exploration", "rock"), candidate(fakeRock, "exploration", "rock")],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    const ids = result.tracks.map((t) => t.track.id);
    expect(ids).toContain("t96"); // honest classic-rock exploration passes
    expect(ids).not.toContain("t95"); // the masquerading Hindi track is blocked
    const blocked = (result.gate || []).find((g) => g.candidate.track.id === "t95");
    expect(blocked?.verdict.blockedBy).toBe("foreign_cluster");
  });

  it("a gate-rejected candidate NEVER re-enters the batch (no back-fill from rejects)", () => {
    // Rich profile; a flood of anchored exploration picks forces the share
    // cap to demote — the freed slots must NOT be refilled with rejects.
    const profile = profileOf({
      longTerm: {
        artists: { "hip hopper": 0.8, "beatmaker": 0.6 },
        genres: { "hip hop": 0.8, trap: 0.4 },
        tracks: {},
      },
      clusters: { latin: 5 },
    });
    const anchored = Array.from({ length: 8 }, (_, i) =>
      candidate(mkTrack(100 + i, { artist: `Trap New ${i}`, genre: "trap" }), "exploration", "hip hop"),
    );
    const taste = Array.from({ length: 4 }, (_, i) =>
      candidate(mkTrack(200 + i, { artist: `Artist ${String.fromCharCode(65 + i)}`, genre: "hip hop" }), "taste"),
    );
    const anchorless = mkTrack(300, { artist: "Nobody", genre: "techno" });
    const result = getWaveRecommendations({
      seed: null,
      profile,
      candidates: [...taste, ...anchored, candidate(anchorless, "taste")],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
      batchSize: 12,
    });
    const ids = result.tracks.map((t) => t.track.id);
    expect(ids).not.toContain("t300"); // the reject stays rejected
    for (const t of result.tracks) {
      expect(t.relevance?.relevancePassed).toBe(true); // every served pick passed the gate
    }
  });

  it("§35 graceful: a hard-blocked-only pool yields nothing — the client's legacy fallback owns recovery", () => {
    const result = getWaveRecommendations({
      seed: null,
      profile: richWesternProfile(),
      candidates: [
        candidate(mkTrack(1, { title: "गाना", artist: "यश", genre: "hip hop" }), "exploration"),
        candidate(mkTrack(2, { title: "दूसरा", artist: "दूसरा यश", genre: "pop" }), "taste"),
      ],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    expect(result.tracks).toHaveLength(0);
    expect(result.meta.relevance_rejected_count).toBe(2);
  });

  it("cold profile still yields music (rung 1) — but hard negatives still block", () => {
    const cold = profileOf(); // empty → cold
    const normal = mkTrack(1, { artist: "Anyone", genre: "indie" });
    const hindi = mkTrack(2, { title: "गाना", artist: "यश", genre: "hip hop" });
    const result = getWaveRecommendations({
      seed: null,
      profile: cold,
      candidates: [candidate(normal, "taste"), candidate(hindi, "taste")],
      randomSeed: 42,
      now: NOW,
      config: NO_JITTER,
    });
    expect(result.tracks.map((t) => t.track.id)).toContain("t1"); // cold → music, not silence
    expect(result.tracks.map((t) => t.track.id)).not.toContain("t2"); // hard negative still blocks
    expect(result.meta.gate_rung).toBe(1);
  });
});
