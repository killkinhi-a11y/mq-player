/**
 * Client playback bridge tests — catalog DTO → queue track, playable build,
 * source preference storage. Guards the catalog→playback contract used by
 * the store and the audio engine.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildPlayableTrack,
  catalogToTrack,
  getUserSourcePreference,
  setUserSourcePreference,
  clearLocalResolveCache,
  type ResolveCandidate,
} from "@/lib/playback/client";
import type { CatalogTrackDTO } from "@/lib/spotify/types";

const catalog: CatalogTrackDTO = {
  id: "sp_6g0damosSHTZ5j2jO9z7yn",
  spotifyId: "6g0damosSHTZ5j2jO9z7yn",
  title: "Goosebumps",
  artist: "Travis Scott",
  artistId: "0Y5tJS1cIPuFqR7EEWRZ0X",
  album: "Birds in the Trap Sing McKnight",
  albumId: "3g4h5i",
  albumImage: "https://i.scdn.co/image/cover",
  durationSec: 226,
  isrc: "USUM71603469",
  explicit: true,
  popularity: 82,
  previewUrl: null,
};

const scCandidate: ResolveCandidate = {
  provider: "soundcloud",
  sourceId: "271666988",
  title: "Goosebumps",
  artist: "Travis Scott",
  durationSec: 226,
  confidence: 0.94,
  score: 94,
};

const audiusCandidate: ResolveCandidate = {
  provider: "audius",
  sourceId: "Dp6l7v",
  title: "Goosebumps",
  artist: "Travis Scott",
  durationSec: 225,
  confidence: 0.9,
  score: 90,
};

describe("catalogToTrack", () => {
  it("produces an unresolved CATALOG track (source spotify, no playback id)", () => {
    const t = catalogToTrack(catalog);
    expect(t.id).toBe("sp_6g0damosSHTZ5j2jO9z7yn");
    expect(t.source).toBe("spotify");
    expect(t.catalogProvider).toBe("spotify");
    expect(t.spotifyId).toBe(catalog.spotifyId);
    expect(t.spotifyArtistId).toBe(catalog.artistId);
    expect(t.playbackProvider).toBeUndefined(); // not resolved yet
    expect(t.title).toBe("Goosebumps");
    expect(t.duration).toBe(226);
    // Catalog metadata only — never a fake audio URL
    expect(t.audioUrl).toBe("");
  });
});

describe("buildPlayableTrack", () => {
  it("SoundCloud candidate → playable soundcloud track with attribution", () => {
    const t = buildPlayableTrack(catalog, scCandidate);
    expect(t.source).toBe("soundcloud");
    expect(t.scTrackId).toBe(271666988);
    expect(t.scIsFull).toBe(true);
    expect(t.playbackProvider).toBe("soundcloud");
    expect(t.playbackId).toBe("271666988");
    expect(t.catalogProvider).toBe("spotify");
    expect(t.spotifyId).toBe(catalog.spotifyId);
    expect(t._resolveConfidence).toBeCloseTo(0.94);
    // Title/artist/artwork come from the CATALOG (Spotify), not the upload
    expect(t.title).toBe("Goosebumps");
    expect(t.cover).toContain("i.scdn.co");
    // Stable composite id → same resolve result = same id (resume works)
    expect(t.id).toBe(`spc_${catalog.spotifyId}_soundcloud_271666988`);
  });

  it("Audius candidate → playable audius track", () => {
    const t = buildPlayableTrack(catalog, audiusCandidate);
    expect(t.source).toBe("audius");
    expect(t.scTrackId).toBeUndefined();
    expect(t.playbackProvider).toBe("audius");
    expect(t.playbackId).toBe("Dp6l7v");
    expect(t.id).toBe(`spc_${catalog.spotifyId}_audius_Dp6l7v`);
  });

  it("preview-only candidate carries the SNIP policy", () => {
    const t = buildPlayableTrack(catalog, { ...scCandidate, isPreview: true });
    expect(t.scStreamPolicy).toBe("SNIP");
    expect(t.scIsFull).toBe(false);
  });

  it("version-tagged candidate keeps the tag for badges", () => {
    const t = buildPlayableTrack(catalog, { ...scCandidate, version: "live" });
    expect(t.versionTag).toBe("live");
  });
});

describe("user source preference (userTrackSourcePreference)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearLocalResolveCache();
  });

  it("defaults to auto", () => {
    expect(getUserSourcePreference()).toBe("auto");
  });

  it("persists soundcloud / audius / auto", () => {
    setUserSourcePreference("soundcloud");
    expect(getUserSourcePreference()).toBe("soundcloud");
    setUserSourcePreference("audius");
    expect(getUserSourcePreference()).toBe("audius");
    setUserSourcePreference("auto");
    expect(getUserSourcePreference()).toBe("auto");
    expect(window.localStorage.getItem("mq:userTrackSourcePreference")).toBeNull(); // auto cleans the key
  });

  it("ignores garbage values (tampered storage)", () => {
    window.localStorage.setItem("mq:userTrackSourcePreference", "napster");
    expect(getUserSourcePreference()).toBe("auto");
  });
});

describe("resolveCatalogTrack — failure honesty", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearLocalResolveCache();
  });

  it("network failure → failed:true, no throw, no fake track", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await buildPlayableBridge();
    expect(outcome.failed).toBe(true);
    expect(outcome.track).toBeNull();
    expect(outcome.lowConfidence).toBe(false);
    vi.unstubAllGlobals();
  });

  it("low-confidence → track null, alternatives preserved for manual choice", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        best: null,
        alternatives: [scCandidate, audiusCandidate],
        confidence: 0.4,
        lowConfidence: true,
        cached: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await buildPlayableBridge();
    expect(outcome.failed).toBe(false);
    expect(outcome.track).toBeNull();
    expect(outcome.lowConfidence).toBe(true);
    expect(outcome.alternatives.length).toBe(2);
    vi.unstubAllGlobals();
  });

  async function buildPlayableBridge() {
    // dynamic import keeps the module-level fetch reference fresh per test
    const { resolveCatalogTrack } = await import("@/lib/playback/client");
    return resolveCatalogTrack({
      spotifyId: catalog.spotifyId,
      title: catalog.title,
      artist: catalog.artist,
      album: catalog.album,
      durationSec: catalog.durationSec,
      isrc: catalog.isrc,
    });
  }
});
