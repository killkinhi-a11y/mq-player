/**
 * Track matching engine tests (src/lib/yandex/matching.ts) — Phase 4 matrix:
 * exact / normalization / feat / remix / live / ambiguous / unmatched /
 * SoundCloud "Artist - Title" packing / duration agreement / multi-artist.
 *
 * Golden rule under test: a track is NEVER silently matched to the wrong
 * song — uncertain cases come back "ambiguous" (with candidates) or
 * "unmatched".
 */

import { describe, it, expect } from "vitest";
import {
  norm,
  normTitle,
  parseTitle,
  levRatio,
  tokenJaccard,
  artistScore,
  titleScore,
  durationScore,
  matchTrack,
  decideMatch,
  searchQueries,
  type ScoredCandidate,
} from "@/lib/yandex/matching";
import type { Track } from "@/lib/musicApi";
import type { YandexTrackMeta } from "@/lib/yandex/types";

function yaTrack(partial: Partial<YandexTrackMeta>): YandexTrackMeta {
  return {
    position: 0,
    trackId: "1000",
    albumId: "2000",
    title: "",
    artists: [],
    albumTitle: "",
    albumIdFull: "2000",
    durationMs: 200000,
    available: true,
    ...partial,
  };
}

function scTrack(partial: Partial<Track>): Track {
  return {
    id: "sc_1",
    title: "",
    artist: "",
    album: "",
    duration: 200,
    cover: "",
    genre: "",
    audioUrl: "",
    source: "soundcloud",
    scTrackId: 1,
    scIsFull: true,
    ...partial,
  };
}

// ── normalization primitives ─────────────────────────────────────────────────

describe("normalization", () => {
  it("norm: case, ё→е, quotes, dashes, whitespace", () => {
    expect(norm("Ёлка — Песня")).toBe("елка - песня");
    expect(norm("  Много   пробелов  ")).toBe("много пробелов");
    expect(norm("«Кавычки» и „лапки“")).toContain("кавычки");
  });

  it("normTitle strips noise suffixes", () => {
    expect(normTitle("Song (Official Video)")).toBe("song");
    expect(normTitle("Song [Official Audio]")).toBe("song");
    expect(normTitle("Song (Explicit)")).toBe("song");
    expect(normTitle("Song")).toBe("song");
  });

  it("parseTitle extracts feat artists from parens", () => {
    const p = parseTitle("Пятница (feat. Баста)");
    expect(p.clean).toBe("пятница");
    expect(p.featArtists).toEqual(["баста"]);
  });

  it("parseTitle extracts inline ft. at the end", () => {
    const p = parseTitle("Song ft. Someone");
    expect(p.clean).toBe("song");
    expect(p.featArtists).toEqual(["someone"]);
  });

  it("parseTitle detects version markers", () => {
    expect(parseTitle("Song (Remix)").markers.has("remix")).toBe(true);
    expect(parseTitle("Song — Live").markers.has("live")).toBe(true);
    expect(parseTitle("Song (Acoustic Version)").markers.has("acoustic")).toBe(true);
    expect(parseTitle("Song").markers.size).toBe(0);
  });

  it("levRatio basics", () => {
    expect(levRatio("same", "same")).toBe(1);
    expect(levRatio("", "")).toBe(1);
    expect(levRatio("abc", "abx")).toBeCloseTo(2 / 3, 5);
    expect(levRatio("abcd", "")).toBe(0);
  });

  it("tokenJaccard basics", () => {
    expect(tokenJaccard("hello world", "world hello")).toBe(1);
    expect(tokenJaccard("hello", "other")).toBe(0);
  });
});

// ── artist scoring ───────────────────────────────────────────────────────────

describe("artistScore", () => {
  it("exact match = 1", () => {
    expect(artistScore(["Scorpions"], "Scorpions")).toBe(1);
  });

  it("case and ё normalization", () => {
    expect(artistScore(["Сергей Лазарев"], "Сергей Лазарев")).toBe(1);
    expect(artistScore(["Ёлкин"], "Елкин")).toBe(1);
  });

  it("secondary artist scores slightly lower than primary", () => {
    const s = artistScore(["Primary Guy", "Featured Gal"], "Featured Gal");
    expect(s).toBeGreaterThan(0.85);
    expect(s).toBeLessThan(1);
  });

  it("word-boundary containment is strong", () => {
    expect(artistScore(["Kiss"], "Kiss Official")).toBeGreaterThan(0.9);
  });

  it("different artists score low", () => {
    expect(artistScore(["Metallica"], "Михаил Круг")).toBeLessThan(0.3);
  });
});

