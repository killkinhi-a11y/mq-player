/**
 * useNativePiP — hook that manages a floating PiP window using window.open()
 * with a blob URL, so it works in ALL browsers (Chrome, Firefox, Edge, Safari).
 *
 * The popup window is a fully self-contained HTML document loaded via blob: URL.
 * The main page communicates with it via direct DOM access (same-origin blob)
 * and Zustand store state synchronization.
 *
 * No doc.open()/doc.write() is used — this avoids React error #300.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { formatDuration } from "@/lib/musicApi";
import { getAudioElement } from "@/lib/audioEngine";

const PIP_WIDTH = 360;
const PIP_HEIGHT = 210;

interface PiPState {
  title: string;
  artist: string;
  cover: string | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  progressPct: number;
}

export function useNativePiP() {
  const pipWindowRef = useRef<Window | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mainUnloadRef = useRef<(() => void) | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const openPiP = useCallback((): boolean => {
    if (typeof window === "undefined") return false;

    // If already open, focus it
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.focus();
      return true;
    }

    try {
      // Build a standalone HTML document as a blob
      const html = buildPiPHTML();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = blobUrl;

      const pip = window.open(
        blobUrl,
        "mq-pip-player",
        `width=${PIP_WIDTH},height=${PIP_HEIGHT},resizable=no,scrollbars=no,location=no,menubar=no,toolbar=no,status=no`
      );

      if (!pip) {
        // Blocked by popup blocker — fall back to overlay
        URL.revokeObjectURL(blobUrl);
        blobUrlRef.current = null;
        console.warn("[PiP] Popup blocked by browser");
        return false;
      }

      pipWindowRef.current = pip;

      // Wait for popup to load, then wire up controls
      const setup = () => {
        if (!pipWindowRef.current || pipWindowRef.current.closed) return;

        // Double-check: some browsers need the popup to finish loading
        try {
          const doc = pipWindowRef.current.document;
          if (!doc.getElementById("pip-play")) {
            // DOM not ready yet, retry
            setTimeout(setup, 100);
            return;
          }
        } catch {
          // Cross-origin or not ready — retry
          setTimeout(setup, 100);
          return;
        }

        syncThemeVars(pipWindowRef.current);
        wireControls(pipWindowRef.current);

        // Initial render
        const st = useAppStore.getState();
        updatePiPContent(pipWindowRef.current, buildState(st));

        // Subscribe to store changes
        const unsub = useAppStore.subscribe((state, prevState) => {
          if (!pipWindowRef.current || pipWindowRef.current.closed) return;
          const changed =
            state.currentTrack !== prevState.currentTrack ||
            state.isPlaying !== prevState.isPlaying ||
            state.progress !== prevState.progress ||
            state.duration !== prevState.duration ||
            state.volume !== prevState.volume;

          if (changed) {
            updatePiPContent(pipWindowRef.current!, buildState(state));
          }
        });
        unsubRef.current = unsub;

        // Periodic progress sync for smooth progress bar
        progressIntervalRef.current = setInterval(() => {
          if (!pipWindowRef.current || pipWindowRef.current.closed) return;
          const s = useAppStore.getState();
          const audio = getAudioElement();
          if (audio && !audio.paused && audio.duration) {
            s.setProgress(audio.currentTime);
            try {
              const doc = pipWindowRef.current!.document;
              const tc = doc.getElementById("pip-time-current");
              if (tc) tc.textContent = formatDuration(Math.floor(audio.currentTime));
              const pct = (audio.currentTime / audio.duration) * 100;
              const fill = doc.getElementById("pip-progress-fill") as HTMLElement | null;
              if (fill) fill.style.width = pct + "%";
              const thumb = doc.getElementById("pip-progress-thumb") as HTMLElement | null;
              if (thumb) thumb.style.left = pct + "%";
            } catch { /* popup closed or cross-origin */ }
          }
        }, 500);
      };

      setTimeout(setup, 150);

      // Poll for manual close
      checkIntervalRef.current = setInterval(() => {
        if (pipWindowRef.current && pipWindowRef.current.closed) {
          clearInterval(checkIntervalRef.current!);
          checkIntervalRef.current = null;
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
          if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
          if (mainUnloadRef.current) { window.removeEventListener("beforeunload", mainUnloadRef.current); mainUnloadRef.current = null; }
          pipWindowRef.current = null;
          if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
          useAppStore.getState().setPiPActive(false);
        }
      }, 1000);

      // Close popup when main page unloads
      const handleMainUnload = () => {
        if (pipWindowRef.current && !pipWindowRef.current.closed) {
          pipWindowRef.current.close();
        }
      };
      window.addEventListener("beforeunload", handleMainUnload);
      mainUnloadRef.current = handleMainUnload;

      return true;
    } catch (err) {
      console.warn("[PiP] Failed to open PiP window:", err);
      return false;
    }
  }, []);

  const doCleanup = useCallback(() => {
    if (checkIntervalRef.current) { clearInterval(checkIntervalRef.current); checkIntervalRef.current = null; }
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (mainUnloadRef.current) { window.removeEventListener("beforeunload", mainUnloadRef.current); mainUnloadRef.current = null; }
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
  }, []);

  const closePiP = useCallback(() => {
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close();
    }
    pipWindowRef.current = null;
    doCleanup();
  }, [doCleanup]);

  const isPiPOpen = useCallback((): boolean => {
    return pipWindowRef.current !== null && !pipWindowRef.current.closed;
  }, []);

  useEffect(() => {
    return () => {
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        pipWindowRef.current.close();
      }
      pipWindowRef.current = null;
      doCleanup();
    };
  }, [doCleanup]);

  return { openPiP, closePiP, isPiPOpen };
}

