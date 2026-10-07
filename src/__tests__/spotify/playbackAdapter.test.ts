/**
 * V2 Spotify — SpotifyPlaybackAdapter (lib/spotify/playbackAdapter.ts).
 *
 * Tests the §13 control surface against a MOCKED Spotify Web Playback SDK
 * (the real SDK needs Widevine + a Premium session — impossible in CI).
 * The mock mirrors the official SDK surface (connect/pause/resume/seek/
 * nextTrack/previousTrack/setVolume/activateElement/getCurrentState + the
 * ready/not_ready/player_state_changed/*_error events).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock the auth manager before importing the adapter ────────────────────
const authState = {
  token: "test-access-token" as string | null,
  refresh: "test-refresh" as string | null,
  product: "premium",
};

vi.mock("@/lib/spotify/auth", () => ({
  spotifyAuth: {
    getStatus: () => ({
      configured: true,
      connected: !!authState.refresh,
      premium: authState.product === "premium",
      user: authState.refresh
        ? { id: "u1", displayName: "Test User", product: authState.product }
        : null,
    }),
    getValidToken: async () => authState.token,
    fetchMe: async () =>
      authState.refresh
        ? { id: "u1", displayName: "Test User", product: authState.product }
        : null,
  },
}));

import {
  spotifyPlaybackAdapter,
  isSpotifyPlaybackBrowserSupported,
} from "@/lib/spotify/playbackAdapter";

// ── SDK mock ──────────────────────────────────────────────────────────────

type SdkListener = (payload: any) => void;

class MockSdkPlayer {
  static instances: MockSdkPlayer[] = [];
  listeners: Record<string, SdkListener[]> = {};
  connected = false;
  volume = 0.8;
  calls: string[] = [];

  constructor(public opts: any) {
    MockSdkPlayer.instances.push(this);
  }

  addListener(event: string, cb: SdkListener) {
    (this.listeners[event] ||= []).push(cb);
    return true;
  }
  emit(event: string, payload: any) {
    (this.listeners[event] || []).forEach((f) => f(payload));
  }
  async connect() {
    this.connected = true;
    this.calls.push("connect");
    this.emit("ready", { device_id: "device-1" });
    return true;
  }
  disconnect() {
    this.connected = false;
    this.calls.push("disconnect");
  }
  async pause() {
    this.calls.push("pause");
    this.emit("player_state_changed", { ...stateAt(0, true) });
  }
  async resume() {
    this.calls.push("resume");
    this.emit("player_state_changed", { ...stateAt(10, false) });
  }
  async seek(ms: number) {
    this.calls.push(`seek:${ms}`);
  }
  async nextTrack() {
    this.calls.push("next");
  }
  async previousTrack() {
    this.calls.push("previous");
  }
  async setVolume(v: number) {
    this.volume = v;
    this.calls.push(`setVolume:${v.toFixed(2)}`);
  }
  async activateElement() {
    this.calls.push("activateElement");
  }
  getCurrentState() {
    return this.current ?? null;
  }
  current: any = null;
}

function stateAt(positionMs: number, paused: boolean) {
  return {
    paused,
    position: positionMs,
    duration: 200_000,
    track_window: {
      current_track: {
        uri: "spotify:track:abc",
        id: "abc",
        name: "Test Song",
        artists: [{ name: "Test Artist" }],
        album: { name: "Test Album", images: [{ url: "https://img/300" }] },
      },
    },
  };
}

async function installSdkMock() {
  const w = window as any;
  w.Spotify = { Player: MockSdkPlayer as any };
  w.onSpotifyWebPlaybackSDKReady?.();
  // allow loadSdk's promise to observe the pre-set Spotify global
  await new Promise((r) => setTimeout(r, 0));
}

// Route api.spotify.com calls through fetch mock
const fetchMock = vi.fn();
window.fetch = fetchMock as any;

function playResponse(status = 202) {
  return { ok: status >= 200 && status < 300, status } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  MockSdkPlayer.instances.length = 0;
  authState.token = "test-access-token";
  authState.refresh = "test-refresh";
  authState.product = "premium";
  // jsdom lacks EME — stub the Widevine capability probe (the adapter's
  // browser gate needs it; the real SDK ships its own EME pipeline).
  if (!navigator.requestMediaKeySystemAccess) {
    (navigator as any).requestMediaKeySystemAccess = async () => {
      throw new Error("not supported");
    };
  }
  // Fresh adapter per test (module-level singleton state resets)
  (spotifyPlaybackAdapter as any).player = null;
  (spotifyPlaybackAdapter as any).deviceId = null;
  (spotifyPlaybackAdapter as any).sdkLoading = null;
  (spotifyPlaybackAdapter as any).sessionDisabled = false;
  (spotifyPlaybackAdapter as any).lastState = null;
  (spotifyPlaybackAdapter as any).endedFiredFor = null;
});

describe("browser support gate", () => {
  it("classifies the test (Chromium-like) UA as supported", () => {
    // jsdom UA is a desktop browser without mobile markers
    expect(typeof isSpotifyPlaybackBrowserSupported()).toBe("boolean");
  });

  it("rejects mobile UAs", () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    expect(isSpotifyPlaybackBrowserSupported()).toBe(false);
    Object.defineProperty(navigator, "userAgent", { value: original, configurable: true });
  });

  it("rejects desktop Safari", () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      configurable: true,
    });
    expect(isSpotifyPlaybackBrowserSupported()).toBe(false);
    Object.defineProperty(navigator, "userAgent", { value: original, configurable: true });
  });
});

describe("official availability (§16 priority gate)", () => {
  it("available when connected + premium + supported browser", async () => {
    await installSdkMock();
    expect(await spotifyPlaybackAdapter.isOfficialAvailable()).toBe(true);
  });

  it("unavailable when logged out", async () => {
    authState.refresh = null;
    expect(await spotifyPlaybackAdapter.isOfficialAvailable()).toBe(false);
  });

  it("unavailable on a free account", async () => {
    authState.product = "free";
    expect(await spotifyPlaybackAdapter.isOfficialAvailable()).toBe(false);
  });

  it("unavailable after an account error (session downgrade, no loops)", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const player = MockSdkPlayer.instances[0];
    player.emit("account_error", { message: "Premium required" });
    expect(await spotifyPlaybackAdapter.isOfficialAvailable()).toBe(false);
  });
});

describe("§13 control surface", () => {
  it("connect() boots the SDK and captures device_id", async () => {
    await installSdkMock();
    const ok = await spotifyPlaybackAdapter.connect();
    expect(ok).toBe(true);
    expect(spotifyPlaybackAdapter.isActive).toBe(true);
    expect(spotifyPlaybackAdapter.getDeviceId()).toBe("device-1");
  });

  it("play() issues PUT /me/player/play with the track URI on OUR device", async () => {
    await installSdkMock();
    fetchMock.mockResolvedValueOnce(playResponse(202));
    const ok = await spotifyPlaybackAdapter.play("spotify:track:xyz", { volumePercent: 70 });
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("https://api.spotify.com/v1/me/player/play?device_id=device-1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ uris: ["spotify:track:xyz"] });
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    // Volume applied through the SDK (0..1), 70% → 0.7
    expect(MockSdkPlayer.instances[0].calls).toContain("setVolume:0.70");
  });

  it("play() passes position_ms when resuming mid-track", async () => {
    await installSdkMock();
    fetchMock.mockResolvedValueOnce(playResponse(202));
    await spotifyPlaybackAdapter.play("spotify:track:xyz", { positionSec: 95 });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).position_ms).toBe(95000);
  });

  it("pause/resume/seek/next/previous/setVolume route to the SDK", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const player = MockSdkPlayer.instances[0];
    await spotifyPlaybackAdapter.pause();
    await spotifyPlaybackAdapter.resume();
    await spotifyPlaybackAdapter.seek(42);
    await spotifyPlaybackAdapter.next();
    await spotifyPlaybackAdapter.previous();
    await spotifyPlaybackAdapter.setVolume(50);
    const calls = player.calls.join(",");
    expect(calls).toContain("pause");
    expect(calls).toContain("resume");
    expect(calls).toContain("seek:42000");
    expect(calls).toContain("next");
    expect(calls).toContain("previous");
    expect(calls).toContain("setVolume:0.50");
  });

  it("play() 404 (device offline) triggers ONE reconnect + retry", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    fetchMock
      .mockResolvedValueOnce(playResponse(404))
      .mockResolvedValueOnce(playResponse(202));
    const ok = await spotifyPlaybackAdapter.play("spotify:track:xyz");
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("device_id=device-1");
  });

  it("play() 403 (premium/market) downgrades the session honestly", async () => {
    await installSdkMock();
    fetchMock.mockResolvedValueOnce(playResponse(403));
    const ok = await spotifyPlaybackAdapter.play("spotify:track:xyz");
    expect(ok).toBe(false);
    expect(await spotifyPlaybackAdapter.isOfficialAvailable()).toBe(false);
  });
});

describe("state pipeline (MQ Wave visual layer source)", () => {
  it("publishes normalized state snapshots", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const seen: any[] = [];
    const off = spotifyPlaybackAdapter.onState((s) => seen.push(s));
    const player = MockSdkPlayer.instances[0];

    player.emit("player_state_changed", stateAt(30_000, false));
    expect(seen.length).toBe(1);
    expect(seen[0]).toMatchObject({
      paused: false,
      durationSec: 200,
      trackUri: "spotify:track:abc",
      title: "Test Song",
      artist: "Test Artist",
      albumName: "Test Album",
      artworkUrl: "https://img/300",
    });
    // Position interpolates from the event — 30s + a few ms of test time.
    expect(seen[0].positionSec).toBeGreaterThanOrEqual(30);
    expect(seen[0].positionSec).toBeLessThan(31);
    off();
  });

  it("interpolates the position between state events while playing", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const player = MockSdkPlayer.instances[0];
    player.emit("player_state_changed", stateAt(10_000, false));
    const pos = spotifyPlaybackAdapter.getPositionSec();
    expect(pos).toBeGreaterThanOrEqual(10);
    expect(pos).toBeLessThan(11.5); // ~0..1.5s of test-time drift is fine
    expect(spotifyPlaybackAdapter.getDurationSec()).toBe(200);
  });

  it("paused state freezes the clock", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const player = MockSdkPlayer.instances[0];
    player.emit("player_state_changed", stateAt(30_000, false));
    player.emit("player_state_changed", stateAt(30_500, true));
    const p1 = spotifyPlaybackAdapter.getPositionSec();
    await new Promise((r) => setTimeout(r, 30));
    expect(spotifyPlaybackAdapter.getPositionSec()).toBe(p1);
    expect(spotifyPlaybackAdapter.isPlaying).toBe(false);
  });
});

describe("end-of-track (Kopuz heuristic: paused@0 after near-end)", () => {
  it("fires onEnded once when the track finishes", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const player = MockSdkPlayer.instances[0];
    let ended = 0;
    const off = spotifyPlaybackAdapter.onEnded(() => ended++);

    // Playing near the end, then paused@0 → ended
    player.emit("player_state_changed", stateAt(199_000, false));
    player.emit("player_state_changed", stateAt(0, true));
    expect(ended).toBe(1);

    // The same end event must not double-fire
    player.emit("player_state_changed", stateAt(0, true));
    expect(ended).toBe(1);
    off();
  });

  it("does NOT fire on a mid-track manual pause", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const player = MockSdkPlayer.instances[0];
    let ended = 0;
    const off = spotifyPlaybackAdapter.onEnded(() => ended++);
    player.emit("player_state_changed", stateAt(60_000, false));
    player.emit("player_state_changed", stateAt(60_500, true));
    expect(ended).toBe(0);
    off();
  });

  it("does NOT fire on track START (position 0, playing)", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const player = MockSdkPlayer.instances[0];
    let ended = 0;
    const off = spotifyPlaybackAdapter.onEnded(() => ended++);
    player.emit("player_state_changed", stateAt(0, false));
    expect(ended).toBe(0);
    off();
  });

  it("near-end playing state fires ended (some browsers never send paused@0)", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const player = MockSdkPlayer.instances[0];
    let ended = 0;
    const off = spotifyPlaybackAdapter.onEnded(() => ended++);
    // Feeding the state through the same path the 1 Hz poll uses.
    player.current = stateAt(199_500, false);
    player.emit("player_state_changed", player.current);
    expect(ended).toBe(1);
    off();
  });
});

describe("errors", () => {
  it("auth errors reach subscribers with kind + message", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const errors: any[] = [];
    const off = spotifyPlaybackAdapter.onError((e) => errors.push(e));
    const player = MockSdkPlayer.instances[0];
    player.emit("authentication_error", { message: "Token expired" });
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("auth");
    expect(errors[0].message).toContain("Token expired");
    off();
  });

  it("playback errors (mid-track DRM/license per Kopuz) reach subscribers", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const errors: any[] = [];
    const off = spotifyPlaybackAdapter.onError((e) => errors.push(e));
    MockSdkPlayer.instances[0].emit("playback_error", { message: "License failed" });
    expect(errors[0].kind).toBe("playback");
    off();
  });

  it("autoplay_failed retries through activateElement once", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    const player = MockSdkPlayer.instances[0];
    player.emit("autoplay_failed", {});
    await new Promise((r) => setTimeout(r, 0));
    expect(player.calls).toContain("activateElement");
  });
});

describe("lifecycle", () => {
  it("disconnect() tears the device down and isActive flips false", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    expect(spotifyPlaybackAdapter.isActive).toBe(true);
    spotifyPlaybackAdapter.disconnect();
    expect(spotifyPlaybackAdapter.isActive).toBe(false);
    expect(spotifyPlaybackAdapter.getDeviceId()).toBe(null);
  });

  it("resetSession clears the forced downgrade", async () => {
    await installSdkMock();
    await spotifyPlaybackAdapter.connect();
    MockSdkPlayer.instances[0].emit("account_error", { message: "x" });
    expect(await spotifyPlaybackAdapter.isOfficialAvailable()).toBe(false);
    spotifyPlaybackAdapter.resetSession();
    expect(await spotifyPlaybackAdapter.isOfficialAvailable()).toBe(true);
  });
});
