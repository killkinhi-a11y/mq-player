/**
 * useNativePiP — hook that manages a native Document Picture-in-Picture window.
 *
 * Uses the Document Picture-in-Picture API (Chrome 116+) to create an actual
 * floating window at the OS level, so the mini-player stays on top of ALL tabs.
 *
 * Falls back gracefully: if the API is unavailable, `isNativePiPSupported` returns false
 * and the caller should use the old overlay-based PiP instead.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { formatDuration } from "@/lib/musicApi";
import { getAudioElement } from "@/lib/audioEngine";

// Extend Window type for Document PiP API
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
    };
  }
}

export function isNativePiPAvailable(): boolean {
  return typeof window !== "undefined" && !!window.documentPictureInPicture;
}

interface PiPState {
  title: string;
  artist: string;
  cover: string | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  progressPct: number;
  accent: string;
}

export function useNativePiP() {
  const [isSupported] = useState(isNativePiPAvailable);
  const pipWindowRef = useRef<Window | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const openPiP = useCallback(async () => {
    if (!isSupported || !window.documentPictureInPicture) return false;

    // If already open, focus it
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.focus();
      return true;
    }

    try {
      const pip = await window.documentPictureInPicture.requestWindow({
        width: 360,
        height: 200,
      });
      pipWindowRef.current = pip;

      // Style the PiP window
      const doc = pip.document;
      const style = doc.createElement("style");
      style.textContent = getPiPCSS();
      doc.head.appendChild(style);

      // Create the body
      const body = doc.createElement("div");
      body.id = "mq-pip-root";
      body.innerHTML = getPiPHTML();
      doc.body.appendChild(body);

      // Apply theme variables from main page
      syncThemeVars(pip);

      // Wire up controls
      wireControls(pip);

      // Subscribe to store changes to keep the window updated
      const unsub = useAppStore.subscribe((state, prevState) => {
        const changed =
          state.currentTrack !== prevState.currentTrack ||
          state.isPlaying !== prevState.isPlaying ||
          state.progress !== prevState.progress ||
          state.duration !== prevState.duration ||
          state.volume !== prevState.volume;

        if (changed && pipWindowRef.current && !pipWindowRef.current.closed) {
          updatePiPContent(pipWindowRef.current, {
            title: state.currentTrack?.title || "Нет трека",
            artist: state.currentTrack?.artist || "",
            cover: state.currentTrack?.cover || null,
            isPlaying: state.isPlaying,
            progress: state.progress,
            duration: state.duration,
            volume: state.volume,
            progressPct: state.duration > 0 ? (state.progress / state.duration) * 100 : 0,
            accent: getAccentFromDocument(),
          });
        }
      });

      unsubRef.current = unsub;

      // Initial render
      const st = useAppStore.getState();
      updatePiPContent(pip, {
        title: st.currentTrack?.title || "Нет трека",
        artist: st.currentTrack?.artist || "",
        cover: st.currentTrack?.cover || null,
        isPlaying: st.isPlaying,
        progress: st.progress,
        duration: st.duration,
        volume: st.volume,
        progressPct: st.duration > 0 ? (st.progress / st.duration) * 100 : 0,
        accent: getAccentFromDocument(),
      });

      // Periodic sync for progress (smooth progress bar updates)
      const progressInterval = setInterval(() => {
        if (pipWindowRef.current && !pipWindowRef.current.closed) {
          const s = useAppStore.getState();
          const audio = getAudioElement();
          if (audio && !audio.paused && audio.duration) {
            s.setProgress(audio.currentTime);
          }
        }
      }, 500);

      // Clean up on window close
      pip.addEventListener("pagehide", () => {
        clearInterval(progressInterval);
        if (unsubRef.current) {
          unsubRef.current();
          unsubRef.current = null;
        }
        pipWindowRef.current = null;
        useAppStore.getState().setPiPActive(false);
      });

      // Also listen for beforeunload on the main page
      const handleMainUnload = () => {
        if (pipWindowRef.current && !pipWindowRef.current.closed) {
          pipWindowRef.current.close();
        }
        clearInterval(progressInterval);
      };
      window.addEventListener("beforeunload", handleMainUnload);

      // Store cleanup ref
      (pip as any)._cleanup = () => {
        clearInterval(progressInterval);
        window.removeEventListener("beforeunload", handleMainUnload);
        if (unsubRef.current) {
          unsubRef.current();
          unsubRef.current = null;
        }
      };

      return true;
    } catch (err) {
      console.warn("[PiP] Failed to open Document PiP window:", err);
      return false;
    }
  }, [isSupported]);

  const closePiP = useCallback(() => {
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      const cleanup = (pipWindowRef.current as any)._cleanup;
      if (cleanup) cleanup();
      pipWindowRef.current.close();
    }
    pipWindowRef.current = null;
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
  }, []);

  const isPiPOpen = useCallback(() => {
    return pipWindowRef.current !== null && !pipWindowRef.current.closed;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        const cleanup = (pipWindowRef.current as any)._cleanup;
        if (cleanup) cleanup();
        pipWindowRef.current.close();
      }
    };
  }, []);

  return { isSupported, openPiP, closePiP, isPiPOpen };
}

// ─── Helper functions ───────────────────────────────────────────

function getAccentFromDocument(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--mq-accent")
    .trim() || "#e03131";
}

function getTextColorFromDocument(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--mq-text")
    .trim() || "#ffffff";
}

function getCardBgFromDocument(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--mq-card")
    .trim() || "#1a1a1a";
}

function getBorderFromDocument(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--mq-border")
    .trim() || "#2a2a2a";
}

function getMutedFromDocument(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--mq-text-muted")
    .trim() || "#888";
}

function getGlowFromDocument(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--mq-glow")
    .trim() || "rgba(224,49,49,0.3)";
}

function syncThemeVars(pip: Window) {
  const root = pip.document.documentElement;
  root.style.setProperty("--mq-accent", getAccentFromDocument());
  root.style.setProperty("--mq-text", getTextColorFromDocument());
  root.style.setProperty("--mq-card", getCardBgFromDocument());
  root.style.setProperty("--mq-border", getBorderFromDocument());
  root.style.setProperty("--mq-text-muted", getMutedFromDocument());
  root.style.setProperty("--mq-glow", getGlowFromDocument());

  // Set background
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--mq-bg")
    .trim() || "#0e0e0e";
  pip.document.body.style.background = bg;
  pip.document.body.style.margin = "0";
  pip.document.body.style.padding = "0";
  pip.document.body.style.overflow = "hidden";

  // Title
  const title = pip.document.createElement("title");
  title.textContent = "MQ Player — Мини-плеер";
  pip.document.head.appendChild(title);
}

function wireControls(pip: Window) {
  const doc = pip.document;

  // Play/Pause
  const playBtn = doc.getElementById("pip-play");
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      useAppStore.getState().togglePlay();
    });
  }

  // Next
  const nextBtn = doc.getElementById("pip-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      useAppStore.getState().nextTrack();
    });
  }

  // Prev
  const prevBtn = doc.getElementById("pip-prev");
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

  // Close
  const closeBtn = doc.getElementById("pip-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      useAppStore.getState().setPiPActive(false);
    });
  }

  // Volume mute toggle
  const volBtn = doc.getElementById("pip-vol");
  if (volBtn) {
    volBtn.addEventListener("click", () => {
      const st = useAppStore.getState();
      st.setVolume(st.volume > 0 ? 0 : 70);
    });
  }

  // Seek on progress bar click
  const progressEl = doc.getElementById("pip-progress");
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

  // Volume slider
  const volSlider = doc.getElementById("pip-vol-slider");
  if (volSlider) {
    volSlider.addEventListener("click", (e) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      useAppStore.getState().setVolume(Math.round(pct * 100));
    });
  }
}

function updatePiPContent(pip: Window, s: PiPState) {
  const doc = pip.document;

  const titleEl = doc.getElementById("pip-title");
  if (titleEl) titleEl.textContent = s.title;

  const artistEl = doc.getElementById("pip-artist");
  if (artistEl) artistEl.textContent = s.artist;

  const coverEl = doc.getElementById("pip-cover");
  if (coverEl) {
    if (s.cover) {
      coverEl.innerHTML = `<img src="${s.cover}" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:cover;">`;
    } else {
      coverEl.innerHTML = `<div style="width:56px;height:56px;border-radius:12px;background:var(--mq-accent);opacity:0.4;display:flex;align-items:center;justify-content:center;font-size:20px;">&#9835;</div>`;
    }
  }

  // Play/pause icon
  const playIcon = doc.getElementById("pip-play-icon");
  if (playIcon) {
    playIcon.textContent = s.isPlaying ? "❚❚" : "▶";
    // Adjust positioning for play triangle
    if (!s.isPlaying) {
      (playIcon as HTMLElement).style.marginLeft = "2px";
    } else {
      (playIcon as HTMLElement).style.marginLeft = "0";
    }
  }

  // Progress bar fill
  const progressFill = doc.getElementById("pip-progress-fill");
  if (progressFill) {
    (progressFill as HTMLElement).style.width = `${s.progressPct}%`;
  }

  // Progress thumb
  const progressThumb = doc.getElementById("pip-progress-thumb");
  if (progressThumb) {
    (progressThumb as HTMLElement).style.left = `${s.progressPct}%`;
  }

  // Time display
  const timeCurrent = doc.getElementById("pip-time-current");
  if (timeCurrent) timeCurrent.textContent = formatDuration(Math.floor(s.progress));

  const timeTotal = doc.getElementById("pip-time-total");
  if (timeTotal) timeTotal.textContent = formatDuration(Math.floor(s.duration));

  // Volume icon
  const volIcon = doc.getElementById("pip-vol-icon");
  if (volIcon) {
    volIcon.textContent = s.volume === 0 ? "🔇" : "🔊";
  }

  // Volume slider fill
  const volFill = doc.getElementById("pip-vol-fill");
  if (volFill) {
    (volFill as HTMLElement).style.width = `${s.volume}%`;
  }

  // Glow on play button when playing
  const playBtn = doc.getElementById("pip-play") as HTMLElement | null;
  if (playBtn) {
    playBtn.style.boxShadow = s.isPlaying ? `0 0 14px var(--mq-glow)` : "none";
  }

  // EQ bars animation state
  const eqContainer = doc.getElementById("pip-eq");
  if (eqContainer) {
    eqContainer.style.display = s.isPlaying ? "flex" : "none";
  }

  // Accent color sync
  const accent = getAccentFromDocument();
  pip.document.documentElement.style.setProperty("--mq-accent", accent);
}

// ─── HTML / CSS templates ──────────────────────────────────────

function getPiPHTML(): string {
  return `
    <div id="mq-pip-container">
      <!-- Glow border -->
      <div id="pip-glow"></div>

      <!-- Header drag area -->
      <div id="pip-header">
        <div id="pip-drag-handle">
          <div id="pip-drag-bar"></div>
        </div>
      </div>

      <!-- Content -->
      <div id="pip-content">
        <div id="pip-cover"></div>
        <div id="pip-info">
          <div id="pip-title">Нет трека</div>
          <div id="pip-artist"></div>
        </div>
        <!-- EQ bars indicator -->
        <div id="pip-eq">
          <div class="eq-bar" style="--i:0"></div>
          <div class="eq-bar" style="--i:1"></div>
          <div class="eq-bar" style="--i:2"></div>
        </div>
      </div>

      <!-- Controls -->
      <div id="pip-controls">
        <button class="pip-ctrl-btn" id="pip-prev" title="Назад">⏮</button>
        <button class="pip-ctrl-btn pip-play-btn" id="pip-play" title="Воспроизвести">
          <span id="pip-play-icon">▶</span>
        </button>
        <button class="pip-ctrl-btn" id="pip-next" title="Далее">⏭</button>

        <div id="pip-vol-wrap">
          <button class="pip-ctrl-btn" id="pip-vol" title="Громкость">
            <span id="pip-vol-icon">🔊</span>
          </button>
          <div id="pip-vol-slider">
            <div id="pip-vol-fill" style="width:70%"></div>
          </div>
        </div>

        <button class="pip-ctrl-btn pip-close-btn" id="pip-close" title="Закрыть">✕</button>
      </div>

      <!-- Progress bar -->
      <div id="pip-progress">
        <div id="pip-progress-fill"></div>
        <div id="pip-progress-thumb"></div>
      </div>

      <!-- Time -->
      <div id="pip-time">
        <span id="pip-time-current">0:00</span>
        <span id="pip-time-mq" style="color:var(--mq-accent);font-size:8px;opacity:0.7;">MQ</span>
        <span id="pip-time-total">0:00</span>
      </div>
    </div>
  `;
}

function getPiPCSS(): string {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--mq-bg, #0e0e0e);
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }

    #mq-pip-container {
      position: relative;
      width: 100%;
      height: 100vh;
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      overflow: hidden;
    }

    #pip-glow {
      position: absolute;
      inset: -2px;
      border-radius: 14px;
      background: var(--mq-accent, #e03131);
      opacity: 0.12;
      filter: blur(10px);
      pointer-events: none;
      z-index: 0;
    }

    #pip-header {
      padding: 6px 12px 2px;
      display: flex;
      justify-content: center;
      position: relative;
      z-index: 1;
    }

    #pip-drag-handle {
      display: flex;
      justify-content: center;
      width: 100%;
      cursor: grab;
    }

    #pip-drag-bar {
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: var(--mq-border, #2a2a2a);
      opacity: 0.6;
    }

    #pip-content {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 14px 4px;
      position: relative;
      z-index: 1;
    }

    #pip-cover img {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      object-fit: cover;
    }

    #pip-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    #pip-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--mq-text, #fff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
    }

    #pip-artist {
      font-size: 11px;
      color: var(--mq-text-muted, #888);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.2;
    }

    #pip-eq {
      display: none;
      align-items: flex-end;
      gap: 2px;
      height: 20px;
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      opacity: 0.6;
    }

    .eq-bar {
      width: 3px;
      border-radius: 2px;
      background: var(--mq-accent, #e03131);
      animation: pipEq 0.6s ease-in-out calc(var(--i) * 0.15s) infinite alternate;
    }

    @keyframes pipEq {
      0% { height: 4px; }
      100% { height: 14px; }
    }

    #pip-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 2px 14px 4px;
      position: relative;
      z-index: 1;
    }

    .pip-ctrl-btn {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--mq-text-muted, #888);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      transition: background 0.15s;
      padding: 0;
      line-height: 1;
    }

    .pip-ctrl-btn:hover {
      background: rgba(255,255,255,0.08);
    }

    .pip-play-btn {
      width: 38px;
      height: 38px;
      background: var(--mq-accent, #e03131);
      color: var(--mq-text, #fff);
      font-size: 14px;
    }

    .pip-play-btn:hover {
      background: var(--mq-accent, #e03131);
      filter: brightness(1.15);
    }

    .pip-close-btn {
      background: rgba(255,255,255,0.06);
      color: var(--mq-text-muted, #888);
    }

    #pip-vol-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      position: relative;
    }

    #pip-vol-slider {
      width: 64px;
      height: 4px;
      border-radius: 2px;
      background: rgba(255,255,255,0.1);
      cursor: pointer;
      position: relative;
    }

    #pip-vol-fill {
      height: 100%;
      background: var(--mq-accent, #e03131);
      border-radius: 2px;
      transition: width 0.1s;
    }

    #pip-progress {
      height: 4px;
      background: rgba(255,255,255,0.08);
      position: relative;
      margin: 2px 14px 4px;
      border-radius: 2px;
      cursor: pointer;
      z-index: 1;
    }

    #pip-progress:hover {
      height: 6px;
    }

    #pip-progress-fill {
      height: 100%;
      background: var(--mq-accent, #e03131);
      border-radius: 2px;
      transition: width 0.1s linear;
      position: relative;
    }

    #pip-progress-thumb {
      position: absolute;
      top: 50%;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--mq-accent, #e03131);
      transform: translate(-50%, -50%);
      box-shadow: 0 0 6px var(--mq-glow, rgba(224,49,49,0.3));
      opacity: 0;
      transition: opacity 0.15s;
    }

    #pip-progress:hover #pip-progress-thumb {
      opacity: 1;
    }

    #pip-time {
      display: flex;
      justify-content: space-between;
      padding: 0 14px 8px;
      font-size: 9px;
      color: var(--mq-text-muted, #888);
      position: relative;
      z-index: 1;
    }
  `;
}
