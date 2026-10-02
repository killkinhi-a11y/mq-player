/**
 * YandexMusicAdapter — the SINGLE place in MQ Player that talks to the Python
 * serverless function (api/yandex_adapter.py → yandex-music 3.0.0).
 *
 *   MQ Next.js routes ──(HMAC-signed HTTPS)──▶ /api/yandex_adapter (Python)
 *                                                └─▶ yandex-music ──▶ Яндекс.Музыка
 *
 * Every Yandex call anywhere in MQ goes through callAdapter() here. If the
 * yandex-music library API changes, only this file + the Python adapter
 * change — the rest of MQ is untouched (Phase 12 requirement).
 *
 * Transport security:
 *   - Requests are signed: X-MQ-Timestamp + X-MQ-Signature =
 *     HMAC_SHA256(derived_secret, "{ts}.{body}") where derived_secret =
 *     HMAC_SHA256(JWT_SECRET, "mq-yandex-adapter-v1") — identical to the
 *     Python side (api/yandex_adapter.py::verify_signature).
 *   - The Yandex token travels only inside this server-to-server request.
 *   - No adapter URL or secret is ever exposed to the client bundle.
 */

import crypto from "crypto";
import type { NextRequest } from "next/server";
import {
  YandexError,
  type YandexAccountPublic,
  type YandexDeviceStart,
  type YandexPlaylistBrief,
  type YandexPlaylistTracks,
} from "./types";
const ADAPTER_TIMEOUT_MS = 55_000;

/** Derived signing key — mirrors adapter_derived_secret() in the Python adapter. */
function adapterDerivedSecret(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new YandexError("internal_error", "Секрет подписи не сконфигурирован на сервере.", 500);
  }
  return crypto.createHmac("sha256", secret).update("mq-yandex-adapter-v1").digest();
}

function sign(timestamp: string, body: string): string {
  return crypto
    .createHmac("sha256", adapterDerivedSecret())
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

/** Resolve the adapter base URL for the current deployment. */
export function adapterBaseUrl(req?: NextRequest): string {
  const override = process.env.YANDEX_ADAPTER_URL;
  if (override) return override.replace(/\/$/, "");
  const origin =
    req?.nextUrl?.origin ||
    (typeof process.env.VERCEL_URL === "string" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "");
  if (!origin) {
    throw new YandexError("internal_error", "Не удалось определить адрес адаптера.", 500);
  }
  return origin.replace(/\/$/, "");
}

interface RawAdapterResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/** POST one signed action to the Python adapter. */
async function postAction<T>(
  baseUrl: string,
  action: string,
  payload: Record<string, unknown>,
  path: "/api/yandex_adapter" | "/api/yandex_adapter.py"
): Promise<T> {
  const body = JSON.stringify({ action, ...payload });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(timestamp, body);

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MQ-Timestamp": timestamp,
      "X-MQ-Signature": signature,
    },
    body,
    signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
    cache: "no-store",
  });

  const text = await res.text();
  let json: RawAdapterResponse<T> | null = null;
  try {
    json = JSON.parse(text) as RawAdapterResponse<T>;
  } catch {
    json = null;
  }

  if (!json) {
    throw new YandexError(
      "adapter_bad_response",
      "Адаптер Яндекс.Музыки вернул нечитаемый ответ. Попробуйте позже.",
      502
    );
  }
  if (!json.ok || json.error) {
    const code = (json.error?.code || "yandex_error") as YandexError["code"];
    const message = json.error?.message || "Ошибка обращения к Яндекс.Музыке.";
    const statusByCode: Partial<Record<YandexError["code"], number>> = {
      yandex_unauthorized: 401,
      yandex_timeout: 504,
      yandex_rate_limited: 429,
      yandex_unavailable: 503,
      yandex_not_found: 404,
      yandex_geo_blocked: 503,
      yandex_proxy_error: 503,
      device_code_expired: 400,
      device_code_cancelled: 400,
      device_access_denied: 403,
      device_auth_failed: 400,
      bad_request: 400,
    };
    throw new YandexError(code, message, statusByCode[code] ?? 502);
  }
  return json.data as T;
}

/**
 * Call an adapter action with automatic path fallback:
 * production serves /api/yandex_adapter; if that route 404s (routing change),
 * retry once with the explicit .py path before failing.
 */
async function callAdapter<T>(
  req: NextRequest | undefined,
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const baseUrl = adapterBaseUrl(req);
  try {
    return await postAction<T>(baseUrl, action, payload, "/api/yandex_adapter");
  } catch (err) {
    const isRouteMiss =
      err instanceof YandexError
        ? err.code === "adapter_unreachable" || err.code === "adapter_bad_response"
        : false;
    if (isRouteMiss && !process.env.YANDEX_ADAPTER_URL) {
      // Retry the alternate registered path before giving up.
      try {
        return await postAction<T>(baseUrl, action, payload, "/api/yandex_adapter.py");
      } catch {
        /* fall through to original error */
      }
    }
    // Fetch-level failures (network / timeout) → adapter_unreachable
    if (!(err instanceof YandexError)) {
      throw new YandexError(
        "adapter_unreachable",
        "Адаптер Яндекс.Музыки недоступен. Попробуйте позже.",
        503
      );
    }
    throw err;
  }
}

// ── Typed action helpers (the ONLY Yandex entry points used by routes) ──────

