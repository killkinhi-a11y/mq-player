"use client";

/**
 * Waveform generator — orchestrates: source resolution → (cache | fetch+decode
 * → peaks) → cache → result. Never blocks playback, never throws.
 *
 * Source resolution per track kind (honest about what is decodable):
 *  - local   → page-session blob URL (fetch+decode OK; "expired" after reload)
 *  - demo    → same-origin static file
 *  - soundcloud → resolved stream; ONLY unencrypted progressive MP3 is
 *              decodable. DRM-HLS / plain-HLS / snippet → blocked (live
 *              sampling path takes over for those, see liveSampler.ts).
 *  - audius  → direct mp3 stream URL
 *
 * Resolutions are memoized per track for the page session — the play path
 * already resolved the same stream, and the edge route caches resolution,
 * so the extra cost is one cheap cache-hit request per track.
 */

import { getAudioContext } from "@/lib/audioEngine";
import { resolveSoundCloudStream } from "@/lib/streamResolver";
import { shouldProxyUrl } from "@/lib/streamResolver";
import { getAudiusStream } from "@/lib/audius";
import { getLocalBlobUrl } from "@/components/mq/SearchView";
import type { Track } from "@/lib/musicApi";
import {
  bucketCountFor,
  computePeaks,
  waveformFingerprint,
  waveformKey,
} from "./computePeaks";
import {
  getWaveformFromCache,
  putWaveformToCache,
} from "./waveformCache";
import { WAVEFORM_VERSION, type WaveformData, type WaveformDecodeBlock } from "./types";

export type ResolvedWaveformSource =
  | { kind: "ok"; url: string; durationSec: number; protocol?: string; quality?: string }
  | { kind: "blocked"; reason: WaveformDecodeBlock; durationSec: number; protocol?: string; quality?: string };

const resolutionMemo = new Map<string, ResolvedWaveformSource>();

export function resolveWaveformSource(track: Track): Promise<ResolvedWaveformSource> {
  const memoKey = `${track.id}|${Math.round(track.duration * 10)}`;
  const memo = resolutionMemo.get(memoKey);
  if (memo) return Promise.resolve(memo);

  const p = (async (): Promise<ResolvedWaveformSource> => {
    const dur = track.duration || 0;

    if (track.source === "local" || track.id.startsWith("local_")) {
      const blobUrl = getLocalBlobUrl(track.id);
      if (blobUrl) return { kind: "ok", url: blobUrl, durationSec: dur };
      return { kind: "blocked", reason: "expired", durationSec: dur };
    }

    if (track.source === "demo") {
      if (track.audioUrl && track.audioUrl.startsWith("/")) {
        return { kind: "ok", url: track.audioUrl, durationSec: dur };
      }
      return { kind: "blocked", reason: "no-url", durationSec: dur };
    }

    if (track.source === "audius" || track.id.startsWith("audius_")) {
      const url = await getAudiusStream(track.id);
      if (url) return { kind: "ok", url, durationSec: dur };
      return { kind: "blocked", reason: "no-url", durationSec: dur };
    }

    if (track.source === "soundcloud" && track.scTrackId && track.scTrackId > 0) {
      const stream = await resolveSoundCloudStream(track.scTrackId);
      if (!stream?.url) {
        return { kind: "blocked", reason: "no-url", durationSec: stream?.duration || dur };
      }
      const durationSec = stream.duration || dur;
      if (stream.isEncrypted) {
        return { kind: "blocked", reason: "drm", durationSec, protocol: stream.protocol ?? undefined };
      }
      if (stream.isHls) {
        return { kind: "blocked", reason: "hls", durationSec, protocol: stream.protocol ?? undefined };
      }
      if (stream.isPreview) {
        return { kind: "blocked", reason: "snippet", durationSec, protocol: stream.protocol ?? undefined };
      }
      return {
        kind: "ok",
        url: shouldProxyUrl(stream.url),
        durationSec,
        protocol: stream.protocol ?? undefined,
        quality: (stream as { quality?: string }).quality ?? undefined,
      };
    }

    return { kind: "blocked", reason: "no-url", durationSec: dur };
  })();

  p.then((res) => {
    resolutionMemo.set(memoKey, res);
  }).catch(() => {
    resolutionMemo.delete(memoKey);
  });
  return p;
}

