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

/** Fetch + decode an audio file and compute its full peaks array. */
export async function decodeFileToPeaks(
  url: string,
  bucketCount: number,
): Promise<Float32Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const ctx = getAudioContext();
    if (!ctx || typeof ctx.decodeAudioData !== "function") return null;
    const audio = await new Promise<AudioBuffer | null>((resolve) => {
      // Callback form: Safari-safe, and lets us swallow decode errors.
      let settled = false;
      try {
        const p = ctx.decodeAudioData(
          buf,
          (ab) => { if (!settled) { settled = true; resolve(ab); } },
          () => { if (!settled) { settled = true; resolve(null); } },
        );
        // Modern promise form (returned value) — use if callbacks unsupported.
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
    if (!audio) return null;
    const channels: Float32Array[] = [];
    for (let c = 0; c < audio.numberOfChannels; c++) {
      channels.push(audio.getChannelData(c));
    }
    return computePeaks(channels, bucketCount);
  } catch {
    return null;
  }
}

// In-flight generation dedup — one decode per key even with concurrent views.
const inFlight = new Map<string, Promise<WaveformData | null>>();

/**
 * Get the waveform for a track: cache-first; on miss (or partial), try full
 * decode; blocked sources return whatever the live sampler has (possibly
 * nothing yet — renderer shows the growing partial honestly).
 */
export async function getWaveform(track: Track): Promise<WaveformData | null> {
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
    const peaks = await decodeFileToPeaks(resolution.url, bucketCount);
    if (!peaks) return cached ?? null; // decode failed — keep any partial
    const data: WaveformData = {
      key,
      trackId: track.id,
      version: WAVEFORM_VERSION,
      fingerprint,
      bucketCount,
      durationSec,
      peaks,
      coverage: 1,
      complete: true,
      updatedAt: Date.now(),
    };
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