// ── title scoring ────────────────────────────────────────────────────────────

describe("titleScore", () => {
  it("equal titles = 1 (feat-stripped)", () => {
    expect(titleScore(parseTitle("Song (feat. X)"), parseTitle("Song"))).toBe(1);
  });

  it("remix vs original is penalized", () => {
    const s = titleScore(parseTitle("Song (Remix)"), parseTitle("Song"));
    expect(s).toBeLessThanOrEqual(0.72 * 1.0001);
  });

  it("both remixes is NOT penalized", () => {
    const s = titleScore(parseTitle("Song (Remix)"), parseTitle("Song — Remix"));
    expect(s).toBeGreaterThan(0.9);
  });

  it("live vs studio is heavily penalized", () => {
    const s = titleScore(parseTitle("Song (Live)"), parseTitle("Song"));
    expect(s).toBeCloseTo(0.6, 5);
  });
});

// ── duration scoring ─────────────────────────────────────────────────────────

describe("durationScore", () => {
  it("close durations score 1", () => {
    expect(durationScore(200, 201)).toBe(1);
  });
  it("unknown duration is neutral", () => {
    expect(durationScore(0, 200)).toBe(0.75);
    expect(durationScore(200, 0)).toBe(0.75);
  });
  it("very different durations score low", () => {
    expect(durationScore(200, 380)).toBeLessThanOrEqual(0.05);
  });
});

// ── full pipeline: matchTrack ────────────────────────────────────────────────

