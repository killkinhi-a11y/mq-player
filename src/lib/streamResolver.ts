/**
 * Stream Resolver — extracted from useAudioEngine.ts
 *
 * Pure utility functions for resolving and configuring audio streams
 * (SoundCloud HLS, EME/DRM, proxy URLs). No React dependencies.
 *
 * The PlaybackEngine imports from here instead of from the React hook file.
 */

import Hls from "hls.js";
import type { HlsConfig } from "hls.js";
import {
  replaceAudioElement,
  connectElementToAudioGraph,
} from "@/lib/audioEngine";

// ── Types ──

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

// ── Stream Resolution ──

export async function resolveSoundCloudStream(
  scTrackId: number,
): Promise<StreamResult | null> {
  try {
    const res = await fetch(
      `/api/music/soundcloud/stream?trackId=${scTrackId}`,
      { signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) {
      console.error(
        `[resolveStream] HTTP ${res.status} for track ${scTrackId}`,
      );
      return null;
    }
    const data = await res.json();

    console.log(
      `[resolveStream] track=${scTrackId}, url=${data.url ? "yes" : "no"}, resolveUrl=${data.resolveUrl ? "yes" : "no"}, error=${data.error || "none"}, protocol=${data.protocol}, isHls=${data.isHls}, isEncrypted=${data.isEncrypted}, policy=${data.isPreview ? "SNIP" : "ALLOW"}, fallbacks=${(data.fallbackStreams || []).length}`,
    );
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
      console.warn(
        "[Player] Edge resolve failed, trying CORS proxy...",
      );
      try {
        let proxyUrl = `/api/music/soundcloud/resolve-proxy?url=${encodeURIComponent(data.resolveUrl)}`;
        if (data.trackAuthorization) {
          proxyUrl += `&track_authorization=${encodeURIComponent(data.trackAuthorization)}`;
        }
        const proxyRes = await fetch(proxyUrl, {
          signal: AbortSignal.timeout(10000),
        });
        if (proxyRes.ok) {
          const proxyData = await proxyRes.json();
          if (proxyData.url) {
            console.log(
              `[resolveStream] CORS proxy succeeded: url=${proxyData.url.substring(0, 60)}...`,
            );
            return {
              url: proxyData.url,
              isPreview: !!data.isPreview,
              duration: data.duration || 0,
              fullDuration: data.fullDuration || 0,
              isHls: !!data.isHls,
              isEncrypted: !!data.isEncrypted,
              protocol: data.protocol || null,
              licenseUrl: data.licenseUrl || null,
              licenseAuthToken:
                data.licenseAuthToken || proxyData.licenseAuthToken || null,
            };
          }
        }
      } catch {
        // CORS proxy failed too
      }
    }

    const diagInfo = data._diag
      ? ` | diag: ${(data._diag as string[]).join(", ")}`
      : "";
    console.error(
      `[resolveStream] No URL for track ${scTrackId}: error=${data.error || "none"}, resolveUrl=${data.resolveUrl ? "yes" : "no"}${diagInfo}`,
    );
    return null;
  } catch (err) {
    console.warn("[resolveSoundCloudStream] failed:", err);
    return null;
  }
}

// ── EME / DRM Helpers ──

const _isFirefox =
  typeof navigator !== "undefined" && /Firefox/i.test(navigator.userAgent);

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
  const scDomainPatterns = [
    "sndcdn.com",
    "soundcloud.cloud",
    "soundcloud.com",
  ];
  config.xhrSetup = function (xhr: XMLHttpRequest, url: string) {
    if (scDomainPatterns.some((domain) => url.includes(domain))) {
      xhr.open(
        "GET",
        `${cdnProxy}?url=${encodeURIComponent(url)}`,
        true,
      );
    }
  };

  if (stream.isEncrypted && stream.licenseUrl) {
    config.emeEnabled = true;
    const proxyParams = new URLSearchParams();
    proxyParams.set("licenseUrl", stream.licenseUrl);
    if (stream.licenseAuthToken) {
      proxyParams.set("licenseAuthToken", stream.licenseAuthToken);
    }
    config.widevineLicenseUrl =
      "/api/music/soundcloud/license-proxy?" + proxyParams.toString();
  } else {
    config.emeEnabled = false;
  }

  return config;
}

export function prepareEncryptedElement(
  el: HTMLAudioElement,
): HTMLAudioElement {
  if (!_isFirefox) return el;
  if ((el as any).mozAudioCaptured) {
    console.log(
      "[Player] Firefox: replacing Web Audio captured element for EME compatibility",
    );
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
    0xed, 0xef, 0x8b, 0xa9, 0x79, 0xd6, 0x4a, 0xce, 0xa3, 0xc8, 0x27, 0xdc,
    0xd5, 0x1d, 0x21, 0xed,
  ]);
  const psshSize = 4 + 4 + 4 + 4 + 16 + 4 + 16;
  const pssh = new Uint8Array(psshSize);
  const dv = new DataView(pssh.buffer);
  dv.setUint32(0, psshSize, false);
  pssh[4] = 0x70;
  pssh[5] = 0x73;
  pssh[6] = 0x73;
  pssh[7] = 0x68;
  dv.setUint32(8, 1, false);
  dv.setUint32(12, 0, false);
  pssh.set(WIDEVINE_SYSTEM_ID, 16);
  dv.setUint32(32, 1, false);
  pssh.set(keyId, 36);
  return pssh;
}

