/**
 * pipManager — opens a PiP window via /pip page route.
 *
 * Opens /pip as a new window/tab. This approach works in ALL browsers
 * including Firefox because:
 * 1. Same-origin navigation is never blocked by popup blockers
 * 2. Falls back to a new tab if popup features are blocked
 *
 * Cross-tab communication via BroadcastChannel + window.__mqPipGetState
 */

import { useAppStore } from "@/store/useAppStore";
import { formatDuration } from "@/lib/musicApi";
import { getAudioElement } from "@/lib/audioEngine";

const PIP_WIDTH = 360;
const PIP_HEIGHT = 280;

// ── Module-level state ─────────────────────────────────────────

let pipWindow: Window | null = null;
let unsubStore: (() => void) | null = null;
let progressInterval: ReturnType<typeof setInterval> | null = null;
let checkInterval: ReturnType<typeof setInterval> | null = null;
let mainUnloadHandler: (() => void) | null = null;
let bc: BroadcastChannel | null = null;
let audioInterval: ReturnType<typeof setInterval> | null = null;

// ── Expose store access for the PiP tab via window.opener ──────

function exposeStoreAPI() {
  if (typeof window === "undefined") return;
  const win = window as any;

  win.__mqPipGetState = (): object | null => {
    const s = useAppStore.getState();
    if (!s.currentTrack) return null;
    return {
      title: s.currentTrack.title || "Нет трека",
      artist: s.currentTrack.artist || "",
      cover: s.currentTrack.cover || null,
      isPlaying: s.isPlaying,
      progress: s.progress,
      duration: s.duration,
      volume: s.volume,
      progressPct: s.duration > 0 ? (s.progress / s.duration) * 100 : 0,
    };
  };

  win.__mqPipAction = (action: string, value?: any) => {
    const st = useAppStore.getState();
    switch (action) {
      case "togglePlay": st.togglePlay(); break;
      case "next": st.nextTrack(); break;
      case "prev": {
        if (st.progress > 3) {
          const audio = getAudioElement();
          if (audio) audio.currentTime = 0;
          st.setProgress(0);
        } else {
          st.prevTrack();
        }
        break;
      }
      case "toggleMute": st.setVolume(st.volume > 0 ? 0 : 70); break;
      case "seek": {
        const newTime = (value || 0) * (st.duration || 1);
        st.setProgress(newTime);
        const audio = getAudioElement();
        if (audio) audio.currentTime = newTime;
        break;
      }
    }
  };
}

// Initialize store API exposure on module load
if (typeof window !== "undefined") {
  exposeStoreAPI();
}

// ── BroadcastChannel helpers ───────────────────────────────────

function initBroadcast() {
  if (typeof window === "undefined") return;
  try {
    bc = new BroadcastChannel("mq-pip");

    bc.onmessage = (e) => {
      if (!e.data) return;

      if (e.data.type === "pip-ready") {
        // PiP tab just opened — send current state
        const state = (window as any).__mqPipGetState?.();
        if (state) bc!.postMessage({ type: "pip-state", state });
      }

      if (e.data.type === "pip-action") {
        (window as any).__mqPipAction?.(e.data.action, e.data.value);
      }
    };
  } catch { /* BroadcastChannel not supported */ }
}

function broadcastState() {
  const state = (window as any).__mqPipGetState?.();
  if (state && bc) {
    bc.postMessage({ type: "pip-state", state });
  }
}

// ── Public API ────────────────────────────────────────────────

export function openPiPPopup(): boolean {
  if (typeof window === "undefined") return false;

  // Already open → focus
  if (pipWindow && !pipWindow.closed) {
    pipWindow.focus();
    return true;
  }

  try {
    const pipUrl = "/pip";

    // Try opening as popup window with features (works in Chrome)
    let win = window.open(
      pipUrl,
      "mq-pip-player",
      `width=${PIP_WIDTH},height=${PIP_HEIGHT},resizable=yes,scrollbars=no,location=no,menubar=no,toolbar=no,status=no`
    );

    // If popup blocked, open as regular tab (works in Firefox)
    if (!win) {
      win = window.open(pipUrl, "mq-pip-player");
    }

    if (!win) {
      console.warn("[PiP] Cannot open window — falling back to overlay");
      return false;
    }

    pipWindow = win;

    // Initialize cross-tab communication
    initBroadcast();

    // Subscribe to store changes → broadcast to PiP tab
    unsubStore = useAppStore.subscribe(() => {
      if (!pipWindow || pipWindow.closed) return;
      broadcastState();
    });

    // Send initial state after a small delay (page needs to load)
    setTimeout(() => {
      if (!pipWindow || pipWindow.closed) return;
      broadcastState();
    }, 500);

    // Periodic state sync for smooth progress bar
    progressInterval = setInterval(() => {
      if (!pipWindow || pipWindow.closed) return;
      const audio = getAudioElement();
      if (audio && !audio.paused && audio.duration) {
        useAppStore.getState().setProgress(audio.currentTime);
        broadcastState();
      }
    }, 500);

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
    console.warn("[PiP] Failed to open PiP:", err);
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
  if (audioInterval) { clearInterval(audioInterval); audioInterval = null; }
  if (unsubStore) { unsubStore(); unsubStore = null; }
  if (mainUnloadHandler) { window.removeEventListener("beforeunload", mainUnloadHandler); mainUnloadHandler = null; }
  if (bc) { bc.close(); bc = null; }
  pipWindow = null;
  useAppStore.getState().setPiPActive(false);
}
