/**
 * V2 Spotify — user catalog mapping (lib/spotify/userCatalog.ts).
 *
 * Verifies the Web API → MQ Track mapping: source identity, catalog fields,
 * and the honest no-preview policy (§2: Spotify previews are never a
 * playback source — previewUrl stays undefined).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const authState = { token: "tok" as string | null };

vi.mock("@/lib/spotify/auth", () => ({
  spotifyAuth: {
    getStatus: () => ({ configured: true, connected: true, premium: true, user: null }),
    getValidToken: async () => authState.token,
    fetchMe: async () => null,
  },
}));

import { spTrackToTrack, searchAll } from "@/lib/spotify/userCatalog";

const spTrack = {
  id: "6ZdhAXDc6a8coEg0m17g2A",
  uri: "spotify:track:6ZdhAXDc6a8coEg0m17g2A",
  name: "Goosebumps",
  duration_ms: 241_120,
  explicit: false,
  preview_url: "https://p.scdn.co/preview.mp3",
  artists: [{ id: "a1", name: "Travis Scott" }, { id: "a2", name: "Kendrick Lamar" }],
  album: {
    id: "al1",
    name: "Birds in the Trap Sing McKnight",
    images: [
      { url: "https://i.scdn.co/640.jpg", width: 640, height: 640 },
      { url: "https://i.scdn.co/300.jpg", width: 300, height: 300 },
    ],
  },
};

describe("spTrackToTrack", () => {
  it("maps the Spotify track onto the MQ Track shape", () => {
    const t = spTrackToTrack(spTrack);
    expect(t.id).toBe("sp_6ZdhAXDc6a8coEg0m17g2A");
    expect(t.source).toBe("spotify");
    expect(t.spotifyUri).toBe("spotify:track:6ZdhAXDc6a8coEg0m17g2A");
    expect(t.spotifyTrackId).toBe("6ZdhAXDc6a8coEg0m17g2A");
    expect(t.title).toBe("Goosebumps");
    expect(t.artist).toBe("Travis Scott, Kendrick Lamar");
    expect(t.album).toBe("Birds in the Trap Sing McKnight");
    expect(t.duration).toBe(241);
  });

  it("prefers a >=300px artwork image (best display quality)", () => {
    const t = spTrackToTrack(spTrack);
    expect(t.cover).toBe("https://i.scdn.co/640.jpg");
  });

  it("falls back to the smallest available image when no >=300 exists", () => {
    const t = spTrackToTrack({
      ...spTrack,
      album: { ...spTrack.album, images: [{ url: "https://i.scdn.co/64.jpg", width: 64 }] },
    });
    expect(t.cover).toBe("https://i.scdn.co/64.jpg");
  });

  it("NEVER exposes the Spotify 30s preview as playback metadata (§2)", () => {
    const t = spTrackToTrack(spTrack);
    expect(t.previewUrl).toBeUndefined();
    expect(t.audioUrl).toBe("");
  });

  it("handles missing artists/album gracefully", () => {
    const t = spTrackToTrack({ ...spTrack, artists: [], album: undefined } as any);
    expect(t.artist).toBe("");
    expect(t.album).toBe("");
    expect(t.cover).toBe("");
  });
});

describe("searchAll", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    authState.token = "tok";
    window.fetch = fetchMock as any;
  });

  it("requests all four result types and maps tracks", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tracks: { items: [spTrack] },
        artists: { items: [{ id: "ar1", name: "Travis Scott" }] },
        albums: { items: [] },
        playlists: { items: [] },
      }),
    } as Response);
    const res = await searchAll("goosebumps");
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/search?q=goosebumps&type=track,artist,album,playlist",
    );
    expect(fetchMock.mock.calls[0][0]).toContain("https://api.spotify.com/v1");
    expect(res?.tracks).toHaveLength(1);
    expect(res?.tracks[0].source).toBe("spotify");
    expect(res?.artists[0].name).toBe("Travis Scott");
  });

  it("returns null when not authenticated (no catalog without a session)", async () => {
    authState.token = null;
    const res = await searchAll("x");
    expect(res).toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on API errors (honest empty state, no fake data)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    const res = await searchAll("x");
    expect(res).toBe(null);
  });
});