// ─── Helpers ──────────────────────────────────────────────────

function buildState(state: ReturnType<typeof useAppStore.getState>): PiPState {
  return {
    title: state.currentTrack?.title || "Нет трека",
    artist: state.currentTrack?.artist || "",
    cover: state.currentTrack?.cover || null,
    isPlaying: state.isPlaying,
    progress: state.progress,
    duration: state.duration,
    volume: state.volume,
    progressPct: state.duration > 0 ? (state.progress / state.duration) * 100 : 0,
  };
}

function getCSSVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function syncThemeVars(pip: Window) {
  const root = pip.document.documentElement;
  root.style.setProperty("--mq-accent", getCSSVar("--mq-accent", "#e03131"));
  root.style.setProperty("--mq-text", getCSSVar("--mq-text", "#ffffff"));
  root.style.setProperty("--mq-card", getCSSVar("--mq-card", "#1a1a1a"));
  root.style.setProperty("--mq-border", getCSSVar("--mq-border", "#2a2a2a"));
  root.style.setProperty("--mq-text-muted", getCSSVar("--mq-text-muted", "#888888"));
  root.style.setProperty("--mq-glow", getCSSVar("--mq-glow", "rgba(224,49,49,0.3)"));
  root.style.setProperty("--mq-bg", getCSSVar("--mq-bg", "#0e0e0e"));
}

function wireControls(pip: Window) {
  const doc = pip.document;
  const el = (id: string) => doc.getElementById(id);

  const playBtn = el("pip-play");
  if (playBtn) playBtn.addEventListener("click", () => useAppStore.getState().togglePlay());

  const nextBtn = el("pip-next");
  if (nextBtn) nextBtn.addEventListener("click", () => useAppStore.getState().nextTrack());

  const prevBtn = el("pip-prev");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      const st = useAppStore.getState();
      if (st.progress > 3) {
        const audio = getAudioElement();
        if (audio) audio.currentTime = 0;
        st.setProgress(0);
      } else {
        st.prevTrack();
      }
    });
  }

  const closeBtn = el("pip-close");
  if (closeBtn) closeBtn.addEventListener("click", () => useAppStore.getState().setPiPActive(false));

  const volBtn = el("pip-vol");
  if (volBtn) {
    volBtn.addEventListener("click", () => {
      const st = useAppStore.getState();
      st.setVolume(st.volume > 0 ? 0 : 70);
    });
  }

  const progressEl = el("pip-progress");
  if (progressEl) {
    progressEl.addEventListener("click", (e) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const st = useAppStore.getState();
      const newTime = pct * (st.duration || 1);
      st.setProgress(newTime);
      const audio = getAudioElement();
      if (audio) audio.currentTime = newTime;
    });
  }

  const volSlider = el("pip-vol-slider");
  if (volSlider) {
    volSlider.addEventListener("click", (e) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      useAppStore.getState().setVolume(Math.round(pct * 100));
    });
  }
}

