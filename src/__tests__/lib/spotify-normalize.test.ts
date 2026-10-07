/**
 * Spotify catalog normalizer tests — real API shapes → MQ DTOs.
 * Guards the metadata contract used by search, artist, album, track pages.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeTrack,
  normalizeArtist,
  normalizeAlbum,
} from "@/lib/spotify/catalog";
import type { SpotifyTrack, SpotifyArtist, SpotifySimplifiedAlbum } from "@/lib/spotify/types";

const spTrack: SpotifyTrack = {
  id: "6g0damosSHTZ5j2jO9z7yn",
  name: "Goosebumps",
  uri: "spotify:track:6g0damosSHTZ5j2jO9z7yn",
  duration_ms: 226000,
  explicit: true,
  track_number: 7,
  disc_number: 1,
  popularity: 82,
  preview_url: "https://p.scdn.co/preview.mp3",
  external_ids: { isrc: "USUM71603469" },
  external_urls: { spotify: "https://open.spotify.com/track/6g0damosSHTZ5j2jO9z7yn" },
  artists: [{ id: "0Y5tJS1cIPuFqR7EEWRZ0X", name: "Travis Scott", uri: "spotify:artist:1", type: "artist" }],
  album: {
    id: "3g4h5i",
    name: "Birds in the Trap Sing McKnight",
    uri: "spotify:album:1",
    album_type: "album",
    total_tracks: 14,
    images: [{ url: "https://i.scdn.co/image/ab67616d0000b273fake", width: 640, height: 640 }],
    release_date: "2016-09-02",
    release_date_precision: "day",
    artists: [{ id: "0Y5tJS1cIPuFqR7EEWRZ0X", name: "Travis Scott", uri: "spotify:artist:1", type: "artist" }],
  },
};

describe("normalizeTrack", () => {
  it("maps a Spotify track to the catalog DTO", () => {
    const dto = normalizeTrack(spTrack);
    expect(dto.provider).toBe("spotify");
    expect(dto.id).toBe("sp_6g0damosSHTZ5j2jO9z7yn");
    expect(dto.catalogId).toBe("6g0damosSHTZ5j2jO9z7yn");
    expect(dto.title).toBe("Goosebumps");
    expect(dto.artist).toBe("Travis Scott");
    expect(dto.album).toBe("Birds in the Trap Sing McKnight");
    expect(dto.durationSec).toBe(226);
    expect(dto.isrc).toBe("USUM71603469");
    expect(dto.explicit).toBe(true);
    expect(dto.albumImage).toContain("i.scdn.co");
    expect(dto.previewUrl).toContain("p.scdn.co"); // preview is a PREVIEW, not playback
  });

  it("survives a track without album/isrc/images", () => {
    const bare = normalizeTrack({ ...spTrack, album: undefined, external_ids: undefined, preview_url: null });
    expect(bare.album).toBe("");
    expect(bare.isrc).toBeUndefined();
    expect(bare.previewUrl).toBeNull();
    expect(bare.albumImage).toBe("");
  });
});

describe("normalizeArtist", () => {
  it("maps followers/genres/image", () => {
    const a: SpotifyArtist = {
      id: "0Y5tJS1cIPuFqR7EEWRZ0X",
      name: "Travis Scott",
      uri: "spotify:artist:1",
      type: "artist",
      followers: { total: 32_000_000 },
      genres: ["rap", "trap"],
      popularity: 92,
      images: [{ url: "https://i.scdn.co/image/artist", width: 640, height: 640 }],
    };
    const dto = normalizeArtist(a);
    expect(dto.id).toBe("spa_0Y5tJS1cIPuFqR7EEWRZ0X");
    expect(dto.provider).toBe("spotify");
    expect(dto.followers).toBe(32_000_000);
    expect(dto.genres).toEqual(["rap", "trap"]);
    expect(dto.image).toContain("i.scdn.co");
    expect(dto.externalUrl).toContain("open.spotify.com/artist/");
  });
});

describe("normalizeAlbum", () => {
  it("maps album type, year, track count", () => {
    const al: SpotifySimplifiedAlbum = {
      id: "3g4h5i",
      name: "UTOPIA",
      uri: "spotify:album:2",
      album_type: "album",
      total_tracks: 19,
      images: [{ url: "https://i.scdn.co/image/utopia", width: 640, height: 640 }],
      release_date: "2023-07-28",
      release_date_precision: "day",
      artists: [{ id: "0Y5tJS1cIPuFqR7EEWRZ0X", name: "Travis Scott", uri: "spotify:artist:1", type: "artist" }],
    };
    const dto = normalizeAlbum(al);
    expect(dto.id).toBe("spl_3g4h5i");
    expect(dto.provider).toBe("spotify");
    expect(dto.year).toBe("2023");
    expect(dto.albumType).toBe("album");
    expect(dto.totalTracks).toBe(19);
    expect(dto.artist).toBe("Travis Scott");
  });

  it("handles single with missing release_date", () => {
    const al: SpotifySimplifiedAlbum = {
      id: "xyz",
      name: "Single",
      uri: "spotify:album:3",
      album_type: "single",
      total_tracks: 1,
      images: [],
      release_date: "",
      release_date_precision: "year",
      artists: [],
    };
    const dto = normalizeAlbum(al);
    expect(dto.year).toBeUndefined();
    expect(dto.image).toBe("");
    expect(dto.artist).toBe("Unknown Artist");
  });
});
