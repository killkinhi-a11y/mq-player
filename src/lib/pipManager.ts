/**
 * pipManager — Native Video PiP (Firefox + Chrome) + fallback popup/tab.
 *
 * PRIMARY: Uses HTMLVideoElement.requestPictureInPicture() with a hidden
 * <video> element whose source is a canvas-rendered mini player stream.
 * This creates a real browser-level PiP window that persists across tabs.
 * Works in Firefox 71+, Chrome 70+, Edge 79+.
 *
 * FALLBACK: Opens /pip page via window.open() as popup (Chrome) or new tab (Firefox).
 *
 * Audio plays from the main audio element — the PiP window provides visual feedback.
 * Playback controls work via MediaSession API (lock screen / system media controls).
 */

import { useAppStore } from "@/store/useAppStore";
import { getAudioElement, getAudioContext, getAnalyser, resumeAudioContext } from "@/lib/audioEngine";

// ── Canvas dimensions (16:9) ──────────────────────────────────
const CW = 640;
const CH = 360;

// ── Native PiP state ──────────────────────────────────────────
let nativeVideo: HTMLVideoElement | null = null;
let nativeCanvas: HTMLCanvasElement | null = null;
let nativeCtx: CanvasRenderingContext2D | null = null;
let nativeStream: MediaStream | null = null;
let audioDest: MediaStreamAudioDestinationNode | null = null;
let animFrame = 0;
let coverImg: HTMLImageElement | null = null;
let lastCoverUrl: string | null = null;
let isNativeActive = false;

// ── Popup/tab state (fallback) ────────────────────────────────
let popupWindow: Window | null = null;
let unsubStore: (() => void) | null = null;
let popupProgressInterval: ReturnType<typeof setInterval> | null = null;
let checkInterval: ReturnType<typeof setInterval> | null = null;
let mainUnloadHandler: (() => void) | null = null;
let bc: BroadcastChannel | null = null;

// ── Drawing helpers ───────────────────────────────────────────

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Canvas frame drawing ──────────────────────────────────────