/** Decode an ArrayBuffer via the shared AudioContext (Safari-safe callback
 *  form; never throws — failures resolve to null). */
async function decodeAudioBuffer(buf: ArrayBuffer): Promise<AudioBuffer | null> {
  const ctx = getAudioContext();
  if (!ctx || typeof ctx.decodeAudioData !== "function") return null;
  return new Promise<AudioBuffer | null>((resolve) => {
    let settled = false;
    try {
      const p = ctx.decodeAudioData(
        buf,
        (ab) => { if (!settled) { settled = true; resolve(ab); } },
        () => { if (!settled) { settled = true; resolve(null); } },
      );
      if (p && typeof (p as Promise<AudioBuffer>).then === "function") {
        (p as Promise<AudioBuffer>).then(
          (ab) => { if (!settled) { settled = true; resolve(ab); } },
          () => { if (!settled) { settled = true; resolve(null); } },
        );
      }
    } catch {
      resolve(null);
    }
  });
}

/** Compute peaks for a decoded buffer at the given bucket count. */
function peaksFromAudio(audio: AudioBuffer, bucketCount: number): Float32Array | null {
  if (bucketCount <= 0) return null;
  const channels: Float32Array[] = [];
  for (let c = 0; c < audio.numberOfChannels; c++) {
    channels.push(audio.getChannelData(c));
  }
  return computePeaks(channels, bucketCount);
}

/** Fetch + decode an audio file and compute its full peaks array. */
export async function decodeFileToPeaks(
  url: string,
  bucketCount: number,
): Promise<Float32Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const audio = await decodeAudioBuffer(buf);
    if (!audio) return null;
    return peaksFromAudio(audio, bucketCount);
  } catch {
    return null;
  }
}

// ── Progressive Range decoding (faster first paint, less bandwidth) ─────────
//
// Long tracks used to download the WHOLE file before any waveform appeared
// (5+ MB for a typical SoundCloud progressive MP3). Now the first ~1.5 MB is
// Range-fetched and decoded alone → a partial wave renders within the first
// fraction of the download; the remainder streams in the background and
// completes the record. Falls back to the full fetch whenever the server
// ignores Range (200), the file is small, or a chunk fails to decode —
// behaviour then is byte-for-byte the previous pipeline.

const PROGRESSIVE_CHUNK_BYTES = 1.5 * 1024 * 1024;
const PROGRESSIVE_MIN_FILE_BYTES = 2 * 1024 * 1024;

interface RangeFetch {
  buf: ArrayBuffer;
  /** HTTP 206 = server honored the Range; 200 = full body came back. */
  status: number;
  totalBytes: number | null;
}

async function fetchRange(url: string, start: number, end: number): Promise<RangeFetch | null> {
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok && res.status !== 206) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) return null;
    let totalBytes: number | null = null;
    const cr = res.headers.get("content-range");
    if (res.status === 206 && cr) {
      const m = cr.match(/\/(\d+)$/);
      if (m) totalBytes = parseInt(m[1], 10);
    }
    return { buf, status: res.status, totalBytes };
  } catch {
    return null;
  }
}

/**
 * Progressive decode pipeline. Emits partial results through `onPartial`
 * (cache + UI) as soon as the first chunk decodes, then completes.
 * Resolves with the final (possibly partial) record — never null unless
 * nothing at all could be decoded (caller then keeps any live-sampled data).
 */
