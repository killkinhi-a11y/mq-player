"use client";

// Google OAuth: full-page redirect (web) or system browser (desktop app).
// Extracted from AuthView (Task B); bodies moved verbatim.
import { useState } from "react";
import type { AuthProviders } from "./types";

export function useGoogleLogin(providers: AuthProviders | null, isDesktopApp: boolean) {
  const [googleRedirecting, setGoogleRedirecting] = useState(false);

  // ─── Google OAuth (full-page redirect — mobile + popup-blocker safe) ─
  // Desktop (Windows app): webview OAuth is blocked by Google — the shell
  // installs window.__MQ_DESKTOP_OPEN_URL__ before the app boots; it opens
  // the SYSTEM browser with the desktop marker (?desktop=1). The callback
  // then finishes through /desktop-auth → mq://auth → the app's cookie jar.
  const handleGoogleLogin = () => {
    if (!providers?.google || googleRedirecting) return;
    if (isDesktopApp) {
      const openExternal = (window as unknown as {
        __MQ_DESKTOP_OPEN_URL__?: (url: string) => void;
      }).__MQ_DESKTOP_OPEN_URL__;
      if (openExternal) {
        setGoogleRedirecting(true);
        openExternal("https://mq1.vercel.app/api/auth/google?desktop=1");
        setTimeout(() => setGoogleRedirecting(false), 2000);
        return;
      }
    }
    setGoogleRedirecting(true);
    window.location.href = "/api/auth/google";
  };

  return { googleRedirecting, handleGoogleLogin };
}
