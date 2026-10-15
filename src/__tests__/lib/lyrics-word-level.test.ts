import { describe, it, expect, vi, beforeEach } from "vitest";

// Component CSS — vitest must not push it through postcss/tailwind
vi.mock("@/components/mq/liquid-lyrics.css", () => ({}));

import {
  parseSyncedDocument,
  parseEnhancedLrc,
  hasEnhancedLrcWordTags,
} from "@/lib/lyrics/wordLevel";
import {
  syncLevelOf,
  withEndMs,
  type LyricLine,
} from "@/lib/lyrics/types";
import {
  wordWindowsFromTimings,
  lineBounds,
  lineFill,
  wordWindows,
} from "@/components/mq/LiquidLyrics";
import { clearCache } from "@/lib/lyricsCache";
import { fetchLyrics } from "@/lib/lyrics-client";

// ─── Fixtures: real-world format samples ─────────────────────────────────────

const TTML_WORD_SYNCED = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <body dur="30s">
    <div>
      <p begin="00:00:12.000" end="00:00:15.000">
        <span begin="00:00:12.000" end="00:00:12.400">Я</span>
        <span begin="00:00:12.400" end="00:00:13.100">хочу</span>
        <span begin="00:00:13.100" end="00:00:13.800">тебя</span>
        <span begin="00:00:13.800" end="00:00:15.000">увидеть</span>
      </p>
    </div>
  </body>
