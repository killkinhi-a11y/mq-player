import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLyrics } from "@/lib/lyrics-client";
import { clearCache } from "@/lib/lyricsCache";

/**
 * Client lyrics pipeline — the full provider chain (spec §1 + §12):
 *   LRCLIB direct → lyrics.ovh → server relay → normalized error.
 * Fetch is fully mocked; results must NEVER be raw exceptions.
 */

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}
function status(s: number) {
  return { ok: s >= 200 && s < 300, status: s, text: async () => "", json: async () => null };
}

describe("fetchLyrics — provider chain", () => {
  beforeEach(() => {
    clearCache();
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("LRCLIB success → normalized synced result with source + ms timings", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("lrclib.net/api/get")) {
        return ok({
          syncedLyrics: "[00:10.00]Первая\n[00:20.00]Вторая",
          plainLyrics: "Первая\nВторая",
          duration: 30,
        });
      }
      return status(404);
    }));

    const res = await fetchLyrics({ artist: "A", title: "T", album: "AL", duration: 30 });
    expect(res.source).toBe("lrclib");
    expect(res.synced).toBe(true);
    expect(res.lines).toHaveLength(2);
    expect(res.lines[0]).toMatchObject({ text: "Первая", startMs: 10000, endMs: 20000 });
    // Last line bounded by the known duration.
    expect(res.lines[1].endMs).toBe(30000);
    // Legacy seconds shape stays available for older consumers.
    expect(res.lyrics[0]).toEqual({ time: 10, text: "Первая" });
  });

  it("LRCLIB plain-only result is returned as unsynced with source", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("lrclib.net")) return ok({ plainLyrics: "текст без таймингов", syncedLyrics: null });
      return status(404);
    }));
    const res = await fetchLyrics({ artist: "A", title: "T" });
    expect(res.synced).toBe(false);
    expect(res.plainText).toBe("текст без таймингов");
    expect(res.source).toBe("lrclib");
  });

  it("fallback: LRCLIB empty → lyrics.ovh plain text", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("lyrics.ovh")) {
        return ok({ lyrics: "Вот текст песни достаточно длинный" });
      }
      if (String(url).includes("lrclib.net")) return status(404);
      return status(404);
    }));
    const res = await fetchLyrics({ artist: "A", title: "T" });
    expect(res.source).toBe("lyrics-ovh");
    expect(res.plainText).toContain("текст песни");
    expect(res.synced).toBe(false);
  });

  it("fallback chain reaches the server relay when both externals 404", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).includes("/api/music/lyrics")) {
        return ok({ source: "lrclib", synced: true, lines: [{ text: "с", startMs: 1000, endMs: 2000 }], plainText: "" });
      }
      if (String(url).includes("lrclib.net") || String(url).includes("lyrics.ovh")) return status(404);
      return status(404);
    }));
    const res = await fetchLyrics({ artist: "A", title: "T", album: "AL", duration: 42 });
    expect(res.source).toBe("server");
    expect(res.synced).toBe(true);
    // Album + duration forwarded to the relay.
    const relay = urls.find((u) => u.includes("/api/music/lyrics"));
    expect(relay).toContain("album=AL");
    expect(relay).toContain("duration=42");
  });

  it("not found anywhere (providers reachable) → normalized not_found error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => status(404)));
    const res = await fetchLyrics({ artist: "A", title: "T" });
    expect(res.source).toBe("none");
    expect(res.error).toBe("not_found");
  });

  it("all providers unreachable → provider_unavailable (never a raw exception)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    const res = await fetchLyrics({ artist: "A", title: "T" });
    expect(res.error).toBe("provider_unavailable");
    expect(res.lines).toEqual([]);
  });

  it("missing artist/title → invalid_metadata without any fetch", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn as unknown as typeof fetch);
    const res = await fetchLyrics({ artist: "", title: "T" });
    expect(res.error).toBe("invalid_metadata");
    expect(fn).not.toHaveBeenCalled();
  });

  it("caches results — second identical query hits the in-memory cache", async () => {
    const fn = vi.fn(async (url: string) => {
      if (String(url).includes("lrclib.net/api/get")) {
        return ok({ syncedLyrics: "[00:01.00]x", plainLyrics: "x" });
      }
      return status(404);
    });
    vi.stubGlobal("fetch", fn as unknown as typeof fetch);

    await fetchLyrics({ artist: "A", title: "T", album: "AL", duration: 60 });
    const callsAfterFirst = fn.mock.calls.length;
    const res2 = await fetchLyrics({ artist: "A", title: "T", album: "AL", duration: 60 });
    expect(fn.mock.calls.length).toBe(callsAfterFirst); // no new network calls
    expect(res2.source).toBe("lrclib");
  });

  it("legacy 2-arg call form still works (back-compat)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("lrclib.net/api/get")) {
        return ok({ plainLyrics: "легаси вызов", syncedLyrics: null });
      }
      return status(404);
    }));
    const res = await fetchLyrics("A", "T");
    expect(res.plainText).toBe("легаси вызов");
  });
});
