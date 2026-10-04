/**
 * Download domain types — the provider abstraction (spec §8).
 *
 * Honesty contract (spec §7):
 *  - FLAC is offered ONLY when the original source actually provides
 *    lossless audio (e.g. a user's local .flac upload). SoundCloud/Audius
 *    serve lossy only → FLAC shows as unavailable, NEVER re-encoded.
 *  - MP3 downloads stream the ORIGINAL file bytes — no re-encode, no
 *    transcoding, no fake containers.
 *  - DRM/paywall/technical restrictions are surfaced as normalized errors,
 *    never bypassed.
 */

import type { Track } from "@/lib/musicApi";

export type DownloadError =
  | "not_available"
  | "source_restricted"
  | "network_error"
  | "unsupported_format";

/** Human-readable RU message for a normalized download error. */
export function downloadErrorMessage(error: DownloadError | undefined): string {
  switch (error) {
    case "not_available":
      return "Скачивание недоступно для этого трека";
    case "source_restricted":
      return "Источник ограничивает скачивание этого трека";
    case "network_error":
      return "Ошибка сети при скачивании";
    case "unsupported_format":
      return "Источник не отдаёт файл в этом формате";
    default:
      return "Скачивание недоступно";
  }
}

export type DownloadFormatKind = "mp3" | "flac";

/** One offerable format (available or not — unavailable ones are SHOWN with
 *  an honest reason, per spec "либо явно писать FLAC unavailable"). */
export interface DownloadFormat {
  format: DownloadFormatKind;
  available: boolean;
  /** Short UI label, e.g. "MP3 · 128 kbps". */
  label: string;
  /** Honest bitrate (kbps) — only when actually known/parsed. */
  bitrateKbps?: number;
  /** Honest sample rate (Hz) — only when actually known/parsed. */
  sampleRateHz?: number;
  /** Honest file size in bytes — only when probed. */
  sizeBytes?: number;
  /** Why unavailable (normalized) — set when available=false. */
  reason?: DownloadError;
  /** Extra honest note, e.g. "оригинальный файл", "фрагмент". */
  note?: string;
}

export interface DownloadResult {
  ok: boolean;
  /** Object URL of the downloaded blob (caller MUST revoke it after use). */
  objectUrl?: string;
  /** Suggested file name. */
  filename?: string;
  error?: DownloadError;
}

/** The provider abstraction (spec §8). Implementations never throw. */
export interface TrackDownloadProvider {
  id: string;
  canDownload(track: Track): Promise<boolean>;
  getFormats(track: Track): Promise<DownloadFormat[]>;
  download(track: Track, format: DownloadFormatKind): Promise<DownloadResult>;
}
