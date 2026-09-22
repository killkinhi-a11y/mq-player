/*
 * DesktopIntegration — the native bridge layer (Tauri only, §23-§34):
 *
 *  1. Windows media controls (SMTC) — pushes track/playback state from the
 *     shared zustand store to the Rust SMTC bridge (invoke smtc_update) and
 *     routes system play/pause/next/previous/seek buttons back into the
 *     SAME store actions the UI uses (one playback truth, §37).
 *  2. Hardware media keys — Windows routes them through SMTC when the app
 *     owns the media session; no separate global-shortcut double-handling.
 *  3. Deep links mq://track/…, mq://artist/…, mq://playlist/…, mq://auth —
 *     identical semantics to the web /play deep links (mirrored from
 *     AppShell) + single-instance forwarding.
 *  4. Track-change Windows notifications (background only, toggleable).
 *  5. Auto-update (§31-32): human-language "Что нового" dialog, no hashes.
 */
import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { useAppStore } from "@/store/useAppStore";
import { currentPlaybackPosition, seekPlayback } from "@/lib/wasm-audio";
import { isTauri, isWindows } from "./env";
import { CheckCircle2, Download } from "lucide-react";

const NOTIF_SETTING_KEY = "mq-desktop-notifications";

/** playTrack argument type (kept out of JSX-ambiguous inline generic). */
type PlayTrackArg = Parameters<ReturnType<typeof useAppStore.getState>["playTrack"]>[0];

function notificationsEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIF_SETTING_KEY) !== "off";
  } catch {
    return true;
  }
}