function drawFrame() {
  if (!nativeCtx || !nativeCanvas) return;
  const ctx = nativeCtx;
  const w = CW;
  const h = CH;

  const state = useAppStore.getState();
  const { currentTrack, isPlaying, progress, duration, volume } = state;

  // ── Background — clean, no glow ──
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);

  if (!currentTrack) {
    ctx.fillStyle = "#555";
    ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MQ Player", w / 2, h / 2);
    return;
  }

  const title = currentTrack.title || "No track";
  const artist = currentTrack.artist || "";
  const pct = duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;

  // ── Cover art area ──
  const cx = 44;
  const cy = 55;
  const cs = 200;

  // Cover — no shadow, no border
  ctx.save();
  if (currentTrack.cover && coverImg && coverImg.complete && coverImg.naturalWidth > 0) {
    roundRect(ctx, cx, cy, cs, cs, 14);
    ctx.clip();
    ctx.drawImage(coverImg, cx, cy, cs, cs);
  } else {
    roundRect(ctx, cx, cy, cs, cs, 14);
    ctx.fillStyle = "rgba(224,49,49,0.2)";
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = '64px sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u266A", cx + cs / 2, cy + cs / 2);
  }
  ctx.restore();

  // ── Text area ──
  const tx = cx + cs + 32;

  // Title
  ctx.fillStyle = "#fff";
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // Truncate title to fit
  const maxTitleW = w - tx - 40;
  let displayTitle = title;
  while (ctx.measureText(displayTitle).width > maxTitleW && displayTitle.length > 1) {
    displayTitle = displayTitle.slice(0, -1);
  }
  if (displayTitle !== title) displayTitle += "\u2026";
  ctx.fillText(displayTitle, tx, cy + 18);

  // Artist
  ctx.fillStyle = "#999";
  ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  let displayArtist = artist;
  while (ctx.measureText(displayArtist).width > maxTitleW && displayArtist.length > 1) {
    displayArtist = displayArtist.slice(0, -1);
  }
  if (displayArtist !== artist) displayArtist += "\u2026";
  ctx.fillText(displayArtist, tx, cy + 58);

  // Playing indicator / status
  if (isPlaying) {
    const t = performance.now() / 1000;
    for (let i = 0; i < 4; i++) {
      const barH = 6 + 16 * Math.abs(Math.sin(t * 3.5 + i * 0.9));
      const alpha = 0.4 + (i / 4) * 0.4;
      ctx.fillStyle = `rgba(224,49,49,${alpha})`;
      roundRect(ctx, tx + i * 9, cy + 96 + 24 - barH, 5, barH, 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = "#555";
    ctx.font = '15px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText("\u25AE\u25AE Paused", tx, cy + 100);
  }

  // Volume indicator
  if (volume === 0) {
    ctx.fillStyle = "#e03131";
    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillText("Muted", tx, cy + 130);
  }

  // ── Progress bar ──
  const barX = tx;
  const barY = h - 72;
  const barW = w - barX - 40;
  const barH = 8;

  // Background
  roundRect(ctx, barX, barY, barW, barH, 4);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();

  // Fill
  if (pct > 0.005) {
    const fillW = Math.max(barH, barW * pct);
    roundRect(ctx, barX, barY, fillW, barH, 4);
    ctx.fillStyle = "#e03131";
    ctx.fill();
  }

  // Dot — no stroke border
  ctx.beginPath();
  ctx.arc(barX + barW * pct, barY + barH / 2, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#e03131";
  ctx.fill();

  // Time
  ctx.fillStyle = "#666";
  ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(fmt(Math.floor(progress)), barX, barY + 16);
  ctx.textAlign = "right";
  ctx.fillText(fmt(Math.floor(duration)), barX + barW, barY + 16);

  // ── Branding — subtle ──
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("MQ", w / 2, h - 8);
}

// ── Animation loop ────────────────────────────────────────────

function startAnimation() {
  if (animFrame) return;
  const loop = () => {
    if (!isNativeActive) return;
    drawFrame();
    animFrame = requestAnimationFrame(loop);
  };
  animFrame = requestAnimationFrame(loop);
}

function stopAnimation() {
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = 0;
  }
}

// ── Cover image preloader ─────────────────────────────────────

function loadCover(url: string | null) {
  if (!url) { lastCoverUrl = null; coverImg = null; return; }
  if (url === lastCoverUrl && coverImg) return;
  lastCoverUrl = url;
  coverImg = new Image();
  coverImg.crossOrigin = "anonymous";
  coverImg.src = url;
}

// ── Track change observer ─────────────────────────────────────

let lastTrackId: string | null = null;
function observeTrackChanges() {
  const check = () => {
    if (!isNativeActive) return;
    const track = useAppStore.getState().currentTrack;
    if (track?.id !== lastTrackId) {
      lastTrackId = track?.id || null;
      loadCover(track?.cover || null);
    }
    setTimeout(check, 1000);
  };
  check();
}

// ══════════════════════════════════════════════════════════════
// NATIVE VIDEO PiP
// ══════════════════════════════════════════════════════════════

async function openNativeVideoPiP(): Promise<boolean> {
  try {
    // Check browser support
    const video = document.createElement("video");
    if (typeof video.requestPictureInPicture !== "function") {
      console.log("[PiP] Native Video PiP not supported");
      return false;
    }

    // Already in PiP?
    if (document.pictureInPictureElement) {
      return true;
    }

    // Ensure AudioContext is running
    resumeAudioContext();

    // Create canvas
    if (!nativeCanvas) {
      nativeCanvas = document.createElement("canvas");
      nativeCanvas.width = CW;
      nativeCanvas.height = CH;
      nativeCtx = nativeCanvas.getContext("2d")!;
    }

    // Create video element (hidden, in DOM)
    if (!nativeVideo) {
      nativeVideo = document.createElement("video");
      nativeVideo.muted = true;
      nativeVideo.playsInline = true;
      nativeVideo.setAttribute("tabindex", "-1");
      nativeVideo.style.cssText =
        "position:fixed!important;top:-9999px!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;";
      document.body.appendChild(nativeVideo);
    }

    // Load cover art
    const track = useAppStore.getState().currentTrack;
    loadCover(track?.cover || null);
    lastTrackId = track?.id || null;

    // Draw first frame
    drawFrame();

    // Canvas stream
    if (!nativeStream) {
      nativeStream = nativeCanvas.captureStream(4);
    }

    // Capture audio from AudioContext (so PiP window can play audio)
    if (!audioDest) {
      try {
        const actx = getAudioContext();
        if (actx) {
          audioDest = actx.createMediaStreamDestination();
          const analyser = getAnalyser();
          if (analyser) {
            analyser.connect(audioDest);
          }
        }
      } catch (e) {
        console.warn("[PiP] Could not set up audio capture:", e);
      }
    }

    // Combine video + audio tracks
    const combinedStream = new MediaStream();
    for (const vt of nativeStream.getVideoTracks()) {
      combinedStream.addTrack(vt);
    }
    if (audioDest) {
      for (const at of audioDest.stream.getAudioTracks()) {
        combinedStream.addTrack(at);
      }
    }

    nativeVideo.srcObject = combinedStream;

    // ── CRITICAL: requestPictureInPicture() MUST be called synchronously
    // ── from user gesture, before any await. Firefox expires user
    // ── activation after the first microtask/macrotask boundary.
    // ── So we request PiP FIRST, then start playing.

    // Request Picture-in-Picture immediately (requires user gesture)
    await nativeVideo.requestPictureInPicture();

    // Start playing the video AFTER PiP is active (fire-and-forget)
    nativeVideo.play().catch(() => {
      // Video play is not critical — canvas stream still renders in PiP
    });

    isNativeActive = true;
    startAnimation();
    observeTrackChanges();

    // Video stays MUTED — audio plays from the main AudioContext/speakers.
    // Unmuting would cause double audio. The PiP window provides visual feedback,
    // while audio continues from the main page in any tab.

    console.log("[PiP] Native Video PiP activated");
    return true;
  } catch (e) {
    console.warn("[PiP] Native Video PiP failed:", e);
    isNativeActive = false;
    stopAnimation();
    return false;
  }
}

function onNativePiPClosed() {
  console.log("[PiP] Native Video PiP closed by user");
  isNativeActive = false;
  stopAnimation();

  if (nativeVideo) {
    try { nativeVideo.pause(); } catch {}
    nativeVideo.srcObject = null;
  }

  useAppStore.getState().setPiPActive(false);
}

function closeNativePiP() {
  try {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    }
  } catch {}

  isNativeActive = false;
  stopAnimation();

  if (nativeVideo) {
    try { nativeVideo.pause(); } catch {}
    nativeVideo.srcObject = null;
  }
}

