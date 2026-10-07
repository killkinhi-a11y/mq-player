/**
 * Duplicate merging tests — the same musical work found in Spotify +
 * SoundCloud + Audius must render as ONE canonical result (search V2).
 * Exercises the PURE merge helper used by SearchView.
 */

import { describe, it, expect } from "vitest";
import {
  isDuplicateOf,
  titleCoreContained,
  mergeSearchResults,
} from "@/lib/playback/merge";
import { catalogToTrack } from "@/lib/playback/client";
import type { CatalogTrackDTO } from "@/lib/spotify/types";
import type { Track } from "@/lib/musicApi";

function dto(title: string, artist: string): CatalogTrackDTO {
  return {
    id: `sp_${title.replace(/\W/g, "")}`, spotifyId: title.replace(/\W/g, ""),
    title, artist,
    album: "Album", albumImage: "", durationSec: 200,
    explicit: false, popularity: 50, previewUrl: null,
  };
}

function sc(title: string, artist: string): Track {
  return {
    id: `sc_${title.replace(/\W/g, "")}`, title, artist, album: "", duration: 200,
    cover: "", genre: "", audioUrl: "", previewUrl: "", source: "soundcloud",
  };
}

describe("titleCoreContained", () => {
  it("reordered titles contain the catalog core", () => {
    expect(titleCoreContained("Goosebumps", "Travis Scott - Goosebumps")).toBe(true);
    expect(titleCoreContained("Goosebumps", "Goosebumps (feat. Kendrick Lamar)")).toBe(true);
  });

  it("different songs don't", () => {
    expect(titleCoreContained("Goosebumps", "Sicko Mode")).toBe(false);
  });

  it("mega-mix token dumps don't (extra-token cap)", () => {
    expect(titleCoreContained("Goosebumps", "Goosebumps Sicko Mode Stargazing Antidote Carousel")).toBe(false);
  });
});

describe("duplicate merge (search V2)", () => {
  it("exact SC upload dedupes against the Spotify catalog result", () => {
    const sp = dto("Goosebumps", "Travis Scott");
    expect(isDuplicateOf(sp, sc("Goosebumps", "Travis Scott"))).toBe(true);
  });

  it("reordered / decorated SC titles still merge", () => {
    const sp = dto("Goosebumps", "Travis Scott");
    expect(isDuplicateOf(sp, sc("Goosebumps (feat. Kendrick Lamar)", "Travis Scott"))).toBe(true);
    expect(isDuplicateOf(sp, sc("Travis Scott - Goosebumps", "Travis Scott"))).toBe(true);
  });

  it("LIVE and REMIX variants keep their own row (separate works)", () => {
    const sp = dto("Goosebumps", "Travis Scott");
    expect(isDuplicateOf(sp, sc("Goosebumps - LIVE", "Travis Scott"))).toBe(false);
    expect(isDuplicateOf(sp, sc("Goosebumps (Remix)", "Travis Scott"))).toBe(false);
    expect(isDuplicateOf(sp, sc("Goosebumps Slowed + Reverb", "Travis Scott"))).toBe(false);
    expect(isDuplicateOf(sp, sc("Goosebumps Karaoke", "Travis Scott"))).toBe(false);
  });

  it("different artists never merge", () => {
    const sp = dto("Goosebumps", "Travis Scott");
    expect(isDuplicateOf(sp, sc("Goosebumps", "COVER BAND"))).toBe(false);
  });

  it("merged list: catalog rows first, duplicates dropped, distinct works kept", () => {
    const catalog = [dto("Goosebumps", "Travis Scott"), dto("Sicko Mode", "Travis Scott")];
    const provider = [
      sc("Goosebumps", "Travis Scott"),                 // dup of catalog #1 → dropped
      sc("Goosebumps (Remix)", "Travis Scott"),          // separate work → kept
      sc("Highest in the Room", "Travis Scott"),         // not in catalog → kept
    ];
    const merged = mergeSearchResults(catalog, provider);

    // catalog identities present, in front
    expect(merged[0].source).toBe("spotify");
    expect(merged[0].title).toBe("Goosebumps");
    expect(merged[1].source).toBe("spotify");
    expect(merged[1].title).toBe("Sicko Mode");
    // the canonical SC duplicate is gone…
    expect(merged.filter((t) => t.title === "Goosebumps" && t.source === "soundcloud").length).toBe(0);
    // …while the variant and the distinct work survive
    expect(merged.some((t) => t.title === "Goosebumps (Remix)")).toBe(true);
    expect(merged.some((t) => t.title === "Highest in the Room")).toBe(true);
  });

  it("empty catalog → provider results untouched (Spotify-off path)", () => {
    const provider = [sc("Goosebumps", "Travis Scott")];
    expect(mergeSearchResults([], provider)).toBe(provider);
  });

  it("merged catalog rows carry catalog attribution for badges", () => {
    const [row] = mergeSearchResults([dto("Goosebumps", "Travis Scott")], []);
    expect(row.catalogProvider).toBe("spotify");
    expect(row.spotifyId).toBeTruthy();
    expect(row.playbackProvider).toBeUndefined(); // unresolved until played
    expect(catalogToTrack(dto("Goosebumps", "Travis Scott")).id).toBe(row.id);
  });
});
