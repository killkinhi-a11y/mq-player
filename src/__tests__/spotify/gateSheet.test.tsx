/**
 * SpotifyGateSheet — component render test (jsdom, createRoot harness —
 * the project's established pattern, see fullplayer tests).
 *
 * Pins the honest §7/§8 UI: all four gate states render with the right
 * copy and the right actions. The sdk_error state MUST offer Retry +
 * Reconnect Spotify and must NOT offer any alternative-source playback.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { SpotifyGateSheet } from "@/components/mq/SpotifyGateSheet";
import { useAppStore } from "@/store/useAppStore";
import { spotifyPlaybackAdapter } from "@/lib/spotify/playbackAdapter";
import { spotifyAuth } from "@/lib/spotify/auth";

// React 19 act() contract (project pattern — see wave-ambient.test.tsx).
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const activeSpies: MockInstance[] = [];

let container: HTMLElement | null = null;
let root: Root | null = null;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // Async act: renders, runs effects AND drains their microtask chain
  // (useSpotifySession's loadConfig → sync → store update) inside act —
  // the exact pattern React docs mandate for effect-driven updates.
  await act(async () => {
    root!.render(React.createElement(SpotifyGateSheet));
  });
}

function openGate(reason: "not_connected" | "not_premium" | "unsupported_browser" | "sdk_error") {
  act(() => {
    useAppStore.getState().openSpotifyGate({
      reason,
      trackId: "sp_track_1",
      trackTitle: "Blinding Lights",
      trackArtist: "The Weeknd",
      spotifyUri: "spotify:track:0VjIjW4GlUZAMYd2vTMeNV",
      ...(reason === "sdk_error" ? { errorKind: "playback", errorMessage: "Spotify: DRM failure" } : {}),
    });
  });
}

const byText = (re: RegExp) =>
  Array.from(document.querySelectorAll("button, h2, p, span")).find((el) => re.test(el.textContent || "")) || null;
const buttonByText = (re: RegExp) =>
  Array.from(document.querySelectorAll("button")).find((el) => re.test(el.textContent || "")) || null;

beforeEach(() => {
  useAppStore.setState({ spotifyGate: null });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  useAppStore.setState({ spotifyGate: null });
  for (const s of activeSpies.splice(0)) s.mockRestore();
});

describe("SpotifyGateSheet render (honest states)", () => {
  it("renders nothing without a gate", async () => {
    await mount();
    expect(document.querySelector("[data-mq-spotify-gate]")).toBeNull();
  });

  it("not_connected: «Подключите Spotify» + PKCE connect button + no-substitution note", async () => {
    openGate("not_connected");
    await mount();
    expect(document.querySelector("[data-mq-spotify-gate='not_connected']")).toBeTruthy();
    expect(byText(/Подключите Spotify/)).toBeTruthy();
    expect(buttonByText(/Подключить Spotify/)).toBeTruthy();
    // §8 honesty note
    expect(byText(/не будет заменён другим источником/i)).toBeTruthy();
    // Track identity is visible
    expect(byText(/Blinding Lights/)).toBeTruthy();
  });

  it("not_premium: Premium requirement + no playback offered", async () => {
    openGate("not_premium");
    await mount();
    expect(document.querySelector("[data-mq-spotify-gate='not_premium']")).toBeTruthy();
    expect(byText(/Требуется Spotify Premium/)).toBeTruthy();
    expect(buttonByText(/Понятно/)).toBeTruthy();
    // No connect button, no retry — nothing that could start other playback
    expect(buttonByText(/Подключить Spotify/)).toBeNull();
    expect(buttonByText(/Повторить/)).toBeNull();
  });

  it("unsupported_browser: names desktop Chromium/Firefox/Edge", async () => {
    openGate("unsupported_browser");
    await mount();
    expect(document.querySelector("[data-mq-spotify-gate='unsupported_browser']")).toBeTruthy();
    expect(byText(/Браузер не поддерживается/)).toBeTruthy();
    expect(byText(/Chrome/i)).toBeTruthy();
    expect(byText(/Firefox/i)).toBeTruthy();
  });

  it("sdk_error: Retry + Reconnect Spotify — no alternative source offered", async () => {
    openGate("sdk_error");
    await mount();
    expect(document.querySelector("[data-mq-spotify-gate='sdk_error']")).toBeTruthy();
    expect(byText(/Воспроизведение через Spotify недоступно/)).toBeTruthy();
    expect(byText(/DRM failure/)).toBeTruthy();
    expect(buttonByText(/Повторить/)).toBeTruthy();
    expect(buttonByText(/Переподключить Spotify/)).toBeTruthy();
    // §8: nothing in the sheet offers another provider's audio
    expect(byText(/SoundCloud/i)).toBeNull();
    expect(byText(/Audius/i)).toBeNull();
  });

  it("Retry bumps the store nonce and closes the sheet", async () => {
    const resetSpy = vi.spyOn(spotifyPlaybackAdapter, "resetSession");
    activeSpies.push(resetSpy);
    openGate("sdk_error");
    await mount();
    const before = useAppStore.getState().spotifyRetryNonce;
    act(() => {
      (buttonByText(/Повторить/) as HTMLButtonElement).click();
    });
    const s = useAppStore.getState();
    expect(s.spotifyGate).toBeNull();
    expect(s.spotifyRetryNonce).toBe(before + 1);
    // Retry boots a FRESH SDK session (clears the downgraded flag) before re-attempt
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it("Reconnect resets the SDK session, logs out and starts a fresh PKCE login", async () => {
    const resetSpy = vi.spyOn(spotifyPlaybackAdapter, "resetSession");
    activeSpies.push(resetSpy);
    const logoutSpy = vi.spyOn(spotifyAuth, "logout");
    activeSpies.push(logoutSpy);
    // beginLogin would navigate to accounts.spotify.com — intercept the redirect
    const loginSpy = vi.spyOn(spotifyAuth, "beginLogin").mockResolvedValue(undefined);
    activeSpies.push(loginSpy);
    openGate("sdk_error");
    await mount();
    act(() => {
      (buttonByText(/Переподключить Spotify/) as HTMLButtonElement).click();
    });
    expect(useAppStore.getState().spotifyGate).toBeNull();
    expect(resetSpy).toHaveBeenCalledTimes(1);
    // logout(false): silent local wipe — no subscriber broadcast
    expect(logoutSpy).toHaveBeenCalledWith(false);
    // connect() went through the REAL useSpotifySession hook → beginLogin
    expect(loginSpy).toHaveBeenCalledTimes(1);
  });

  it("not_connected connect button dismisses the gate and launches the PKCE flow", async () => {
    const loginSpy = vi.spyOn(spotifyAuth, "beginLogin").mockResolvedValue(undefined);
    activeSpies.push(loginSpy);
    openGate("not_connected");
    await mount();
    act(() => {
      (buttonByText(/Подключить Spotify/) as HTMLButtonElement).click();
    });
    expect(useAppStore.getState().spotifyGate).toBeNull();
    expect(loginSpy).toHaveBeenCalledTimes(1);
  });

  it("not_premium «Понятно» dismisses without any playback action", async () => {
    openGate("not_premium");
    await mount();
    act(() => {
      (buttonByText(/Понятно/) as HTMLButtonElement).click();
    });
    expect(useAppStore.getState().spotifyGate).toBeNull();
  });

  it("backdrop click closes the gate sheet", async () => {
    openGate("not_connected");
    await mount();
    const backdrop = document.querySelector("[data-mq-spotify-gate]") as HTMLElement;
    act(() => {
      backdrop.click();
    });
    expect(useAppStore.getState().spotifyGate).toBeNull();
  });

  it("Escape closes the gate sheet", async () => {
    openGate("not_premium");
    await mount();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(useAppStore.getState().spotifyGate).toBeNull();
  });

  it("openSpotifyGate stops playback honestly (isPlaying false)", () => {
    useAppStore.setState({ isPlaying: true, playbackState: "playing" });
    openGate("sdk_error");
    const s = useAppStore.getState();
    expect(s.isPlaying).toBe(false);
    expect(s.playbackState).toBe("error");
  });
});
