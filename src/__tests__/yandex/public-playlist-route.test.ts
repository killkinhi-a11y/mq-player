/**
 * @vitest-environment node
 *
 * /api/yandex/public-playlist + /match route tests:
 *   - NO SESSION required (the core public-flow contract)
 *   - URL validation: invalid URL / unsupported host → 400
 *   - success payload shape (playlist card + tracks + sourceUrl, no internals)
 *   - error mapping: not found / geo blocked / timeout / upstream 5xx
 *   - empty playlist → 404 with a clear message
 *   - match route: chunk cap + payload validation + matched/unmatched results
 *   - adapter receives ONLY (user_id, kind) — never a raw URL to fetch
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = "public-route-test-secret-0123456789ab";
process.env.TURSO_DATABASE_URL = `file:/tmp/mq-yandex-public-route-${process.pid}.db`;

const adapterMock = vi.hoisted(() => ({
  adapterPublicPlaylistTracks: vi.fn(),
}));
const soundcloudMock = vi.hoisted(() => ({
  searchSCTracks: vi.fn(),
}));
vi.mock("@/lib/yandex/adapter", () => adapterMock);
vi.mock("@/lib/soundcloud", () => soundcloudMock);

import { POST as publicPlaylistPOST } from "@/app/api/yandex/public-playlist/route";
import { POST as matchPOST } from "@/app/api/yandex/public-playlist/match/route";
import { YandexError } from "@/lib/yandex/types";

const GOOD_URL = "https://music.yandex.ru/users/music.partners/playlists/1293";

/** Unique IP per call — keeps tests independent of the in-memory rate limiter. */
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `192.0.2.${(ipCounter % 250) + 1}`;
}

