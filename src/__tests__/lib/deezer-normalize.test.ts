/**
 * Deezer catalog normalizer tests — real API shapes → shared catalog DTOs.
 * Network-free: the Deezer API is geo/egress-blocked in some environments
 * (e.g. this CI container) — production Vercel egress reaches it fine
 * (the charts Deezer fallback has worked for months).
 */

import { describe, it, expect } from "vitest";
import { dzNormalizeTrack, dzNormalizeArtist, dzNormalizeAlbum } from "@/lib/deezer/catalog";

const dzTrack = {
  id: 110969365,
  title: "Goosebumps (feat. Kendrick Lamar)",
  title_short: "Goosebumps",
  duration: 226,
  preview: "https://cdns-preview-d.dzcdn.net/stream/preview.mp3",
  isrc: "USUM71603469",
  explicit_lyrics: 1,
  rank: 925000,
  artist: { id: 34711, name: "Travis Scott", picture_medium: "https://api.deezer.com/artist/34711/image" },
  album: { id: 13224869, title: "Birds In The Trap Sing McKnight", cover_medium: "https://api.deezer.com/album/13224869/image" },
};

describe("dzNormalizeTrack", () => {
  it("maps a Deezer track to the shared catalog DTO", () => {
    const dto = dzNormalizeTrack(dzTrack);
    expect(dto.provider).toBe("deezer");
    expect(dto.id).toBe("dz_110969365");
    expect(dto.catalogId).toBe("110969365");
    expect(dto.title).toContain("Goosebumps");
    expect(dto.artist).toBe("Travis Scott");
    expect(dto.artistId).toBe("34711");
    expect(dto.album).toBe("Birds In The Trap Sing McKnight");
    expect(dto.albumId).toBe("13224869");
    expect(dto.durationSec).toBe(226);
    expect(dto.isrc).toBe("USUM71603469"); // strong resolver signal
    expect(dto.explicit).toBe(true);
    expect(dto.previewUrl).toContain("dzcdn.net");
  });

  it("survives a minimal track object", () => {
    const dto = dzNormalizeTrack({ id: 1, title: "X", duration: 0 });
    expect(dto.provider).toBe("deezer");
    expect(dto.artist).toBe("Unknown Artist");
    expect(dto.album).toBe("");
    expect(dto.durationSec).toBe(0);
    expect(dto.isrc).toBeUndefined();
  });
});

describe("dzNormalizeArtist", () => {
  it("maps fans → followers, album count, image", () => {
    const dto = dzNormalizeArtist({ id: 34711, name: "Travis Scott", nb_fan: 15_000_000, nb_album: 45, picture_xl: "https://api.deezer.com/artist/34711/image" });
    expect(dto.provider).toBe("deezer");
    expect(dto.id).toBe("dza_34711");
    expect(dto.catalogId).toBe("34711");
    expect(dto.followers).toBe(15_000_000);
    expect(dto.trackCount).toBe(45);
    expect(dto.externalUrl).toContain("deezer.com/artist/34711");
  });
});

describe("dzNormalizeAlbum", () => {
  it("maps record types (single/ep/album), year, track count", () => {
    const album = dzNormalizeAlbum({
      id: 13224869,
      title: "Birds In The Trap Sing McKnight",
      artist: { id: 34711, name: "Travis Scott" },
      release_date: "2016-09-02",
      nb_tracks: 14,
      record_type: "album",
      duration: 3067,
    });
    expect(album.provider).toBe("deezer");
    expect(album.id).toBe("dzl_13224869");
    expect(album.year).toBe("2016");
    expect(album.albumType).toBe("album");
    expect(album.totalTracks).toBe(14);
    expect(album.totalDurationSec).toBe(3067);
    expect(album.artist).toBe("Travis Scott");

    const single = dzNormalizeAlbum({ id: 2, title: "S", record_type: "single", release_date: "2024-01-01" });
    expect(single.albumType).toBe("single");
    const ep = dzNormalizeAlbum({ id: 3, title: "E", record_type: "ep" });
    expect(ep.albumType).toBe("ep");
  });
});
