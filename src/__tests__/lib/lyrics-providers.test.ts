import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseLrc,
  searchLrclib,
  hasContent,
  pickBest,
} from "@/lib/lyrics/lrclib";
import {
  normalizeLegacyLines,
  withEndMs,
  lineStartSec,
  lyricsErrorMessage,
  type LyricLine,
} from "@/lib/lyrics/types";

// ─── LRC parsing ────────────────────────────────────────────────────────────

describe("LRCLIB — parseLrc", () => {
  it("parses well-formed synced lyrics into ms-based lines", () => {
    const lines = parseLrc("[00:12.50]Первая строка\n[01:02.25]Вторая");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ text: "Первая строка", startMs: 12500 });
    expect(lines[1].startMs).toBe(62250);
  });

  it("supports centiseconds and milliseconds timestamps", () => {
    const lines = parseLrc("[00:01.30]a\n[00:02.345]b");
    expect(lines[0].startMs).toBe(1300);
    expect(lines[1].startMs).toBe(2345);
  });

  it("emits one entry per tag for multi-timestamp lines", () => {
    const lines = parseLrc("[00:05.00][00:35.00]Припев");
    expect(lines).toHaveLength(2);
    expect(lines[0].startMs).toBe(5000);
    expect(lines[1].startMs).toBe(35000);
  });

  it("skips malformed lines without inventing timestamps", () => {
    const lines = parseLrc("no timestamp here\n[bad]also bad\n[00:10.00]good");
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("good");
  });

  it("sorts lines by start time", () => {
    const lines = parseLrc("[00:30.00]b\n[00:10.00]a");
    expect(lines[0].text).toBe("a");
  });

  it("returns empty for empty input", () => {
    expect(parseLrc("")).toEqual([]);
  });
});

describe("LRCLIB — record selection", () => {
  it("hasContent requires actual lyrics and skips instrumental", () => {
    expect(hasContent({ syncedLyrics: "[00:01.00]x" })).toBe(true);
    expect(hasContent({ plainLyrics: "la la" })).toBe(true);
    expect(hasContent({ syncedLyrics: null, plainLyrics: null })).toBe(false);
    expect(hasContent({ plainLyrics: "x", instrumental: true })).toBe(false);
  });

  it("pickBest prefers synced over plain (spec §1)", () => {
    const plain = { plainLyrics: "plain", syncedLyrics: null };
    const synced = { plainLyrics: "plain", syncedLyrics: "[00:01.00]synced" };
    expect(pickBest([plain, synced])).toBe(synced);
    expect(pickBest([synced, plain])).toBe(synced);
    expect(pickBest([null, plain])).toBe(plain);
    expect(pickBest([null])).toBeNull();
  });
});

// ─── searchLrclib provider hop (fetch mocked) ───────────────────────────────

function mockFetch(impl: (url: string) => { status: number; body?: unknown } | { status: number; body?: unknown }[]) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(url);
    const out = impl(url);
    const first = Array.isArray(out) ? out[0] : out;
    return {
      ok: first.status >= 200 && first.status < 300,
      status: first.status,
      text: async () => (first.body === undefined ? "" : JSON.stringify(first.body)),
    };
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

