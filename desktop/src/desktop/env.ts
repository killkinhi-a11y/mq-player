/*
 * Desktop runtime environment — single source of truth for
 * "am I running inside the Tauri shell?" and the localhost proxy coordinates.
 */
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __MQ_DESKTOP__?: {
      proxyUrl: string;
      proxyToken: string;
      version: string;
      buildId: string;
      platform: string;
    };
  }
}

export const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  (!!window.__TAURI_INTERNALS__ || !!window.__MQ_DESKTOP__);

export const isWindows = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /win/i.test(navigator.userAgent || "") || window.__MQ_DESKTOP__?.platform === "windows";
};

/** Ask the Rust side for the localhost proxy coordinates (Tauri only). */
export async function loadDesktopInfo(): Promise<void> {
  if (!isTauri() || window.__MQ_DESKTOP__) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const info = await invoke<[string, string, string, string, string]>("desktop_info");
    window.__MQ_DESKTOP__ = {
      proxyUrl: info[0],
      proxyToken: info[1],
      version: info[2],
      buildId: info[3],
      platform: info[4],
    };
  } catch (e) {
    // Proxy unavailable → app still boots; API calls will fail loudly
    // (honest failure, no silent mock).
    console.error("[MQ Desktop] desktop_info failed:", e);
  }
}

export const DESKTOP_VERSION = process.env.MQ_DESKTOP_VERSION || "1.0.0";
export const DESKTOP_BUILD_ID = process.env.MQ_DESKTOP_BUILD_ID || "desktop-1.0.0";
