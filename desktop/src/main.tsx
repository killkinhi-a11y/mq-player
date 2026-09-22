/*
 * MQ Player Desktop — entry point.
 *
 * Boot order is CRITICAL:
 *  1. global styles (tokens + themes) — synchronous CSS import;
 *  2. desktop info (proxy coordinates) from the Rust shell, if any;
 *  3. network patches (fetch + EventSource → localhost proxy);
 *  4. ONLY THEN dynamically import the app tree — the zustand store's
 *     rehydration probe (`/api/auth/me`) fires during module init and
 *     must already go through the proxy.
 *
 * Browser mode (no Tauri): patches are skipped and the same UI runs
 * against the Vite dev proxy (see mqDevProxy in vite.config.ts) — this
 * is how the desktop UI is visually QA'd in a normal browser.
 */
import "./tailwind-desktop.css";
import "./desktop.css";
import { createRoot } from "react-dom/client";
import { loadDesktopInfo, isTauri } from "./desktop/env";
import { patchNetwork } from "./desktop/net";

async function boot(): Promise<void> {
  // 1. Tauri shell handshake (no-op in browser mode)
  await loadDesktopInfo();

  // 2. Route every app API call through the Rust proxy (Tauri only).
  patchNetwork();

  // 3. Mark the document for desktop CSS rules (titlebar offsets etc.)
  if (isTauri()) {
    document.documentElement.setAttribute("data-mq-desktop", "true");

    // External-URL seam for SHARED web components (no tauri imports in
    // ../src): opens t.me / OAuth / any external link in the SYSTEM
    // browser instead of navigating the app window.
    (window as unknown as { __MQ_DESKTOP_OPEN_URL__?: (url: string) => void }).__MQ_DESKTOP_OPEN_URL__ =
      (url: string) => {
        import("@tauri-apps/plugin-opener")
          .then((m) => m.openUrl(url))
          .catch((e) => console.error("[MQ Desktop] openUrl failed:", e));
      };
  }

  // 4. Now the app tree is safe to load.
  const { default: DesktopApp } = await import("./DesktopApp");
  const root = createRoot(document.getElementById("root")!);
  root.render(<DesktopApp />);

  // 5. Fade the boot splash.
  requestAnimationFrame(() => {
    const splash = document.getElementById("mq-boot-splash");
    if (splash) {
      splash.classList.add("done");
      setTimeout(() => splash.remove(), 450);
    }
  });
}

boot().catch((e) => {
  console.error("[MQ Desktop] boot failed:", e);
  const el = document.getElementById("root");
  if (el) {
    el.innerHTML =
      '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0e0e0e;color:#e03131;font-family:system-ui;font-size:14px;text-align:center;padding:24px">Не удалось запустить MQ Player.<br/>Попробуйте перезапустить приложение.</div>';
  }
});