/* ── SMTC: store → Rust (1Hz position ticker + state changes) ───────────── */
function useSmtcSync() {
  useEffect(() => {
    if (!isWindows()) return;
    let lastKey = "";
    let timer: number | undefined;

    const push = (positionSec?: number) => {
      const s = useAppStore.getState();
      const t = s.currentTrack;
      const key = t ? `${t.id}|${s.isPlaying ? 1 : 0}|${t.duration}` : "none";
      const pos = positionSec ?? currentPlaybackPosition();
      invoke("smtc_update", {
        title: t?.title ?? "",
        artist: t?.artist ?? "",
        album: t?.album ?? "",
        artworkPath: t?.cover ?? "",
        durationSec: t?.duration ?? 0,
        positionSec: pos,
        playing: !!s.isPlaying,
        hasTrack: !!t,
      }).catch(() => { /* SMTC updates are best-effort */ });
      return key;
    };

    lastKey = push();
    const tick = () => {
      const s = useAppStore.getState();
      const key = s.currentTrack ? `${s.currentTrack.id}|${s.isPlaying ? 1 : 0}|${s.currentTrack.duration}` : "none";
      if (key !== lastKey) lastKey = key;
      push();
    };
    timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
}

/* ── SMTC / tray / system buttons: Rust → store ────────────────────────── */
function useSystemButtons() {
  useEffect(() => {
    if (!isWindows()) return;
    let un: UnlistenFn | undefined;
    listen<{ kind: string; positionSec?: number; deltaSec?: number }>("smtc://event", (e) => {
      const s = useAppStore.getState();
      switch (e.payload.kind) {
        case "playpause":
        case "play":
        case "pause":
          // Normalize: play/pause land as toggles when states mismatch.
          if (e.payload.kind === "playpause") s.togglePlay();
          else if (e.payload.kind === "play" && !s.isPlaying) s.togglePlay();
          else if (e.payload.kind === "pause" && s.isPlaying) s.togglePlay();
          break;
        case "next":
          s.nextTrack();
          break;
        case "previous":
          s.prevTrack();
          break;
        case "seek":
          if (typeof e.payload.positionSec === "number") seekPlayback(e.payload.positionSec);
          break;
        case "seekby":
          if (typeof e.payload.deltaSec === "number") {
            seekPlayback(Math.max(0, currentPlaybackPosition() + e.payload.deltaSec));
          }
          break;
      }
    }).then((f) => (un = f));
    return () => un?.();
  }, []);
}

/* ── Track-change notification (background-only, §26) ──────────────────── */
function useTrackNotifications() {
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const lastNotified = useRef<string | null>(null);

  useEffect(() => {
    if (!currentTrack || !isPlaying) return;
    if (currentTrack.id === lastNotified.current) return;
    // Only fire when the previous track also played through (skip first
    // restore) and the window is in the background (don't spam the user
    // who is looking right at the app).
    if (lastNotified.current === null) {
      lastNotified.current = currentTrack.id;
      return;
    }
    lastNotified.current = currentTrack.id;
    if (!notificationsEnabled() || document.hasFocus()) return;

    (async () => {
      try {
        const mod = await import("@tauri-apps/plugin-notification");
        let granted = await mod.isPermissionGranted();
        if (!granted) granted = (await mod.requestPermission()) === "granted";
        if (!granted) return;
        mod.sendNotification({
          title: currentTrack.title || "MQ Player",
          body: currentTrack.artist || "",
        });
      } catch { /* notifications are best-effort */ }
    })();
  }, [currentTrack, isPlaying]);
}

/* ── Deep links: mq:// scheme (§34) — same semantics as web /play links ── */
async function handleDeepLink(rawUrl: string): Promise<void> {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "mq:") return;
    const host = url.hostname || url.pathname.replace(/^\/+/, "").split("/")[0] || "";
    const [, second] = (url.pathname.match(/\/([^/]+)/) || []) as (string | undefined)[];

    // mq://auth#token=… / mq://auth?token=… — Google handoff from the
    // system browser (session JWT → Rust cookie jar) then clean restart.
    if (host === "auth") {
      const token = url.searchParams.get("token") || new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
      if (token) {
        await invoke("auth_store_token", { token });
        window.location.reload();
      }
      return;
    }

    // Wait for hydration + auth (same contract as the web deep link).
    const waitAuth = async (): Promise<boolean> => {
      for (let i = 0; i < 100; i++) {
        const s = useAppStore.getState();
        if (s._hasHydrated && s.isAuthenticated) return true;
        await new Promise((r) => setTimeout(r, 200));
      }
      return false;
    };

    if (host === "track" && second) {
      if (!(await waitAuth())) return;
      const r = await fetch(`/api/tracks/share?scTrackId=${encodeURIComponent(second)}`);
      if (!r.ok) return;
      const data = await r.json();
      const t = data?.track ?? data;
      if (!t || !t.title) return;
      const track = {
        id: t.id ?? `sc_${t.scTrackId}`,
        title: t.title ?? "Unknown",
        artist: t.artist ?? "",
        album: t.album ?? "",
        cover: t.cover ?? t.image ?? "",
        duration: t.duration ?? 0,
        genre: t.genre ?? "",
        audioUrl: t.audioUrl ?? t.streamUrl ?? "",
        previewUrl: t.previewUrl ?? "",
        source: t.source ?? "soundcloud",
        scTrackId: t.scTrackId ?? null,
      } as const;
      useAppStore.getState().playTrack(track as PlayTrackArg);
      setTimeout(() => {
        const now = useAppStore.getState();
        if (now.currentTrack?.id === track.id) now.setFullTrackViewOpen(true);
      }, 400);
      return;
    }

    if (host === "artist" && second) {
      if (!(await waitAuth())) return;
      useAppStore.getState().setSelectedArtist({ name: decodeURIComponent(second) });
      return;
    }

    if (host === "playlist" && second) {
      if (!(await waitAuth())) return;
      const r = await fetch(`/api/playlists/${encodeURIComponent(second)}`);
      if (!r.ok) return;
      const data = await r.json();
      const p = data?.playlist;
      if (!p) return;
      useAppStore.setState((s) => ({
        playlists: [p, ...s.playlists.filter((x) => x.id !== p.id)],
        selectedPlaylistId: p.id,
        currentView: "playlists" as const,
      }));
      return;
    }

    // mq://play?track=…&artist=…&pl=… — canonical share-URL params.
    if (host === "play") {
      const track = url.searchParams.get("track");
      const artist = url.searchParams.get("artist");
      const pl = url.searchParams.get("pl");
      if (track) return handleDeepLink(`mq://track/${encodeURIComponent(track)}`);
      if (artist) return handleDeepLink(`mq://artist/${encodeURIComponent(artist)}`);
      if (pl) return handleDeepLink(`mq://playlist/${encodeURIComponent(pl)}`);
    }
  } catch (e) {
    console.warn("[MQ Desktop] deep link failed:", rawUrl, e);
  }
}