function updatePiPContent(pip: Window, s: PiPState) {
  try {
    const doc = pip.document;
    const el = (id: string) => doc.getElementById(id) as HTMLElement | null;

    const titleEl = el("pip-title");
    if (titleEl) titleEl.textContent = s.title;

    const artistEl = el("pip-artist");
    if (artistEl) artistEl.textContent = s.artist;

    const coverEl = el("pip-cover");
    if (coverEl) {
      if (s.cover) {
        coverEl.innerHTML = '<img src="' + s.cover + '" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:cover;">';
      } else {
        coverEl.innerHTML = '<div style="width:56px;height:56px;border-radius:12px;background:var(--mq-accent);opacity:0.4;display:flex;align-items:center;justify-content:center;font-size:20px;">&#9835;</div>';
      }
    }

    const playIcon = el("pip-play-icon");
    if (playIcon) {
      playIcon.textContent = s.isPlaying ? "\u275A\u275A" : "\u25B6";
      playIcon.style.marginLeft = s.isPlaying ? "0" : "2px";
    }

    const progressFill = el("pip-progress-fill");
    if (progressFill) progressFill.style.width = s.progressPct + "%";

    const progressThumb = el("pip-progress-thumb");
    if (progressThumb) progressThumb.style.left = s.progressPct + "%";

    const timeCurrent = el("pip-time-current");
    if (timeCurrent) timeCurrent.textContent = formatDuration(Math.floor(s.progress));

    const timeTotal = el("pip-time-total");
    if (timeTotal) timeTotal.textContent = formatDuration(Math.floor(s.duration));

    const volIcon = el("pip-vol-icon");
    if (volIcon) volIcon.textContent = s.volume === 0 ? "\uD83D\uDD07" : "\uD83D\uDD0A";

    const volFill = el("pip-vol-fill");
    if (volFill) volFill.style.width = s.volume + "%";

    const playBtn = el("pip-play");
    if (playBtn) playBtn.style.boxShadow = s.isPlaying ? "0 0 14px var(--mq-glow)" : "none";

    const eqEl = el("pip-eq");
    if (eqEl) eqEl.style.display = s.isPlaying ? "flex" : "none";

    syncThemeVars(pip);
  } catch { /* popup closed */ }
}

// ─── HTML document builder ────────────────────────────────────

function buildPiPHTML(): string {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<title>MQ Player</title>'
    + '<style>' + CSS + '</style>'
    + '</head><body>'
    + '<div id="mq-pip-container">'
    + '<div id="pip-glow"></div>'
    + '<div id="pip-header"><div id="pip-drag-handle"><div id="pip-drag-bar"></div></div></div>'
    + '<div id="pip-content">'
    + '<div id="pip-cover"></div>'
    + '<div id="pip-info"><div id="pip-title">MQ Player</div><div id="pip-artist">...</div></div>'
    + '<div id="pip-eq"><div class="eq-bar" style="--i:0"></div><div class="eq-bar" style="--i:1"></div><div class="eq-bar" style="--i:2"></div></div>'
    + '</div>'
    + '<div id="pip-controls">'
    + '<button class="pip-ctrl-btn" id="pip-prev">&#9198;</button>'
    + '<button class="pip-ctrl-btn pip-play-btn" id="pip-play"><span id="pip-play-icon">&#9654;</span></button>'
    + '<button class="pip-ctrl-btn" id="pip-next">&#9197;</button>'
    + '<div id="pip-vol-wrap">'
    + '<button class="pip-ctrl-btn" id="pip-vol"><span id="pip-vol-icon">&#128266;</span></button>'
    + '<div id="pip-vol-slider"><div id="pip-vol-fill" style="width:70%"></div></div>'
    + '</div>'
    + '<button class="pip-ctrl-btn pip-close-btn" id="pip-close">&#10005;</button>'
    + '</div>'
    + '<div id="pip-progress"><div id="pip-progress-fill"></div><div id="pip-progress-thumb"></div></div>'
    + '<div id="pip-time">'
    + '<span id="pip-time-current">0:00</span>'
    + '<span id="pip-time-mq">MQ</span>'
    + '<span id="pip-time-total">0:00</span>'
    + '</div>'
    + '</div></body></html>';
}

