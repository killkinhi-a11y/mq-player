/**
 * PlaybackResolver tests — the GOOSEBUMPS MATCH MATRIX (user spec §7/§40).
 *
 * Guarantees:
 *  - The ORIGINAL "Goosebumps" (3:46) outranks Live/Remix/Karaoke/Slowed/
 *    Cover/Sped-up/Acoustic/Instrumental candidates when a normal original
 *    exists.
 *  - ISRC match is decisive (+100).
 *  - Duration, artist, album contribute as specified.
 *  - Below-threshold resolves are LOW-CONFIDENCE (no autoplay, no best).
 *  - Match cache stores confidence/source/expiresAt; user preference
 *    re-ranks alternatives but never forces a bad match.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  scoreCandidate,
  rankCandidates,
  getCachedMatch,
  setCachedMatch,
  clearMatchCache,
  matchCacheKey,
  AUTO_PLAY_THRESHOLD,
  VERSION_PENALTIES,
  type CatalogTrack,
  type PlaybackCandidate,
} from "@/lib/playback/resolver";

/* ── The catalog track: Spotify "Goosebumps" — Travis Scott (3:46) ── */

const GOOSEBUMPS: CatalogTrack = {
  catalogId: "6g0damosSHTZ5j2jO9z7yn",
  title: "Goosebumps",
  artist: "Travis Scott",
  album: "Birds in the Trap Sing McKnight",
  durationSec: 226, // 3:46
};

function cand(partial: Partial<PlaybackCandidate> & { title: string; sourceId: string }): PlaybackCandidate {
  return {
    provider: "soundcloud",
    artist: "Travis Scott",
    durationSec: 226,
    ...partial,
  };
}

/* ═══ THE GOOSEBUMPS MATRIX ═══ */

describe("PlaybackResolver — goosebumps matrix", () => {
  it("ORIGINAL candidate scores highest and clears the threshold", () => {
    const original = cand({ title: "Goosebumps", sourceId: "1" });
    const r = scoreCandidate(GOOSEBUMPS, original);
    // title 40 + artist 40 + duration 20 = 100 raw → confidence 1.0
    expect(r.breakdown.title).toBe(40);
    expect(r.breakdown.artist).toBe(40);
    expect(r.breakdown.duration).toBe(20);
    expect(r.confidence).toBeGreaterThanOrEqual(AUTO_PLAY_THRESHOLD);
    expect(r.version).toBe("original");
  });

  it("LIVE (8:41) loses to the original — duration + version penalties", () => {
    const original = cand({ title: "Goosebumps", sourceId: "1" });
    const live = cand({ title: "Goosebumps - LIVE", sourceId: "2", durationSec: 521 });
    const ro = scoreCandidate(GOOSEBUMPS, original);
    const rl = scoreCandidate(GOOSEBUMPS, live);
    expect(rl.breakdown.versionPenalty).toBe(VERSION_PENALTIES.live);
    // 8:41 vs 3:46 → duration contributes nothing
    expect(rl.breakdown.duration).toBeLessThan(20);
    expect(rl.score).toBeLessThan(ro.score);
    expect(rl.version).toBe("live");
  });

  it("REMIX loses to the original", () => {
    const remix = cand({ title: "Goosebumps (Remix)", sourceId: "3" });
    const r = scoreCandidate(GOOSEBUMPS, remix);
    expect(r.breakdown.versionPenalty).toBe(VERSION_PENALTIES.remix);
    expect(r.version).toBe("remix");
    expect(r.score).toBeLessThan(scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "1" })).score);
  });

  it("KARAOKE can never win against any real candidate", () => {
    const karaoke = cand({ title: "Goosebumps Karaoke Version", sourceId: "4" });
    const r = scoreCandidate(GOOSEBUMPS, karaoke);
    expect(r.score).toBeLessThanOrEqual(0); // -100 penalty
    expect(r.version).toBe("karaoke");
    // Even alone it must not clear autoplay threshold
    const ranked = rankCandidates(GOOSEBUMPS, [karaoke]);
    expect(ranked.best).toBeNull();
    expect(ranked.lowConfidence).toBe(true);
  });

  it("SLOWED + REVERB and SPED UP are penalized", () => {
    const slowed = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps Slowed + Reverb", sourceId: "5", durationSec: 300 }));
    expect(slowed.breakdown.versionPenalty).toBe(VERSION_PENALTIES.slowed);
    const spedUp = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps Sped Up", sourceId: "6", durationSec: 180 }));
    expect(spedUp.breakdown.versionPenalty).toBe(VERSION_PENALTIES.sped_up);
  });

  it("COVER is rejected like karaoke", () => {
    const cover = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps (Cover)", sourceId: "7", artist: "Some Band" }));
    expect(cover.breakdown.versionPenalty).toBe(VERSION_PENALTIES.cover);
    expect(cover.score).toBeLessThanOrEqual(0);
  });

  it("ACOUSTIC / INSTRUMENTAL / RADIO EDIT are ranked below original", () => {
    for (const title of ["Goosebumps Acoustic", "Goosebumps Instrumental", "Goosebumps - Radio Edit"]) {
      const alt = scoreCandidate(GOOSEBUMPS, cand({ title, sourceId: title }));
      const orig = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "orig" }));
      expect(alt.score).toBeLessThan(orig.score);
    }
  });

  it("the full matrix: original ranks FIRST among all versions", () => {
    const candidates = [
      cand({ title: "Goosebumps - LIVE", sourceId: "live", durationSec: 521 }),
      cand({ title: "Goosebumps (Remix)", sourceId: "remix" }),
      cand({ title: "Goosebumps Karaoke", sourceId: "kara" }),
      cand({ title: "Goosebumps Slowed + Reverb", sourceId: "slow", durationSec: 300 }),
      cand({ title: "Goosebumps (Cover)", sourceId: "cover", artist: "Cover Band" }),
      cand({ title: "Goosebumps Sped Up", sourceId: "sped", durationSec: 180 }),
      cand({ title: "Goosebumps", sourceId: "original" }),
    ];
    const ranked = rankCandidates(GOOSEBUMPS, candidates);
    expect(ranked.best).not.toBeNull();
    expect(ranked.best!.sourceId).toBe("original");
    expect(ranked.best!.confidence).toBeGreaterThanOrEqual(AUTO_PLAY_THRESHOLD);
    expect(ranked.alternatives[0].sourceId).toBe("original");
  });

  it("an exact wrong-artist upload does not match", () => {
    const wrong = cand({ title: "Goosebumps", sourceId: "8", artist: "Random Uploader Music" });
    const r = scoreCandidate(GOOSEBUMPS, wrong);
    // artist 0 → score = 40 + 20 = 60 → 0.6 — right at threshold, but a
    // strong original from the real artist still wins.
    const real = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "9" }));
    expect(real.score).toBeGreaterThan(r.score);
  });
});