// ══════════════════════════════════════════════════════════════
// POPUP/TAB FALLBACK (opens /pip page)
// ══════════════════════════════════════════════════════════════

function openPopupTab(): boolean {
  if (typeof window === "undefined") return false;

  if (popupWindow && !popupWindow.closed) {
    popupWindow.focus();
    return true;
  }

  try {
    const pipUrl = "/pip";

    // Try popup window (Chrome)
    let win = window.open(
      pipUrl,
      "mq-pip-player",
      "width=380,height=300,resizable=yes,scrollbars=no"
    );

    // Firefox blocks popup features → open as new tab
    if (!win) {
      win = window.open(pipUrl, "_blank");
    }

    if (!win) {
      console.warn("[PiP] Cannot open window — falling back to overlay");
      return false;
    }

    popupWindow = win;
    initBroadcast();

    unsubStore = useAppStore.subscribe(() => {
      if (!popupWindow || popupWindow.closed) return;
      broadcastState();
    });

    setTimeout(() => {
      if (!popupWindow || popupWindow.closed) return;
      broadcastState();
    }, 500);

    popupProgressInterval = setInterval(() => {
      if (!popupWindow || popupWindow.closed) return;
      const audio = getAudioElement();
      if (audio && !audio.paused && audio.duration) {
        useAppStore.getState().setProgress(audio.currentTime);
        broadcastState();
      }
    }, 500);

    checkInterval = setInterval(() => {
      if (popupWindow && popupWindow.closed) {
        onPopupClosed();
      }
    }, 1000);

    mainUnloadHandler = () => {
      if (popupWindow && !popupWindow.closed) popupWindow.close();
    };
    window.addEventListener("beforeunload", mainUnloadHandler);

    return true;
  } catch (err) {
    console.warn("[PiP] Failed to open popup:", err);
    return false;
  }
}