describe("matchTrack decision matrix", () => {
  it("EXACT: identical artist+title → matched, exact=true", () => {
    const r = matchTrack(
      yaTrack({ title: "Bohemian Rhapsody", artists: ["Queen"], durationMs: 354000 }),
      [scTrack({ title: "Bohemian Rhapsody", artist: "Queen", duration: 354, id: "sc_11", scTrackId: 11 })]
    );
    expect(r.status).toBe("matched");
    expect(r.exact).toBe(true);
    expect(r.best?.track.id).toBe("sc_11");
  });

  it("EXACT through normalization (ё→е, case, extra spaces, feat-stripped)", () => {
    const r = matchTrack(
      yaTrack({ title: "Ёлки — Точки", artists: ["Иван Дорн"], durationMs: 200000 }),
      [scTrack({ title: "Елки - Точки  ", artist: "иван дорн", duration: 200 })]
    );
    expect(r.status).toBe("matched");
    expect(r.exact).toBe(true);
  });

  it("EXACT via SoundCloud 'Artist - Title' packing", () => {
    const r = matchTrack(
      yaTrack({ title: "Wind of Change", artists: ["Scorpions"], durationMs: 310000 }),
      [scTrack({ title: "Scorpions - Wind of Change", artist: "SomeLabel Records", duration: 310 })]
    );
    expect(r.status).toBe("matched");
    expect(r.exact).toBe(true);
  });

  it("feat. artist in Yandex title still matches base MQ title", () => {
    const r = matchTrack(
      yaTrack({ title: "Саныч (feat. Скриптонит)", artists: ["Джарахов"] }),
      [scTrack({ title: "Саныч", artist: "Джарахов", duration: 215 })]
    );
    expect(r.status).toBe("matched");
  });

  it("REMIX vs original → NOT silently matched", () => {
    const r = matchTrack(
      yaTrack({ title: "Midnight City (Remix)", artists: ["M83"] }),
      [scTrack({ title: "Midnight City", artist: "M83", duration: 244 })]
    );
    expect(r.status).not.toBe("matched");
    expect(["ambiguous", "unmatched"]).toContain(r.status);
  });

  it("LIVE vs studio → not matched", () => {
    const r = matchTrack(
      yaTrack({ title: "Nothing Else Matters (Live)", artists: ["Metallica"] }),
      [scTrack({ title: "Nothing Else Matters", artist: "Metallica", duration: 388 })]
    );
    expect(r.status).not.toBe("matched");
  });

  it("strong single candidate → matched (not exact)", () => {
    const r = matchTrack(
      yaTrack({ title: "Smells Like Teen Spirit", artists: ["Nirvana"], durationMs: 301000 }),
      [scTrack({ title: "Smells Like Teen Spirit", artist: "Nirvana", duration: 302 })]
    );
    expect(r.status).toBe("matched");
  });

  it("two close non-exact candidates → ambiguous with candidates", () => {
    // Neither candidate matches exactly (typos in artist/title), both are
    // equally good — the engine must NOT silently pick one.
    const r = matchTrack(
      yaTrack({ title: "Sunshyne", artists: ["Alfa"], durationMs: 200000 }),
      [
        scTrack({ title: "Sunshine", artist: "Alfa", duration: 200, id: "sc_a", scTrackId: 101 }),
        scTrack({ title: "Sunshyne", artist: "Alpha", duration: 200, id: "sc_b", scTrackId: 102 }),
      ]
    );
    expect(r.status).toBe("ambiguous");
    expect((r.candidates ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("near-tie between exact-title/wrong-artist and exact-artist/wrong-title is ambiguous", () => {
    const r = matchTrack(
      yaTrack({ title: "Hurt", artists: ["Johnny Cash"], durationMs: 214000 }),
      [
        scTrack({ title: "Hurt", artist: "Nine Inch Nails", duration: 214, id: "sc_n", scTrackId: 111 }),
        scTrack({ title: "Hirt", artist: "Johnny Cash", duration: 214, id: "sc_j", scTrackId: 112 }),
      ]
    );
    // No exact match (artist OR title wrong on each) → no silent match
    expect(r.status).not.toBe("matched");
  });

  it("nothing close → unmatched", () => {
    const r = matchTrack(
      yaTrack({ title: "Совершенно несуществующий трек", artists: ["Никто Никакой"], durationMs: 100000 }),
      [scTrack({ title: "unrelated thing", artist: "someone else", duration: 400 })]
    );
    expect(r.status).toBe("unmatched");
  });

  it("empty candidates → unmatched", () => {
    const r = matchTrack(yaTrack({ title: "Any", artists: ["Any"] }), []);
    expect(r.status).toBe("unmatched");
    expect(r.best).toBeNull();
  });

  it("wrong song with similar title but wrong artist is rejected", () => {
    const r = matchTrack(
      yaTrack({ title: "Hurt", artists: ["Johnny Cash"], durationMs: 214000 }),
      [scTrack({ title: "Hurt", artist: "Nine Inch Nails", duration: 214 })]
    );
    expect(r.status).not.toBe("matched");
  });

  it("duration mismatch on otherwise equal metadata lowers confidence", () => {
    const r = matchTrack(
      yaTrack({ title: "Creep", artists: ["Radiohead"], durationMs: 238000 }),
      [scTrack({ title: "Creep", artist: "Radiohead", duration: 500 })]
    );
    // 262s difference → durationScore 0.05 — combined < 0.9 threshold → ambiguous
    expect(r.status).not.toBe("matched");
  });
});

// ── decideMatch internals ────────────────────────────────────────────────────

describe("decideMatch thresholds", () => {
  const ya = yaTrack({ title: "Test Song", artists: ["Test Artist"] });

  function scored(score: number, artist: number): ScoredCandidate {
    return {
      track: scTrack({ title: "x", artist: "y" }),
      score,
      artist,
      title: 0,
      duration: 0,
    };
  }

  it("strong artist + score → matched", () => {
    const r = decideMatch(ya, [scored(0.95, 0.95), scored(0.5, 0.5)]);
    expect(r.status).toBe("matched");
  });

  it("top-2 gap < 0.05 with both strong → ambiguous", () => {
    const r = decideMatch(ya, [scored(0.95, 0.95), scored(0.93, 0.93)]);
    expect(r.status).toBe("ambiguous");
  });

  it("single mid candidate → ambiguous (manual resolution), never silent", () => {
    const r = decideMatch(ya, [scored(0.75, 0.7)]);
    expect(r.status).toBe("ambiguous");
  });

  it("candidate below manual floor → unmatched", () => {
    const r = decideMatch(ya, [scored(0.3, 0.2)]);
    expect(r.status).toBe("unmatched");
  });
});

// ── search query generation ──────────────────────────────────────────────────

describe("searchQueries", () => {
  it("primary artist + title", () => {
    expect(searchQueries(yaTrack({ title: "Song", artists: ["A", "B"] }))[0]).toBe("A Song");
  });

  it("uses feat artists when artists list is empty", () => {
    const q = searchQueries(yaTrack({ title: "Song (feat. Someone)", artists: [] }));
    expect(q[0]).toBe("someone Song");
  });

  it("falls back to title only for very short queries", () => {
    const q = searchQueries(yaTrack({ title: "AB", artists: [] }));
    expect(q[0]).toBe("AB");
  });
});
