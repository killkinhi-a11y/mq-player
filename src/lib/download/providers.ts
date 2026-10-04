"use client";

/**
 * Download providers — one per track source, all implementing
 * `TrackDownloadProvider` (spec §8). None of them re-encode, transcode, or
 * bypass restrictions; they relay ORIGINAL bytes and report honest formats.
 */

import type { Track } from "@/lib/musicApi";
import { resolveSoundCloudStream } from "@/lib/streamResolver";
import { shouldProxyUrl } from "@/lib/streamResolver";
import { getAudiusStream } from "@/lib/audius";
import { getLocalBlobUrl } from "@/components/mq/SearchView";
import type {
  DownloadFormat,
  DownloadResult,
  TrackDownloadProvider,
} from "./types";
import { probeAudioUrl } from "./audioHeaders";

/** FLAC is offered only by sources that actually serve lossless. */
function flacUnavailable(note?: string): DownloadFormat {
  return {
    format: "flac",
    available: false,
    label: "FLAC",
    reason: "unsupported_format",
    note: note || "Источник не предоставляет FLAC",
  };
}

async function fetchToResult(
  url: string,
  filename: string,
): Promise<DownloadResult> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) {
      return { ok: false, error: res.status === 403 || res.status === 401 ? "source_restricted" : "network_error" };
    }
    const blob = await res.blob();
    if (!blob.size) return { ok: false, error: "not_available" };
    return { ok: true, objectUrl: URL.createObjectURL(blob), filename };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "track"
  );
}

export function trackFilename(track: Track, ext: string): string {
  return `${sanitizeFilename(`${track.artist} - ${track.title}`)}.${ext}`;
}

// ─── SoundCloud ──────────────────────────────────────────────────────────────

interface ScResolved {
  url: string;
  duration: number;
  blocked?: "drm" | "hls" | "snippet" | "no-url";
}

async function resolveSc(track: Track): Promise<ScResolved> {
  if (!track.scTrackId || track.scTrackId <= 0) return { url: "", duration: track.duration, blocked: "no-url" };
  const stream = await resolveSoundCloudStream(track.scTrackId);
  if (!stream?.url) return { url: "", duration: stream?.duration || track.duration, blocked: "no-url" };
  if (stream.isEncrypted) return { url: "", duration: stream.duration, blocked: "drm" };
  if (stream.isHls) return { url: "", duration: stream.duration, blocked: "hls" };
  if (stream.isPreview) return { url: "", duration: stream.duration, blocked: "snippet" };
  return { url: shouldProxyUrl(stream.url), duration: stream.duration || track.duration };
}

export const soundcloudDownloadProvider: TrackDownloadProvider = {
  id: "soundcloud",
  async canDownload(track) {
    const r = await resolveSc(track);
    return !r.blocked;
  },
  async getFormats(track) {
    const r = await resolveSc(track);
    if (r.blocked) {
      const reason = r.blocked === "drm" ? "source_restricted" : r.blocked === "hls" ? "unsupported_format" : "not_available";
      const note =
        r.blocked === "drm"
          ? "Трек защищён (DRM)"
          : r.blocked === "hls"
            ? "Источник отдаёт поток HLS, а не файл"
            : r.blocked === "snippet"
              ? "Доступен только фрагмент"
              : undefined;
      return [
        { format: "mp3" as const, available: false, label: "MP3", reason, note },
        flacUnavailable(),
      ];
    }
    // Probe the REAL file: honest bitrate/sample rate/size.
    const probe = await probeAudioUrl(r.url);
    const bitrate = probe?.header?.bitrateKbps;
    const sr = probe?.header?.sampleRateHz;
    const size = probe?.sizeBytes;
    const labelBits: string[] = ["MP3"];
    if (bitrate) labelBits.push(`${bitrate} kbps`);
    if (!bitrate && size && r.duration > 0) {
      labelBits.push(`≈ ${Math.round((size * 8) / r.duration / 1000)} kbps`);
    }
    return [
      {
        format: "mp3",
        available: true,
        label: labelBits.join(" · "),
        bitrateKbps: bitrate,
        sampleRateHz: sr,
        sizeBytes: size,
        note: "оригинальный файл",
      },
      flacUnavailable("SoundCloud не предоставляет lossless"),
    ];
  },
  async download(track, format) {
    if (format !== "mp3") return { ok: false, error: "unsupported_format" };
    const r = await resolveSc(track);
    if (r.blocked) {
      return { ok: false, error: r.blocked === "drm" ? "source_restricted" : r.blocked === "hls" ? "unsupported_format" : "not_available" };
    }
    return fetchToResult(r.url, trackFilename(track, "mp3"));
  },
};

// ─── Local files (user's own uploads — the ONLY lossless-capable source) ────

