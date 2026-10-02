/**
 * Yandex Music shared types (server + client safe — no secrets here).
 *
 * These mirror the JSON contract of api/yandex_adapter.py (the Python
 * serverless function that wraps yandex-music 3.0.0). The adapter returns
 * EXACTLY these shapes — no extra fields, no tokens.
 */

/** Playlist card shown in the import selection list. */
export interface YandexPlaylistBrief {
  uid: number | null;
  kind: number;
  title: string;
  description: string;
  trackCount: number;
  visibility: string;
  ownerLogin: string;
  coverUrl: string;
  durationMs: number;
  modified: string;
  collective: boolean;
}

/** A track inside a Yandex playlist (metadata only — never audio). */
export interface YandexTrackMeta {
  position: number;
  trackId: string;
  albumId: string | null;
  title: string;
  artists: string[];
  albumTitle: string;
  albumIdFull: string | null;
  durationMs: number;
  available: boolean;
}

/** Full playlist payload fetched at import time (order = Yandex order). */
export interface YandexPlaylistTracks {
  kind: number;
  uid: number | null;
  title: string;
  description: string;
  coverUrl: string;
  ownerLogin: string;
  trackCount: number;
  tracks: YandexTrackMeta[];
}

/** MQ-side account view (login/display only — never tokens). */
export interface YandexAccountPublic {
  uid: number | null;
  login: string | null;
  displayName: string | null;
}

/** Device-flow screen data (user_code is safe to show; device_code stays server-side). */
export interface YandexDeviceStart {
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export type YandexDevicePoll =
  | { status: "pending" }
  | { status: "authorized"; expiresIn: number; tokenType: string };

/** Machine-readable error codes from the adapter / routes. */
export type YandexErrorCode =
  | "adapter_unreachable"
  | "adapter_bad_response"
  | "bad_request"
  | "unauthorized"
  | "yandex_unauthorized"
  | "yandex_timeout"
  | "yandex_rate_limited"
  | "yandex_unavailable"
  | "yandex_not_found"
  | "yandex_geo_blocked"
  | "yandex_proxy_error"
  | "yandex_bad_request"
  | "yandex_error"
  | "device_code_expired"
  | "device_code_cancelled"
  | "device_access_denied"
  | "device_auth_failed"
  | "no_yandex_account"
  | "job_not_found"
  | "internal_error";

/** Structured error thrown by adapter calls and route handlers. */
export class YandexError extends Error {
  code: YandexErrorCode;
  status: number;

  constructor(code: YandexErrorCode, message: string, status = 502) {
    super(message);
    this.name = "YandexError";
    this.code = code;
    this.status = status;
  }
}
