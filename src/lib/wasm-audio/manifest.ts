/**
 * version.json loader + asset URL builder.
 *
 * The manifest is the SINGLE source of truth for asset URLs (§35.10):
 * app code never hardcodes a tag → old JS can never pair with new WASM.
 * Fetched with cache: 'no-store'; sw.js passes this path straight to the
 * network (see sw.js audio-engine rule), so a stale deployment can't serve
 * an old manifest either.
 */
import type { AudioEngineManifest } from "./types";

let cached: Promise<AudioEngineManifest> | null = null;

export function resetManifestCache(): void {
  cached = null;
}

export function fetchAudioEngineManifest(): Promise<AudioEngineManifest> {
  if (cached) return cached;
  cached = (async () => {
    const res = await fetch("/audio-engine/version.json", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) throw new Error(`version.json HTTP ${res.status}`);
    const m = (await res.json()) as AudioEngineManifest;
    if (!m || typeof m.tag !== "string" || !m.core || !m.codec || !m.worklet || !m.worker) {
      throw new Error("version.json: malformed manifest");
    }
    return m;
  })();
  cached.catch(() => { cached = null; });
  return cached;
}

/** Absolute URLs for a manifest's assets (immutable, content-hashed). */
export function assetUrl(manifest: AudioEngineManifest, file: string): string {
  return `/audio-engine/${manifest.tag}/${file}`;
}