function closePopupTab() {
  if (popupWindow && !popupWindow.closed) {
    popupWindow.close();
  }
  onPopupClosed();
}

function onPopupClosed() {
  if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
  if (popupProgressInterval) { clearInterval(popupProgressInterval); popupProgressInterval = null; }
  if (unsubStore) { unsubStore(); unsubStore = null; }
  if (mainUnloadHandler) { window.removeEventListener("beforeunload", mainUnloadHandler); mainUnloadHandler = null; }
  if (bc) { bc.close(); bc = null; }
  popupWindow = null;
  // Don't call setPiPActive(false) here — the popup close handler in the /pip page does it
  // via window.close() → beforeunload
}

// ══════════════════════════════════════════════════════════════
// STORE API EXPOSURE (for /pip page via window.opener)
// ══════════════════════════════════════════════════════════════

function exposeStoreAPI() {
  if (typeof window === "undefined") return;
  const win = window as any;

  win.__mqPipGetState = (): object | null => {
    const s = useAppStore.getState();
    if (!s.currentTrack) return null;
    return {
      title: s.currentTrack.title || "No track",
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
      case "toggleMute": st.setVolume(st.volume > 0 ? 0 : 30); break;
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

if (typeof window !== "undefined") {
  exposeStoreAPI();
}

// ══════════════════════════════════════════════════════════════
// BROADCAST CHANNEL (cross-tab sync for /pip page)
// ══════════════════════════════════════════════════════════════

function initBroadcast() {
  if (typeof window === "undefined") return;
  try {
    bc = new BroadcastChannel("mq-pip");
    bc.onmessage = (e) => {
      if (!e.data) return;
      if (e.data.type === "pip-ready") {
        const state = (window as any).__mqPipGetState?.();
        if (state) bc!.postMessage({ type: "pip-state", state });
      }
      if (e.data.type === "pip-action") {
        (window as any).__mqPipAction?.(e.data.action, e.data.value);
      }
    };
  } catch { /* not supported */ }
}

function broadcastState() {
  const state = (window as any).__mqPipGetState?.();
  if (state && bc) bc.postMessage({ type: "pip-state", state });
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Open PiP — tries native Video PiP first (Firefox!), then falls back
 * to popup/tab, then to overlay (returns false).
 *
 * MUST be called from a user gesture (click handler) for native PiP to work.
 */
export async function openPiPPopup(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // If native PiP is already active, just return true
  if (isNativeActive || document.pictureInPictureElement) return true;

  // If popup tab is already open, focus it
  if (popupWindow && !popupWindow.closed) {
    popupWindow.focus();
    return true;
  }

  // 1) Try native Video PiP (works in Firefox!)
  try {
    const opened = await openNativeVideoPiP();
    if (opened) return true;
  } catch {
    // Native PiP failed, try fallback
  }

  // 2) Fall back to popup/tab
  return openPopupTab();
}

/**
 * Close PiP — closes whatever is open (native PiP, popup, or tab).
 */
export function closePiPPopup() {
  if (typeof window === "undefined") return;

  // Close native PiP
  closeNativePiP();

  // Close popup/tab
  closePopupTab();
}

/**
 * Check if any form of PiP is currently open.
 */
export function isPiPPopupOpen(): boolean {
  return (
    isNativeActive ||
    !!document.pictureInPictureElement ||
    (popupWindow !== null && !popupWindow.closed)
  );
}