function useDeepLinks() {
  useEffect(() => {
    if (!isTauri()) return;
    // onOpenUrl fires BOTH for cold-start links and runtime links (the
    // plugin queues the launch URL until a listener subscribes).
    const unsubs: Promise<UnlistenFn>[] = [
      import("@tauri-apps/plugin-deep-link").then((m) =>
        m.onOpenUrl((urls) => urls.forEach((u) => void handleDeepLink(u)))
      ),
      // Second launch with a mq:// link in argv → forwarded here.
      listen<string[]>("second-instance", (e) => {
        const argv = e.payload || [];
        for (const a of argv) if (a.startsWith("mq://")) void handleDeepLink(a);
      }),
    ];
    return () => {
      unsubs.forEach((p) => p.then((f) => f()));
    };
  }, []);
}

/* ── Auto-update (§31-32) — human language, no build IDs ───────────────── */

interface DesktopUpdateDialog {
  version: string;
  notes: string;
  update: Update;
}

function useAutoUpdate() {
  const [upd, setUpd] = useState<DesktopUpdateDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dismissedAt, setDismissed] = useState<number | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const check = async () => {
      if (cancelled) return;
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update && !cancelled) {
          setUpd({ version: update.version, notes: update.body || "Улучшения и исправления", update });
        }
      } catch { /* updater endpoint unreachable — silent */ }
    };
    check();
    const interval = window.setInterval(check, 4 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!upd || (dismissedAt && Date.now() - dismissedAt < 6 * 60 * 60 * 1000)) return null;

  const bullets = upd.notes.split(/\r?\n/).map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);

  const apply = async () => {
    setBusy(true);
    setProgress(0);
    let received = 0;
    let total = 0;
    try {
      await upd.update.downloadAndInstall((p) => {
        if (p.event === "Started" && p.data.contentLength) {
          total = p.data.contentLength;
        } else if (p.event === "Progress" && p.data.chunkLength) {
          received += p.data.chunkLength;
          if (total > 0) setProgress(Math.min(0.99, received / total));
        } else if (p.event === "Finished") {
          setProgress(1);
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      console.error("[MQ Desktop] update failed:", e);
      setBusy(false);
    }
  };

  return (
    <div className="mq-desktop-update" role="dialog" aria-modal="true" aria-label="Доступно обновление">
      <div className="mq-desktop-update-card">
        <h3>Доступно обновление MQ Player</h3>
        <div className="version">Что нового — версия {upd.version}</div>
        <ul>
          {bullets.slice(0, 8).map((b, i) => (
            <li key={i}>
              <CheckCircle2 size={15} strokeWidth={2} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={() => setDismissed(Date.now())}
            disabled={busy}
            style={{
              padding: "9px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)",
              background: "transparent", color: "inherit", fontSize: 13.5, cursor: busy ? "default" : "pointer",
            }}
          >
            Позже
          </button>
          <button
            onClick={apply}
            disabled={busy}
            style={{
              padding: "9px 18px", borderRadius: 12, border: "none",
              background: busy ? "color-mix(in srgb, var(--mq-accent,#e03131) 60%, #444)" : "var(--mq-accent, #e03131)",
              color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: busy ? "default" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            <Download size={14} strokeWidth={2.2} />
            {busy ? (progress >= 1 ? "Установка…" : `Загрузка ${Math.round(progress * 100)}%`) : "Обновить"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── External links: never navigate the app window off-origin ─────────── */
function useExternalLinks() {
  useEffect(() => {
    if (!isTauri()) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      const appOrigin = window.location.origin;
      const proxyOrigin = window.__MQ_DESKTOP__?.proxyUrl
        ? new URL(window.__MQ_DESKTOP__.proxyUrl).origin
        : null;
      const isApp = url.origin === appOrigin || url.origin === proxyOrigin;
      if (isApp) return;
      // External (t.me, accounts.google.com, github…) → system browser.
      e.preventDefault();
      import("@tauri-apps/plugin-opener")
        .then((m) => m.openUrl(url.toString()))
        .catch(() => {});
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

/* ── Mounted once from DesktopApp ──────────────────────────────────────── */
export default function DesktopIntegration() {
  useSmtcSync();
  useSystemButtons();
  useTrackNotifications();
  useDeepLinks();
  useExternalLinks();
  const updateDialog = useAutoUpdate();
  return updateDialog;
}
