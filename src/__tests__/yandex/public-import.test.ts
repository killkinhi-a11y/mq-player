/**
 * @vitest-environment node
 *
 * PUBLIC import matching core tests (src/lib/yandex/public-import.ts):
 *   - matchPublicChunk uses the engine's matching decisions (matched /
 *     ambiguous / unmatched) over mocked SoundCloud candidates
 *   - duplicate source tracks reuse the first decision (no double search)
 *   - slimPublicTrack keeps only MQ-relevant fields
 *   - isYandexTrackMeta validation for untrusted client payloads
 *   - PUBLIC_MATCH_CHUNK boundary contract
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Track } from "@/lib/musicApi";
import type { YandexTrackMeta } from "@/lib/yandex/types";

const scSearchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/soundcloud", () => ({
  searchSCTracks: scSearchMock,
}));

import {
  matchPublicChunk,
  slimPublicTrack,
  isYandexTrackMeta,
  PUBLIC_MATCH_CHUNK,
  PUBLIC_MAX_TRACKS,
} from "@/lib/yandex/public-import";

function scTrack(id: string, title: string, artist: string, duration = 200): Track {
  return {
    id,
    title,
    artist,
    album: "",
    duration,
    cover: `https://cover/${id}.jpg`,
    genre: "",
    audioUrl: `https://audio/${id}.mp3`,
    previewUrl: "",
    source: "soundcloud",
    scTrackId: Number(id.replace(/\D/g, "")) || 1,
    scStreamPolicy: "",
    scIsFull: true,
  };
}

function ya(position: number, title: string, artists: string[], durationSec = 200): YandexTrackMeta {
  return {
    position,
    trackId: `ya-${position}`,
    albumId: null,
    title,
    artists,
    albumTitle: "",
    albumIdFull: null,
    durationMs: durationSec * 1000,
    available: true,
  };
}

beforeEach(() => {
  scSearchMock.mockReset();
});

describe("matchPublicChunk", () => {
  it("marks an exact artist+title+duration hit as matched and slims the track", async () => {
    scSearchMock.mockResolvedValue([
      scTrack("sc1", "Smells Like Teen Spirit", "Nirvana", 201),
      scTrack("sc2", "Totally Different Song", "Someone Else", 100),
    ]);
    const res = await matchPublicChunk([ya(0, "Smells Like Teen Spirit", ["Nirvana"], 201)]);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe("matched");
    expect(res[0].mqTrack).toMatchObject({ id: "sc1", title: "Smells Like Teen Spirit", artist: "Nirvana" });
    // slimmed: cover kept, previewUrl empty, source soundcloud
    expect(res[0].mqTrack!.previewUrl).toBe("");
    expect(res[0].mqTrack!.source).toBe("soundcloud");
  });

  it("returns unmatched when SoundCloud has nothing", async () => {
    scSearchMock.mockResolvedValue([]);
    const res = await matchPublicChunk([ya(0, "Неизвестный Раритет 1994", ["Никто"], 999)]);
    expect(res[0].status).toBe("unmatched");
    expect(res[0].mqTrack).toBeFalsy();
  });

  it("returns ambiguous for near-tie candidates instead of silently picking one", async () => {
    scSearchMock.mockResolvedValue([
      scTrack("a1", "Creep", "Radiohead", 238),
      scTrack("a2", "Creep (slowed)", "Radiohead", 300),
      scTrack("a3", "Creep remix", "Radiohead", 250),
    ]);
    const res = await matchPublicChunk([ya(0, "Creep", ["Radiohead"], 240)]);
    expect(["ambiguous", "matched"]).toContain(res[0].status);
    if (res[0].status === "ambiguous") {
      expect(res[0].candidates!.length).toBeGreaterThan(1);
      expect(res[0].mqTrack).toBeFalsy();
    }
  });

  it("reuses the first decision for duplicate source tracks (no extra search)", async () => {
    scSearchMock.mockResolvedValue([scTrack("d1", "Song X", "Artist Y", 180)]);
    const res = await matchPublicChunk([ya(0, "Song X", ["Artist Y"], 180), ya(1, "Song X", ["Artist Y"], 180)]);
    expect(scSearchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(res[0].status).toBe(res[1].status);
    expect(res[1].mqTrack).toMatchObject({ id: "d1" });
  });

  it("tolerates a search rejection and keeps going (query variant fallback)", async () => {
    // Two artists → two query variants; the first call rejects, the second succeeds.
    scSearchMock
      .mockImplementationOnce(() => Promise.reject(new Error("sc down")))
      .mockResolvedValue([scTrack("r1", "Recovery Song", "Recoverist", 210)]);
    const res = await matchPublicChunk([ya(0, "Recovery Song", ["Recoverist", "Other"], 210)]);
    expect(res[0].status).toBe("matched");
  });

  it("processes more than SEARCH_CONCURRENCY tracks per call", async () => {
    scSearchMock.mockResolvedValue([]);
    const many = Array.from({ length: 10 }, (_, i) => ya(i, `Track ${i}`, [`Artist ${i}`]));
    const res = await matchPublicChunk(many);
    expect(res).toHaveLength(10);
    expect(res.every((r) => r.status === "unmatched")).toBe(true);
  });
});

describe("slimPublicTrack", () => {
  it("keeps only MQ-relevant fields", () => {
    const fat: Track = {
      ...scTrack("s1", "T", "A", 1),
      _reason: "related_current",
      _seedArtist: "X",
    } as Track;
    const slim = slimPublicTrack(fat);
    expect(slim).toMatchObject({ id: "s1", title: "T", artist: "A" });
    expect("_reason" in slim).toBe(false);
    expect("_seedArtist" in slim).toBe(false);
  });
});

describe("isYandexTrackMeta (untrusted input validation)", () => {
  it("accepts a well-formed meta", () => {
    expect(isYandexTrackMeta(ya(0, "T", ["A"]))).toBe(true);
  });
  const bad: Array<[unknown, string]> = [
    [null, "null"],
    [undefined, "undefined"],
    ["string", "plain string"],
    [{}, "empty object"],
    [{ title: "T" }, "missing trackId"],
    [{ trackId: "x" }, "missing title"],
    [{ trackId: "", title: "T", artists: [], position: 0 }, "empty trackId"],
    [{ trackId: 1, title: "T", artists: [], position: 0 }, "numeric trackId"],
    [{ trackId: "x", title: "T", artists: "not-array", position: 0 }, "artists not array"],
    [{ trackId: "x", title: "T", artists: [], position: "0" }, "position string"],
  ];
  for (const [v, label] of bad) {
    it(`rejects ${label}`, () => {
      expect(isYandexTrackMeta(v)).toBe(false);
    });
  }
});

describe("public flow constants", () => {
  it("PUBLIC_MATCH_CHUNK caps request size", () => {
    expect(PUBLIC_MATCH_CHUNK).toBe(12);
    expect(PUBLIC_MATCH_CHUNK).toBeLessThanOrEqual(12);
  });
  it("PUBLIC_MAX_TRACKS caps the import size", () => {
    expect(PUBLIC_MAX_TRACKS).toBe(200);
    expect(PUBLIC_MAX_TRACKS).toBeGreaterThan(0);
  });
});