async function decodeProgressive(
  url: string,
  bucketCount: number,
  durationSec: number,
  makeData: (peaks: Float32Array, coverage: number, complete: boolean) => WaveformData,
  onPartial?: (data: WaveformData) => void,
): Promise<WaveformData | null> {
  const first = await fetchRange(url, 0, PROGRESSIVE_CHUNK_BYTES - 1);
  if (!first) {
    // Network failed outright — fall back to the classic full path.
    const peaks = await decodeFileToPeaks(url, bucketCount);
    return peaks ? makeData(peaks, 1, true) : null;
  }

  const totalBytes = first.totalBytes;
  const progressive =
    first.status === 206 &&
    !!totalBytes &&
    totalBytes > PROGRESSIVE_MIN_FILE_BYTES &&
    first.buf.byteLength < totalBytes;

  if (!progressive) {
    // Small file, or the server ignored Range and sent everything (200).
    const audio = await decodeAudioBuffer(first.buf);
    if (!audio) {
      const peaks = await decodeFileToPeaks(url, bucketCount);
      return peaks ? makeData(peaks, 1, true) : null;
    }
    const peaks = peaksFromAudio(audio, bucketCount);
    return peaks ? makeData(peaks, 1, true) : null;
  }

  // ── Progressive path ──
  const ab1 = await decodeAudioBuffer(first.buf);
  if (!ab1 || ab1.duration <= 0.2) {
    // Truncation broke the decoder — full fetch is the honest fallback.
    const peaks = await decodeFileToPeaks(url, bucketCount);
    return peaks ? makeData(peaks, 1, true) : null;
  }

  const coverage1 = Math.min(0.98, ab1.duration / Math.max(durationSec, ab1.duration));
  const n1 = Math.max(1, Math.min(bucketCount - 1, Math.round(bucketCount * coverage1)));
  const peaks1 = peaksFromAudio(ab1, n1);
  if (!peaks1) return null;

  const partialPeaks = new Float32Array(bucketCount);
  partialPeaks.set(peaks1, 0);
  const partial = makeData(partialPeaks, coverage1, false);
  onPartial?.(partial);

  // ── Background completion: the rest of the file ──
  const rest = await fetchRange(url, first.buf.byteLength, (totalBytes ?? 0) - 1);
  if (!rest) return partial; // honest partial — live sampler can still top it up
  const ab2 = await decodeAudioBuffer(rest.buf);
  if (!ab2 || ab2.duration <= 0.2) return partial;

  const n2 = bucketCount - n1;
  const peaks2 = peaksFromAudio(ab2, n2);
  if (!peaks2) return partial;

  const fullPeaks = new Float32Array(partialPeaks); // copy — partial stays intact
  fullPeaks.set(peaks2, n1);
  const coverage = Math.min(1, (ab1.duration + ab2.duration) / Math.max(durationSec, ab1.duration + ab2.duration));
  return makeData(fullPeaks, coverage, true);
}

// In-flight generation dedup — one decode per key even with concurrent views.
const inFlight = new Map<string, Promise<WaveformData | null>>();

/**
 * Get the waveform for a track: cache-first; on miss (or partial), try full
 * decode; blocked sources return whatever the live sampler has (possibly
 * nothing yet — renderer shows the growing partial honestly).
 *
 * `onPartial` receives early partial results (progressive Range decode) so
 * the UI can paint the first part of the wave while the rest streams in.
 */
export async function getWaveform(
  track: Track,
  onPartial?: (data: WaveformData) => void,
): Promise<WaveformData | null> {
  const resolution = await resolveWaveformSource(track);
  const durationSec = resolution.durationSec || track.duration || 0;
  if (durationSec <= 0) return null;

  const fingerprint = waveformFingerprint({ durationSec });
  const key = waveformKey(track.id, fingerprint);

  const cached = await getWaveformFromCache(key);
  if (cached?.complete) return cached;

  if (resolution.kind === "blocked") {
    return cached ?? null; // partial (live-sampled) or nothing
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    const bucketCount = bucketCountFor(durationSec);
    if (bucketCount <= 0) return null;

    const makeData = (peaks: Float32Array, coverage: number, complete: boolean): WaveformData => ({
      key,
      trackId: track.id,
      version: WAVEFORM_VERSION,
      fingerprint,
      bucketCount,
      durationSec,
      peaks,
      coverage,
      complete,
      updatedAt: Date.now(),
    });

    const emitPartial = (data: WaveformData) => {
      void putWaveformToCache(data);
      onPartial?.(data);
    };

    const data = await decodeProgressive(resolution.url, bucketCount, durationSec, makeData, emitPartial);
    if (!data) return cached ?? null; // decode failed — keep any partial
    await putWaveformToCache(data);
    return data;
  })()
    .catch(() => cached ?? null)
    .finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task;
}

/** Test hook — clear session memos. */
export function resetWaveformResolutionForTest() {
  resolutionMemo.clear();
  inFlight.clear();
}
