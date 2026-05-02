"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1,
  Shuffle, Music, Loader2, PictureInPicture2, ListMusic,
  Heart, ThumbsDown, FileText, Download, ListEnd, Share2, Waves, Brain
} from "lucide-react";
import { formatDuration } from "@/lib/musicApi";
import { getAudioElement, initAudioEngine, getAnalyser, resumeAudioContext, resetCorsState, getInactiveAudio, crossfadeTo, cancelCrossfade } from "@/lib/audioEngine";
import { getLocalBlobUrl } from "./SearchView";
import { openPiPPopup, closePiPPopup } from "@/lib/pipManager";
import TrackCommentsPanel from "./TrackCommentsPanel";
import QueueView from "./QueueView";
import Hls from "hls.js";

async function resolveSoundCloudStream(scTrackId: number): Promise<{ url: string; isPreview: boolean; duration: number; fullDuration: number; isHls?: boolean } | null> {
  try {
    const res = await fetch(`/api/music/soundcloud/stream?trackId=${scTrackId}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    // Best case: Edge Function resolved the CDN URL directly
    if (data.url) {
      return {
        url: data.url,
        isPreview: !!data.isPreview,
        duration: data.duration || 0,
        fullDuration: data.fullDuration || 0,
        isHls: !!data.isHls,
      };
    }

    // Fallback: Edge couldn't resolve — try our CORS proxy with the template URL
    if (data.resolveUrl) {
      console.warn("[Player] Edge resolve failed, trying CORS proxy...");
      try {
        const proxyRes = await fetch(
          `/api/music/soundcloud/resolve-proxy?url=${encodeURIComponent(data.resolveUrl)}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (proxyRes.ok) {
          const proxyData = await proxyRes.json();
          if (proxyData.url) {
            return {
              url: proxyData.url,
              isPreview: !!data.isPreview,
              duration: data.duration || 0,
              fullDuration: data.fullDuration || 0,
              isHls: !!data.isHls,
            };
          }
        }
      } catch {
        // CORS proxy failed too
      }
    }

    return null;
  } catch {
    return null;
  }
}



function ShareButton({ scTrackId }: { scTrackId: number }) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}/track/${scTrackId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [scTrackId]);

  return (
    <div className="relative p-1 flex-shrink-0 hidden lg:flex items-center justify-center">
      <motion.button whileTap={{ scale: 0.85 }} onClick={handleShare}
        style={{ color: "var(--mq-text-muted)" }} title="Поделиться">
        <Share2 className="w-4 h-4" />
      </motion.button>
      {copied && (
        <span
          className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded whitespace-nowrap"
          style={{ background: "var(--mq-accent)", color: "#fff" }}
        >
          Скопировано!
        </span>
      )}
    </div>
  );
}