export const localDownloadProvider: TrackDownloadProvider = {
  id: "local",
  async canDownload(track) {
    return !!getLocalBlobUrl(track.id);
  },
  async getFormats(track) {
    const url = getLocalBlobUrl(track.id);
    if (!url) {
      return [
        { format: "mp3" as const, available: false, label: "MP3", reason: "not_available", note: "Файл доступен только в этой сессии" },
        { format: "flac" as const, available: false, label: "FLAC", reason: "not_available", note: "Файл доступен только в этой сессии" },
      ];
    }
    // Sniff the ACTUAL bytes — the format is whatever the user uploaded.
    const probe = await probeAudioUrl(url);
    const kind = probe?.header?.kind;
    if (kind === "flac") {
      return [
        {
          format: "flac",
          available: true,
          label: probe?.header?.sampleRateHz ? `FLAC · ${probe.header.sampleRateHz} Hz` : "FLAC",
          sampleRateHz: probe?.header?.sampleRateHz,
          sizeBytes: probe?.sizeBytes ?? (await blobSize(url)),
          note: "ваш оригинальный lossless-файл",
        },
        { format: "mp3" as const, available: false, label: "MP3", reason: "unsupported_format", note: "Оригинал — FLAC, конвертация не выполняется" },
      ];
    }
    const bitrate = probe?.header?.bitrateKbps;
    return [
      {
        format: "mp3",
        available: true,
        label: bitrate ? `MP3 · ${bitrate} kbps` : "MP3",
        bitrateKbps: bitrate,
        sampleRateHz: probe?.header?.sampleRateHz,
        sizeBytes: probe?.sizeBytes ?? (await blobSize(url)),
        note: "ваш оригинальный файл",
      },
      flacUnavailable("Оригинальный файл — не lossless"),
    ];
  },
  async download(track, format) {
    const url = getLocalBlobUrl(track.id);
    if (!url) return { ok: false, error: "not_available" };
    const probe = await probeAudioUrl(url);
    const kind = probe?.header?.kind;
    if (kind === "flac" && format !== "flac") return { ok: false, error: "unsupported_format" };
    if (kind === "mp3" && format !== "mp3") return { ok: false, error: "unsupported_format" };
    if (!kind) {
      // Unknown sniff (rare) — allow the requested ext only for mp3 default.
      if (format === "flac") return { ok: false, error: "unsupported_format" };
    }
    return fetchToResult(url, trackFilename(track, format === "flac" ? "flac" : "mp3"));
  },
};

async function blobSize(url: string): Promise<number | undefined> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) });
    const cl = res.headers.get("content-length");
    return cl ? parseInt(cl, 10) : undefined;
  } catch {
    return undefined;
  }
}

// ─── Demo (same-origin static files) ────────────────────────────────────────

export const demoDownloadProvider: TrackDownloadProvider = {
  id: "demo",
  async canDownload(track) {
    return !!track.audioUrl && track.audioUrl.startsWith("/");
  },
  async getFormats(track) {
    if (!track.audioUrl?.startsWith("/")) {
      return [
        { format: "mp3" as const, available: false, label: "MP3", reason: "not_available" },
        flacUnavailable(),
      ];
    }
    const probe = await probeAudioUrl(track.audioUrl);
    const bitrate = probe?.header?.bitrateKbps;
    return [
      {
        format: "mp3",
        available: true,
        label: bitrate ? `MP3 · ${bitrate} kbps` : "MP3",
        bitrateKbps: bitrate,
        sampleRateHz: probe?.header?.sampleRateHz,
        sizeBytes: probe?.sizeBytes,
        note: "демо-файл",
      },
      flacUnavailable(),
    ];
  },
  async download(track, format) {
    if (format !== "mp3" || !track.audioUrl?.startsWith("/")) {
      return { ok: false, error: "unsupported_format" };
    }
    return fetchToResult(track.audioUrl, trackFilename(track, "mp3"));
  },
};

// ─── Audius (direct mp3 streams) ────────────────────────────────────────────

export const audiusDownloadProvider: TrackDownloadProvider = {
  id: "audius",
  async canDownload(track) {
    return !!(await getAudiusStream(track.id));
  },
  async getFormats(track) {
    const url = await getAudiusStream(track.id);
    if (!url) {
      return [
        { format: "mp3" as const, available: false, label: "MP3", reason: "not_available" },
        flacUnavailable(),
      ];
    }
    const probe = await probeAudioUrl(url);
    const bitrate = probe?.header?.bitrateKbps;
    const size = probe?.sizeBytes;
    const dur = track.duration || 0;
    const est = !bitrate && size && dur > 0 ? Math.round((size * 8) / dur / 1000) : undefined;
    return [
      {
        format: "mp3",
        available: true,
        label: bitrate ? `MP3 · ${bitrate} kbps` : est ? `MP3 · ≈${est} kbps` : "MP3",
        bitrateKbps: bitrate,
        sampleRateHz: probe?.header?.sampleRateHz,
        sizeBytes: size,
        note: "оригинальный поток",
      },
      flacUnavailable("Audius не предоставляет lossless"),
    ];
  },
  async download(track, format) {
    if (format !== "mp3") return { ok: false, error: "unsupported_format" };
    const url = await getAudiusStream(track.id);
    if (!url) return { ok: false, error: "not_available" };
    return fetchToResult(url, trackFilename(track, "mp3"));
  },
};

// ─── Selection ───────────────────────────────────────────────────────────────

/** Pick the provider for a track by its source. */
export function getDownloadProvider(track: Track): TrackDownloadProvider | null {
  switch (track.source) {
    case "soundcloud":
      return soundcloudDownloadProvider;
    case "local":
      return localDownloadProvider;
    case "demo":
      return demoDownloadProvider;
    case "audius":
      return audiusDownloadProvider;
    default:
      return null;
  }
}