</tt>`;

const ENHANCED_LRC = `[00:12.00]Я <00:12.20>хочу <00:12.80>тебя <00:13.40>увидеть
[00:16.00]<00:16.00>Is <00:16.30>this <00:16.60>the <00:16.90>real <00:17.20>life`;

const PLAIN_LRC = `[00:12.00]Я хочу тебя увидеть
[00:16.00]Is this the real life`;

const QRC = `<?xml version="1.0" encoding="utf-8"?>
<QrcInfos>
<QrcHeadInfo Title="T" Singer="T" Time="2026"/>
<LyricInfo LyricCount="1">
<Lyric_1 LyricType="1" LyricContent="
[offset:0]
[12000,3000]Я(12000,400)хочу(12400,700)тебя(13100,700)увидеть(13800,1200)
[16000,4000]Is(16000,600)this(16600,500)the(17100,700)real(17800,700)life(18500,1500)
"/>
</LyricInfo>
</QrcInfos>`;

// ─── Format detection + word-level parsing ───────────────────────────────────

describe("wordLevel — enhanced LRC detection", () => {
  it("detects word tags in enhanced LRC and rejects plain LRC", () => {
    expect(hasEnhancedLrcWordTags(ENHANCED_LRC)).toBe(true);
    expect(hasEnhancedLrcWordTags(PLAIN_LRC)).toBe(false);
    expect(hasEnhancedLrcWordTags("")).toBe(false);
  });
});

describe("wordLevel — parseEnhancedLrc", () => {
  it("produces REAL word timings including the pre-tag prefix word", () => {
    const lines = parseEnhancedLrc(ENHANCED_LRC, 30000);
    expect(lines).not.toBeNull();
    expect(lines!.length).toBeGreaterThanOrEqual(2);
    const first = lines![0];
    // Prefix word "Я" sits before the first <tag> — it must be recovered
    // with the line-start window, not dropped.
    const words = first.words ?? [];
    const texts = words.map((w) => w.text);
    expect(texts).toContain("Я");
    expect(texts).toContain("хочу");
    expect(texts).toContain("увидеть");
    // Word timings are REAL (startMs stated by the source), monotonic.
    for (const w of words) {
      expect(w.startMs).toBeGreaterThanOrEqual(first.startMs ?? 0);
    }
    for (let i = 1; i < words.length; i++) {
      expect(words[i].startMs).toBeGreaterThanOrEqual(words[i - 1].startMs);
    }
  });

  it("returns null for plain line-level LRC (honesty: no invented word timing)", () => {
    expect(parseEnhancedLrc(PLAIN_LRC, 30000)).toBeNull();
  });
});

describe("wordLevel — parseSyncedDocument (TTML)", () => {
  it("marks word-synced TTML as syncLevel=word with exact timings", () => {
    const doc = parseSyncedDocument(TTML_WORD_SYNCED, { durationMs: 30000 });
    expect(doc.format).toBe("ttml");
    expect(doc.syncLevel).toBe("word");
    expect(doc.lines.length).toBeGreaterThan(0);
    const sung = doc.lines.find((l) => l.text.includes("хочу"));
    expect(sung).toBeDefined();
    const words = sung!.words!;
    expect(words.map((w) => w.text)).toEqual(["Я", "хочу", "тебя", "увидеть"]);
    expect(words[1].startMs).toBe(12400);
    expect(words[1].endMs).toBe(13100);
    // Whitespace XML-indent parts must be filtered out.
    expect(words.every((w) => w.text.trim().length > 0)).toBe(true);
  });

  it("derives line endMs from the document for word lines", () => {
    const doc = parseSyncedDocument(TTML_WORD_SYNCED, { durationMs: 30000 });
    const sung = doc.lines.find((l) => l.text.includes("хочу"))!;
    expect(sung.startMs).toBe(12000);
    expect(sung.endMs).toBe(15000);
  });
});

describe("wordLevel — parseSyncedDocument (QRC)", () => {
  it("parses QRC karaoke word timings", () => {
    const doc = parseSyncedDocument(QRC, { durationMs: 30000 });
    expect(doc.format).toBe("qrc");
    expect(doc.syncLevel).toBe("word");
    const sung = doc.lines.find((l) => l.text.includes("увидеть"));
    expect(sung).toBeDefined();
    const words = sung!.words!;
    expect(words.length).toBe(4);
    // QRC states explicit absolute word timings.
    expect(words[0].startMs).toBe(12000);
    expect(words[0].endMs).toBe(12400);
    expect(words[1].startMs).toBe(12400);
    expect(words[1].endMs).toBe(13100);
  });
});

describe("wordLevel — parseSyncedDocument (line-level + plain)", () => {
  it("plain LRC → line level, NO word timings (never fake word sync)", () => {
    const doc = parseSyncedDocument(PLAIN_LRC, { durationMs: 30000 });
    expect(doc.format).toBe("lrc");
    expect(doc.syncLevel).toBe("line");
    expect(doc.lines.every((l) => !l.words)).toBe(true);
  });

  it("garbage input → empty lines, plain level, no throw", () => {
    const doc = parseSyncedDocument("!!!not a lyrics document");
    expect(doc.lines).toEqual([]);
    expect(doc.syncLevel).toBe("plain");
  });

  it("empty input → empty result", () => {
    expect(parseSyncedDocument("")).toEqual({
      lines: [],
      syncLevel: "plain",
      format: "unknown",
    });
  });
});

// ─── Honest sync-level derivation ────────────────────────────────────────────

describe("syncLevelOf — the honesty contract", () => {
  it("word only when a line carries real word timings", () => {
    const wordLines: LyricLine[] = [
      { text: "a b", startMs: 0, endMs: 4000, words: [{ text: "a", startMs: 0, endMs: 2000 }] },
    ];
    expect(syncLevelOf(wordLines)).toBe("word");
    expect(syncLevelOf([{ text: "a b", startMs: 0 }])).toBe("line");
    expect(syncLevelOf([{ text: "a b" }])).toBe("plain");
    expect(syncLevelOf([], true)).toBe("plain");
  });

  it("line words without startMs are NOT word level", () => {
    const noStart: LyricLine[] = [
      { text: "a", words: [{ text: "a", startMs: 0 }] },
    ];
    expect(syncLevelOf(noStart)).toBe("plain");
  });
});

// ─── Karaoke window math (real timings → 0..100 line space) ──────────────────

describe("LiquidLyrics — wordWindowsFromTimings", () => {
  const bounds = { start: 10, end: 14 }; // 4000 ms line

  it("maps word timings into line-progress space exactly", () => {
    const line: LyricLine = {
      text: "a b",
      startMs: 10000,
      endMs: 14000,
      words: [
        { text: "a", startMs: 10000, endMs: 12000 },
        { text: "b", startMs: 12000, endMs: 14000 },
      ],
    };
    const wins = wordWindowsFromTimings(line, bounds);
    expect(wins).toHaveLength(2);
    // Word "a": starts at line start → wa=0, span=50% → w-inv=2.
    expect(wins[0][0]).toBe(0);
    expect(wins[0][1]).toBe(2);
    // Word "b": starts at 50% → wa=50, span=50% → w-inv=2.
    expect(wins[1][0]).toBe(50);
    expect(wins[1][1]).toBe(2);
  });

  it("clamps out-of-line word starts into the line window", () => {
    const line: LyricLine = {
      text: "a b",
      startMs: 10000,
      words: [
        { text: "a", startMs: 10000, endMs: 12000 },
        { text: "b", startMs: 16000, endMs: 17000 }, // beyond line end
      ],
    };
    const wins = wordWindowsFromTimings(line, bounds);
    expect(wins[1][0]).toBeLessThanOrEqual(99);
    expect(wins[1][0] + 100 / wins[1][1]).toBeLessThanOrEqual(100.5);
  });

  it("floors tiny syllables to a visible window", () => {
    const line: LyricLine = {
      text: "те бя",
      startMs: 10000,
      words: [{ text: "те", startMs: 10000, endMs: 10020 }],
    };
    const wins = wordWindowsFromTimings(line, bounds);
    // 1.5% floor (float rounding tolerated).
    expect(100 / wins[0][1]).toBeGreaterThanOrEqual(1.4);
  });

  it("falls back to projected windows without word data", () => {
    const wins = wordWindowsFromTimings({ text: "a b", startMs: 0 }, bounds);
    expect(wins).toEqual([]);
    expect(wordWindows(3)).toHaveLength(3);
  });
});

describe("LiquidLyrics — lineBounds/lineFill shared base", () => {
  it("lineFill uses the same bounds as word windows (no drift)", () => {
    const lines: LyricLine[] = [
      { text: "a", startMs: 0, endMs: 4000 },
      { text: "b", startMs: 4000, endMs: 8000 },
    ];
    expect(lineBounds(lines, 0, 10)).toEqual({ start: 0, end: 4 });
    expect(lineFill(lines, 0, 2, 10)).toBe(0.5);
    expect(lineFill(lines, 0, 4, 10)).toBe(1);
  });
});

// ─── fetchLyrics pipeline: enhanced LRC word data flows through ──────────────

describe("lyrics-client — word-level via enhanced LRCLIB payload", () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  it("returns word-level lines + syncLevel when LRCLIB serves enhanced LRC", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("lrclib.net")) {
          const body = { id: 1, instrumental: false, plainLyrics: null, syncedLyrics: ENHANCED_LRC };
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(body),
            json: async () => body,
          };
        }
        return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
      }),
    );
    const res = await fetchLyrics({ artist: "Artist", title: "Song", duration: 30 });
    expect(res.source).toBe("lrclib");
    expect(res.syncLevel).toBe("word");
    expect(res.lines[0].words?.length).toBeGreaterThanOrEqual(3);
    // A word-timed result still honors withEndMs line bounds.
    expect(res.lines[0].startMs).toBe(12000);
  });

  it("plain LRCLIB payload stays line-level (never dressed as word sync)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("lrclib.net")) {
          const body = { id: 2, instrumental: false, plainLyrics: null, syncedLyrics: PLAIN_LRC };
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(body),
            json: async () => body,
          };
        }
        return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
      }),
    );
    const res = await fetchLyrics({ artist: "Artist2", title: "Song2", duration: 30 });
    expect(res.syncLevel).toBe("line");
    expect(res.lines.every((l) => !l.words)).toBe(true);
  });

  it("withEndMs preserves word arrays while fixing line ends", () => {
    const lines: LyricLine[] = [
      { text: "a b", startMs: 0, words: [{ text: "a", startMs: 0, endMs: 1000 }] },
      { text: "c", startMs: 2000 },
    ];
    const fixed = withEndMs(lines, 5);
    expect(fixed[0].endMs).toBe(2000);
    expect(fixed[0].words).toEqual([{ text: "a", startMs: 0, endMs: 1000 }]);
  });
});
