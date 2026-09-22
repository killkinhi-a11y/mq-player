/*
 * Desktop-mode detection for SHARED web components (task: web/desktop split).
 *
 * The Tauri shell (desktop/src/main.tsx) installs window.__MQ_DESKTOP__ and
 * sets <html data-mq-desktop="true"> BEFORE the app tree loads, so a lazy
 * read at first render is reliable:
 *   - WEB (Next.js): window.__MQ_DESKTOP__ never exists → false
 *   - DESKTOP (Vite/Tauri): set during boot, before React mounts → true
 *
 * Use for CONDITIONAL LAYOUT ONLY (old web navbar vs desktop sidebar shell).
 * Never import Tauri APIs here — this file is part of the shared web bundle.
 */

export function isDesktopApp(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { __MQ_DESKTOP__?: unknown }).__MQ_DESKTOP__
  );
}