describe("LRCLIB — searchLrclib", () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("success: exact hit with album + duration (sharper /api/get)", async () => {
    const { calls } = mockFetch((url) => {
      if (url.includes("/api/get") && url.includes("album_name")) {
        return { status: 200, body: { syncedLyrics: "[00:01.00]хей", plainLyrics: "хей" } };
      }
      return { status: 404 };
    });
    const res = await searchLrclib({ artist: "A", title: "T", album: "AL", duration: 180 });
    expect(res.record?.syncedLyrics).toContain("[00:01.00]");
    expect(calls[0]).toContain("album_name=AL");
    expect(calls[0]).toContain("duration=180");
    expect(res.error).toBeUndefined();
  });

  it("synced beats an earlier plain-only hit", async () => {
    mockFetch((url) => {
      if (url.includes("/api/get")) {
        return { status: 200, body: { plainLyrics: "только текст", syncedLyrics: null } };
      }
      if (url.includes("/api/search")) {
        return { status: 200, body: [{ syncedLyrics: "[00:05.00]синхро", plainLyrics: null }] };
      }
      return { status: 404 };
    });
    const res = await searchLrclib({ artist: "A", title: "T" });
    expect(res.record?.syncedLyrics).toBe("[00:05.00]синхро");
  });

  it("not found: provider reachable, no match → normalized not_found", async () => {
    mockFetch(() => ({ status: 404 }));
    const res = await searchLrclib({ artist: "A", title: "T" });
    expect(res.record).toBeNull();
    expect(res.error).toBe("not_found");
  });

  it("timeout/network: provider unreachable → provider_unavailable", async () => {
    const fn = vi.fn(async () => { throw new Error("network down"); });
    vi.stubGlobal("fetch", fn);
    const res = await searchLrclib({ artist: "A", title: "T" });
    expect(res.error).toBe("provider_unavailable");
  });

  it("rate limited: 429 from LRCLIB → rate_limited", async () => {
    mockFetch(() => ({ status: 429 }));
    const res = await searchLrclib({ artist: "A", title: "T" });
    expect(res.error).toBe("rate_limited");
  });

  it("falls back through search strategies when exact get 404s", async () => {
    const { calls } = mockFetch((url) => {
      if (url.includes("/api/search") && url.includes("q=T")) {
        return { status: 200, body: [{ plainLyrics: "найдено поиском" }] };
      }
      return { status: 404 };
    });
    const res = await searchLrclib({ artist: "A", title: "T" });
    expect(res.record?.plainLyrics).toBe("найдено поиском");
    expect(calls.some((c) => c.includes("/api/get"))).toBe(true);
    expect(calls.some((c) => c.includes("/api/search"))).toBe(true);
  });
});

// ─── Normalization helpers ──────────────────────────────────────────────────

describe("Lyrics normalization", () => {
  it("normalizeLegacyLines converts seconds to ms", () => {
    const out = normalizeLegacyLines([{ time: 1.5, text: "x" }]);
    expect(out[0]).toEqual({ text: "x", startMs: 1500 });
    expect(normalizeLegacyLines([])).toEqual([]);
    expect(normalizeLegacyLines(null)).toEqual([]);
  });

  it("withEndMs: each line ends where the next starts", () => {
    const lines: LyricLine[] = [
      { text: "a", startMs: 1000 },
      { text: "b", startMs: 5000 },
    ];
    const out = withEndMs(lines);
    expect(out[0].endMs).toBe(5000);
    expect(out[1].endMs).toBeUndefined();
  });

  it("withEndMs: last line bounded by track duration when known", () => {
    const out = withEndMs([{ text: "a", startMs: 1000 }], 30);
    expect(out[0].endMs).toBe(30000);
  });

  it("withEndMs: keeps LRCLIB's tighter timings (more precise than guessing)", () => {
    const lines: LyricLine[] = [
      { text: "a", startMs: 1000, endMs: 2600 },
      { text: "b", startMs: 5000 },
    ];
    const out = withEndMs(lines);
    expect(out[0].endMs).toBe(2600);
  });

  it("lineStartSec converts to the audio clock unit", () => {
    expect(lineStartSec({ text: "x", startMs: 1500 })).toBe(1.5);
    expect(lineStartSec({ text: "x" })).toBe(0);
  });

  it("error mapping: normalized codes → human RU messages", () => {
    expect(lyricsErrorMessage("not_found")).toBe("Текст не найден");
    expect(lyricsErrorMessage("provider_unavailable")).toContain("недоступен");
    expect(lyricsErrorMessage("invalid_metadata")).toContain("данных");
    expect(lyricsErrorMessage("rate_limited")).toContain("запросов");
    expect(lyricsErrorMessage(undefined)).toBe("Текст не найден");
  });
});