/* ═══ ISRC ═══ */

describe("PlaybackResolver — ISRC", () => {
  it("an ISRC match is decisive (+100)", () => {
    const c: CatalogTrack = { ...GOOSEBUMPS, isrc: "USUM71603469" };
    const m = scoreCandidate(c, cand({ title: "Totally Different Title", sourceId: "x", artist: "Someone Else", isrc: "USUM71603469", durationSec: 100 }));
    expect(m.breakdown.isrc).toBe(100);
    expect(m.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("ISRC mismatch does not penalize (absence ≠ contradiction)", () => {
    const c: CatalogTrack = { ...GOOSEBUMPS, isrc: "USUM71603469" };
    const m = scoreCandidate(c, cand({ title: "Goosebumps", sourceId: "y" }));
    expect(m.breakdown.isrc).toBe(0);
    expect(m.breakdown.title).toBe(40);
  });
});

/* ═══ Scoring components ═══ */

describe("PlaybackResolver — scoring components", () => {
  it("duration bands: ≤3s full, ≤5s 12, ≤8s 6, >60s negative", () => {
    expect(scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "a", durationSec: 224 })).breakdown.duration).toBe(20);
    expect(scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "b", durationSec: 230 })).breakdown.duration).toBe(12);
    expect(scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "c", durationSec: 233 })).breakdown.duration).toBe(6);
    expect(scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "d", durationSec: 400 })).breakdown.duration).toBe(-10);
  });

  it("album match adds +10", () => {
    const m = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "e", album: "Birds in the Trap Sing McKnight" }));
    expect(m.breakdown.album).toBe(10);
  });

  it("preview-only (SNIP) tracks get a −25 penalty", () => {
    const m = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "f", isPreview: true }));
    expect(m.breakdown.previewPenalty).toBe(-25);
  });

  it("catalog wants a LIVE version → live candidate NOT penalized", () => {
    const liveCatalog: CatalogTrack = { ...GOOSEBUMPS, title: "Goosebumps - Live", version: "live" };
    const liveCand = scoreCandidate(liveCatalog, cand({ title: "Goosebumps (Live)", sourceId: "g" }));
    expect(liveCand.breakdown.versionPenalty).toBe(0);
    // and the ORIGINAL candidate is the weaker signal in that context
    const origCand = scoreCandidate(liveCatalog, cand({ title: "Goosebumps", sourceId: "h" }));
    expect(origCand.breakdown.versionPenalty).toBe(-15);
  });

  it("popularity is a capped tiebreaker (0–4), never decisive", () => {
    const low = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "i", popularity: 5 }));
    const high = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "j", popularity: 50_000_000 }));
    expect(high.score - low.score).toBeLessThanOrEqual(4);
  });
});

/* ═══ Ranking + threshold ═══ */