export async function adapterProbe(req?: NextRequest): Promise<{ service: string; python: string; yandexMusic: string }> {
  const data = await callAdapter<{ service: string; python: string; yandex_music: string }>(req, "probe");
  return { service: data.service, python: data.python, yandexMusic: data.yandex_music };
}

/** Start the OAuth Device Flow. The device_code stays server-side (caller encrypts it). */
export async function adapterDeviceStart(
  deviceName: string,
  req?: NextRequest
): Promise<YandexDeviceStart & { deviceCode: string }> {
  const data = await callAdapter<{
    user_code: string;
    verification_url: string;
    device_code: string;
    expires_in: number;
    interval: number;
  }>(req, "device_start", { device_name: deviceName });
  return {
    userCode: data.user_code,
    verificationUrl: data.verification_url,
    deviceCode: data.device_code,
    expiresIn: data.expires_in,
    interval: data.interval,
  };
}

/** Poll the device code once. Returns the token pair — caller encrypts immediately. */
export async function adapterDevicePoll(
  deviceCode: string,
  req?: NextRequest
): Promise<{ status: "pending" } | { status: "authorized"; accessToken: string; refreshToken: string; expiresIn: number; tokenType: string }> {
  const data = await callAdapter<{
    status: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  }>(req, "device_poll", { device_code: deviceCode });
  if (data.status !== "authorized") {
    return { status: "pending" };
  }
  if (!data.access_token) {
    throw new YandexError("adapter_bad_response", "Адаптер вернул пустой токен. Попробуйте ещё раз.", 502);
  }
  return {
    status: "authorized",
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresIn: data.expires_in || 0,
    tokenType: data.token_type || "bearer",
  };
}

/** Fetch the authorized account info. */
export async function adapterAccount(token: string, req?: NextRequest): Promise<YandexAccountPublic> {
  const data = await callAdapter<{ uid: number | null; login: string | null; display_name: string | null; full_name: string | null }>(
    req,
    "account",
    { token }
  );
  return { uid: data.uid, login: data.login, displayName: data.display_name || data.full_name };
}

/** List the authorized user's playlists. */
export async function adapterPlaylistsList(token: string, req?: NextRequest): Promise<YandexPlaylistBrief[]> {
  const data = await callAdapter<{ playlists: Array<Record<string, unknown>> }>(req, "playlists_list", { token });
  return (data.playlists || []).map((p) => ({
    uid: (p.uid as number | null) ?? null,
    kind: Number(p.kind ?? 0),
    title: String(p.title ?? ""),
    description: String(p.description ?? ""),
    trackCount: Number(p.track_count ?? 0),
    visibility: String(p.visibility ?? ""),
    ownerLogin: String(p.owner_login ?? ""),
    coverUrl: String(p.cover_url ?? ""),
    durationMs: Number(p.duration_ms ?? 0),
    modified: String(p.modified ?? ""),
    collective: Boolean(p.collective),
  }));
}

/** Fetch one playlist with full track metadata (order preserved). */
export async function adapterPlaylistTracks(
  token: string,
  kind: number,
  req?: NextRequest
): Promise<YandexPlaylistTracks> {
  const data = await callAdapter<{
    kind: number;
    uid: number | null;
    title: string;
    description: string;
    cover_url: string;
    owner_login: string;
    track_count: number;
    tracks: Array<Record<string, unknown>>;
  }>(req, "playlist_tracks", { token, kind });
  return normalizePlaylistTracks(data);
}

/**
 * Fetch a PUBLIC playlist by owner login/uid + kind — NO token, NO OAuth,
 * NO user cookies. This is the tokenless users_playlists(kind, user_id=...)
 * path for URL-based imports.
 */
export async function adapterPublicPlaylistTracks(
  ownerLoginOrId: string,
  kind: number,
  req?: NextRequest
): Promise<YandexPlaylistTracks> {
  const data = await callAdapter<{
    kind: number;
    uid: number | null;
    title: string;
    description: string;
    cover_url: string;
    owner_login: string;
    track_count: number;
    tracks: Array<Record<string, unknown>>;
  }>(req, "public_playlist", { user_id: ownerLoginOrId, kind });
  return normalizePlaylistTracks(data);
}

/** Shared snake_case → camelCase normalization for playlist payloads. */
function normalizePlaylistTracks(data: {
  kind: number;
  uid: number | null;
  title: string;
  description: string;
  cover_url: string;
  owner_login: string;
  track_count: number;
  tracks: Array<Record<string, unknown>>;
}): YandexPlaylistTracks {
  return {
    kind: data.kind,
    uid: data.uid ?? null,
    title: data.title ?? "",
    description: data.description ?? "",
    coverUrl: data.cover_url ?? "",
    ownerLogin: data.owner_login ?? "",
    trackCount: data.track_count ?? 0,
    tracks: (data.tracks || []).map((t) => ({
      position: Number(t.position ?? 0),
      trackId: String(t.track_id ?? ""),
      albumId: (t.album_id as string | null) ?? null,
      title: String(t.title ?? ""),
      artists: Array.isArray(t.artists) ? t.artists.map(String) : [],
      albumTitle: String(t.album_title ?? ""),
      albumIdFull: (t.album_id_full as string | null) ?? null,
      durationMs: Number(t.duration_ms ?? 0),
      available: t.available !== false,
    })),
  };
}