export async function setupManualEME(
  audioEl: HTMLAudioElement,
  stream: {
    isEncrypted?: boolean;
    protocol?: string | null;
    licenseUrl?: string | null;
    licenseAuthToken?: string | null;
  },
): Promise<HTMLAudioElement | null> {
  if (!stream.isEncrypted || !stream.licenseUrl) {
    return null;
  }

  const keySystem =
    stream.protocol === "cbc-encrypted-hls"
      ? "com.apple.fps"
      : "com.widevine.alpha";

  const licenseProxyParams = new URLSearchParams();
  licenseProxyParams.set("licenseUrl", stream.licenseUrl);
  if (stream.licenseAuthToken) {
    licenseProxyParams.set("licenseAuthToken", stream.licenseAuthToken);
  }
  const licenseProxyUrl =
    "/api/music/soundcloud/license-proxy?" + licenseProxyParams.toString();

  try {
    if (!navigator.requestMediaKeySystemAccess) return null;

    let keySystemAccess: MediaKeySystemAccess;
    try {
      keySystemAccess = await navigator.requestMediaKeySystemAccess(
        keySystem,
        [
          {
            initDataTypes: ["cenc"],
            audioCapabilities: [
              {
                contentType: 'audio/mp4; codecs="mp4a.40.2"',
                robustness: "SW_SECURE_CRYPTO",
              },
            ],
          },
        ],
      );
    } catch {
      return null;
    }

    const newMediaKeys = await keySystemAccess.createMediaKeys();
    let mediaKeys: MediaKeys;
    let targetEl: HTMLAudioElement = audioEl;

    try {
      const existingKeys = audioEl.mediaKeys;
      if (existingKeys) {
        mediaKeys = existingKeys;
      } else {
        await audioEl.setMediaKeys(newMediaKeys);
        mediaKeys = newMediaKeys;
      }
    } catch (e: any) {
      if (e?.name === "NotSupportedError" && audioEl.mediaKeys) {
        mediaKeys = audioEl.mediaKeys;
      } else if (e?.name === "NotSupportedError") {
        try {
          targetEl = replaceAudioElement(audioEl);
          await targetEl.setMediaKeys(newMediaKeys);
          mediaKeys = newMediaKeys;
          connectElementToAudioGraph(targetEl);
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }

    // Clean up previous handlers
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

      let session: MediaKeySession;
      try {
        session = mediaKeys.createSession();
      } catch {
        return;
      }

      try {
        if (!event.initData) return;
        await session.generateRequest(event.initDataType, event.initData);
      } catch {
        return;
      }

      session.addEventListener(
        "message",
        async (msgEvent: MediaKeyMessageEvent) => {
          try {
            const response = await fetch(licenseProxyUrl, {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: msgEvent.message,
            });
            if (!response.ok) return;
            const license = await response.arrayBuffer();
            if (license.byteLength === 0) return;
            try {
              await session.update(new Uint8Array(license));
            } catch {}
          } catch {}
        },
      );

      session.addEventListener("keystatuseschange", () => {
        session.keyStatuses.forEach((status: MediaKeyStatus) => {
          if (status === "usable") {
            console.log("[ManualEME] Key is usable");
          }
        });
      });
    };
    targetEl.addEventListener("encrypted", encryptedHandler);
    (targetEl as any)._emeEncryptedHandler = encryptedHandler;

    const psshTimeout = setTimeout(async () => {
      if (emeDone) return;
      const keyIdHex = (targetEl as any)._drmKeyId;
      if (!keyIdHex) return;

      const keyId = new Uint8Array(
        keyIdHex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)),
      );
      const pssh = buildWidevinePssh(keyId);
      emeDone = true;

      let session: MediaKeySession;
      try {
        session = mediaKeys.createSession();
        await session.generateRequest("cenc", pssh.buffer as ArrayBuffer);
      } catch {
        return;
      }

      session.addEventListener(
        "message",
        async (msgEvent: MediaKeyMessageEvent) => {
          try {
            const response = await fetch(licenseProxyUrl, {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: msgEvent.message,
            });
            if (!response.ok) return;
            const license = await response.arrayBuffer();
            await session.update(new Uint8Array(license));
          } catch {}
        },
      );
    }, 5000);
    (targetEl as any)._emePsshTimeout = psshTimeout;

    return targetEl;
  } catch {
    return null;
  }
}

export function createManifestInterceptor(
  audioEl: HTMLAudioElement,
): (xhr: XMLHttpRequest, url: string) => void {
  return function (xhr: XMLHttpRequest, url: string) {
    if (!url.includes(".m3u8") && !url.includes("playlist")) return;

    const origOnLoad = xhr.onload;
    xhr.addEventListener("load", () => {
      try {
        if (
          xhr.responseText &&
          xhr.responseText.includes("#EXT-X-KEY")
        ) {
          const keyLines = xhr.responseText
            .split("\n")
            .filter((line: string) => line.startsWith("#EXT-X-KEY:"));

          for (const line of keyLines) {
            const kidMatch = line.match(/KEYID=0x([0-9a-fA-F]+)/);
            if (kidMatch) {
              (audioEl as any)._drmKeyId = kidMatch[1];
            }
            const kidMatch2 = line.match(/KEYID="?([^",\s]+)"?/);
            if (kidMatch2?.[1] && !kidMatch2[1].startsWith("0x")) {
              (audioEl as any)._drmKeyId = kidMatch2[1].replace(/-/g, "");
            }
          }
        }
      } catch {
        // Don't let manifest parsing errors break playback
      }
      if (origOnLoad)
        (origOnLoad as EventListener).call(xhr, new Event("load"));
    });
  };
}

/**
 * Check if an audio URL should be proxied through the SoundCloud CDN proxy.
 */
export function shouldProxyUrl(url: string): string {
  if (
    url.includes("sndcdn.com") ||
    url.includes("soundcloud.cloud")
  ) {
    return `/api/music/soundcloud/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