const CSS = [
  '*{margin:0;padding:0;box-sizing:border-box}',
  'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0e0e0e;overflow:hidden;user-select:none;-webkit-user-select:none}',
  '#mq-pip-container{position:relative;width:100%;height:100vh;display:flex;flex-direction:column;overflow:hidden}',
  '#pip-glow{position:absolute;inset:-2px;background:var(--mq-accent,#e03131);opacity:.12;filter:blur(10px);pointer-events:none;z-index:0}',
  '#pip-header{padding:6px 12px 2px;display:flex;justify-content:center;position:relative;z-index:1}',
  '#pip-drag-handle{display:flex;justify-content:center;width:100%;cursor:grab}',
  '#pip-drag-bar{width:36px;height:4px;border-radius:2px;background:var(--mq-border,#2a2a2a);opacity:.6}',
  '#pip-content{display:flex;align-items:center;gap:10px;padding:4px 14px;position:relative;z-index:1}',
  '#pip-cover img{width:56px;height:56px;border-radius:12px;object-fit:cover}',
  '#pip-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
  '#pip-title{font-size:13px;font-weight:600;color:var(--mq-text,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}',
  '#pip-artist{font-size:11px;color:var(--mq-text-muted,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2}',
  '#pip-eq{display:none;align-items:flex-end;gap:2px;height:20px;position:absolute;right:14px;top:50%;transform:translateY(-50%);opacity:.6}',
  '.eq-bar{width:3px;border-radius:2px;background:var(--mq-accent,#e03131);animation:pipEq .6s ease-in-out calc(var(--i)*.15s) infinite alternate}',
  '@keyframes pipEq{0%{height:4px}100%{height:14px}}',
  '#pip-controls{display:flex;align-items:center;justify-content:center;gap:6px;padding:2px 14px 4px;position:relative;z-index:1}',
  '.pip-ctrl-btn{width:30px;height:30px;border-radius:50%;border:none;background:0 0;color:var(--mq-text-muted,#888);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;transition:background .15s;padding:0;line-height:1}',
  '.pip-ctrl-btn:hover{background:rgba(255,255,255,.08)}',
  '.pip-play-btn{width:38px;height:38px;background:var(--mq-accent,#e03131);color:var(--mq-text,#fff);font-size:14px}',
  '.pip-play-btn:hover{filter:brightness(1.15)}',
  '.pip-close-btn{background:rgba(255,255,255,.06);color:var(--mq-text-muted,#888)}',
  '#pip-vol-wrap{display:flex;align-items:center;gap:4px;margin-left:auto;position:relative}',
  '#pip-vol-slider{width:64px;height:4px;border-radius:2px;background:rgba(255,255,255,.1);cursor:pointer;position:relative}',
  '#pip-vol-fill{height:100%;background:var(--mq-accent,#e03131);border-radius:2px;transition:width .1s}',
  '#pip-progress{height:4px;background:rgba(255,255,255,.08);position:relative;margin:2px 14px 4px;border-radius:2px;cursor:pointer;z-index:1}',
  '#pip-progress:hover{height:6px}',
  '#pip-progress-fill{height:100%;background:var(--mq-accent,#e03131);border-radius:2px;transition:width .1s linear;position:relative}',
  '#pip-progress-thumb{position:absolute;top:50%;width:10px;height:10px;border-radius:50%;background:var(--mq-accent,#e03131);transform:translate(-50%,-50%);box-shadow:0 0 6px var(--mq-glow,rgba(224,49,49,.3));opacity:0;transition:opacity .15s}',
  '#pip-progress:hover #pip-progress-thumb{opacity:1}',
  '#pip-time{display:flex;justify-content:space-between;padding:0 14px 8px;font-size:9px;color:var(--mq-text-muted,#888);position:relative;z-index:1}',
  '#pip-time-mq{color:var(--mq-accent,#e03131);font-size:8px;opacity:.7}',
].join('\n');
