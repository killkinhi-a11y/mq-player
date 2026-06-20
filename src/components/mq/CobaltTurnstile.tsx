"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";

/**
 * Invisible Cloudflare Turnstile widget for cobalt SNIP bypass.
 *
 * When a SNIP track is played and we don't have a cobalt JWT yet,
 * this component automatically solves the Turnstile challenge and
 * obtains a JWT from our /api/cobalt/session endpoint.
 *
 * The widget is invisible — the user never sees it.
 * The JWT is cached in the store so the challenge only needs to be solved
 * once per session (or when the JWT expires).
 */

const TURNSTILE_SITEKEY = "0x4AAAAAAAhUvTuTxLs2HYH4";
const COBALT_SESSION_URL = "/api/cobalt/session";

// Load Turnstile script once
let turnstileLoaded = false;
let turnstileLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (turnstileLoaded) return Promise.resolve();
  if (turnstileLoadPromise) return turnstileLoadPromise;

  turnstileLoadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") { resolve(); return; }

    // Check if already loaded
    if ((window as any).turnstile) {
      turnstileLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
    script.async = true;

    (window as any).onTurnstileLoad = () => {
      turnstileLoaded = true;
      resolve();
    };

    script.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(script);

    // Timeout after 10s
    setTimeout(() => {
      if (!turnstileLoaded) reject(new Error("Turnstile load timeout"));
    }, 10000);
  });

  return turnstileLoadPromise;
}

export default function CobaltTurnstile() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const isRequestingRef = useRef(false);

  const obtainJwt = useCallback(async (token: string) => {
    if (isRequestingRef.current) return;
    isRequestingRef.current = true;

    try {
      // "[CobaltTurnstile] Turnstile solved, exchanging for JWT...";
      const res = await fetch(COBALT_SESSION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnstileToken: token }),
      });

      if (!res.ok) {
        console.warn(`[CobaltTurnstile] Session failed: HTTP ${res.status}`);
        return;
      }

      const data = await res.json();
      if (data.token) {
        // Cache JWT with 4-hour expiry (cobalt JWTs typically last ~6h)
        const expiry = data.expiresAt
          ? new Date(data.expiresAt).getTime()
          : Date.now() + 4 * 60 * 60 * 1000;

        useAppStore.getState().setCobaltJwt(data.token, expiry);
        // "[CobaltTurnstile] JWT obtained and cached ✓";
      } else {
        console.warn("[CobaltTurnstile] No JWT in response:", data.error || "unknown");
      }
    } catch (err) {
      console.warn("[CobaltTurnstile] JWT request failed:", err);
    } finally {
      isRequestingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      // Check if we already have a valid JWT
      const existingJwt = useAppStore.getState().getCobaltJwt();
      if (existingJwt) {
        // "[CobaltTurnstile] JWT already cached, skipping Turnstile";
        return;
      }

      try {
        await loadTurnstileScript();
        if (!mounted) return;

        const turnstile = (window as any).turnstile;
        if (!turnstile || !containerRef.current) return;

        // "[CobaltTurnstile] Rendering invisible widget...";

        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITEKEY,
          callback: (token: string) => {
            obtainJwt(token);
          },
          "error-callback": () => {
            console.warn("[CobaltTurnstile] Turnstile error — will retry later");
          },
          "expired-callback": () => {
            // Turnstile token expired — reset widget
            // "[CobaltTurnstile] Token expired, resetting...";
            useAppStore.getState().setCobaltJwt(null, null);
            if (widgetIdRef.current) {
              try { turnstile.reset(widgetIdRef.current); } catch {}
            }
          },
          theme: "light",
          size: "invisible",
          "response-field": false,
          appearance: "interaction-only",
        });
      } catch (err) {
        console.warn("[CobaltTurnstile] Init failed:", err);
      }
    }

    init();

    return () => {
      mounted = false;
      // Don't destroy widget on unmount — keep it alive for re-rendering
    };
  }, [obtainJwt]);

  // Invisible container — takes no space
  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        overflow: "hidden",
        opacity: 0,
        pointerEvents: "none",
        zIndex: -1,
      }}
    />
  );
}
