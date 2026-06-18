"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  getAudioElement, initAudioEngine, getInactiveAudio, resumeAudioContext,
  resetCorsState, crossfadeTo, cancelCrossfade, replaceAudioElement,
  connectElementToAudioGraph, onAudioElementReplaced, getGaplessPreloadedTrackId,
  setGaplessPreloadedTrackId, clearGaplessPreload, crossfadeToGapless,
  preloadTrack, isGaplessEnabled, setAudioPlaybackRate,
} from "@/lib/audioEngine";
import { replayGain, getDefaultGainForGenre } from "@/lib/replayGain";
import { getLocalBlobUrl } from "./SearchView";
import { toast } from "@/hooks/use-toast";
import Hls from "hls.js";
import type { HlsConfig } from "hls.js";
import type { Track } from "@/lib/musicApi";

// ── Error Logger ──
export const PlayerErrorLogger = {
  logs: [] as Array<{ time: string; track: string; error: string; action: string; fixed: boolean }>,
  maxLogs: 100,

  log(trackTitle: string, errorMsg: string, action: string = "retry") {
    const entry = {
      time: new Date().toISOString(),
      track: trackTitle || "unknown",
      error: errorMsg,
      action,
      fixed: false,
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    console.log(`%c[MQ-Player Error] %c${entry.track}%c: ${entry.error} (${entry.action})`,
      "color:#ef4444;font-weight:bold", "color:#fbbf24", "color:#94a3b8");
    return entry;
  },

  markFixed(time: string) {
    const entry = this.logs.find(e => e.time === time);
    if (entry) entry.fixed = true;
  },

  getUnfixed() {
    return this.logs.filter(e => !e.fixed);
  },

  autoFix() {
    const unfixed = this.getUnfixed();
    if (unfixed.length === 0) return;

    const patterns: Record<string, number> = {};
    for (const entry of unfixed) {
      const key = entry.error.slice(0, 80);
      patterns[key] = (patterns[key] || 0) + 1;
    }

    console.log(`%c[MQ AutoFix] Found ${unfixed.length} unfixed errors in ${Object.keys(patterns).length} categories`, "color:#22c55e;font-weight:bold");

    const abortCount = unfixed.filter(e => e.error.includes("AbortError")).length;
    if (abortCount >= 2) {
      console.log("[MQ AutoFix] Multiple AbortErrors detected — resetting CORS state");
      resetCorsState?.();
      unfixed.filter(e => e.error.includes("AbortError")).forEach(e => this.markFixed(e.time));
    }

    const allowedCount = unfixed.filter(e => e.error.includes("NotAllowedError")).length;
    if (allowedCount >= 2) {
      console.log("[MQ AutoFix] NotAllowedError — autoplay policy, user interaction needed");
      unfixed.filter(e => e.error.includes("NotAllowedError")).forEach(e => this.markFixed(e.time));
    }
  }
};

// Run auto-fix every 15 seconds
if (typeof window !== "undefined") {
  setInterval(() => PlayerErrorLogger.autoFix(), 15000);
}

// ── Waveform peak generator ──
export function generateWaveformPeaks(trackId: string, count: number = 100): number[] {
  let seed = 0;
  for (let i = 0; i < trackId.length; i++) seed = ((seed << 5) - seed + trackId.charCodeAt(i)) | 0;
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const base = 0.3 + (seed % 50) / 100;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const variation = (seed % 30) / 100;
    peaks.push(Math.min(1, base + variation));
  }
  return peaks;
}

