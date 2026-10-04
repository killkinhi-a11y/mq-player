"use client";

/**
 * Download service — the façade the UI talks to. Normalized errors only,
 * never raw exceptions (spec §12). Also owns the "trigger a browser save"
 * step (anchor click + objectURL revoke) so every menu site behaves the same.
 */

import type { Track } from "@/lib/musicApi";
import type {
  DownloadFormat,
  DownloadFormatKind,
  DownloadResult,
} from "./types";
import { getDownloadProvider } from "./providers";

export type { DownloadFormat, DownloadFormatKind, DownloadResult } from "./types";
export { downloadErrorMessage } from "./types";
export { getDownloadProvider } from "./providers";

/** List formats for a track (both MP3 and FLAC, available or honestly not). */
export async function getDownloadFormats(track: Track): Promise<DownloadFormat[]> {
  const provider = getDownloadProvider(track);
  if (!provider) {
    return [
      { format: "mp3", available: false, label: "MP3", reason: "not_available", note: "Источник не поддерживает скачивание" },
      { format: "flac", available: false, label: "FLAC", reason: "not_available", note: "Источник не поддерживает скачивание" },
    ];
  }
  try {
    return await provider.getFormats(track);
  } catch {
    return [
      { format: "mp3", available: false, label: "MP3", reason: "network_error" },
      { format: "flac", available: false, label: "FLAC", reason: "network_error" },
    ];
  }
}

/** Download one track in the requested format. Never throws. */
export async function downloadTrack(
  track: Track,
  format: DownloadFormatKind,
): Promise<DownloadResult> {
  const provider = getDownloadProvider(track);
  if (!provider) return { ok: false, error: "not_available" };
  try {
    return await provider.download(track, format);
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** Push a successful result to the browser's save flow. */
export function saveDownloadResult(result: DownloadResult): void {
  if (!result.ok || !result.objectUrl || !result.filename) return;
  const a = document.createElement("a");
  a.href = result.objectUrl;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download, then free the blob.
  setTimeout(() => URL.revokeObjectURL(result.objectUrl as string), 30000);
}

/** Format bytes for menu hints. */
export function formatBytes(bytes: number | undefined): string | undefined {
  if (!bytes || bytes <= 0) return undefined;
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}
