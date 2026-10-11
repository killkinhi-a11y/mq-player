/**
 * FREE PLAYBACK MODE regression tests (direction 2026-10-11).
 *
 * Contract under test — the user-mandated free scenario:
 *   «Пользователь открывает MQ, находит песню, нажимает Play и слушает
 *    полноценный трек» — no Spotify login, no Premium, no OAuth, no gate.
 *
 * 1. SOURCE CONTRACT: the audio engine never imports the (deleted) Spotify
 *    Official Playback modules and never references a playback gate. Every
 *    catalog track — Spotify or Deezer — MUST flow through the free
 *    PlaybackResolver (SoundCloud / Audius full-length).
 * 2. IDENTITY CONTRACT: catalog tracks carry catalogProvider/catalogId
 *    attribution (no SDK playback URIs); buildPlayableTrack keeps the
 *    honest «Каталог → Звук» chain (spotify catalog + soundcloud playback).
 * 3. STORE CONTRACT: no gate/session state exists — playbackMode has no
 *    "spotify" value; a Play press on a catalog track can never open a
 *    login prompt.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENGINE = readFileSync(
  resolve(__dirname, "../../components/mq/useAudioEngine.ts"),
  "utf8",
);
const STORE = readFileSync(
  resolve(__dirname, "../../store/useAppStore.ts"),
  "utf8",
);
const CLIENT = readFileSync(
  resolve(__dirname, "../../lib/playback/client.ts"),
  "utf8",
);

describe("free playback mode — source contract", () => {
  it("the audio engine never imports Spotify Official Playback modules", () => {
    const forbidden = [
      "@/lib/spotify/gate",
      "@/lib/spotify/playbackAdapter",
      "@/lib/spotify/auth",
      "spotifyPlaybackAdapter",
      "spotifyAuth",
      "decideSpotifyPlayback",
      "isSpotifyOfficialTrack",
      "bindSpotifyTransport",
    ];
    for (const token of forbidden) {
      expect(ENGINE.includes(token), `engine must not reference "${token}"`).toBe(false);
    }
  });

  it("the audio engine never opens a playback gate or requires login", () => {
    expect(ENGINE.includes("openSpotifyGate")).toBe(false);
    expect(ENGINE.includes("not_premium")).toBe(false);
    expect(ENGINE.includes("not_connected")).toBe(false);
  });

  it("every catalog track resolves through the PlaybackResolver", () => {
    // The unified catalog branch: source "spotify" + catalogId + no
    // playbackId → resolveCatalogTrack (provider spotify OR deezer —
    // both free paths, no per-provider official branch in between).
    expect(ENGINE.includes("resolveCatalogTrack")).toBe(true);
    const catalogBranch = 'if (currentTrack.source === "spotify" && currentTrack.catalogId && !currentTrack.playbackId)';
    expect(ENGINE.includes(catalogBranch)).toBe(true);
    // The resolver call maps BOTH catalog providers — no separate
    // Spotify-only branch between the condition and the resolve call.
    const branchIdx = ENGINE.indexOf(catalogBranch);
    const window = ENGINE.slice(branchIdx, branchIdx + 1200);
    expect(window.includes("resolveCatalogTrack")).toBe(true);
  });

  it("the store has no gate/session state or retry actions", () => {
    const forbidden = [
      "spotifyGate",
      "spotifyConnected",
      "spotifyPremium",
      "spotifyPlaybackSupported",
      "spotifyFallbackNotice",
      "openSpotifyGate",
      "retrySpotifyPlayback",
      "spotifyRetryNonce",
      "setSpotifySession",
    ];
    for (const token of forbidden) {
      expect(STORE.includes(token), `store must not reference "${token}"`).toBe(false);
    }
  });

  it('playbackMode has no "spotify" value — only element-engine modes', () => {
    expect(STORE.includes('"soundcloud" | "idle"')).toBe(true);
    expect(STORE.includes('"soundcloud" | "idle" | "spotify"')).toBe(false);
  });
});

describe("free playback mode — identity contract", () => {
  it("catalogToTrack carries NO SDK playback URI (metadata identity only)", () => {
    expect(CLIENT.includes("spotifyUri")).toBe(false);
    expect(CLIENT.includes("spotifyTrackId")).toBe(false);
    // Lazy-resolve marker + honest attribution stay:
    expect(CLIENT.includes('source: "spotify"')).toBe(true);
    expect(CLIENT.includes("catalogProvider: dto.provider")).toBe(true);
  });

  it("buildPlayableTrack keeps the honest catalog → playback attribution", async () => {
    const { buildPlayableTrack } = await import("../../lib/playback/client");
    const track = buildPlayableTrack(
      {
        provider: "spotify",
        catalogId: "6ZdhAXDc6a8coEg0m17g2A",
        title: "Goosebumps",
        artist: "Travis Scott",
        durationSec: 241,
      },
      {
        provider: "soundcloud",
        sourceId: "272204757",
        title: "Goosebumps",
        artist: "Travis Scott",
        durationSec: 242,
        confidence: 0.93,
        score: 100,
        isFullLength: true,
      },
    );
    // Playback source is the free provider…
    expect(track.source).toBe("soundcloud");
    expect(track.scTrackId).toBe(272204757);
    // …and the catalog identity is preserved for the honest badge chain.
    expect(track.catalogProvider).toBe("spotify");
    expect(track.catalogId).toBe("6ZdhAXDc6a8coEg0m17g2A");
    expect(track.playbackProvider).toBe("soundcloud");
    expect(track.playbackId).toBe("272204757");
    // Full-length verdict carried onto the playable track.
    expect(track.scIsFull).toBe(true);
  });
});

describe("free playback mode — resolver contract (regression guard)", () => {
  it("the resolver never picks a preview as the auto-play best", async () => {
    const { rankCandidates } = await import("../../lib/playback/resolver");
    const catalog = {
      catalogId: "sp_test",
      title: "Test Song",
      artist: "Test Artist",
      durationSec: 200,
    };
    const result = rankCandidates(catalog, [
      {
        provider: "soundcloud",
        sourceId: "1",
        title: "Test Song",
        artist: "Test Artist",
        durationSec: 200,
        isPreview: true, // SNIP — full-name perfect match, but a preview
      },
      {
        provider: "audius",
        sourceId: "2",
        title: "Test Song",
        artist: "Test Artist",
        durationSec: 201,
      },
    ]);
    // The preview must NOT be the auto-played best — the full-length
    // Audius candidate wins even with a slightly worse duration score.
    expect(result.best).not.toBeNull();
    expect(result.best!.provider).toBe("audius");
    expect(result.best!.isFullLength).toBe(true);
  });

  it("a wrong track is never auto-played (low confidence → no best)", async () => {
    const { rankCandidates } = await import("../../lib/playback/resolver");
    const catalog = {
      catalogId: "sp_test2",
      title: "Completely Different Song",
      artist: "Someone Else",
      durationSec: 180,
    };
    const result = rankCandidates(catalog, [
      {
        provider: "soundcloud",
        sourceId: "9",
        title: "Unrelated Upload (Remix)",
        artist: "DJ Nobody",
        durationSec: 305,
      },
    ]);
    expect(result.best).toBeNull();
    expect(result.lowConfidence).toBe(true);
  });
});

describe("free playback mode — \"Artist - Title\" upload naming (fan uploads)", () => {
  const catalog = {
    catalogId: "sp_faded",
    title: "Faded",
    artist: "Alan Walker",
    durationSec: 212,
  };

  it("a verbatim fan re-upload (\"Alan Walker - Faded\", duration-confirmed) auto-plays", async () => {
    const { rankCandidates } = await import("../../lib/playback/resolver");
    const result = rankCandidates(catalog, [
      {
        provider: "audius",
        sourceId: "777",
        title: "Alan Walker - Faded",
        artist: "LandsXScapes", // random fan uploader — NOT Alan Walker
        durationSec: 212,
      },
    ]);
    expect(result.best).not.toBeNull();
    expect(result.best!.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result.best!.isFullLength).toBe(true);
  });

  it("noise-bracket variants pass (\"(Official Audio)\", \"(Original Mix)\")", async () => {
    const { artistCreditedInTitle } = await import("../../lib/playback/resolver");
    expect(
      artistCreditedInTitle(catalog, { title: "Alan Walker - Faded (Official Audio)", durationSec: 211 }),
    ).toBe(true);
    expect(
      artistCreditedInTitle(catalog, { title: "Alan Walker - Faded (Original Mix)", durationSec: 213 }),
    ).toBe(true);
  });

  it("version/extra-artist brackets are rejected — never a different recording", async () => {
    const { artistCreditedInTitle } = await import("../../lib/playback/resolver");
    // Remix credited in brackets → different recording
    expect(
      artistCreditedInTitle(catalog, { title: "Alan Walker - Faded (SLUSHII Remix)", durationSec: 212 }),
    ).toBe(false);
    // Unknown re-edit label → different cut
    expect(
      artistCreditedInTitle(catalog, { title: "Alan Walker - Faded (OneUpped)", durationSec: 212 }),
    ).toBe(false);
    // Extra credited artist (feat. contamination) → different recording
    expect(
      artistCreditedInTitle(catalog, { title: "2Pac Ft. Alan Walker - Faded", durationSec: 212 }),
    ).toBe(false);
  });

  it("duration mismatch voids the naming evidence — a copied name never clears alone", async () => {
    const { artistCreditedInTitle } = await import("../../lib/playback/resolver");
    expect(
      artistCreditedInTitle(catalog, { title: "Alan Walker - Faded", durationSec: 260 }),
    ).toBe(false);
    // Unknown catalog duration → rule cannot confirm → off
    expect(
      artistCreditedInTitle(
        { ...catalog, durationSec: 0 },
        { title: "Alan Walker - Faded", durationSec: 212 },
      ),
    ).toBe(false);
  });

  it("a remix uploaded by the OFFICIAL artist still loses to the verbatim upload", async () => {
    const { rankCandidates } = await import("../../lib/playback/resolver");
    const result = rankCandidates(catalog, [
      {
        provider: "soundcloud",
        sourceId: "1",
        title: "Faded (SLUSHII Remix)",
        artist: "Alan Walker", // official channel, exact uploader match
        durationSec: 212,
      },
      {
        provider: "audius",
        sourceId: "2",
        title: "Alan Walker - Faded",
        artist: "LandsXScapes", // fan re-upload, verbatim naming
        durationSec: 212,
      },
    ]);
    expect(result.best).not.toBeNull();
    // The ORIGINAL (verbatim re-upload) must outrank the official remix —
    // the catalog track is "Faded", not "Faded (SLUSHII Remix)".
    expect(result.best!.sourceId).toBe("2");
  });
});
