/*
 * Network layer patches — install BEFORE the web app modules load.
 *
 * The web client only ever issues RELATIVE fetches ("/api/…",
 * "/audio-engine/…", "/version.json", "/demo/…"). In the desktop shell
 * those same paths must reach https://mq1.vercel.app with the session
 * cookie the RUST proxy holds (httpOnly cookies can't cross origins —
 * SameSite=Lax blocks them from tauri.localhost). The Rust side runs a
 * localhost reverse proxy that:
 *   - forwards to production with a real browser UA / Origin / Referer;
 *   - attaches the persisted session cookie from its own jar;
 *   - captures Set-Cookie responses into that jar (login/logout flows);
 *   - adds CORS headers for the tauri origin so the WebView can read
 *     responses, including Range/206 for <audio> and streamed SSE.
 *
 * This file rewrites every matching fetch/EventSource URL to the proxy.
 * `/version.json` is served from the DESKTOP's own identity so the web
 * UpdateBanner never nags desktop users about web deploys (the desktop
 * has its own updater through the Tauri plugin).
 */
import { DESKTOP_BUILD_ID, DESKTOP_VERSION } from "./env";

const PROXIED_PREFIXES = ["/api/", "/audio-engine/", "/demo/"];

type ProxyDecision = "proxy" | "serve-desktop" | null;

function shouldProxy(pathname: string): ProxyDecision {
  if (pathname === "/version.json") return "serve-desktop";
  return PROXIED_PREFIXES.some((p) => pathname.startsWith(p)) ? "proxy" : null;
}

function proxyUrlFor(url: string): string | null {
  const info = window.__MQ_DESKTOP__;
  if (!info) return null;
  let u: URL;
  try {
    u = new URL(url, window.location.href);
  } catch {
    return null;
  }
  // Relative app paths
  const decision = shouldProxy(u.pathname);
  if (decision === "serve-desktop") return "desktop-identity";
  if (decision === "proxy") return info.proxyUrl + u.pathname + u.search;
  // Absolute production URLs (APP_URL-based fetches, e.g. update checks)
  if (u.origin === "https://mq1.vercel.app") return info.proxyUrl + u.pathname + u.search;
  return null;
}

export function patchNetwork(): void {
  const info = window.__MQ_DESKTOP__;
  if (!info) return;
  const desktop = info;

  const origFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let target: string | null = null;
    if (typeof input === "string") target = proxyUrlFor(input);
    else if (input instanceof URL) target = proxyUrlFor(input.toString());
    else if (input instanceof Request) target = proxyUrlFor(input.url);

    if (target === "desktop-identity") {
      // Desktop identity, not the web deploy — keeps the web UpdateBanner
      // silent (desktop updates flow through the Tauri updater instead).
      return new Response(
        JSON.stringify({ version: DESKTOP_VERSION, buildId: DESKTOP_BUILD_ID, desktop: true }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (!target) return origFetch(input as any, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("x-mq-desktop", desktop.proxyToken);
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    const body = init?.body ?? (input instanceof Request ? undefined : undefined);
    return origFetch(target, { ...init, method, headers, body, credentials: "omit" });
  }) as typeof window.fetch;

  // EventSource can't set headers → the proxy accepts ?_mqt= as auth.
  const OrigEventSource = window.EventSource;
  if (OrigEventSource) {
    class PatchedEventSource extends OrigEventSource {
      constructor(url: string | URL, config?: EventSourceInit) {
        let finalUrl = typeof url === "string" ? url : url.toString();
        const proxied = proxyUrlFor(finalUrl);
        if (proxied && proxied !== "desktop-identity") {
          finalUrl = proxied + (proxied.includes("?") ? "&" : "?") + "_mqt=" + encodeURIComponent(desktop.proxyToken);
        }
        super(finalUrl, config);
      }
    }
    // Preserve static constants (CONNECTING/OPEN/CLOSED) and prototype chain
    (PatchedEventSource as any).CONNECTING = (OrigEventSource as any).CONNECTING;
    (PatchedEventSource as any).OPEN = (OrigEventSource as any).OPEN;
    (PatchedEventSource as any).CLOSED = (OrigEventSource as any).CLOSED;
    window.EventSource = PatchedEventSource as typeof EventSource;
  }

  // sendBeacon (logout fires one at /api/auth/logout) — route through the
  // proxy so the Rust jar picks up the cookie-clearing Set-Cookie.
  const origBeacon = navigator.sendBeacon?.bind(navigator);
  if (origBeacon) {
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null): boolean => {
      const s = typeof url === "string" ? url : url.toString();
      const proxied = proxyUrlFor(s);
      if (proxied && proxied !== "desktop-identity") {
        // fetch with keepalive = the spec-compliant beacon transport.
        origFetch(proxied, {
          method: "POST",
          body: (data as BodyInit) ?? null,
          keepalive: true,
          headers: { "x-mq-desktop": desktop.proxyToken },
        }).catch(() => {});
        return true;
      }
      return origBeacon(s, data as BodyInit | null);
    };
  }
}
