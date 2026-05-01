/**
 * pipManager — standalone PiP window manager (not a React hook).
 *
 * Opens a popup window via window.open() + blob URL.
 * MUST be called synchronously from a user click handler to preserve
 * the user-gesture context (Firefox blocks popups from async code).
 *
 * The popup is a self-contained HTML doc. The main page communicates
 * with it via direct DOM access (same-origin blob) and Zustand
 * store subscriptions.
 */

import { useAppStore } from "@/store/useAppStore";
import { formatDuration } from "@/lib/musicApi";
import { getAudioElement } from "@/lib/audioEngine";

const PIP_WIDTH = 360;
const PIP_HEIGHT = 210;

// ── Module-level state (survives outside React lifecycle) ──────

let pipWindow: Window | null = null;
let blobUrl: string | null = null;
let unsubStore: (() => void) | null = null;
let progressInterval: ReturnType<typeof setInterval> | null = null;
let checkInterval: ReturnType<typeof setInterval> | null = null;
let mainUnloadHandler: (() => void) | null = null;

// ── Public API ────────────────────────────────────────────────

export function openPiPPopup(): boolean {
  if (typeof window === "undefined") return false;

  // Already open → just focus
  if (pipWindow && !pipWindow.closed) {
    pipWindow.focus();
    return true;
  }

  try {
    const html = buildPiPHTML();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    blobUrl = url;

    const win = window.open(
      url,
      "mq-pip-player",
      `width=${PIP_WIDTH},height=${PIP_HEIGHT},resizable=no,scrollbars=no,location=no,menubar=no,toolbar=no,status=no`
    );

    if (!win) {
      URL.revokeObjectURL(url);
      blobUrl = null;
      console.warn("[PiP] Popup blocked by browser — falling back to overlay");
      return false;
    }

    pipWindow = win;

    // Wire up after popup DOM is ready
    const setup = () => {
      if (!pipWindow || pipWindow.closed) return;
      try {
        const doc = pipWindow.document;
        if (!doc.getElementById("pip-play")) {
          setTimeout(setup, 100);
          return;
        }
      } catch {
        setTimeout(setup, 100);
        return;
      }

      syncThemeVars(pipWindow);
      wireControls(pipWindow);

      // Initial render
      updatePiPContent(pipWindow, buildState(useAppStore.getState()));

      // Subscribe to store
      unsubStore = useAppStore.subscribe((state, prev) => {
        if (!pipWindow || pipWindow.closed) return;
        if (
          state.currentTrack !== prev.currentTrack ||
          state.isPlaying !== prev.isPlaying ||
          state.progress !== prev.progress ||
          state.duration !== prev.duration ||
          state.volume !== prev.volume
        ) {
          updatePiPContent(pipWindow!, buildState(state));
        }
      });

      // Smooth progress sync
      progressInterval = setInterval(() => {
        if (!pipWindow || pipWindow.closed) return;
        const audio = getAudioElement();
        if (audio && !audio.paused && audio.duration) {
          useAppStore.getState().setProgress(audio.currentTime);
          try {
            const doc = pipWindow!.document;
            const tc = doc.getElementById("pip-time-current");
            if (tc) tc.textContent = formatDuration(Math.floor(audio.currentTime));
            const pct = (audio.currentTime / audio.duration) * 100;
            const fill = doc.getElementById("pip-progress-fill") as HTMLElement | null;
            if (fill) fill.style.width = pct + "%";
            const thumb = doc.getElementById("pip-progress-thumb") as HTMLElement | null;
            if (thumb) thumb.style.left = pct + "%";
          } catch { /* closed */ }
        }
      }, 500);
    };

    setTimeout(setup, 150);

    // Poll for manual close
    checkInterval = setInterval(() => {
      if (pipWindow && pipWindow.closed) {
        onPopupClosed();
      }
    }, 1000);

    // Close popup when main page unloads
    mainUnloadHandler = () => {
      if (pipWindow && !pipWindow.closed) pipWindow.close();
    };
    window.addEventListener("beforeunload", mainUnloadHandler);

    return true;
  } catch (err) {
    console.warn("[PiP] Failed to open popup:", err);
    return false;
  }
}

export function closePiPPopup() {
  if (pipWindow && !pipWindow.closed) {
    pipWindow.close();
  }
  onPopupClosed();
}

export function isPiPPopupOpen(): boolean {
  return pipWindow !== null && !pipWindow.closed;
}

// ── Internal cleanup ──────────────────────────────────────────

function onPopupClosed() {
  if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
  if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
  if (unsubStore) { unsubStore(); unsubStore = null; }
  if (mainUnloadHandler) { window.removeEventListener("beforeunload", mainUnloadHandler); mainUnloadHandler = null; }
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
  pipWindow = null;
  // Tell store to deactivate
  useAppStore.getState().setPiPActive(false);
}

// ── State builder ──────────────────────────────────────────────

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

// ── Theme sync ────────────────────────────────────────────────

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

// ── Wire controls ─────────────────────────────────────────────

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

// ── Update popup content ──────────────────────────────────────

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

// ── HTML document builder ────────────────────────────────────

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