function postReq(path: string, body: unknown, ip = nextIp()): NextRequest {
  return new NextRequest(new URL(`http://localhost${path}`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function playlistTracksPayload() {
  return {
    kind: 1293,
    uid: 111,
    title: "Публичный плейлист",
    description: "описание",
    coverUrl: "https://avatars.yandex.net/cover",
    ownerLogin: "music.partners",
    trackCount: 2,
    tracks: [
      {
        position: 0,
        trackId: "100",
        albumId: "200",
        title: "Track One",
        artists: ["Artist A"],
        albumTitle: "Album",
        albumIdFull: "200",
        durationMs: 200000,
        available: true,
      },
      {
        position: 1,
        trackId: "101",
        albumId: null,
        title: "Track Two",
        artists: ["Artist B"],
        albumTitle: "",
        albumIdFull: null,
        durationMs: 180000,
        available: true,
      },
    ],
  };
}

beforeEach(() => {
  adapterMock.adapterPublicPlaylistTracks.mockReset();
  soundcloudMock.searchSCTracks.mockReset();
});

describe("POST /api/yandex/public-playlist — NO session required", () => {
  it("succeeds WITHOUT any session cookie (tokenless public contract)", async () => {
    adapterMock.adapterPublicPlaylistTracks.mockResolvedValue(playlistTracksPayload());
    const res = await publicPlaylistPOST(postReq("/api/yandex/public-playlist", { url: GOOD_URL }), undefined as never);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/yandex/public-playlist — URL validation (SSRF-safe)", () => {
  const badBodies: Array<[unknown, string]> = [
    [{}, "missing url"],
    [{ url: 123 }, "non-string url"],
    [{ url: "" }, "empty url"],
    [{ url: "not-a-url" }, "plain text"],
    [{ url: "https://evil.com/users/x/playlists/1" }, "foreign host"],
    [{ url: "https://music.yandex.ru.evil.com/users/x/playlists/1" }, "host suffix attack"],
    [{ url: "https://music.yandex.ru/playlist/1" }, "short form"],
    [{ url: "x".repeat(600) }, "oversize url"],
  ];
  for (const [body, label] of badBodies) {
    it(`returns 400 for ${label}`, async () => {
      const res = await publicPlaylistPOST(postReq("/api/yandex/public-playlist", body), undefined as never);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("bad_request");
      expect(typeof json.message).toBe("string");
      expect(json.message.length).toBeGreaterThan(5);
    });
  }

  it("never passes the raw URL to the adapter — only (login, kind)", async () => {
    adapterMock.adapterPublicPlaylistTracks.mockResolvedValue(playlistTracksPayload());
    await publicPlaylistPOST(
      postReq("/api/yandex/public-playlist", { url: `${GOOD_URL}?tracked=1#x` }),
      undefined as never
    );
    expect(adapterMock.adapterPublicPlaylistTracks).toHaveBeenCalledWith(
      "music.partners",
      1293,
      expect.anything()
    );
  });

  it("rejects malformed JSON body", async () => {
    const res = await publicPlaylistPOST(
      postReq("/api/yandex/public-playlist", "{not json"),
      undefined as never
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/yandex/public-playlist — success shape", () => {
  it("returns playlist card + tracks + sourceUrl, capped at PUBLIC_MAX_TRACKS", async () => {
    const big = playlistTracksPayload();
    big.trackCount = 300;
    big.tracks = Array.from({ length: 300 }, (_, i) => ({
      position: i,
      trackId: String(i),
      albumId: null,
      title: `T${i}`,
      artists: ["A"],
      albumTitle: "",
      albumIdFull: null,
      durationMs: 100000,
      available: true,
    }));
    adapterMock.adapterPublicPlaylistTracks.mockResolvedValue(big);
    const res = await publicPlaylistPOST(postReq("/api/yandex/public-playlist", { url: GOOD_URL }), undefined as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.playlist).toMatchObject({ title: "Публичный плейлист", kind: 1293, ownerLogin: "music.partners" });
    expect(json.tracks).toHaveLength(200);
    expect(json.trackCount).toBe(200);
    expect(json.totalTrackCount).toBe(300);
    expect(json.sourceUrl).toBe("https://music.yandex.ru/users/music.partners/playlists/1293");
    // no internals leak
    expect(JSON.stringify(json)).not.toContain("invocationInfo");
    expect(JSON.stringify(json)).not.toContain("token");
  });

  it("empty playlist → 404 with a clear message", async () => {
    const empty = playlistTracksPayload();
    empty.tracks = [];
    adapterMock.adapterPublicPlaylistTracks.mockResolvedValue(empty);
    const res = await publicPlaylistPOST(postReq("/api/yandex/public-playlist", { url: GOOD_URL }), undefined as never);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("yandex_empty_playlist");
    expect(json.message).toContain("нет треков");
  });
});

describe("POST /api/yandex/public-playlist — error mapping", () => {
  const cases: Array<[YandexError, number, string, string]> = [
    [new YandexError("yandex_not_found", "Плейлист недоступен: не найден или скрыт настройками приватности.", 404), 404, "yandex_not_found", "приват"],
    [
      new YandexError("yandex_geo_blocked", "Яндекс.Музыка ограничивает доступ по региону", 503),
      503,
      "yandex_geo_blocked",
      "регион",
    ],
    [new YandexError("yandex_timeout", "Яндекс.Музыка не ответила вовремя", 504), 504, "yandex_timeout", "ответ"],
    [new YandexError("adapter_unreachable", "Адаптер недоступен", 503), 503, "adapter_unreachable", "адаптер"],
  ];
  for (const [err, status, code, msgFragment] of cases) {
    it(`maps ${code} → ${status}`, async () => {
      adapterMock.adapterPublicPlaylistTracks.mockRejectedValue(err);
      const res = await publicPlaylistPOST(postReq("/api/yandex/public-playlist", { url: GOOD_URL }), undefined as never);
      expect(res.status).toBe(status);
      const json = await res.json();
      expect(json.error).toBe(code);
      expect(String(json.message).toLowerCase()).toContain(msgFragment);
    });
  }
});

describe("POST /api/yandex/public-playlist — rate limit", () => {
  it("applies the yandexPublic preset (10/min)", async () => {
    adapterMock.adapterPublicPlaylistTracks.mockResolvedValue(playlistTracksPayload());
    const results: number[] = [];
    const fixedIp = "198.51.100.99";
    for (let i = 0; i < 11; i++) {
      const res = await publicPlaylistPOST(
        postReq("/api/yandex/public-playlist", { url: GOOD_URL }, fixedIp),
        undefined as never
      );
      results.push(res.status);
    }
    expect(results.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
    expect(results.filter((s) => s === 200).length).toBe(10);
  });
});

describe("POST /api/yandex/public-playlist/match", () => {
  const trackMeta = (i: number) => ({
    position: i,
    trackId: `t${i}`,
    albumId: null,
    title: `Song ${i}`,
    artists: ["Artist"],
    albumTitle: "",
    albumIdFull: null,
    durationMs: 200000,
    available: true,
  });

  it("matches a slice and returns per-track decisions", async () => {
    // Only "Song 0" has a candidate; every other query finds nothing.
    soundcloudMock.searchSCTracks.mockImplementation(async (q: string) =>
      String(q).includes("Song 0")
        ? [
            {
              id: "sc1",
              title: "Song 0",
              artist: "Artist",
              album: "",
              duration: 200,
              cover: "",
              genre: "",
              audioUrl: "",
              previewUrl: "",
              source: "soundcloud",
              scTrackId: 1,
              scStreamPolicy: "",
              scIsFull: true,
            },
          ]
        : []
    );
    const res = await matchPOST(
      postReq("/api/yandex/public-playlist/match", { tracks: [trackMeta(0), trackMeta(1)] }),
      undefined as never
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(2);
    expect(json.matches[0].status).toBe("matched");
    expect(json.matches[1].status).toBe("unmatched");
  });

  it("requires no session", async () => {
    soundcloudMock.searchSCTracks.mockResolvedValue([]);
    const res = await matchPOST(
      postReq("/api/yandex/public-playlist/match", { tracks: [trackMeta(0)] }),
      undefined as never
    );
    expect(res.status).toBe(200);
  });

  it("rejects chunks above PUBLIC_MATCH_CHUNK", async () => {
    const res = await matchPOST(
      postReq("/api/yandex/public-playlist/match", { tracks: Array.from({ length: 13 }, (_, i) => trackMeta(i)) }),
      undefined as never
    );
    expect(res.status).toBe(400);
  });

  it("rejects malformed track payloads", async () => {
    const res = await matchPOST(
      postReq("/api/yandex/public-playlist/match", { tracks: [{ position: "x" }] }),
      undefined as never
    );
    expect(res.status).toBe(400);
  });

  it("rejects an empty tracks array", async () => {
    const res = await matchPOST(postReq("/api/yandex/public-playlist/match", { tracks: [] }), undefined as never);
    expect(res.status).toBe(400);
  });

  it("rejects non-array tracks", async () => {
    const res = await matchPOST(postReq("/api/yandex/public-playlist/match", { tracks: "nope" }), undefined as never);
    expect(res.status).toBe(400);
  });
});
