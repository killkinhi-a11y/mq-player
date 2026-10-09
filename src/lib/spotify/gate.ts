/**
 * Spotify Official Playback gate (PHASE 2/§7/§8 of the official-playback spec).
 *
 * THE CONTRACT (user-mandated, 2026-10-09):
 *   When the user presses Play on a SPOTIFY track (a track whose identity is
 *   a real Spotify track — catalogProvider "spotify" with a spotifyUri),
 *   playback may ONLY go through the official Web Playback SDK.
 *
 *   There is NO automatic substitution. A Spotify track is never handed to
 *   the SoundCloud/Audius resolver, never matched to a similarly-named
 *   upload, never previewed. Every unavailability is surfaced to the user
 *   as an honest, specific gate state with a concrete action:
 *
 *     not_connected       → «Connect Spotify to play full tracks»
 *     not_premium         → «Spotify Premium is required for full playback»
 *     unsupported_browser → Web Playback SDK needs desktop Chromium/FF/Edge
 *     sdk_error           → «Spotify playback unavailable» + Retry/Reconnect
 *
 * Deezer catalog tracks (anonymous fallback catalog, NO spotifyUri, never
 * claiming to be Spotify content) are NOT Spotify tracks — they keep their
 * own resolver path with honest «Deezer → SoundCloud» attribution. That is
 * a different catalog, not a substitution of Spotify content.
 */

export type SpotifyGateReason =
  | "not_connected"
  | "not_premium"
  | "unsupported_browser"
  | "sdk_error";

export interface SpotifyGateInputs {
  /** Track carries a real Spotify identity (URI of the exact chosen track). */
  isSpotifyTrack: boolean;
  /** PKCE session exists (refresh token). */
  connected: boolean;
  /** /me product === "premium". */
  premium: boolean;
  /** Desktop Chromium/Firefox/Edge with EME (SDK requirement). */
  playbackSupported: boolean;
}

export type SpotifyPlaybackDecision =
  | { action: "play-official" }
  | { action: "gate"; reason: Exclude<SpotifyGateReason, "sdk_error"> };

/**
 * Pure decision — no network, no side effects, fully unit-tested.
 * Order matters: a connected Free user on an unsupported browser is told
 * about the PREMIUM gap first (it is the deeper blocker — even a supported
 * browser would not stream for Free accounts).
 */
export function decideSpotifyPlayback(inputs: SpotifyGateInputs): SpotifyPlaybackDecision {
  const { isSpotifyTrack, connected, premium, playbackSupported } = inputs;
  if (!isSpotifyTrack) return { action: "play-official" }; // not a Spotify track — caller never gates
  if (!connected) return { action: "gate", reason: "not_connected" };
  if (!premium) return { action: "gate", reason: "not_premium" };
  if (!playbackSupported) return { action: "gate", reason: "unsupported_browser" };
  return { action: "play-official" };
}

/** True when a track must be treated as Spotify-official-only content. */
export function isSpotifyOfficialTrack(track: {
  catalogProvider?: string;
  spotifyUri?: string;
}): boolean {
  return track.catalogProvider !== "deezer" && !!track.spotifyUri;
}

/* ── Human-readable gate copy (single source of truth for UI + toasts) ─── */

export interface SpotifyGateCopy {
  title: string;
  message: string;
  /** Primary action label; null → informational only. */
  primaryAction: "connect" | "retry" | "reconnect" | null;
}

export function spotifyGateCopy(reason: SpotifyGateReason, errorMessage?: string | null): SpotifyGateCopy {
  switch (reason) {
    case "not_connected":
      return {
        title: "Подключите Spotify",
        message:
          "Чтобы слушать полные треки Spotify, подключите свой аккаунт. Трек будет играть через официальный Spotify Web Playback SDK — без превью и подмен.",
        primaryAction: "connect",
      };
    case "not_premium":
      return {
        title: "Требуется Spotify Premium",
        message:
          "Полное официальное воспроизведение Spotify доступно только с подпиской Premium (ограничение Spotify Developer Policy). Каталог и библиотека работают на любом аккаунте.",
        primaryAction: null,
      };
    case "unsupported_browser":
      return {
        title: "Браузер не поддерживается",
        message:
          "Spotify Web Playback SDK работает в десктопных Chrome, Edge и Firefox с DRM-модулем. Откройте MQ в одном из этих браузеров — трек продолжится с того же места.",
        primaryAction: null,
      };
    case "sdk_error":
      return {
        title: "Воспроизведение через Spotify недоступно",
        message:
          errorMessage ||
          "Spotify Web Playback SDK сообщил об ошибке. Проверьте подключение и статус аккаунта — трек не будет заменён другим источником.",
        primaryAction: "retry",
      };
  }
}