export default function PlayerBar() {
  const {
    currentTrack, isPlaying, volume, progress, duration,
    shuffle, repeat, togglePlay, nextTrack, prevTrack,
    setVolume, setProgress, setDuration, toggleShuffle, toggleRepeat,
    animationsEnabled, compactMode,
    setFullTrackViewOpen, setPiPActive, isPiPActive, pipMode,
    setPlaybackMode, requestShowSimilar, requestShowLyrics,
    toggleLike, toggleDislike, likedTrackIds, dislikedTrackIds,
    upNext, currentStyle, radioMode, smartShuffle, toggleRadioMode,
  } = useAppStore();

  const [showQueue, setShowQueue] = useState(false);

  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const crossfadeRef = useRef(false); // track if crossfade is in progress
  const prevTrackIdForCrossfade = useRef<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingTrack, _setIsLoadingTrack] = useState(false);
  const isLoadingTrackRef = useRef(false);
  // Wrapper that keeps the ref in sync with local state (needed for cross-handler checks)
  const setIsLoadingTrack = useCallback((val: boolean) => {
    isLoadingTrackRef.current = val;
    _setIsLoadingTrack(val);
  }, []);
  const [playError, _setPlayError] = useState(false);
  const playErrorRef = useRef(false);
  // Wrapper that keeps the ref in sync with local state (needed for cross-handler checks)
  const setPlayError = useCallback((val: boolean) => {
    playErrorRef.current = val;
    _setPlayError(val);
  }, []);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const retryingRef = useRef(false); // prevents concurrent retry attempts

  const prevTrackRef = useRef(prevTrack);
  const nextTrackRef = useRef(nextTrack);
  const setProgressRef = useRef(setProgress);
  const setDurationRef = useRef(setDuration);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => { prevTrackRef.current = prevTrack; }, [prevTrack]);
  useEffect(() => { nextTrackRef.current = nextTrack; }, [nextTrack]);
  useEffect(() => { setProgressRef.current = setProgress; }, [setProgress]);
  useEffect(() => { setDurationRef.current = setDuration; }, [setDuration]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // ── Audio element + Web Audio init (shared engine) ──
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = getAudioElement();
    audioRef.current = audio;

    initAudioEngine(audio);

    // Helper to always get the current active audio element
    const getActive = () => getAudioElement();

    const onTimeUpdate = () => {
      const a = getActive();
      if (!isDragging && a) setProgressRef.current(a.currentTime);
      // Update MediaSession position state for lock-screen progress bar
      if ("mediaSession" in navigator && navigator.mediaSession && a?.duration && isFinite(a.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: a.duration,
            playbackRate: a.playbackRate,
            position: a.currentTime,
          });
        } catch {}
      }
    };
    const onLoaded = () => {
      const a = getActive();
      if (a?.duration && isFinite(a.duration)) setDurationRef.current(a.duration);
    };
    const onEnded = () => {
      setPlayError(false);
      crossfadeRef.current = false;
      const st = useAppStore.getState();
      // Record track completion for feedback
      const currentTrackId = st.currentTrack?.id;
      if (currentTrackId) {
        useAppStore.getState().recordComplete(currentTrackId, st.progress || 0);
      }
      if (st.repeat === "one") {
        const a = getActive();
        if (a) {
          a.currentTime = 0;
          a.play().catch(() => {});
          setProgressRef.current(0);
        }
      } else {
        const st2 = useAppStore.getState();
        if (st2.currentTrack?.id && st2.progress > 0) {
          st2.recordComplete(st2.currentTrack.id, st2.progress);
        }
        nextTrackRef.current();
      }
    };
    const onError = () => {
      // Prevent concurrent retries — only one retry chain at a time
      if (retryingRef.current) return;

      const audioEl = getActive();
      const st = useAppStore.getState();
      const isSCTrack = !!st.currentTrack?.scTrackId;

      // Save playback position for mid-playback recovery
      const savedPosition = audioEl?.currentTime || 0;
      const wasMidPlayback = savedPosition > 1 && !isLoadingTrackRef.current;

      // For SoundCloud tracks: re-resolve stream URL instead of reloading same (possibly expired) URL
      if (isSCTrack && st.currentTrack?.scTrackId && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        retryingRef.current = true;
        const scId = st.currentTrack.scTrackId;
        console.warn(`[Player] Error on SC track${wasMidPlayback ? ' (mid-playback)' : ''}, re-resolving stream (attempt ${retryCountRef.current}/${maxRetries})`);

        resolveSoundCloudStream(scId).then(stream => {
          retryingRef.current = false;
          // Check if track hasn't changed during retry
          const currentSt = useAppStore.getState();
          if (currentSt.currentTrack?.scTrackId !== scId) return;

          let finalUrl: string | null = stream?.url || null;

          if (finalUrl) {
            const a = getActive();
            if (a) {
              // Clean up any previous HLS instance before switching source
              const prevHls = (a as any)._hlsInstance;
              if (prevHls) { try { prevHls.destroy(); } catch {} delete (a as any)._hlsInstance; }

              a.crossOrigin = 'anonymous';
              a.src = finalUrl;
              a.load();
              a.play().then(() => {
                // Restore position if this was a mid-playback recovery
                if (wasMidPlayback && isFinite(savedPosition)) {
                  a.currentTime = savedPosition;
                }
              }).catch(() => {});
            }
          } else {
            setPlayError(true);
            setIsLoadingTrack(false);
            setTimeout(() => { nextTrackRef.current(); }, 1500);
          }
        }).catch(() => {
          retryingRef.current = false;
          setPlayError(true);
          setIsLoadingTrack(false);
          setTimeout(() => { nextTrackRef.current(); }, 1500);
        });
        return;
      }

      // Non-SC tracks or max retries: try reloading same URL once more
      if (audioEl?.src && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        retryingRef.current = true;
        console.warn(`[Player] Error loading track, retry ${retryCountRef.current}/${maxRetries}`);
        setTimeout(() => {
          retryingRef.current = false;
          audioEl.load();
          audioEl.play().catch(() => {
            setPlayError(true);
            setIsLoadingTrack(false);
          });
        }, 1000 * retryCountRef.current);
      } else {
        setPlayError(true);
        setIsLoadingTrack(false);
        console.warn(`[Player] Max retries reached, auto-skipping to next track`);
        setTimeout(() => {
          if (playErrorRef.current && useAppStore.getState().currentTrack) {
            nextTrackRef.current();
          }
        }, 2000);
      }
    };
    const onCanPlay = () => {
      setIsLoadingTrack(false);
      setPlayError(false);
      retryCountRef.current = 0; // reset retry count on successful load
      resumeAudioContext();
      const st = useAppStore.getState();
      if (st.isPlaying) {
        const a = getActive();
        if (a && !crossfadeRef.current) a.play().catch(() => {});
      }
    };
    const onPlaying = (e: Event) => {
      setIsLoadingTrack(false);
      setPlayError(false);
      retryCountRef.current = 0; // reset on confirmed playback
      resumeAudioContext();
      // Only auto-resume if this event is from the currently active audio element
      // Prevents secondary crossfade element from re-triggering play after user pauses
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;
      if (!useAppStore.getState().isPlaying) {
        useAppStore.getState().togglePlay();
      }
    };

    // Listen on both audio elements
    const addListeners = (el: HTMLAudioElement) => {
      el.addEventListener("timeupdate", onTimeUpdate);
      el.addEventListener("loadedmetadata", onLoaded);
      el.addEventListener("canplay", onCanPlay);
      el.addEventListener("durationchange", onLoaded);
      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);
      el.addEventListener("playing", onPlaying);
    };
    const removeListeners = (el: HTMLAudioElement) => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("durationchange", onLoaded);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      el.removeEventListener("playing", onPlaying);
    };

    addListeners(audio);
    // Also listen on the secondary audio element for crossfade
    const secondary = getInactiveAudio();
    if (secondary) addListeners(secondary);

    return () => {
      removeListeners(audio);
      if (secondary) removeListeners(secondary);
      // Clean up HLS instances
      const destroyHls = (el: HTMLAudioElement) => {
        const hls = (el as any)._hlsInstance;
        if (hls) { try { hls.destroy(); } catch {} delete (el as any)._hlsInstance; }
      };
      destroyHls(audio);
      if (secondary) destroyHls(secondary);
      audio.pause();
      audio.src = "";
      if (secondary) { secondary.pause(); secondary.src = ""; }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ── Style-Aware Canvas Visualization ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Helper: resize canvas to match display
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    // Helper: get accent color RGB
    const getAccent = () => {
      const c = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      if (c.startsWith("#") && c.length >= 7) {
        return { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) };
      }
      return { r: 224, g: 49, b: 49 };
    };

    // ═══════════════════════════════════════════════════════════════════
    // iPod 2001 — Monochrome Equalizer Bars
    // Like the classic iPod battery/signal meter: thin vertical bars
    // ═══════════════════════════════════════════════════════════════════
    const drawIpod = () => {
      animFrameRef.current = requestAnimationFrame(drawIpod);
      resize();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const t = performance.now() / 1000;
      const barCount = Math.floor(w / 4);
      const barW = 2;
      const gap = (w - barCount * barW) / (barCount + 1);

      for (let i = 0; i < barCount; i++) {
        const x = gap + i * (barW + gap);
        // Pseudo-random height based on sine waves
        const freq1 = Math.sin(t * 2.0 + i * 0.3) * 0.3;
        const freq2 = Math.sin(t * 3.5 + i * 0.15) * 0.2;
        const freq3 = Math.cos(t * 1.5 + i * 0.5) * 0.15;
        const norm = 0.5 + freq1 + freq2 + freq3;
        const barH = Math.max(2, Math.min(h * 0.9, norm * h));

        // Blue gradient from bottom: bright to dim
        const grad = ctx.createLinearGradient(x, h, x, h - barH);
        grad.addColorStop(0, "rgba(42,127,255,0.8)");
        grad.addColorStop(0.5, "rgba(42,127,255,0.4)");
        grad.addColorStop(1, "rgba(42,127,255,0.1)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, h - barH, barW, barH);
      }
    };

    // ═══════════════════════════════════════════════════════════════════
    // Japan — Cherry Blossom Petals Falling
    // Soft pink petals drifting down with gentle sway + ripple circles
    // ═══════════════════════════════════════════════════════════════════
    interface Petal {
      x: number; y: number; size: number; speed: number; sway: number;
      phase: number; rot: number; rotSpeed: number; opacity: number;
    }
    const petals: Petal[] = Array.from({ length: 25 }, () => ({
      x: Math.random() * 1200,
      y: Math.random() * 60 - 60,
      size: 2 + Math.random() * 4,
      speed: 0.3 + Math.random() * 0.5,
      sway: 0.3 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.03,
      opacity: 0.2 + Math.random() * 0.5,
    }));

    const drawJapan = () => {
      animFrameRef.current = requestAnimationFrame(drawJapan);
      resize();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const t = performance.now() / 1000;

      // Subtle ink wash wave at bottom
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 3) {
        const y = h * 0.7 + Math.sin(t * 0.8 + x * 0.008) * h * 0.12
          + Math.sin(t * 1.3 + x * 0.015) * h * 0.06;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      const waveGrad = ctx.createLinearGradient(0, h * 0.5, 0, h);
      waveGrad.addColorStop(0, "rgba(139,34,82,0.04)");
      waveGrad.addColorStop(1, "rgba(139,34,82,0.01)");
      ctx.fillStyle = waveGrad;
      ctx.fill();

      // Thin red accent line
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const y = h * 0.55 + Math.sin(t * 0.8 + x * 0.008) * h * 0.12
          + Math.sin(t * 1.3 + x * 0.015) * h * 0.06;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(139,34,82,0.2)";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Falling petals
      for (const p of petals) {
        p.y += p.speed;
        p.x += Math.sin(t * p.sway + p.phase) * 0.4;
        p.rot += p.rotSpeed;

        if (p.y > h + 10) {
          p.y = -10;
          p.x = Math.random() * w;
        }
        if (p.x < -20) p.x = w + 10;
        if (p.x > w + 20) p.x = -10;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.opacity;

        // Petal shape: two overlapping ellipses
        ctx.fillStyle = "rgba(232,180,188,0.6)";
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(245,210,215,0.4)";
        ctx.beginPath();
        ctx.ellipse(p.size * 0.3, 0, p.size * 0.6, p.size * 0.35, 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.restore();
      }
    };

    // ═══════════════════════════════════════════════════════════════════
    // Swag — Gold Particle Storm + EQ Bars
    // Bold gold particles shooting up, thick EQ bars, street energy
    // ═══════════════════════════════════════════════════════════════════
    interface GoldParticle {
      x: number; y: number; vx: number; vy: number; size: number;
      life: number; maxLife: number; bright: boolean;
    }
    const goldParticles: GoldParticle[] = Array.from({ length: 35 }, () => ({
      x: Math.random() * 1200,
      y: 60 + Math.random() * 20,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -(0.5 + Math.random() * 1.5),
      size: 1 + Math.random() * 2.5,
      life: Math.random() * 100,
      maxLife: 60 + Math.random() * 80,
      bright: Math.random() > 0.7,
    }));

    const drawSwag = () => {
      animFrameRef.current = requestAnimationFrame(drawSwag);
      resize();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const t = performance.now() / 1000;

      // Thick EQ bars from center, spreading outward
      const barCount = 32;
      const totalBarW = w * 0.8;
      const barW = totalBarW / barCount * 0.7;
      const barGap = totalBarW / barCount * 0.3;
      const startX = (w - totalBarW) / 2;

      for (let i = 0; i < barCount; i++) {
        // Symmetric from center
        const dist = Math.abs(i - barCount / 2) / (barCount / 2);
        const f1 = Math.sin(t * 3.0 + i * 0.4) * 0.35;
        const f2 = Math.sin(t * 5.0 + i * 0.2) * 0.2;
        const f3 = Math.cos(t * 2.0 + i * 0.6) * 0.15;
        const norm = Math.max(0.05, 0.5 + f1 + f2 + f3);
        const barH = Math.max(1, norm * h * (1 - dist * 0.4));

        const x = startX + i * (barW + barGap);

        // Gold gradient: bright core, dark edges
        const grad = ctx.createLinearGradient(x, h, x, h - barH);
        grad.addColorStop(0, "rgba(184,151,46,0.9)");
        grad.addColorStop(0.4, "rgba(212,175,55,0.7)");
        grad.addColorStop(1, "rgba(212,175,55,0.2)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, h - barH, barW, barH);

        // Glow on top of tall bars
        if (norm > 0.6) {
          ctx.fillStyle = "rgba(255,215,0,0.15)";
          ctx.fillRect(x - 1, h - barH - 2, barW + 2, 4);
        }
      }

      // Gold particles rising up
      for (const p of goldParticles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        if (p.life > p.maxLife || p.y < -10) {
          p.x = Math.random() * w;
          p.y = h + 5;
          p.life = 0;
          p.maxLife = 60 + Math.random() * 80;
          p.vy = -(0.5 + Math.random() * 1.5);
          p.vx = (Math.random() - 0.5) * 1.5;
        }

        const lifeRatio = 1 - p.life / p.maxLife;
        const alpha = lifeRatio < 0.3 ? lifeRatio / 0.3 : (lifeRatio > 0.7 ? (1 - lifeRatio) / 0.3 : 1);

        if (p.bright) {
          ctx.fillStyle = `rgba(255,215,0,${alpha * 0.8})`;
          ctx.shadowColor = "rgba(212,175,55,0.5)";
          ctx.shadowBlur = 4;
        } else {
          ctx.fillStyle = `rgba(212,175,55,${alpha * 0.5})`;
          ctx.shadowBlur = 0;
        }
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.shadowBlur = 0;
      }
    };

    // ═══════════════════════════════════════════════════════════════════
    // Default — Composite sinusoidal waves (original)
    // ═══════════════════════════════════════════════════════════════════
    const waves = [
      { segs: 40, speed: 0.6, amp: 0.35, phase: 0, yOff: 0.5, alpha: 0.5, lw: 1.5 },
      { segs: 55, speed: 0.9, amp: 0.25, phase: 1.2, yOff: 0.5, alpha: 0.3, lw: 1.0 },
      { segs: 30, speed: 0.4, amp: 0.45, phase: 2.5, yOff: 0.5, alpha: 0.2, lw: 1.0 },
      { segs: 70, speed: 1.2, amp: 0.15, phase: 3.8, yOff: 0.5, alpha: 0.15, lw: 0.8 },
    ];
    const particles = Array.from({ length: 20 }, () => ({
      waveIdx: Math.floor(Math.random() * waves.length),
      xFrac: Math.random(),
      size: 1 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.8 + Math.random() * 2.0,
    }));

    const drawDefault = () => {
      animFrameRef.current = requestAnimationFrame(drawDefault);
      resize();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const { r, g, b } = getAccent();
      const t = performance.now() / 1000;

      for (const wave of waves) {
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < wave.segs; i++) {
          const x = (i / (wave.segs - 1)) * w;
          const xn = i / (wave.segs - 1);
          const yNorm = 0.6 * Math.sin(t * wave.speed + wave.phase + 0.7 * xn * Math.PI * 2)
            + 0.3 * Math.sin(t * wave.speed * 1.7 + 0.5 * wave.phase + 1.3 * xn * Math.PI * 2)
            + 0.1 * Math.cos(t * wave.speed * 0.5 + 2.1 * xn * Math.PI * 2);
          const y = wave.yOff * h - yNorm * wave.amp * h;
          points.push({ x, y });
        }

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha * 0.3})`;
        ctx.lineWidth = wave.lw + 4;
        ctx.lineJoin = "bevel";
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha})`;
        ctx.lineWidth = wave.lw;
        ctx.stroke();

        const gradient = ctx.createLinearGradient(0, wave.yOff * h - wave.amp * h, 0, h);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${wave.alpha * 0.12})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      for (const p of particles) {
        const wave = waves[p.waveIdx];
        const xn = p.xFrac;
        const yNorm = 0.6 * Math.sin(t * wave.speed + wave.phase + 0.7 * xn * Math.PI * 2)
          + 0.3 * Math.sin(t * wave.speed * 1.7 + 0.5 * wave.phase + 1.3 * xn * Math.PI * 2)
          + 0.1 * Math.cos(t * wave.speed * 0.5 + 2.1 * xn * Math.PI * 2);
        const px = xn * w;
        const py = wave.yOff * h - yNorm * wave.amp * h;
        const tw = 0.3 + 0.7 * Math.pow(Math.sin(t * p.twinkle + p.phase), 2);
        const alpha = tw * (0.3 + wave.alpha * 0.5);
        const size = p.size * (0.5 + tw * 0.5);
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      }
    };

    // ── Choose renderer based on style ──
    switch (currentStyle) {
      case "ipod-2001": drawIpod(); break;
      case "japan": drawJapan(); break;
      case "swag": drawSwag(); break;
      default: drawDefault(); break;
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [currentTrack?.id, currentStyle]);

  // ── Handle track change ─────────────────────────────────
  const prevTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentTrack) {
      setPlaybackMode("idle");
      return;
    }

    if (currentTrack.id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = currentTrack.id;
      setProgress(0);
      retryCountRef.current = 0;
      // (diversity set removed — server resolves CDN URLs now)
    }

    // Cancellation flag — prevents race conditions from rapid track switching
    let cancelled = false;

    const loadTrack = async () => {
      try {
        setIsLoadingTrack(true);
        setPlayError(false);
        retryCountRef.current = 0;

        // Determine if crossfade is possible (needs a previous track that was playing)
        const canCrossfade = prevTrackIdForCrossfade.current !== null
          && prevTrackIdForCrossfade.current !== currentTrack.id
          && useAppStore.getState().isPlaying;

        // Get the audio element to use
        // For crossfade: use the inactive element, preload, then crossfade
        // For first load or no crossfade: use the active element directly
        const audioEl = canCrossfade ? getInactiveAudio() : getAudioElement();
        if (!audioEl) return;
        audioEl.pause();

        // Clean up any previous HLS instance on this audio element
        const prevHls = (audioEl as any)._hlsInstance;
        if (prevHls) { try { prevHls.destroy(); } catch {} delete (audioEl as any)._hlsInstance; }

        if (cancelled) return;

        if (currentTrack.source === "soundcloud" && currentTrack.scTrackId) {
          // Inline SoundCloud stream resolution (no separate callback to avoid extra async hop)
          setPlaybackMode("soundcloud");
          resetCorsState(); // will be auto-detected — proxy has CORS so real data will work

          const stream = await resolveSoundCloudStream(currentTrack.scTrackId);
          if (cancelled) return;

          if (stream && stream.url) {
            const isHlsStream = stream.isHls && Hls.isSupported();

            if (isHlsStream) {
              // Use HLS.js for HLS streams (some tracks only have HLS, no progressive MP3)
              audioEl.crossOrigin = "anonymous";
              const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
              });
              hls.loadSource(stream.url);
              hls.attachMedia(audioEl);
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (!cancelled) {
                  if (canCrossfade) {
                    crossfadeRef.current = true;
                    audioEl.play().catch(() => {});
                    crossfadeTo(audioEl);
                  } else {
                    cancelCrossfade();
                    audioEl.play().catch(() => {});
                  }
                  prevTrackIdForCrossfade.current = currentTrack.id;
                }
              });
              hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data.fatal) {
                  console.error(`[Player] HLS fatal error:`, data.type, data.details);
                  hls.destroy();
                  // Let the global onError handler retry
                }
              });
              // Store hls instance for cleanup
              (audioEl as any)._hlsInstance = hls;
              // Don't wait for canplay — HLS.js handles its own loading
              if (canCrossfade) {
                // Wait for MANIFEST_PARSED event above
              } else {
                // Wait for MANIFEST_PARSED event above
              }
            } else {
              // Standard progressive stream or native HLS (Safari)
              // SC CDN returns CORS headers — play directly for reliability
              audioEl.crossOrigin = "anonymous";
              audioEl.src = stream.url;

              // Wait for audio to be ready before playing/crossfading
              let loadFailed = false;
              await new Promise<void>((resolve) => {
                const onCanPlay = () => {
                  audioEl.removeEventListener("canplay", onCanPlay);
                  audioEl.removeEventListener("error", onError);
                  resolve();
                };
                const onError = () => {
                  audioEl.removeEventListener("canplay", onCanPlay);
                  audioEl.removeEventListener("error", onError);
                  loadFailed = true;
                  resolve();
                };
                audioEl.addEventListener("canplay", onCanPlay);
                audioEl.addEventListener("error", onError);
                audioEl.load();
                // Timeout fallback
                setTimeout(resolve, 5000);
              });

              if (cancelled) return;

              if (loadFailed) {
                if (!retryingRef.current) {
                  setIsLoadingTrack(false);
                }
                return;
              }

              if (canCrossfade) {
                crossfadeRef.current = true;
                audioEl.play().catch(() => {});
                crossfadeTo(audioEl);
                prevTrackIdForCrossfade.current = currentTrack.id;
              } else {
                cancelCrossfade();
                audioEl.play().catch(() => {});
                prevTrackIdForCrossfade.current = currentTrack.id;
              }
            }
          } else if (currentTrack.audioUrl) {
            resetCorsState();
            audioEl.src = currentTrack.audioUrl;
            audioEl.load();
            if (canCrossfade) {
              crossfadeRef.current = true;
              audioEl.play().catch(() => {});
              crossfadeTo(audioEl);
            } else {
              cancelCrossfade();
              audioEl.play().catch(() => {});
            }
            prevTrackIdForCrossfade.current = currentTrack.id;
          } else {
            setPlayError(true);
            setIsLoadingTrack(false);
            setTimeout(() => nextTrackRef.current(), 1500);
          }
        } else if (currentTrack.audioUrl || currentTrack.id.startsWith("local_")) {
          setPlaybackMode("soundcloud");

          // For local tracks: use client-side blob URL (server doesn't persist files)
          let audioSrc = currentTrack.audioUrl;
          if (currentTrack.id.startsWith("local_")) {
            const blobUrl = getLocalBlobUrl(currentTrack.id);
            if (blobUrl) {
              audioSrc = blobUrl;
            } else if (!audioSrc || audioSrc === "blob://client-side") {
              // No blob URL available (e.g. page was reloaded)
              setPlayError(true);
              setIsLoadingTrack(false);
              setTimeout(() => nextTrackRef.current(), 1500);
              return;
            }
          }

          audioEl.crossOrigin = "anonymous";
          resetCorsState();
          audioEl.src = audioSrc;
          audioEl.load();
          if (canCrossfade) {
            crossfadeRef.current = true;
            audioEl.play().catch(() => {});
            crossfadeTo(audioEl);
          } else {
            cancelCrossfade();
            audioEl.play().catch(() => {});
          }
          prevTrackIdForCrossfade.current = currentTrack.id;
        } else {
          setPlayError(true);
          setIsLoadingTrack(false);
          setTimeout(() => nextTrackRef.current(), 1500);
        }
      } catch (err) {
        console.error("loadTrack error:", err);
        setPlayError(true);
        setIsLoadingTrack(false);
        setTimeout(() => nextTrackRef.current(), 2000);
      }
    };

    loadTrack();

    return () => { cancelled = true; };
  }, [currentTrack?.id]);

  // ── Override prevTrack: seek audio to 0 when progress > 3s ──
  const handlePrevTrack = useCallback(() => {
    const st = useAppStore.getState();
    if (st.progress > 3) {
      // Seek audio element to beginning instead of just setting store state
      const audio = getAudioElement();
      if (audio && audio.src) {
        audio.currentTime = 0;
      }
      const secondary = getInactiveAudio();
      if (secondary && secondary.src) {
        secondary.currentTime = 0;
      }
      st.setProgress(0);
    } else {
      st.prevTrack();
    }
  }, []);

  const handlePrevTrackRef = useRef(handlePrevTrack);
  useEffect(() => { handlePrevTrackRef.current = handlePrevTrack; }, [handlePrevTrack]);

  // ── Handle play/pause ───────────────────────────────────
  useEffect(() => {
    // Always use the current active audio element (not stale audioRef)
    const audio = getAudioElement();
    const secondary = getInactiveAudio();

    if (isPlaying) {
      resumeAudioContext();
      if (!audio.src || audio.readyState < 2) return;
      audio.play().catch((err) => {
        // Don't flip isPlaying back for non-critical errors (e.g., was already playing)
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          // For real errors, try once more
          setTimeout(() => {
            getAudioElement().play().catch(() => useAppStore.getState().togglePlay());
          }, 500);
        } else if (err.name === 'NotAllowedError') {
          useAppStore.getState().togglePlay();
        }
      });
    } else {
      // Pause BOTH audio elements to handle crossfade state
      if (audio.src) audio.pause();
      if (secondary && secondary.src) secondary.pause();
    }
  }, [isPlaying]);

  // ── Handle volume ───────────────────────────────────────
  useEffect(() => {
    // Quadratic curve: human hearing is logarithmic.
    // volume=10% → 1% actual, volume=30% → 9%, volume=100% → 100%
    // This makes low volumes MUCH quieter, like a real audio player.
    const vol = Math.pow(volume / 100, 2);
    getAudioElement().volume = vol;
    const secondary = getInactiveAudio();
    if (secondary) secondary.volume = vol;
  }, [volume]);

  // ── Media Session API — lock screen / notification controls ──
  useEffect(() => {
    if (!currentTrack || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || "Unknown",
      artist: currentTrack.artist || "Unknown",
      album: currentTrack.album || "MQ Player",
      artwork: currentTrack.cover ? [{ src: currentTrack.cover, sizes: "512x512", type: "image/jpeg" }] : [],
    });

    // Set handlers once — they use store.getState() dynamically so they always work
    // Don't null them in cleanup to keep notification controls alive during track switches
    navigator.mediaSession.setActionHandler("play", () => {
      resumeAudioContext();
      const st = useAppStore.getState();
      if (!st.isPlaying) st.togglePlay();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      const st = useAppStore.getState();
      if (st.isPlaying) st.togglePlay();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      resumeAudioContext();
      handlePrevTrackRef.current();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      resumeAudioContext();
      useAppStore.getState().nextTrack();
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details && details.seekTime !== undefined) {
        const audio = getAudioElement();
        audio.currentTime = details.seekTime;
        setProgressRef.current(details.seekTime);
      }
    });
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const audio = getAudioElement();
      const offset = details?.seekOffset || 10;
      audio.currentTime = Math.max(0, audio.currentTime - offset);
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const audio = getAudioElement();
      const offset = details?.seekOffset || 10;
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + offset);
    });
    navigator.mediaSession.setActionHandler("stop", () => {
      const st = useAppStore.getState();
      if (st.isPlaying) st.togglePlay();
    });

    // No cleanup — handlers stay active for background playback
  }, [currentTrack?.id]);

  // ── Update MediaSession playback state & position for notifications ──
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
      if (isPlaying && duration > 0 && "updatePositionState" in navigator.mediaSession) {
        (navigator.mediaSession as any).updatePositionState({
          duration: duration,
          playbackRate: 1,
          position: Math.min(progress, duration),
        });
      }
    } catch {}
  }, [isPlaying, progress, duration]);

  // ── Volume mouse wheel — works on the whole player bar (native listener) ──────────────
  const playerBarRef = useRef<HTMLDivElement>(null);
  const volumeSectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = playerBarRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -2 : 2;
      useAppStore.getState().setVolume(Math.round(Math.max(0, Math.min(100, useAppStore.getState().volume + delta))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Progress drag/seek ──────────────────────────────────
  const seekToPosition = useCallback((clientX: number) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const newTime = pct * duration;
    setProgress(newTime);

    const audio = getAudioElement();
    audio.currentTime = newTime;
  }, [duration, setProgress]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    seekToPosition(e.clientX);
    const onMove = (ev: MouseEvent) => seekToPosition(ev.clientX);
    const onUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [seekToPosition]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    seekToPosition(e.touches[0].clientX);
    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      seekToPosition(ev.touches[0].clientX);
    };
    const onEnd = () => {
      setIsDragging(false);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  }, [seekToPosition]);

  // ── Volume click ────────────────────────────────────────
  const handleVolumeClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setVolume(Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100))));
  }, [setVolume]);

  // ── Render ──────────────────────────────────────────────
  if (!currentTrack) return null;

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  const modeLabel = (() => {
    if (isLoadingTrack) return null;
    if (currentTrack.scIsFull) {
      return <span style={{ color: "#ff5500", marginLeft: 6, fontSize: 10 }}>&#9654; Полный трек</span>;
    }
    return <span style={{ color: "var(--mq-text-muted)", marginLeft: 6, fontSize: 10 }}>Превью 30с</span>;
  })();

  return (
    <motion.div
      ref={playerBarRef}
      initial={animationsEnabled ? { y: 100 } : undefined}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
      className="fixed left-0 right-0 z-40 lg:bottom-0 bottom-[56px]"
      style={{ backgroundColor: "var(--mq-player-bg)", borderTop: "1px solid var(--mq-border)", touchAction: "none" }}
    >
      {/* Progress bar */}
      <div
        ref={progressRef}
        onMouseDown={handleProgressMouseDown}
        onTouchStart={handleProgressTouchStart}
        className={`w-full ${compactMode ? "h-1" : "h-1.5"} cursor-pointer group relative`}
        style={{ backgroundColor: "var(--mq-border)" }}
      >
        <div className="h-full transition-all duration-100" style={{
          width: `${progressPct}%`,
          backgroundColor: playError ? "#ef4444" : "var(--mq-accent)",
          boxShadow: "0 0 8px var(--mq-glow)",
        }} />
        <div className="absolute top-1/2 w-3 h-3 rounded-full transition-opacity sm:opacity-0 sm:group-hover:opacity-100 opacity-100" style={{
          left: `${progressPct}%`,
          backgroundColor: playError ? "#ef4444" : "var(--mq-accent)",
          transform: "translate(-50%, -50%)",
          boxShadow: "0 0 6px var(--mq-glow)",
        }} />
        {/* Time text - always visible (not just sm:block) */}
        <div className="absolute top-full left-1 text-[9px] mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
          {formatDuration(Math.floor(progress))}
        </div>
        <div className="absolute top-full right-1 text-[9px] mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
          {formatDuration(Math.floor(duration))}
        </div>
      </div>

      <div className={`flex items-center justify-between ${compactMode ? "px-2 py-1 lg:px-4 lg:py-2" : "px-3 py-2 lg:px-6 lg:py-3"} max-w-screen-2xl mx-auto`}>
        {/* Track info */}
        <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => setFullTrackViewOpen(true)}>
          {currentTrack.cover ? (
            <img src={currentTrack.cover} alt={currentTrack.album} className={`${compactMode ? "w-8 h-8 lg:w-10 lg:h-10" : "w-10 h-10 lg:w-12 lg:h-12"} rounded-lg object-cover flex-shrink-0`} />
          ) : (
            <div className={`${compactMode ? "w-8 h-8 lg:w-10 lg:h-10" : "w-10 h-10 lg:w-12 lg:h-12"} rounded-lg flex-shrink-0 flex items-center justify-center`} style={{ backgroundColor: "var(--mq-accent)", opacity: 0.5 }}>
              <Music className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
            <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
              {currentTrack.artist}
              {modeLabel}
              {playError && <span className="ml-1.5 px-1.5 py-0 rounded text-[9px]" style={{ backgroundColor: "rgba(239,68,68,0.2)", color: "#ef4444" }}>Ошибка</span>}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 sm:gap-2 lg:gap-4 mx-0.5 sm:mx-2 lg:mx-4">
          <div className="relative p-1 min-w-[28px] min-h-[28px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center">
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleShuffle} className="flex items-center justify-center"
              style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
              <Shuffle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </motion.button>
            {shuffle && smartShuffle && (
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--mq-accent)", fontSize: "6px", color: "var(--mq-text)" }}>
                AI
              </div>
            )}
          </div>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handlePrevTrack}
            className="p-1.5 sm:p-2 min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center" style={{ color: "var(--mq-text)" }}>
            <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.85 }} onClick={togglePlay}
            className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)", boxShadow: isPlaying ? "0 0 20px var(--mq-glow)" : "none" }}>
            <AnimatePresence mode="wait">
              {isLoadingTrack ? (
                <motion.div key="loading" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }}>
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                </motion.div>
              ) : isPlaying ? (
                <motion.div key="pause" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }}>
                  <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
                </motion.div>
              ) : (
                <motion.div key="play" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }}>
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => {
            const st = useAppStore.getState();
            if (st.currentTrack?.id) st.recordSkip(st.currentTrack.id);
            nextTrack();
          }}
            className="p-1.5 sm:p-2 min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center" style={{ color: "var(--mq-text)" }}>
            <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={toggleRepeat} className="p-1 min-w-[28px] min-h-[28px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center"
            style={{ color: repeat !== "off" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
            {repeat === "one" ? <Repeat1 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Repeat className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
          </motion.button>
          {/* Wave Mode Toggle */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              const st = useAppStore.getState();
              st.toggleRadioMode();
            }}
            className="relative p-1 min-w-[28px] min-h-[28px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center"
            style={{
              color: radioMode ? "var(--mq-accent)" : "var(--mq-text-muted)",
            }}
            title={radioMode ? "Выключить волну" : "Волна"}
          >
            <Waves className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            {radioMode && (
              <motion.div
                layoutId="wave-indicator"
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                style={{ backgroundColor: "var(--mq-accent)" }}
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            )}
          </motion.button>
        </div>

        {/* Action buttons — desktop only except like */}
        <div className="flex items-center gap-1 lg:gap-2 flex-1 justify-end min-w-0">
          <span className="text-xs hidden lg:block" style={{ color: "var(--mq-text-muted)" }}>
            {formatDuration(Math.floor(progress))} / {formatDuration(Math.floor(duration))}
          </span>

          {/* Like button — visible on all screens */}
          {(() => {
            const isLiked = (Array.isArray(likedTrackIds) ? likedTrackIds : []).includes(currentTrack.id);
            return (
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => toggleLike(currentTrack.id, currentTrack)}
                className="p-1 flex-shrink-0" style={{ color: isLiked ? "#ef4444" : "var(--mq-text-muted)" }}>
                <Heart className={`w-4 h-4 ${isLiked ? "fill-current" : ""}`} />
              </motion.button>
            );
          })()}

          {/* Dislike button — desktop only */}
          {(() => {
            const isDisliked = (Array.isArray(dislikedTrackIds) ? dislikedTrackIds : []).includes(currentTrack.id);
            return (
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => toggleDislike(currentTrack.id, currentTrack)}
                className="p-1 flex-shrink-0 hidden lg:flex items-center justify-center" style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }}>
                <ThumbsDown className={`w-4 h-4 ${isDisliked ? "fill-current" : ""}`} />
              </motion.button>
            );
          })()}

          {/* Similar tracks — desktop only */}
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => requestShowSimilar()}
            className="p-1 flex-shrink-0 items-center justify-center hidden lg:flex"
            style={{ color: "var(--mq-text-muted)" }} title="Похожие">
            <ListMusic className="w-4 h-4" />
          </motion.button>

          {/* Queue — desktop only */}
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowQueue(true)}
            className="p-1 flex-shrink-0 items-center justify-center hidden lg:flex relative"
            style={{ color: upNext.length > 0 ? "var(--mq-accent)" : "var(--mq-text-muted)" }} title="Очередь">
            <ListEnd className="w-4 h-4" />
            {upNext.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold"
                style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>{upNext.length}</span>
            )}
          </motion.button>

          {/* Lyrics — desktop only (moved to full player on mobile) */}
          <motion.button whileTap={{ scale: 0.9 }}
            onClick={() => { setFullTrackViewOpen(true); requestShowLyrics(); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg flex-shrink-0 hidden lg:flex"
            style={{ color: "var(--mq-text-muted)", backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
            title="Текст">
            <FileText className="w-3.5 h-3.5" />
            <span className="text-[10px] hidden lg:inline">Текст</span>
          </motion.button>

          {/* Download — desktop only */}
          <motion.button whileTap={{ scale: 0.85 }} onClick={async () => {
            const audio = audioRef.current || getAudioElement();
            const t = useAppStore.getState().currentTrack;
            if (audio && audio.src && t) {
              try {
                // For proxied tracks, use the direct URL for download
                let downloadSrc = audio.src;
                if (t.scTrackId) {
                  const res = await fetch(`/api/music/soundcloud/stream?trackId=${t.scTrackId}`);
                  if (res.ok) {
                    const data = await res.json();
                    if (data.directUrl) downloadSrc = data.directUrl;
                  }
                }
                const a = document.createElement('a');
                a.href = downloadSrc; a.download = `${t.artist} - ${t.title}.mp3`;
                a.target = '_blank'; a.rel = 'noopener';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
              } catch {
                const a = document.createElement('a');
                a.href = audio.src; a.download = `${t.artist} - ${t.title}.mp3`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
              }
            }
          }}
            className="p-1 flex-shrink-0 hidden lg:flex items-center justify-center"
            style={{ color: "var(--mq-text-muted)" }} title="Скачать">
            <Download className="w-4 h-4" />
          </motion.button>

          {/* Share — desktop only */}
          {currentTrack.scTrackId && (
            <ShareButton scTrackId={currentTrack.scTrackId} />
          )}

          {/* PiP */}
          <motion.button whileTap={{ scale: 0.9 }} onClick={async () => {
            if (isPiPActive) {
              closePiPPopup();
              setPiPActive(false);
            } else {
              const opened = await openPiPPopup();
              setPiPActive(true, opened ? 'popup' : 'overlay');
            }
          }}
            className="p-1 flex-shrink-0 flex items-center justify-center"
            style={{ color: isPiPActive ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
            <PictureInPicture2 className="w-4 h-4" />
          </motion.button>

          {/* Volume — mute button always visible, slider & percentage hidden on mobile */}
          <div ref={volumeSectionRef} className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setVolume(volume > 0 ? 0 : 30)}
              className="p-1 flex-shrink-0"
              style={{ color: "var(--mq-text-muted)" }}>
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <div ref={volumeRef} onClick={handleVolumeClick}
              className="w-20 h-1.5 rounded-full cursor-pointer flex-shrink-0 hidden md:block"
              style={{ backgroundColor: "var(--mq-border)" }}>
              <div className="h-full rounded-full" style={{ width: `${volume}%`, backgroundColor: "var(--mq-accent)" }} />
            </div>
            <span className="text-[10px] w-8 flex-shrink-0 text-right hidden md:block"
              style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}%</span>
          </div>
        </div>
      </div>

      {/* Audio visualization waveform — visible on all screen sizes */}
      <canvas
        ref={canvasRef}
        className="w-full pointer-events-none block"
        style={{ height: compactMode ? 20 : 28, opacity: isPlaying ? 0.7 : 0.1, transition: "opacity 0.3s", minHeight: compactMode ? 20 : 28 }}
      />

      {/* Queue View */}
      <QueueView isOpen={showQueue} onClose={() => setShowQueue(false)} />

    </motion.div>
  );
}