/** Resolve the playable URL for a stream — proxy through our CDN if needed */
function proxyStreamUrl(url: string): string {
  // Already a local proxy URL — never double-proxy
  if (url.startsWith('/api/')) return url;
  // SoundCloud CDN + cobalt bypass domains need proxying for CORS
  if (url.includes('sndcdn.com') || url.includes('soundcloud.cloud') || url.includes('cobalt.tools')) {
    return `/api/music/soundcloud/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export interface StreamResult {
  url: string;
  isPreview: boolean;
  duration: number;
  fullDuration: number;
  isHls: boolean;
  isEncrypted: boolean;
  protocol?: string;
  licenseUrl?: string;
  licenseAuthToken?: string;
  fallbackStreams?: Array<{
    url: string;
    protocol: string;
    isHls: boolean;
    isEncrypted: boolean;
    licenseUrl?: string;
    licenseAuthToken?: string;
  }>;
  drmRestricted?: boolean;
}

// ── EME/DRM Helper ──
export function buildEmeHlsConfig(stream: {
  isEncrypted?: boolean;
  protocol?: string | null;
  licenseUrl?: string | null;
  licenseAuthToken?: string | null;
}): Partial<HlsConfig> {
  const config: Partial<HlsConfig> = {
    enableWorker: true,
    lowLatencyMode: false,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    manifestLoadingMaxRetry: 4,
    manifestLoadingRetryDelay: 2000,
    levelLoadingMaxRetry: 4,
    levelLoadingRetryDelay: 2000,
    fragLoadingMaxRetry: 6,
    fragLoadingRetryDelay: 2000,
  };

  const cdnProxy = "/api/music/soundcloud/proxy";
  const scDomainPatterns = ['sndcdn.com', 'soundcloud.cloud', 'soundcloud.com'];
  config.xhrSetup = function (xhr: XMLHttpRequest, url: string) {
    if (scDomainPatterns.some(domain => url.includes(domain))) {
      xhr.open('GET', `${cdnProxy}?url=${encodeURIComponent(url)}`, true);
    }
  };

  if (stream.isEncrypted && stream.licenseUrl) {
    config.emeEnabled = true;
    const proxyParams = new URLSearchParams();
    proxyParams.set('licenseUrl', stream.licenseUrl);
    if (stream.licenseAuthToken) {
      proxyParams.set('licenseAuthToken', stream.licenseAuthToken);
    }
    config.widevineLicenseUrl = '/api/music/soundcloud/license-proxy?' + proxyParams.toString();
  } else {
    config.emeEnabled = false;
  }

  return config;
}

const _isFirefox = typeof navigator !== 'undefined' && /Firefox/i.test(navigator.userAgent);

export function prepareEncryptedElement(el: HTMLAudioElement): HTMLAudioElement {
  if (!_isFirefox) return el;
  if ((el as any).mozAudioCaptured) {
    console.log("[Player] Firefox: replacing Web Audio captured element for EME compatibility");
    const newEl = replaceAudioElement(el);
    return newEl;
  }
  return el;
}

export function ensureWebAudioConnected(el: HTMLAudioElement): void {
  connectElementToAudioGraph(el);
}

export function buildWidevinePssh(keyId: Uint8Array): Uint8Array {
  const WIDEVINE_SYSTEM_ID = new Uint8Array([
    0xed, 0xef, 0x8b, 0xa9, 0x79, 0xd6, 0x4a, 0xce,
    0xa3, 0xc8, 0x27, 0xdc, 0xd5, 0x1d, 0x21, 0xed,
  ]);
  const psshSize = 4 + 4 + 4 + 4 + 16 + 4 + 16;
  const pssh = new Uint8Array(psshSize);
  const dv = new DataView(pssh.buffer);
  dv.setUint32(0, psshSize, false);
  pssh[4] = 0x70; pssh[5] = 0x73; pssh[6] = 0x73; pssh[7] = 0x68;
  dv.setUint32(8, 1, false);
  dv.setUint32(12, 0, false);
  pssh.set(WIDEVINE_SYSTEM_ID, 16);
  dv.setUint32(32, 1, false);
  pssh.set(keyId, 36);
  return pssh;
}

export async function setupManualEME(
  audioEl: HTMLAudioElement,
  stream: { isEncrypted?: boolean; protocol?: string | null; licenseUrl?: string | null; licenseAuthToken?: string | null },
): Promise<HTMLAudioElement | null> {
  if (!stream.isEncrypted || !stream.licenseUrl) {
    console.log("[ManualEME] Not encrypted or no licenseUrl — skipping");
    return null;
  }

  const keySystem = stream.protocol === "cbc-encrypted-hls"
    ? "com.apple.fps"
    : "com.widevine.alpha";

  console.log("[ManualEME] Setting up manual EME for", keySystem);
  console.log("[ManualEME] licenseUrl:", stream.licenseUrl);
  console.log("[ManualEME] hasAuthToken:", !!stream.licenseAuthToken, stream.licenseAuthToken ? ("len=" + stream.licenseAuthToken.length) : "");

  const licenseProxyParams = new URLSearchParams();
  licenseProxyParams.set("licenseUrl", stream.licenseUrl);
  if (stream.licenseAuthToken) {
    licenseProxyParams.set("licenseAuthToken", stream.licenseAuthToken);
  }
  const licenseProxyUrl = "/api/music/soundcloud/license-proxy?" + licenseProxyParams.toString();

  try {
    if (!navigator.requestMediaKeySystemAccess) {
      console.error("[ManualEME] navigator.requestMediaKeySystemAccess NOT available — EME not supported in this browser");
      return null;
    }

    console.log("[ManualEME] Requesting key system access for", keySystem);
    let keySystemAccess: MediaKeySystemAccess;
    try {
      keySystemAccess = await navigator.requestMediaKeySystemAccess(keySystem, [{
        initDataTypes: ["cenc"],
        audioCapabilities: [{ contentType: "audio/mp4; codecs=\"mp4a.40.2\"", robustness: "SW_SECURE_CRYPTO" }],
      }]);
      console.log("[ManualEME] Key system access GRANTED for", keySystem);
    } catch (e: any) {
      console.error("[ManualEME] Key system access DENIED for", keySystem, "—", e?.name, e?.message);
      return null;
    }

    console.log("[ManualEME] Creating MediaKeys...");
    const newMediaKeys = await keySystemAccess.createMediaKeys();
    console.log("[ManualEME] MediaKeys created successfully");

    let mediaKeys: MediaKeys;
    let targetEl: HTMLAudioElement = audioEl;

    try {
      const existingKeys = audioEl.mediaKeys;
      if (existingKeys) {
        console.log("[ManualEME] Audio element already has MediaKeys — reusing existing keys");
        mediaKeys = existingKeys;
      } else {
        await audioEl.setMediaKeys(newMediaKeys);
        console.log("[ManualEME] MediaKeys set on audio element ✓");
        mediaKeys = newMediaKeys;
      }
    } catch (e: any) {
      if (e?.name === "NotSupportedError" && audioEl.mediaKeys) {
        console.warn("[ManualEME] setMediaKeys threw NotSupportedError, but element already has keys — reusing");
        mediaKeys = audioEl.mediaKeys;
      } else if (e?.name === "NotSupportedError") {
        console.warn("[ManualEME] setMediaKeys NotSupportedError — element is captured by MediaElementAudioSource (Firefox)");
        console.warn("[ManualEME] Replacing with fresh un-captured element via replaceAudioElement...");
        try {
          targetEl = replaceAudioElement(audioEl);
          await targetEl.setMediaKeys(newMediaKeys);
          mediaKeys = newMediaKeys;
          console.log("[ManualEME] ★ setMediaKeys succeeded on fresh element ✓");
          connectElementToAudioGraph(targetEl);
          console.log("[ManualEME] ★ Element connected to Web Audio graph after MediaKeys ✓");
        } catch (replaceErr: any) {
          console.error("[ManualEME] Element replacement + setMediaKeys FAILED:", replaceErr?.name, replaceErr?.message);
          return null;
        }
      } else {
        console.error("[ManualEME] setMediaKeys FAILED:", e?.name, e?.message);
        return null;
      }
    }

    const prevEncryptedHandler = (audioEl as any)._emeEncryptedHandler;
    if (prevEncryptedHandler) {
      audioEl.removeEventListener("encrypted", prevEncryptedHandler);
      (audioEl as any)._emeEncryptedHandler = null;
    }
    const prevPsshTimeout = (audioEl as any)._emePsshTimeout;
    if (prevPsshTimeout) {
      clearTimeout(prevPsshTimeout);
      (audioEl as any)._emePsshTimeout = null;
    }
    if (targetEl !== audioEl) {
      const prevHandler2 = (targetEl as any)._emeEncryptedHandler;
      if (prevHandler2) {
        targetEl.removeEventListener("encrypted", prevHandler2);
        (targetEl as any)._emeEncryptedHandler = null;
      }
      const prevTimeout2 = (targetEl as any)._emePsshTimeout;
      if (prevTimeout2) {
        clearTimeout(prevTimeout2);
        (targetEl as any)._emePsshTimeout = null;
      }
    }

    let emeDone = false;
    const encryptedHandler = async (event: MediaEncryptedEvent) => {
      if (emeDone) return;
      emeDone = true;

      console.log("[ManualEME] ★ 'encrypted' event fired!");
      console.log("[ManualEME]   initDataType:", event.initDataType);
      console.log("[ManualEME]   initData length:", event.initData?.byteLength || 0);

      let session: MediaKeySession;
      try {
        session = mediaKeys.createSession();
        console.log("[ManualEME] Key session created, sessionId:", session.sessionId || "(pending)");
      } catch (e: any) {
        console.error("[ManualEME] Failed to create key session:", e?.name, e?.message);
        return;
      }

      try {
        if (!event.initData) {
          console.error("[ManualEME] initData is null — cannot generateRequest");
          return;
        }
        console.log("[ManualEME] Calling generateRequest(", event.initDataType, ", initData[" + event.initData.byteLength + "])");
        await session.generateRequest(event.initDataType, event.initData);
        console.log("[ManualEME] generateRequest() succeeded ✓");
      } catch (e: any) {
        console.error("[ManualEME] generateRequest() FAILED:", e?.name, e?.message);
        return;
      }

      session.addEventListener("message", async (msgEvent: MediaKeyMessageEvent) => {
        console.log("[ManualEME] ★ CDM challenge received!");
        console.log("[ManualEME]   messageType:", msgEvent.messageType);
        console.log("[ManualEME]   challenge length:", msgEvent.message.byteLength, "bytes");

        try {
          console.log("[ManualEME] Sending challenge to license proxy...");
          const response = await fetch(licenseProxyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: msgEvent.message,
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            console.error("[ManualEME] License proxy returned HTTP", response.status, errorText.substring(0, 200));
            return;
          }

          const license = await response.arrayBuffer();
          console.log("[ManualEME] ★ License received from proxy!");
          console.log("[ManualEME]   license length:", license.byteLength, "bytes");

          if (license.byteLength === 0) {
            console.error("[ManualEME] License is EMPTY — SC license server returned no data");
            return;
          }

          try {
            await session.update(new Uint8Array(license));
            console.log("[ManualEME] ★ session.update() succeeded ✓ — key should be usable now");
          } catch (e: any) {
            console.error("[ManualEME] session.update() FAILED:", e?.name, e?.message);
          }
        } catch (e: any) {
          console.error("[ManualEME] License exchange FAILED:", e?.name, e?.message);
        }
      });

      session.addEventListener("keystatuseschange", () => {
        session.keyStatuses.forEach((status: MediaKeyStatus, keyId: BufferSource) => {
          const hex = Array.from(new Uint8Array(keyId as ArrayBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
          console.log("[ManualEME] Key status:", status, "keyId:", hex);
          if (status === "usable") {
            console.log("[ManualEME] ★★★ KEY IS USABLE — decryption should work! ★★★");
          }
        });
      });
    };
    targetEl.addEventListener("encrypted", encryptedHandler);
    (targetEl as any)._emeEncryptedHandler = encryptedHandler;

    const psshTimeout = setTimeout(async () => {
      if (emeDone) return;
      console.warn("[ManualEME] 'encrypted' event did NOT fire within 5s — trying PSSH fallback from manifest KEYID");

      const keyIdHex = (targetEl as any)._drmKeyId;
      if (!keyIdHex) {
        console.error("[ManualEME] No KEYID captured from manifest — cannot build PSSH fallback");
        return;
      }

      const keyId = new Uint8Array(keyIdHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
      const pssh = buildWidevinePssh(keyId);
      console.log("[ManualEME] Built PSSH box from KEYID:", keyIdHex, "size:", pssh.byteLength);

      emeDone = true;
      let session: MediaKeySession;
      try {
        session = mediaKeys.createSession();
        await session.generateRequest("cenc", pssh.buffer as ArrayBuffer);
        console.log("[ManualEME] PSSH fallback: generateRequest succeeded");
      } catch (e: any) {
        console.error("[ManualEME] PSSH fallback: generateRequest FAILED:", e?.name, e?.message);
        return;
      }

      session.addEventListener("message", async (msgEvent: MediaKeyMessageEvent) => {
        console.log("[ManualEME] PSSH fallback: CDM challenge received, length:", msgEvent.message.byteLength);
        try {
          const response = await fetch(licenseProxyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: msgEvent.message,
          });
          if (!response.ok) {
            console.error("[ManualEME] PSSH fallback: License proxy returned HTTP", response.status);
            return;
          }
          const license = await response.arrayBuffer();
          console.log("[ManualEME] PSSH fallback: License received, length:", license.byteLength);
          await session.update(new Uint8Array(license));
          console.log("[ManualEME] PSSH fallback: session.update() succeeded ✓");
        } catch (e: any) {
          console.error("[ManualEME] PSSH fallback: License exchange FAILED:", e);
        }
      });

      session.addEventListener("keystatuseschange", () => {
        session.keyStatuses.forEach((status: MediaKeyStatus, keyId: BufferSource) => {
          const hex = Array.from(new Uint8Array(keyId as ArrayBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
          console.log("[ManualEME] PSSH fallback: Key status:", status, "keyId:", hex);
        });
      });
    }, 5000);
    (targetEl as any)._emePsshTimeout = psshTimeout;

    console.log("[ManualEME] Setup complete — waiting for 'encrypted' event from media element");
    console.log("[ManualEME]   target element:", targetEl === audioEl ? "(original)" : "(REPLACED — new element)");
    return targetEl;
  } catch (e: any) {
    console.error("[ManualEME] Setup FAILED:", e?.name, e?.message);
    return null;
  }
}

export function createManifestInterceptor(audioEl: HTMLAudioElement): (xhr: XMLHttpRequest, url: string) => void {
  return function (xhr: XMLHttpRequest, url: string) {
    if (!url.includes(".m3u8") && !url.includes("playlist")) return;

    const origOnLoad = xhr.onload;
    xhr.addEventListener("load", () => {
      try {
        if (xhr.responseText && xhr.responseText.includes("#EXT-X-KEY")) {
          const keyLines = xhr.responseText.split("\n")
            .filter(line => line.startsWith("#EXT-X-KEY:"));
          console.log("[Manifest] #EXT-X-KEY tags found:", keyLines.length);
          for (const line of keyLines) {
            console.log("[Manifest]   ", line.substring(0, 300));
          }

          for (const line of keyLines) {
            const kidMatch = line.match(/KEYID=0x([0-9a-fA-F]+)/);
            if (kidMatch) {
              const keyId = kidMatch[1];
              console.log("[Manifest] ★ Extracted KEYID:", keyId);
              (audioEl as any)._drmKeyId = keyId;
            }
            const kidMatch2 = line.match(/KEYID="?([^",\s]+)"?/);
            if (kidMatch2 && kidMatch2[1] && !kidMatch2[1].startsWith("0x")) {
              console.log("[Manifest] ★ Extracted KEYID (alt format):", kidMatch2[1]);
              (audioEl as any)._drmKeyId = kidMatch2[1].replace(/-/g, "");
            }
          }
        }
      } catch (e) {
        // Don't let manifest parsing errors break playback
      }
      if (origOnLoad) (origOnLoad as EventListener).call(xhr, new Event("load"));
    });
  };
}

export async function resolveSoundCloudStream(scTrackId: number): Promise<StreamResult | null> {
  try {
    // Include cobalt JWT if available (for SNIP bypass)
    const cobaltJwt = useAppStore.getState().getCobaltJwt();
    const jwtParam = cobaltJwt ? `&cobaltJwt=${encodeURIComponent(cobaltJwt)}` : '';
    const res = await fetch(`/api/music/soundcloud/stream?trackId=${scTrackId}${jwtParam}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.error(`[resolveStream] HTTP ${res.status} for track ${scTrackId}`);
      return null;
    }
    const data = await res.json();

    console.log(`[resolveStream] track=${scTrackId}, url=${data.url ? 'yes' : 'no'}, resolveUrl=${data.resolveUrl ? 'yes' : 'no'}, error=${data.error || 'none'}, protocol=${data.protocol}, isHls=${data.isHls}, isEncrypted=${data.isEncrypted}, policy=${data.isPreview ? 'SNIP' : 'ALLOW'}, fallbacks=${(data.fallbackStreams || []).length}`);
    if (data._diag) {
      console.log(`[resolveStream] diagnostics:`, data._diag);
    }

    if (data.url) {
      return {
        url: data.url,
        isPreview: !!data.isPreview,
        duration: data.duration || 0,
        fullDuration: data.fullDuration || 0,
        isHls: !!data.isHls,
        isEncrypted: !!data.isEncrypted,
        protocol: data.protocol || null,
        licenseUrl: data.licenseUrl || null,
        licenseAuthToken: data.licenseAuthToken || null,
        fallbackStreams: data.fallbackStreams || null,
        drmRestricted: !!data.drmRestricted,
      };
    }

    if (data.resolveUrl) {
      console.warn("[Player] Edge resolve failed, trying CORS proxy...");
      try {
        let proxyUrl = `/api/music/soundcloud/resolve-proxy?url=${encodeURIComponent(data.resolveUrl)}`;
        if (data.trackAuthorization) {
          proxyUrl += `&track_authorization=${encodeURIComponent(data.trackAuthorization)}`;
        }
        const proxyRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
        if (proxyRes.ok) {
          const proxyData = await proxyRes.json();
          if (proxyData.url) {
            console.log(`[resolveStream] CORS proxy succeeded: url=${proxyData.url.substring(0, 60)}...`);
            return {
              url: proxyData.url,
              isPreview: !!data.isPreview,
              duration: data.duration || 0,
              fullDuration: data.fullDuration || 0,
              isHls: !!data.isHls,
              isEncrypted: !!data.isEncrypted,
              protocol: data.protocol || null,
              licenseUrl: data.licenseUrl || null,
              licenseAuthToken: data.licenseAuthToken || proxyData.licenseAuthToken || null,
            };
          }
        }
      } catch {
        // CORS proxy failed too
      }
    }

    const diagInfo = data._diag ? ` | diag: ${(data._diag as string[]).join(', ')}` : '';
    console.error(`[resolveStream] No URL for track ${scTrackId}: error=${data.error || 'none'}, resolveUrl=${data.resolveUrl ? 'yes' : 'no'}${diagInfo}`);
    return null;
  } catch (err) {
    console.warn("[resolveSoundCloudStream] failed:", err);
    return null;
  }
}