describe("PlaybackResolver — ranking + threshold", () => {
  it("empty candidates → no best, not low-confidence", () => {
    const r = rankCandidates(GOOSEBUMPS, []);
    expect(r.best).toBeNull();
    expect(r.alternatives).toEqual([]);
    expect(r.lowConfidence).toBe(false);
  });

  it("only weak candidates → lowConfidence (UI must not autoplay)", () => {
    const weak = cand({ title: "Completely Different Song", sourceId: "z", artist: "Unknown" });
    const r = rankCandidates(GOOSEBUMPS, [weak]);
    expect(r.best).toBeNull();
    expect(r.lowConfidence).toBe(true);
    expect(r.alternatives.length).toBe(1); // still offered as a manual choice
  });

  it("alternatives are sorted by score and capped at 8", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      cand({ title: "Goosebumps", sourceId: `k${i}`, popularity: 12 - i }),
    );
    const r = rankCandidates(GOOSEBUMPS, many);
    expect(r.alternatives.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < r.alternatives.length; i++) {
      expect(r.alternatives[i].score).toBeLessThanOrEqual(r.alternatives[i - 1].score);
    }
  });

  it("confidence is normalized to 0..1 and clamped", () => {
    const perfect = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps", sourceId: "p", album: "Birds in the Trap Sing McKnight", popularity: 1_000_000 }));
    expect(perfect.confidence).toBeLessThanOrEqual(1);
    expect(perfect.confidence).toBeGreaterThanOrEqual(0);
    const terrible = scoreCandidate(GOOSEBUMPS, cand({ title: "x", sourceId: "t", artist: "y", durationSec: 999, isPreview: true }));
    expect(terrible.confidence).toBe(0);
  });
});

/* ═══ Match cache ═══ */

describe("PlaybackResolver — match cache", () => {
  beforeEach(() => clearMatchCache());

  it("stores and returns entries keyed by provider:catalogId", () => {
    const ranked = rankCandidates(GOOSEBUMPS, [cand({ title: "Goosebumps", sourceId: "c1" })]);
    setCachedMatch("spotify", GOOSEBUMPS.catalogId, ranked.best, ranked, "resolver");
    const hit = getCachedMatch("spotify", GOOSEBUMPS.catalogId);
    expect(hit).not.toBeNull();
    expect(hit!.key).toBe(matchCacheKey("spotify", GOOSEBUMPS.catalogId));
    expect(hit!.best!.sourceId).toBe("c1");
    expect(hit!.source).toBe("resolver");
    expect(hit!.resolvedAt).toBeTruthy();
    expect(hit!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns null for unknown keys", () => {
    expect(getCachedMatch("spotify", "does-not-exist")).toBeNull();
  });

  it("expires entries past their TTL", () => {
    const ranked = rankCandidates(GOOSEBUMPS, [cand({ title: "Goosebumps", sourceId: "c2" })]);
    const entry = setCachedMatch("spotify", GOOSEBUMPS.catalogId, ranked.best, ranked, "resolver");
    entry.expiresAt = Date.now() - 1; // force-expire
    expect(getCachedMatch("spotify", GOOSEBUMPS.catalogId)).toBeNull();
  });

  it("userTrackSourcePreference flows through prefer re-ranking (route logic)", () => {
    // The route re-ranks cached alternatives by preferred provider when that
    // provider clears the threshold — mirror the exact predicate here.
    const sc = cand({ title: "Goosebumps", sourceId: "sc1" });
    const audius: PlaybackCandidate = { ...cand({ title: "Goosebumps", sourceId: "au1" }), provider: "audius" };
    const ranked = rankCandidates(GOOSEBUMPS, [sc, audius]);
    expect(ranked.best!.provider).toBe("soundcloud"); // equal scores, SC first
    const preferred = ranked.alternatives.find(
      (a) => a.provider === "audius" && a.confidence >= AUTO_PLAY_THRESHOLD,
    );
    expect(preferred).toBeDefined(); // preference CAN switch to Audius
    expect(preferred!.confidence).toBeGreaterThanOrEqual(AUTO_PLAY_THRESHOLD);
    // but a preference never forces a sub-threshold match:
    const weakAudius: PlaybackCandidate = {
      ...cand({ title: "Different Song", sourceId: "au2", artist: "Other" }),
      provider: "audius",
    };
    const ranked2 = rankCandidates(GOOSEBUMPS, [sc, weakAudius]);
    const forced = ranked2.alternatives.find(
      (a) => a.provider === "audius" && a.confidence >= AUTO_PLAY_THRESHOLD,
    );
    expect(forced).toBeUndefined();
  });
});

describe("PlaybackResolver — token-core title containment (SC naming)", () => {
  it("'Artist - Title' uploads score near-exact title points", () => {
    const m = scoreCandidate(GOOSEBUMPS, cand({ title: "Travis Scott - Goosebumps", sourceId: "n1" }));
    expect(m.breakdown.title).toBe(Math.round(40 * 0.85)); // 34
    // 34 + 40 (artist) + 20 (duration) = 94 → confident
    expect(m.confidence).toBeGreaterThanOrEqual(AUTO_PLAY_THRESHOLD);
  });

  it("feat-extended uploads still contain the core", () => {
    const m = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps ft. Kendrick Lamar", sourceId: "n2" }));
    expect(m.breakdown.title).toBeGreaterThan(30);
  });

  it("mega-mix token dumps do NOT get the containment bonus", () => {
    const m = scoreCandidate(GOOSEBUMPS, cand({ title: "Goosebumps Sicko Mode Stargazing Antidote Carousel Mix", sourceId: "n3" }));
    expect(m.breakdown.title).toBeLessThan(20);
  });
});