// ── Hook interface ──
export interface UseAudioEngineParams {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  playbackRate: number;
  setProgress: (p: number) => void;
  setDuration: (d: number) => void;
  setPlaybackMode: (m: "soundcloud" | "idle") => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  miniPlayerHidden: boolean;
  setMiniPlayerHidden: (h: boolean) => void;
}

export function useAudioEngine(params: UseAudioEngineParams) {
  const {
    currentTrack, isPlaying, volume, playbackRate,
    setProgress, setDuration, setPlaybackMode,
    togglePlay, nextTrack, prevTrack,
    miniPlayerHidden, setMiniPlayerHidden,
  } = params;

  // ── Local state ──
  const [isLoadingTrack, _setIsLoadingTrack] = useState(false);
  const isLoadingTrackRef = useRef(false);
  const setIsLoadingTrack = useCallback((val: boolean) => {
    isLoadingTrackRef.current = val;
    _setIsLoadingTrack(val);
  }, []);

  const [playError, _setPlayError] = useState(false);
  const playErrorRef = useRef(false);
  const setPlayError = useCallback((val: boolean) => {
    playErrorRef.current = val;
    _setPlayError(val);
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  // ── Refs ──
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const playerBarRef = useRef<HTMLDivElement>(null);
  const crossfadeRef = useRef(false);

  // ── RAF-based progress sync (avoids React re-renders every 250ms) ──
  // Components register a callback to receive high-frequency progress updates
  // via requestAnimationFrame, bypassing React state for the progress bar.
  const progressRAFCallbacks = useRef<Set<(currentTime: number, duration: number) => void>>(new Set());
  const rafIdRef = useRef<number>(0);
  const isRAFRunning = useRef(false);

  const registerProgressRAF = useCallback((cb: (currentTime: number, duration: number) => void) => {
    progressRAFCallbacks.current.add(cb);
    return () => { progressRAFCallbacks.current.delete(cb); };
  }, []);

  const startProgressRAF = useCallback(() => {
    if (isRAFRunning.current) return;
    isRAFRunning.current = true;
    const tick = () => {
      const a = getAudioElement();
      if (a && !a.paused && a.duration && isFinite(a.duration)) {
        const ct = a.currentTime;
        const dur = a.duration;
        progressRAFCallbacks.current.forEach(cb => { try { cb(ct, dur); } catch {} });
      }
      if (isRAFRunning.current) {
        rafIdRef.current = requestAnimationFrame(tick);
      }
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  const stopProgressRAF = useCallback(() => {
    isRAFRunning.current = false;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
  }, []);

  const prevTrackIdForCrossfade = useRef<string | null>(null);
  const startLoadingTimeoutRef = useRef<((generation: number) => void) | null>(null);
  const clearLoadingTimeoutRef = useRef<(() => void) | null>(null);

  const gaplessPreloadStartedRef = useRef(false);
  const gaplessPreloadedTrackRef = useRef<Track | null>(null);

  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const retryingRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const fallbackStreamsRef = useRef<StreamResult['fallbackStreams']>(null);
  const currentStreamEmeRef = useRef<{ isEncrypted: boolean; protocol: string; licenseUrl: string } | null>(null);
  const prevTrackIdRef = useRef<string | null>(null);

  const prevTrackRef = useRef(prevTrack);
  const nextTrackRef = useRef(nextTrack);
  const setProgressRef = useRef(setProgress);
  const setDurationRef = useRef(setDuration);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => { prevTrackRef.current = prevTrack; }, [prevTrack]);
  useEffect(() => { nextTrackRef.current = nextTrack; }, [nextTrack]);
  useEffect(() => { setProgressRef.current = setProgress; }, [setProgress]);
  useEffect(() => { setDurationRef.current = setDuration; }, [setDuration]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);

  // ── Gapless preload helper ──
  const gaplessPreloadNextTrack = useCallback(async (nextTrackData: Track) => {
    try {
      const inactive = getInactiveAudio();
      if (!inactive) return;

      const prevHls = (inactive as any)._hlsInstance;
      if (prevHls) {
        try { prevHls.destroy(); } catch {}
        delete (inactive as any)._hlsInstance;
      }

      inactive.pause();
      inactive.currentTime = 0;
      inactive.crossOrigin = "anonymous";

      if (nextTrackData.source === "demo" && nextTrackData.audioUrl) {
        ensureWebAudioConnected(inactive);
        const el = preloadTrack(nextTrackData.audioUrl, nextTrackData.id);
        if (el) {
          gaplessPreloadedTrackRef.current = nextTrackData;
          console.log("[Gapless] Preloaded demo track:", nextTrackData.title);
        }
      } else if (nextTrackData.source === "soundcloud" && nextTrackData.scTrackId) {
        const stream = await resolveSoundCloudStream(nextTrackData.scTrackId);
        if (!stream?.url) {
          console.warn("[Gapless] Failed to resolve stream for preloading:", nextTrackData.title);
          gaplessPreloadStartedRef.current = false;
          return;
        }

        const currentPlayingId = useAppStore.getState().currentTrack?.id;
        if (!currentPlayingId) return;
        if (currentPlayingId === nextTrackData.id) return;

        const isHlsStream = stream.isHls && Hls.isSupported();

        if (isHlsStream) {
          let targetEl = inactive;

          const hlsConfig = buildEmeHlsConfig(stream);

          if (stream.isEncrypted) {
            targetEl = prepareEncryptedElement(inactive);
            const origXhrSetup = hlsConfig.xhrSetup;
            const manifestInterceptor = createManifestInterceptor(targetEl);
            hlsConfig.xhrSetup = function (xhr: XMLHttpRequest, url: string) {
              manifestInterceptor(xhr, url);
              if (origXhrSetup) origXhrSetup(xhr, url);
            };
          } else {
            ensureWebAudioConnected(inactive);
          }

          const hls = new Hls({
            ...hlsConfig,
            autoStartLoad: true,
          });
          hls.loadSource(stream.url);
          hls.attachMedia(targetEl);
          (targetEl as any)._hlsInstance = hls;

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setGaplessPreloadedTrackId(nextTrackData.id);
            gaplessPreloadedTrackRef.current = nextTrackData;
            console.log("[Gapless] Preloaded HLS track:", nextTrackData.title);
          });

          hls.on(Hls.Events.ERROR, (_ev, data) => {
            if (data.fatal) {
              console.warn("[Gapless] HLS preload error:", data.type, data.details);
              try { hls.destroy(); } catch {}
              delete (targetEl as any)._hlsInstance;
              gaplessPreloadStartedRef.current = false;
            }
          });
        } else {
          const playUrl = proxyStreamUrl(stream.url);

          ensureWebAudioConnected(inactive);
          const el = preloadTrack(playUrl, nextTrackData.id);
          if (el) {
            gaplessPreloadedTrackRef.current = nextTrackData;
            console.log("[Gapless] Preloaded progressive track:", nextTrackData.title);
          }
        }
      } else if (nextTrackData.audioUrl || nextTrackData.id.startsWith("local_")) {
        let audioSrc = nextTrackData.audioUrl;
        if (nextTrackData.id.startsWith("local_")) {
          const blobUrl = getLocalBlobUrl(nextTrackData.id);
          if (blobUrl) {
            audioSrc = blobUrl;
          } else if (!audioSrc || audioSrc === "blob://client-side") {
            return;
          }
        }

        if (audioSrc) {
          ensureWebAudioConnected(inactive);
          const srcUrl = (audioSrc.includes('sndcdn.com') || audioSrc.includes('soundcloud.cloud'))
            ? `/api/music/soundcloud/proxy?url=${encodeURIComponent(audioSrc)}`
            : audioSrc;
          const el = preloadTrack(srcUrl, nextTrackData.id);
          if (el) {
            gaplessPreloadedTrackRef.current = nextTrackData;
            console.log("[Gapless] Preloaded local/direct track:", nextTrackData.title);
          }
        }
      }
    } catch (err) {
      console.warn("[Gapless] Preload failed:", err);
      gaplessPreloadStartedRef.current = false;
    }
  }, []);

  // ── Audio element init + event listeners effect ──
  useEffect(() => {
    const audio = getAudioElement();
    audioRef.current = audio;

    initAudioEngine(audio);

    const getActive = () => getAudioElement();

    const onTimeUpdate = () => {
      const a = getActive();
      if (a && a.duration && isFinite(a.duration) && a.currentTime > a.duration) return;

      const abState = useAppStore.getState().abRepeat;
      if (abState.active && abState.pointB !== null && abState.pointA !== null && a) {
        if (a.currentTime >= abState.pointB) {
          a.currentTime = abState.pointA;
        }
      }

      // Gapless preload
      if (a && a.duration && isFinite(a.duration) && isGaplessEnabled()) {
        const remaining = a.duration - a.currentTime;
        if (remaining <= 10 && remaining > 0) {
          const nextT = useAppStore.getState().peekNextTrack();
          if (nextT) {
            if (gaplessPreloadedTrackRef.current && gaplessPreloadedTrackRef.current.id !== nextT.id) {
              clearGaplessPreload();
              gaplessPreloadStartedRef.current = false;
              gaplessPreloadedTrackRef.current = null;
            }
            if (!gaplessPreloadStartedRef.current) {
              gaplessPreloadStartedRef.current = true;
              gaplessPreloadNextTrack(nextT);
            }
          }
        }
      }

      if (!isDraggingRef.current && a) {
        // Throttle store updates to ~1Hz — the progress bar animates via RAF,
        // so the store only needs coarse updates for time display text.
        const st = useAppStore.getState();
        if (Math.abs(a.currentTime - st.progress) >= 1 || a.currentTime === 0) {
          setProgressRef.current(a.currentTime);
        }
      }
      if ("mediaSession" in navigator && navigator.mediaSession && a?.duration && isFinite(a.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: a.duration,
            playbackRate: a.playbackRate,
            position: a.currentTime,
          });
        } catch {}
      }
    };

    const onLoaded = (e: Event) => {
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;
      const a = getActive();
      if (a?.duration && isFinite(a.duration)) setDurationRef.current(a.duration);
    };

    const onEnded = (e: Event) => {
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;

      setPlayError(false);
      crossfadeRef.current = false;
      const st = useAppStore.getState();
      const currentTrackId = st.currentTrack?.id;
      if (currentTrackId && st.progress > 0) {
        useAppStore.getState().recordComplete(currentTrackId, st.progress);
      }
      if (st.repeat === "one") {
        const a = getActive();
        if (a) {
          a.currentTime = 0;
          a.play().catch(() => {});
          setProgressRef.current(0);
        }
      } else {
        nextTrackRef.current();
      }
    };

    const onError = (e: Event) => {
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;

      if (retryingRef.current) return;

      const audioEl = getActive();
      const st = useAppStore.getState();
      const isSCTrack = !!st.currentTrack?.scTrackId;

      const trackTitle = st.currentTrack?.title || "unknown";

      if (st.currentTrack?.id !== useAppStore.getState().currentTrack?.id) return;

      const errorCode = audioEl?.error?.code || 0;
      const errorMessages: Record<number, string> = {
        1: "MEDIA_ERR_ABORTED",
        2: "MEDIA_ERR_NETWORK",
        3: "MEDIA_ERR_DECODE",
        4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
      };
      const errorMsg = errorMessages[errorCode] || `code ${errorCode}`;
      PlayerErrorLogger.log(trackTitle, errorMsg, `retry ${retryCountRef.current + 1}`);

      const savedPosition = audioEl?.currentTime || 0;
      const wasMidPlayback = savedPosition > 1 && !isLoadingTrackRef.current;

      const skipToNextWithError = (message: string) => {
        setPlayError(true);
        setIsLoadingTrack(false);
        retryingRef.current = false;
        prevTrackIdForCrossfade.current = null;
        const errTrackId = st.currentTrack?.id;
        try {
          toast({
            title: "Ошибка воспроизведения",
            description: message,
          });
        } catch {}
        setTimeout(() => {
          if (useAppStore.getState().currentTrack?.id === errTrackId) {
            nextTrackRef.current();
          }
        }, 1500);
      };

      if (isSCTrack && st.currentTrack?.scTrackId && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        retryingRef.current = true;
        const scId = st.currentTrack.scTrackId;
        console.warn(`[Player] Error on SC track${wasMidPlayback ? ' (mid-playback)' : ''}, re-resolving stream (attempt ${retryCountRef.current}/${maxRetries})`);

        resolveSoundCloudStream(scId).then(async (stream) => {
          retryingRef.current = false;

          const currentSt = useAppStore.getState();
          if (currentSt.currentTrack?.scTrackId !== scId) return;

          if (stream?.url) {
            currentStreamEmeRef.current = stream.isEncrypted && stream.licenseUrl
              ? { isEncrypted: stream.isEncrypted, protocol: stream.protocol || '', licenseUrl: stream.licenseUrl }
              : null;

            let a = audioEl;
            if (a) {
              const prevHls = (a as any)._hlsInstance;
              if (prevHls) { try { prevHls.destroy(); } catch {} delete (a as any)._hlsInstance; }

              a.crossOrigin = 'anonymous';

              if (stream.isHls && Hls.isSupported()) {
                const hlsConfig = buildEmeHlsConfig(stream);
                if (stream.isEncrypted) {
                  a = prepareEncryptedElement(a);
                  const origXhrSetup = hlsConfig.xhrSetup;
                  const manifestInterceptor = createManifestInterceptor(a);
                  hlsConfig.xhrSetup = function (xhr: XMLHttpRequest, url: string) {
                    manifestInterceptor(xhr, url);
                    if (origXhrSetup) origXhrSetup(xhr, url);
                  };
                } else {
                  ensureWebAudioConnected(a);
                }
                const hls = new Hls(hlsConfig);
                hls.loadSource(stream.url);
                hls.attachMedia(a);
                const retryManifestTimeout = setTimeout(() => {
                  if (a.paused && !a.currentTime) {
                    console.error("[Player] HLS retry manifest timeout — skipping");
                    hls.destroy(); delete (a as any)._hlsInstance;
                    skipToNextWithError(`Таймаут загрузки: ${trackTitle}`);
                  }
                }, 8000);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                  clearTimeout(retryManifestTimeout);
                  a.play().then(() => {
                    if (wasMidPlayback && isFinite(savedPosition)) {
                      a.currentTime = savedPosition;
                    }
                  }).catch(() => {});
                });
                hls.on(Hls.Events.ERROR, (_ev, data) => {
                  clearTimeout(retryManifestTimeout);
                  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    console.warn("[Player] Attempting HLS network recovery during retry...");
                    hls.startLoad();
                  } else if (data.fatal) {
                    console.error("[Player] HLS fatal error during retry:", data.type, data.details);
                    hls.destroy(); delete (a as any)._hlsInstance;
                    skipToNextWithError(`Ошибка HLS: ${trackTitle}`);
                  }
                });
                (a as any)._hlsInstance = hls;
              } else {
                const retryPlayUrl = proxyStreamUrl(stream.url);
                a.src = retryPlayUrl;
                a.load();
                a.play().then(() => {
                  if (wasMidPlayback && isFinite(savedPosition)) {
                    a.currentTime = savedPosition;
                  }
                }).catch(() => {});
              }
            }
          } else {
            skipToNextWithError(`Не удалось загрузить: ${trackTitle}`);
          }
        }).catch((err) => {
          retryingRef.current = false;
          console.warn("[Player] Stream resolve failed:", err);
          skipToNextWithError(`Ошибка сети: ${trackTitle}`);
        });
        return;
      }

      if (audioEl?.src && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        resetCorsState();
        retryingRef.current = true;
        console.warn(`[Player] Error loading track, retry ${retryCountRef.current}/${maxRetries}`);
        setTimeout(() => {
          retryingRef.current = false;
          const currentSt = useAppStore.getState();
          if (currentSt.currentTrack?.id !== st.currentTrack?.id) return;

          const savedSrc = audioEl.src;
          audioEl.removeAttribute('src');
          audioEl.load();
          setTimeout(() => {
            audioEl.src = savedSrc;
            audioEl.load();
            audioEl.play().then(() => {
            }).catch(() => {
              skipToNextWithError(`Не удалось воспроизвести: ${trackTitle}`);
            });
          }, 100);
        }, 1000 * retryCountRef.current);
      } else {
        console.warn(`[Player] Max retries reached, skipping to next track`);
        skipToNextWithError(`Не удалось воспроизвести: ${trackTitle}`);
      }
    };

    const onCanPlay = (e: Event) => {
      // CRITICAL: Only handle events from the active audio element.
      // The inactive element (gapless preload) also fires canplay,
      // and without this check it would incorrectly call play() on
      // the active element, causing AbortError and repeated pausing.
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;

      setIsLoadingTrack(false);
      setPlayError(false);
      retryCountRef.current = 0;
      if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
      if (stallTimeoutId) { clearTimeout(stallTimeoutId); stallTimeoutId = null; }
      if (PlayerErrorLogger.logs.length > 0) {
        const lastUnfixed = [...PlayerErrorLogger.getUnfixed()].reverse()[0];
        if (lastUnfixed) {
          PlayerErrorLogger.markFixed(lastUnfixed.time);
          console.log(`%c[MQ-Player] Fixed: %c${lastUnfixed.track}`, "color:#22c55e;font-weight:bold", "color:#94a3b8");
        }
      }
      resumeAudioContext();
      const st = useAppStore.getState();
      // Update playback state — do NOT call play() here.
      // The isPlaying effect (which depends on isLoadingTrack) will detect
      // that loading finished and call play() centrally, eliminating race
      // conditions between multiple play() calls.
      useAppStore.setState({ playbackState: st.isPlaying ? 'playing' : 'paused', isBuffering: false });
    };

    const onPlaying = (e: Event) => {
      setIsLoadingTrack(false);
      setPlayError(false);
      retryCountRef.current = 0;
      if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
      if (stallTimeoutId) { clearTimeout(stallTimeoutId); stallTimeoutId = null; }
      const lastUnfixed = [...PlayerErrorLogger.getUnfixed()].reverse()[0];
      if (lastUnfixed) {
        PlayerErrorLogger.markFixed(lastUnfixed.time);
        console.log(`%c[MQ-Player] Playing: %c${lastUnfixed.track}`, "color:#22c55e;font-weight:bold", "color:#94a3b8");
      }
      resumeAudioContext();
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;
      // Sync store state with actual audio state.
      // Do NOT write isPlaying: true back to the store from audio events —
      // that creates a feedback loop with the isPlaying effect (React #310).
      // The store's isPlaying is the source of truth; audio follows it, not the reverse.
      if (!useAppStore.getState().isPlaying) {
        // Audio started playing but store says paused — pause the audio
        // to stay consistent with the store's intent.
        const a = getActive();
        if (a) a.pause();
      } else {
        useAppStore.setState({ playbackState: 'playing', isBuffering: false });
      }
      crossfadeRef.current = false;

      // ── ReplayGain (M5.1) ──
      // Apply genre-based gain normalization when enabled.
      const rgEnabled = useAppStore.getState().replayGainEnabled;
      const audioEl = getAudioElement();
      if (rgEnabled && audioEl) {
        const track = useAppStore.getState().currentTrack;
        if (track) {
          const defaultGain = getDefaultGainForGenre(track.genre || "");
          replayGain.attach(audioEl);
          replayGain.setEnabled(true);
          replayGain.setBaseVolume(audioEl.volume);
          replayGain.applyGain(defaultGain);
        }
      } else {
        replayGain.setEnabled(false);
      }
    };

    let loadingTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let stallTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const startLoadingTimeout = (generation: number) => {
      if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
      loadingTimeoutId = setTimeout(() => {
        if (loadGenerationRef.current !== generation) return;
        const st = useAppStore.getState();
        if (st.currentTrack && !playErrorRef.current && isLoadingTrackRef.current) {
          const a = getActive();
          if (a && (a.readyState < 2 || a.paused) && st.isPlaying) {
            console.warn("[Player] Loading timeout — forcing retry");
            PlayerErrorLogger.log(st.currentTrack?.title || "unknown", "Loading timeout (10s)", "force retry");
            if (st.currentTrack?.scTrackId && !retryingRef.current) {
              retryingRef.current = true;
              resolveSoundCloudStream(st.currentTrack.scTrackId).then(async (stream) => {
                retryingRef.current = false;
                if (!stream?.url || !a) return;
                if (useAppStore.getState().currentTrack?.scTrackId !== st.currentTrack?.scTrackId) return;
                currentStreamEmeRef.current = stream.isEncrypted && stream.licenseUrl
                  ? { isEncrypted: stream.isEncrypted, protocol: stream.protocol || '', licenseUrl: stream.licenseUrl }
                  : null;
                let activeEl = a;
                const prevHls = (activeEl as any)._hlsInstance;
                if (prevHls) { try { prevHls.destroy(); } catch {} delete (activeEl as any)._hlsInstance; }
                activeEl.crossOrigin = 'anonymous';
                if (stream.isHls && Hls.isSupported()) {
                  const hlsConfig = buildEmeHlsConfig(stream);
                  if (stream.isEncrypted) {
                    activeEl = prepareEncryptedElement(activeEl);
                    const origXhrSetup = hlsConfig.xhrSetup;
                    const manifestInterceptor = createManifestInterceptor(activeEl);
                    hlsConfig.xhrSetup = function (xhr: XMLHttpRequest, url: string) {
                      manifestInterceptor(xhr, url);
                      if (origXhrSetup) origXhrSetup(xhr, url);
                    };
                  } else {
                    ensureWebAudioConnected(activeEl);
                  }
                  const hls = new Hls(hlsConfig);
                  hls.loadSource(stream.url);
                  hls.attachMedia(activeEl);
                  hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setIsLoadingTrack(false);
                    activeEl.play().catch(() => {});
                  });
                  hls.on(Hls.Events.ERROR, (_ev, data) => {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                      hls.startLoad();
                    } else if (data.fatal) {
                      console.error("[Player] HLS fatal after loading timeout retry:", data.type, data.details);
                      hls.destroy(); delete (activeEl as any)._hlsInstance;
                      setIsLoadingTrack(false);
                      setPlayError(true);
                      prevTrackIdForCrossfade.current = null;
                      setTimeout(() => nextTrackRef.current(), 1500);
                    }
                  });
                  (activeEl as any)._hlsInstance = hls;
                } else {
                  const timeoutPlayUrl = proxyStreamUrl(stream.url);
                  activeEl.src = timeoutPlayUrl;
                  activeEl.load();
                  activeEl.play().catch(() => {});
                }
              }).catch(() => {
                retryingRef.current = false;
                a.play().then(() => {}).catch(() => {});
              });
            } else {
              a.play().then(() => {
                console.log("[Player] Force play succeeded after timeout");
              }).catch(() => {});
            }
          }
        }
      }, 10000);
    };

    const onWaiting = (e: Event) => {
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;
      useAppStore.setState({ playbackState: 'buffering', isBuffering: true });
      if (!isLoadingTrackRef.current && useAppStore.getState().isPlaying) {
        if (stallTimeoutId) clearTimeout(stallTimeoutId);
        stallTimeoutId = setTimeout(() => {
          const a = getActive();
          if (a && a.paused && useAppStore.getState().isPlaying && !playErrorRef.current) {
            console.warn("[Player] Stall detected (8s) — forcing retry");
            PlayerErrorLogger.log(useAppStore.getState().currentTrack?.title || "unknown", "Stall timeout (8s)", "force retry");
            const st = useAppStore.getState();
            if (st.currentTrack?.scTrackId && !retryingRef.current) {
              retryingRef.current = true;
              resolveSoundCloudStream(st.currentTrack.scTrackId).then(async (stream) => {
                retryingRef.current = false;
                if (!stream?.url || !a) {
                  setPlayError(true);
                  setTimeout(() => nextTrackRef.current(), 1500);
                  return;
                }
                if (useAppStore.getState().currentTrack?.scTrackId !== st.currentTrack?.scTrackId) return;
                currentStreamEmeRef.current = stream.isEncrypted && stream.licenseUrl
                  ? { isEncrypted: stream.isEncrypted, protocol: stream.protocol || '', licenseUrl: stream.licenseUrl }
                  : null;
                let activeEl = a;
                const prevHls = (activeEl as any)._hlsInstance;
                if (prevHls) { try { prevHls.destroy(); } catch {} delete (activeEl as any)._hlsInstance; }
                activeEl.crossOrigin = 'anonymous';
                if (stream.isHls && Hls.isSupported()) {
                  const hlsConfig = buildEmeHlsConfig(stream);
                  if (stream.isEncrypted) {
                    activeEl = prepareEncryptedElement(activeEl);
                    const origXhrSetup = hlsConfig.xhrSetup;
                    const manifestInterceptor = createManifestInterceptor(activeEl);
                    hlsConfig.xhrSetup = function (xhr: XMLHttpRequest, url: string) {
                      manifestInterceptor(xhr, url);
                      if (origXhrSetup) origXhrSetup(xhr, url);
                    };
                  } else {
                    ensureWebAudioConnected(activeEl);
                  }
                  const hls = new Hls(hlsConfig);
                  hls.loadSource(stream.url);
                  hls.attachMedia(activeEl);
                  hls.on(Hls.Events.MANIFEST_PARSED, () => { activeEl.play().catch(() => {}); });
                  hls.on(Hls.Events.ERROR, (_ev, data) => {
                    if (data.fatal) {
                      console.error("[Player] HLS fatal error after stall retry:", data.type, data.details);
                      hls.destroy(); delete (activeEl as any)._hlsInstance;
                      setPlayError(true);
                      prevTrackIdForCrossfade.current = null;
                      setTimeout(() => nextTrackRef.current(), 1500);
                    }
                  });
                  (activeEl as any)._hlsInstance = hls;
                } else {
                  const stallPlayUrl = proxyStreamUrl(stream.url);
                  activeEl.src = stallPlayUrl;
                  activeEl.load();
                  activeEl.play().catch(() => {});
                }
              }).catch(() => {
                retryingRef.current = false;
                setPlayError(true);
                setTimeout(() => nextTrackRef.current(), 1500);
              });
            } else {
              setPlayError(true);
              setTimeout(() => nextTrackRef.current(), 1500);
            }
          }
        }, 8000);
      }
    };

    // Immediately re-apply volume when a new track starts loading.
    // HTML5 <audio> resets volume to 1.0 when .src changes — this prevents
    // a brief loud burst before the volume useEffect runs.
    const onLoadStart = () => {
      const a = getActive();
      if (a) {
        const vol = Math.pow(useAppStore.getState().volume / 100, 2);
        a.volume = vol;
      }
      // Also reset loading state for the new track
      setPlayError(false);
    };

    const addListeners = (el: HTMLAudioElement) => {
      el.addEventListener("timeupdate", onTimeUpdate);
      el.addEventListener("loadedmetadata", onLoaded);
      el.addEventListener("canplay", onCanPlay);
      el.addEventListener("durationchange", onLoaded);
      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);
      el.addEventListener("playing", onPlaying);
      el.addEventListener("waiting", onWaiting);
      el.addEventListener("loadstart", onLoadStart);
    };
    const removeListeners = (el: HTMLAudioElement) => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("durationchange", onLoaded);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("loadstart", onLoadStart);
    };

    startLoadingTimeoutRef.current = startLoadingTimeout;

    addListeners(audio);
    const secondary = getInactiveAudio();
    if (secondary) addListeners(secondary);
    // Keep the unsub reference so we can tear it down on cleanup
    const unsubReplaced = onAudioElementReplaced(addListeners);

    clearLoadingTimeoutRef.current = () => {
      if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
      if (stallTimeoutId) { clearTimeout(stallTimeoutId); stallTimeoutId = null; }
    };

    // IMPORTANT: We intentionally do NOT clean up event listeners or pause audio
    // on unmount. The playback engine must persist across React re-renders and
    // route changes. If the component unmounts (e.g. Suspense fallback), audio
    // should continue playing uninterrupted. Listeners are only cleaned up on
    // full page unload (beforeunload), not on React component unmount.
    return () => {
      if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
      if (stallTimeoutId) { clearTimeout(stallTimeoutId); stallTimeoutId = null; }
      // Unsubscribe the element-replaced callback to avoid accumulation if the
      // effect ever re-runs (e.g. React StrictMode double-invoke).
      unsubReplaced();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Page unload cleanup: release audio resources when tab closes ──
  useEffect(() => {
    const handleUnload = () => {
      const audio = getAudioElement();
      const secondary = getInactiveAudio();
      const destroyHls = (el: HTMLAudioElement) => {
        const hls = (el as any)._hlsInstance;
        if (hls) { try { hls.destroy(); } catch {} delete (el as any)._hlsInstance; }
      };
      destroyHls(audio);
      if (secondary) destroyHls(secondary);
      audio.pause();
      audio.src = "";
      if (secondary) { secondary.pause(); secondary.src = ""; }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // ── Load track effect ──
  useEffect(() => {
    if (!currentTrack) {
      setPlaybackMode("idle");
      setIsLoadingTrack(false);
      return;
    }

    if (currentTrack.id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = currentTrack.id;
      setProgress(0);
      setDuration(currentTrack.duration || 0);
      retryCountRef.current = 0;
    }

    let cancelled = false;
    const pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

    loadGenerationRef.current++;
    const currentGeneration = loadGenerationRef.current;

    const tryFallbackStream = async (audioEl: HTMLAudioElement, track: typeof currentTrack, isCancelled: boolean): Promise<boolean> => {
      const fallbacks = fallbackStreamsRef.current;
      if (!fallbacks || fallbacks.length === 0 || isCancelled) return false;

      const fallback = fallbacks[0];
      console.warn(`[Player] Primary stream failed, trying fallback: ${fallback.protocol} (${fallback.isEncrypted ? 'encrypted' : 'plain'})`);

      fallbackStreamsRef.current = fallbacks.slice(1);

      let activeEl = audioEl;

      const prevHls = (activeEl as any)._hlsInstance;
      if (prevHls) { try { prevHls.destroy(); } catch {} delete (activeEl as any)._hlsInstance; }

      activeEl.crossOrigin = 'anonymous';

      if (fallback.isHls && Hls.isSupported()) {
        const hlsConfig = buildEmeHlsConfig(fallback);

        if (fallback.isEncrypted) {
          activeEl = prepareEncryptedElement(activeEl);
          const origXhrSetup = hlsConfig.xhrSetup;
          const manifestInterceptor = createManifestInterceptor(activeEl);
          hlsConfig.xhrSetup = function (xhr: XMLHttpRequest, url: string) {
            manifestInterceptor(xhr, url);
            if (origXhrSetup) origXhrSetup(xhr, url);
          };
        } else {
          ensureWebAudioConnected(activeEl);
        }

        const hls = new Hls(hlsConfig);
        hls.loadSource(fallback.url);
        hls.attachMedia(activeEl);

        const fbTimeout = setTimeout(() => {
          if (activeEl.paused && !activeEl.currentTime && !isCancelled) {
            console.error("[Player] Fallback stream manifest timeout — giving up");
            hls.destroy(); delete (activeEl as any)._hlsInstance;
            setIsLoadingTrack(false);
            setPlayError(true);
            prevTrackIdForCrossfade.current = null;
            setTimeout(() => nextTrackRef.current(), 1500);
          }
        }, 10000);
        pendingTimeouts.push(fbTimeout);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          clearTimeout(fbTimeout);
          if (!isCancelled) {
            setIsLoadingTrack(false);
            setPlayError(false);
            resumeAudioContext();
            activeEl.play().catch((err) => {
              if (err.name !== "NotAllowedError") {
                console.error("[Player] Fallback play() failed:", err.name, err.message);
              }
            });
          }
        });

        hls.on(Hls.Events.ERROR, async (_ev, data) => {
          clearTimeout(fbTimeout);
          if (data.fatal) {
            console.error("[Player] Fallback HLS also failed:", data.type, data.details);
            hls.destroy(); delete (activeEl as any)._hlsInstance;
            if (await tryFallbackStream(activeEl, track, isCancelled)) return;
            setIsLoadingTrack(false);
            setPlayError(true);
            prevTrackIdForCrossfade.current = null;
            setTimeout(() => nextTrackRef.current(), 1500);
          }
        });

        (activeEl as any)._hlsInstance = hls;
      } else {
        activeEl.src = fallback.url;
        activeEl.load();
        activeEl.play().catch(() => {});
      }

      PlayerErrorLogger.log(track?.title || "unknown", `Fallback to ${fallback.protocol}`, "fallback");
      return true;
    };

    const loadTrack = async () => {
      try {
        setIsLoadingTrack(true);
        setPlayError(false);
        retryCountRef.current = 0;
        fallbackStreamsRef.current = null;
        if (startLoadingTimeoutRef.current) startLoadingTimeoutRef.current(currentGeneration);

        const preloadedTrackId = getGaplessPreloadedTrackId();
        const isGaplessPreloaded = preloadedTrackId === currentTrack.id
          && isGaplessEnabled()
          && prevTrackIdForCrossfade.current !== null
          && prevTrackIdForCrossfade.current !== currentTrack.id
          && useAppStore.getState().isPlaying;

        if (isGaplessPreloaded) {
          const inactiveEl = getInactiveAudio();
          if (inactiveEl && (inactiveEl.readyState >= 2 || (inactiveEl as any)._hlsInstance)) {
            console.log("[Gapless] Using preloaded track for instant transition:", currentTrack.title);

            const hlsInstance = (inactiveEl as any)._hlsInstance;
            if (hlsInstance) {
              crossfadeRef.current = true;
              crossfadeToGapless(inactiveEl);
              resumeAudioContext();
              inactiveEl.play().catch((err) => {
                if (err.name !== "NotAllowedError") {
                  console.error("[Gapless] play() failed:", err.name, err.message);
                }
              });
            } else {
              crossfadeRef.current = true;
              crossfadeToGapless(inactiveEl);
              resumeAudioContext();
              inactiveEl.play().catch((err) => {
                if (err.name !== "NotAllowedError") {
                  console.error("[Gapless] play() failed:", err.name, err.message);
                }
              });
            }

            prevTrackIdForCrossfade.current = currentTrack.id;
            setIsLoadingTrack(false);
            setPlayError(false);
            retryCountRef.current = 0;

            gaplessPreloadStartedRef.current = false;
            gaplessPreloadedTrackRef.current = null;

            return;
          } else {
            console.log("[Gapless] Preload not ready, falling back to normal load");
            clearGaplessPreload();
          }
        }

        if (preloadedTrackId !== currentTrack.id) {
          clearGaplessPreload();
        }
        gaplessPreloadStartedRef.current = false;
        gaplessPreloadedTrackRef.current = null;

        const canCrossfade = prevTrackIdForCrossfade.current !== null
          && prevTrackIdForCrossfade.current !== currentTrack.id
          && useAppStore.getState().isPlaying
          && useAppStore.getState().crossfadeEnabled;

        const _initialAudioEl = canCrossfade ? getInactiveAudio() : getAudioElement();
        if (!_initialAudioEl) return;
        let audioEl: HTMLAudioElement = _initialAudioEl;
        audioEl.pause();

        const prevHls = (audioEl as any)._hlsInstance;
        if (prevHls) { try { prevHls.destroy(); } catch {} delete (audioEl as any)._hlsInstance; }

        if (cancelled) return;

        if (currentTrack.source === "demo" && currentTrack.audioUrl) {
          setPlaybackMode("soundcloud");
          resetCorsState();
          ensureWebAudioConnected(audioEl);
          audioEl.src = currentTrack.audioUrl;
          // Re-apply volume after track change (audio element resets to 1.0 on new src)
          audioEl.volume = Math.pow(useAppStore.getState().volume / 100, 2);
          audioEl.load();
          if (canCrossfade) {
            crossfadeRef.current = true;
            if (useAppStore.getState().isPlaying) audioEl.play().catch(() => {});
            crossfadeTo(audioEl);
          } else {
            cancelCrossfade();
            if (useAppStore.getState().isPlaying) audioEl.play().catch(() => {});
          }
          prevTrackIdForCrossfade.current = currentTrack.id;
        } else if (currentTrack.source === "soundcloud" && currentTrack.scTrackId) {
          setPlaybackMode("soundcloud");
          resetCorsState();

          const stream = await resolveSoundCloudStream(currentTrack.scTrackId);
          if (cancelled) return;

          if (stream && stream.url) {
            fallbackStreamsRef.current = stream.fallbackStreams || null;
            currentStreamEmeRef.current = stream.isEncrypted && stream.licenseUrl
              ? { isEncrypted: stream.isEncrypted, protocol: stream.protocol || '', licenseUrl: stream.licenseUrl }
              : null;
            const isHlsStream = stream.isHls && Hls.isSupported();

            if (isHlsStream) {
              audioEl.crossOrigin = "anonymous";

              const hlsConfig = buildEmeHlsConfig(stream);

              if (stream.isEncrypted) {
                console.log("[Player] Encrypted stream detected — HLS.js EME enabled, preparing element");
                console.log("[Player]   protocol:", stream.protocol, "| hasLicenseUrl:", !!stream.licenseUrl, "| hasAuthToken:", !!stream.licenseAuthToken);
                audioEl = prepareEncryptedElement(audioEl);

                const origXhrSetup = hlsConfig.xhrSetup;
                const manifestInterceptor = createManifestInterceptor(audioEl);
                hlsConfig.xhrSetup = function (xhr: XMLHttpRequest, url: string) {
                  manifestInterceptor(xhr, url);
                  if (origXhrSetup) origXhrSetup(xhr, url);
                };
              } else {
                ensureWebAudioConnected(audioEl);
              }

              const hls = new Hls(hlsConfig);
              hls.loadSource(stream.url);
              hls.attachMedia(audioEl);

              const hlsManifestTimeout = setTimeout(async () => {
                if (!cancelled && audioEl.paused && !audioEl.currentTime) {
                  console.error("[Player] HLS manifest parse timeout — trying fallback");
                  try { hls.destroy(); } catch {}
                  delete (audioEl as any)._hlsInstance;
                  prevTrackIdForCrossfade.current = null;
                  if (!(await tryFallbackStream(audioEl, currentTrack, cancelled))) {
                    setIsLoadingTrack(false);
                    setPlayError(true);
                    PlayerErrorLogger.log(currentTrack?.title || "unknown", "HLS manifest timeout (15s)", "skip");
                    pendingTimeouts.push(setTimeout(() => nextTrackRef.current(), 1500));
                  }
                }
              }, 15000);
              pendingTimeouts.push(hlsManifestTimeout);

              hls.on(Hls.Events.KEY_LOADING, (_event, data) => {
                console.log("[Player] DRM key loading:", data.frag?.url?.slice(-40));
              });
              hls.on(Hls.Events.KEY_LOADED, (_event, data) => {
                console.log("[Player] DRM key acquired:", data.frag?.url?.slice(-40));
              });
              hls.on(Hls.Events.FRAG_DECRYPTED, (_event, data) => {
                console.log("[Player] Segment decrypted OK:", data.frag?.url?.slice(-40));
              });
              // @ts-expect-error KEY_STATUS may not be in all hls.js versions
              hls.on(Hls.Events.KEY_STATUS, (_event, data: any) => {
                if (data.status !== "usable") {
                  console.warn("[Player] DRM key status:", data.status, "for", data.frag?.url?.slice(-40));
                }
              });

              const drmTimeout = setTimeout(() => {
                if (audioEl.paused && !audioEl.currentTime && !cancelled) {
                  console.error("[Player] DRM playback timeout — license may be invalid");
                  setIsLoadingTrack(false);
                  setPlayError(true);
                  prevTrackIdForCrossfade.current = null;
                  try { hls.destroy(); } catch {}
                  delete (audioEl as any)._hlsInstance;
                  PlayerErrorLogger.log(currentTrack?.title || "unknown", "DRM timeout (25s)", "skip");
                  pendingTimeouts.push(setTimeout(() => nextTrackRef.current(), 2000));
                }
              }, 25000);
              pendingTimeouts.push(drmTimeout);

              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (!cancelled) {
                  clearTimeout(hlsManifestTimeout);
                  const clearT = () => { clearTimeout(drmTimeout); };
                  audioEl.addEventListener("playing", clearT, { once: true });

                  // Re-apply volume after HLS manifest loads (audio element may reset volume)
                  audioEl.volume = Math.pow(useAppStore.getState().volume / 100, 2);

                  if (canCrossfade) {
                    crossfadeRef.current = true;
                    crossfadeTo(audioEl);
                  } else {
                    cancelCrossfade();
                  }

                  resumeAudioContext();
                  if (useAppStore.getState().isPlaying) {
                    audioEl.play().catch((err) => {
                      if (err.name === "NotAllowedError") {
                        console.warn("[Player] Autoplay blocked — need user gesture");
                      } else {
                        console.error("[Player] play() failed:", err.name, err.message);
                      }
                    });
                  }
                  prevTrackIdForCrossfade.current = currentTrack.id;
                }
              });

              hls.on(Hls.Events.ERROR, async (_event, data) => {
                if (data.type === Hls.ErrorTypes.KEY_SYSTEM_ERROR) {
                  console.error("[Player] DRM/Key system error:", data.details, data.fatal);
                  clearTimeout(drmTimeout);
                  if (await tryFallbackStream(audioEl, currentTrack, cancelled)) return;
                  if (!retryingRef.current && currentTrack.scTrackId) {
                    retryingRef.current = true;
                    console.warn("[Player] DRM failed, all fallbacks exhausted — re-resolving stream...");
                    resolveSoundCloudStream(currentTrack.scTrackId).then(async (freshStream) => {
                      retryingRef.current = false;
                      if (cancelled) return;
                      if (freshStream && freshStream.url) {
                        currentStreamEmeRef.current = freshStream.isEncrypted && freshStream.licenseUrl
                          ? { isEncrypted: freshStream.isEncrypted, protocol: freshStream.protocol || '', licenseUrl: freshStream.licenseUrl }
                          : null;
                        fallbackStreamsRef.current = freshStream.fallbackStreams || null;
                        let activeEl = audioEl;
                        const prevHls = (activeEl as any)._hlsInstance;
                        if (prevHls) { try { prevHls.destroy(); } catch {} delete (activeEl as any)._hlsInstance; }
                        activeEl.crossOrigin = 'anonymous';
                        const fbConfig = buildEmeHlsConfig(freshStream);
                        if (freshStream.isEncrypted) {
                          activeEl = prepareEncryptedElement(activeEl);
                          const origXhrSetup = fbConfig.xhrSetup;
                          const manifestInterceptor = createManifestInterceptor(activeEl);
                          fbConfig.xhrSetup = function (xhr: XMLHttpRequest, url: string) {
                            manifestInterceptor(xhr, url);
                            if (origXhrSetup) origXhrSetup(xhr, url);
                          };
                        } else {
                          ensureWebAudioConnected(activeEl);
                        }
                        const fbHls = new Hls(fbConfig);
                        fbHls.loadSource(freshStream.url);
                        fbHls.attachMedia(activeEl);
                        (activeEl as any)._hlsInstance = fbHls;
                        fbHls.on(Hls.Events.MANIFEST_PARSED, () => {
                          if (!cancelled) {
                            resumeAudioContext();
                            if (useAppStore.getState().isPlaying) activeEl.play().catch(() => {});
                          }
                        });
                        fbHls.on(Hls.Events.ERROR, (_ev2, data2) => {
                          if (data2.fatal) {
                            fbHls.destroy(); delete (activeEl as any)._hlsInstance;
                            setIsLoadingTrack(false); setPlayError(true);
                            prevTrackIdForCrossfade.current = null;
                            setTimeout(() => nextTrackRef.current(), 1500);
                          }
                        });
                      } else {
                        setIsLoadingTrack(false); setPlayError(true);
                        prevTrackIdForCrossfade.current = null;
                        setTimeout(() => nextTrackRef.current(), 2000);
                      }
                    }).catch(() => {
                      setIsLoadingTrack(false); setPlayError(true);
                      setTimeout(() => nextTrackRef.current(), 2000);
                    });
                  } else {
                    setIsLoadingTrack(false);
                    setPlayError(true);
                    prevTrackIdForCrossfade.current = null;
                    setTimeout(() => nextTrackRef.current(), 2000);
                  }
                  return;
                }
                if (data.fatal) {
                  console.error("[Player] HLS fatal error:", data.type, data.details);
                  clearTimeout(drmTimeout);
                  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    console.warn("[Player] Attempting HLS network recovery...");
                    if (await tryFallbackStream(audioEl, currentTrack, cancelled)) return;
                    hls.startLoad();
                  } else {
                    if (await tryFallbackStream(audioEl, currentTrack, cancelled)) return;
                    hls.destroy();
                    delete (audioEl as any)._hlsInstance;
                    setIsLoadingTrack(false);
                    setPlayError(true);
                    prevTrackIdForCrossfade.current = null;
                    PlayerErrorLogger.log(currentTrack?.title || "unknown", `HLS fatal: ${data.type}/${data.details}`, "skip");
                    setTimeout(() => nextTrackRef.current(), 1500);
                  }
                }
              });
              (audioEl as any)._hlsInstance = hls;
              if (canCrossfade) {
                // Wait for MANIFEST_PARSED event above
              } else {
                // Wait for MANIFEST_PARSED event above
              }
            } else {
              audioEl.crossOrigin = "anonymous";
              const playUrl = proxyStreamUrl(stream.url);
              audioEl.src = playUrl;
              // Re-apply volume after track change (audio element resets to 1.0 on new src)
              audioEl.volume = Math.pow(useAppStore.getState().volume / 100, 2);

              let loadFailed = false;
              await new Promise<void>((resolve) => {
                const onCanPlay = () => {
                  audioEl.removeEventListener("canplay", onCanPlay);
                  audioEl.removeEventListener("error", onError);
                  resolve();
                };
                const onError = () => {
                  audioEl.removeEventListener("canplay", onCanPlay);
                  audioEl.removeEventListener("error", onError);
                  loadFailed = true;
                  resolve();
                };
                audioEl.addEventListener("canplay", onCanPlay);
                audioEl.addEventListener("error", onError);
                audioEl.load();
                setTimeout(resolve, 5000);
              });

              if (cancelled) return;

              if (loadFailed) {
                if (!retryingRef.current) {
                  setIsLoadingTrack(false);
                }
                return;
              }

              if (canCrossfade) {
                crossfadeRef.current = true;
                if (useAppStore.getState().isPlaying) audioEl.play().catch(() => {});
                crossfadeTo(audioEl);
                prevTrackIdForCrossfade.current = currentTrack.id;
              } else {
                cancelCrossfade();
                if (useAppStore.getState().isPlaying) audioEl.play().catch(() => {});
                prevTrackIdForCrossfade.current = currentTrack.id;
              }
            }
          } else if (currentTrack.audioUrl) {
            resetCorsState();
            audioEl.src = proxyStreamUrl(currentTrack.audioUrl);
            // Re-apply volume after track change (audio element resets to 1.0 on new src)
            audioEl.volume = Math.pow(useAppStore.getState().volume / 100, 2);
            audioEl.load();
            if (canCrossfade) {
              crossfadeRef.current = true;
              if (useAppStore.getState().isPlaying) audioEl.play().catch(() => {});
              crossfadeTo(audioEl);
            } else {
              cancelCrossfade();
              if (useAppStore.getState().isPlaying) audioEl.play().catch(() => {});
            }
            prevTrackIdForCrossfade.current = currentTrack.id;
          } else {
            console.warn(`[Player] No stream URL for SC track: ${currentTrack.title}`);
            setPlayError(true);
            setIsLoadingTrack(false);
            prevTrackIdForCrossfade.current = null;
            const isDrm = stream?.drmRestricted;
            PlayerErrorLogger.log(currentTrack.title || "unknown", isDrm ? "DRM restricted (no playable stream)" : "No stream URL", "skip");
            try {
              toast({
                title: "Трек недоступен",
                description: isDrm
                  ? `"${currentTrack.title || "неизвестный"}" — защищён DRM, воспроизведение невозможно`
                  : `Трек недоступен: ${currentTrack.title || "неизвестный"}`,
              });
            } catch {}
            setTimeout(() => nextTrackRef.current(), 1500);
          }
        } else if (currentTrack.audioUrl || currentTrack.id.startsWith("local_")) {
          setPlaybackMode("soundcloud");

          let audioSrc = currentTrack.audioUrl;
          if (currentTrack.id.startsWith("local_")) {
            const blobUrl = getLocalBlobUrl(currentTrack.id);
            if (blobUrl) {
              audioSrc = blobUrl;
            } else if (!audioSrc || audioSrc === "blob://client-side") {
              setPlayError(true);
              setIsLoadingTrack(false);
              try {
                toast({ title: "Ошибка воспроизведения", description: "Локальный файл не найден (перезагрузите страницу)" });
              } catch {}
              setTimeout(() => nextTrackRef.current(), 1500);
              return;
            }
          }

          audioEl.crossOrigin = "anonymous";
          resetCorsState();
          audioEl.src = audioSrc;
          // Re-apply volume after track change (audio element resets to 1.0 on new src)
          audioEl.volume = Math.pow(useAppStore.getState().volume / 100, 2);
          audioEl.load();
          if (canCrossfade) {
            crossfadeRef.current = true;
            if (useAppStore.getState().isPlaying) audioEl.play().catch(() => {});
            crossfadeTo(audioEl);
          } else {
            cancelCrossfade();
            if (useAppStore.getState().isPlaying) audioEl.play().catch(() => {});
          }
          prevTrackIdForCrossfade.current = currentTrack.id;
        } else {
          console.warn(`[Player] No audio source for track: ${currentTrack.title}`);
          setPlayError(true);
          setIsLoadingTrack(false);
          try {
            toast({ title: "Ошибка воспроизведения", description: `Нет источника: ${currentTrack.title || "неизвестный"}` });
          } catch {}
          setTimeout(() => nextTrackRef.current(), 1500);
        }
      } catch (err) {
        console.error("loadTrack error:", err);
        setPlayError(true);
        setIsLoadingTrack(false);
        try {
          toast({ title: "Ошибка воспроизведения", description: "Произошла ошибка при загрузке трека" });
        } catch {}
        setTimeout(() => nextTrackRef.current(), 2000);
      }
    };

    loadTrack();

    return () => { cancelled = true; pendingTimeouts.forEach(t => clearTimeout(t)); };
  }, [currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback rate effect ──
  useEffect(() => {
    if (!currentTrack?.id) return;
    setAudioPlaybackRate(playbackRate);
  }, [currentTrack?.id, playbackRate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── handlePrevTrack callback ──
  const handlePrevTrack = useCallback(() => {
    const st = useAppStore.getState();
    if (st.progress > 3) {
      const audio = getAudioElement();
      if (audio && audio.src) {
        audio.currentTime = 0;
      }
      const secondary = getInactiveAudio();
      if (secondary && secondary.src) {
        secondary.currentTime = 0;
      }
      st.setProgress(0);
    } else {
      st.prevTrack();
    }
  }, []);

  // ── isPlaying effect ──
  // This is the SINGLE source of truth for calling audio.play()/audio.pause().
  // togglePlay() in useAppStore ONLY flips the isPlaying flag — it does NOT
  // call audio.play()/audio.pause() directly. This eliminates race conditions
  // from multiple play() calls that cause AbortError and the "repeated pausing" bug.
  //
  // The effect depends on BOTH isPlaying AND isLoadingTrack so that it re-runs
  // when a track finishes loading (isLoadingTrack: true→false) while isPlaying
  // is true. This lets us centralize ALL play()/pause() calls here instead of
  // having onCanPlay or loadTrack call play() directly.
  //
  // NOTE: We deliberately do NOT toggle isPlaying back to false on NotAllowedError.
  // Doing so caused the "double-click bug": user clicks play → isPlaying flips to true →
  // browser blocks autoplay → isPlaying flips back to false → player bar appears paused
  // or invisible → user must click again. Instead, we keep isPlaying=true (the user's
  // intent) and this effect will retry play() when isLoadingTrack becomes false
  // (i.e., when track loading completes, which satisfies browser autoplay policy
  // since the load was initiated by a user gesture).
  useEffect(() => {
    const audio = getAudioElement();
    const secondary = getInactiveAudio();

    if (isPlaying) {
      resumeAudioContext();

      // Skip if we're in the middle of loading a new track.
      // The effect will re-run when isLoadingTrack becomes false.
      if (isLoadingTrackRef.current) return;

      // Skip if no source is loaded yet or audio isn't ready
      if (!audio.src || audio.readyState < 2) return;

      // Don't re-play if already playing (avoids AbortError from double play())
      if (!audio.paused) return;

      audio.play().then(() => {
        // Successfully started playing — update playback state
        useAppStore.setState({ playbackState: 'playing', isBuffering: false });
      }).catch((err) => {
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          // Real playback error — retry once after a short delay
          setTimeout(() => {
            const a = getAudioElement();
            if (a && useAppStore.getState().isPlaying) {
              a.play().then(() => {
                useAppStore.setState({ playbackState: 'playing', isBuffering: false });
              }).catch(() => {
                // If retry also fails, pause to avoid spinning forever
                useAppStore.setState({ playbackState: 'paused', isPlaying: false });
              });
            }
          }, 500);
        }
        // NotAllowedError: silently ignore — the effect will re-run when
        // isLoadingTrack becomes false, retrying play() after user-gesture load.
        // AbortError: also ignored — usually means a new load() interrupted play().
      });
    } else {
      if (audio.src) audio.pause();
      if (secondary && secondary.src) secondary.pause();
      useAppStore.setState({ playbackState: 'paused', isBuffering: false });
    }
  }, [isPlaying, isLoadingTrack]);

  // Start/stop RAF-based progress sync based on playback state
  useEffect(() => {
    if (isPlaying && !isLoadingTrack) {
      startProgressRAF();
    } else {
      stopProgressRAF();
    }
    return () => stopProgressRAF();
  }, [isPlaying, isLoadingTrack, startProgressRAF, stopProgressRAF]);

  // ── Volume effect ──
  // Re-apply volume whenever volume changes OR track changes (audio element resets to 1.0 on new src)
  useEffect(() => {
    const vol = Math.pow(volume / 100, 2);
    const audio = getAudioElement();
    if (audio) audio.volume = vol;
    const secondary = getInactiveAudio();
    if (secondary) secondary.volume = vol;
  }, [volume, currentTrack?.id]);

  return {
    isLoadingTrack,
    playError,
    isDragging,
    setIsDragging,
    handlePrevTrack,
    audioRef,
    canvasRef,
    progressRef,
    volumeRef,
    playerBarRef,
    registerProgressRAF,
  };
}
