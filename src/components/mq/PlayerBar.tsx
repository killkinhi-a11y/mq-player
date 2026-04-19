"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1,
  Shuffle, Music, Loader2, PictureInPicture2, ListMusic,
  Heart, ThumbsDown, FileText, Download
} from "lucide-react";
import { formatDuration } from "@/lib/musicApi";
import { getAudioElement, initAudioEngine, getAnalyser, resumeAudioContext, resetCorsState, getInactiveAudio, crossfadeTo, cancelCrossfade } from "@/lib/audioEngine";

async function resolveSoundCloudStream(scTrackId: number): Promise<{ url: string; isPreview: boolean; duration: number; fullDuration: number } | null> {
  try {
    const res = await fetch(`/api/music/soundcloud/stream?trackId=${scTrackId}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default function PlayerBar() {
  const {
    currentTrack, isPlaying, volume, progress, duration,
    shuffle, repeat, togglePlay, nextTrack, prevTrack,
    setVolume, setProgress, setDuration, toggleShuffle, toggleRepeat,
    animationsEnabled, compactMode,
    setFullTrackViewOpen, setPiPActive, isPiPActive,
    setPlaybackMode, requestShowSimilar, requestShowLyrics,
    toggleLike, toggleDislike, likedTrackIds, dislikedTrackIds,
  } = useAppStore();

  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const crossfadeRef = useRef(false); // track if crossfade is in progress
  const prevTrackIdForCrossfade = useRef<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [playError, _setPlayError] = useState(false);
  const playErrorRef = useRef(false);
  // Wrapper that keeps the ref in sync with local state (needed for cross-handler checks)
  const setPlayError = useCallback((val: boolean) => {
    playErrorRef.current = val;
    _setPlayError(val);
  }, []);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

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
      if (st.repeat === "one") {
        const a = getActive();
        if (a) {
          a.currentTime = 0;
          a.play().catch(() => {});
          setProgressRef.current(0);
        }
      } else {
        nextTrackRef.current();
      }
    };
    const onError = () => {
      const audioEl = getActive();
      // Retry on error for the same track (max 3 times)
      if (audioEl?.src && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        console.warn(`[Player] Error loading track, retry ${retryCountRef.current}/${maxRetries}`);
        setTimeout(() => {
          audioEl.load();
          audioEl.play().catch(() => {
            setPlayError(true);
            setIsLoadingTrack(false);
          });
        }, 1000 * retryCountRef.current);
      } else {
        setPlayError(true);
        setIsLoadingTrack(false);
        const st = useAppStore.getState();
        if (st.currentTrack?.scTrackId && audioEl?.src && !audioEl.src.includes("api/v1/soundcloud")) {
          console.warn(`[Player] Trying SC stream resolution as fallback`);
          resolveSoundCloudStream(st.currentTrack.scTrackId).then(stream => {
            if (stream?.url) {
              retryCountRef.current = 0;
              cancelCrossfade();
              const a = getActive();
              if (a) {
                a.src = stream.url;
                a.load();
                a.play().catch(() => {});
              }
            }
          }).catch(() => {});
        } else {
          console.warn(`[Player] Max retries reached, auto-skipping to next track`);
          setTimeout(() => {
            if (playErrorRef.current && useAppStore.getState().currentTrack) {
              nextTrackRef.current();
            }
          }, 2000);
        }
      }
    };
    const onCanPlay = () => {
      setIsLoadingTrack(false);
      setPlayError(false);
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
      audio.pause();
      audio.src = "";
      if (secondary) { secondary.pause(); secondary.src = ""; }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ── Decorative Visualization — composite sinusoidal waves, not tied to audio ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Wave configs: segments, speed, amplitude, phase, yOff, alpha, lineWidth
    const waves = [
      { segs: 40, speed: 0.6, amp: 0.35, phase: 0, yOff: 0.5, alpha: 0.5, lw: 1.5 },
      { segs: 55, speed: 0.9, amp: 0.25, phase: 1.2, yOff: 0.5, alpha: 0.3, lw: 1.0 },
      { segs: 30, speed: 0.4, amp: 0.45, phase: 2.5, yOff: 0.5, alpha: 0.2, lw: 1.0 },
      { segs: 70, speed: 1.2, amp: 0.15, phase: 3.8, yOff: 0.5, alpha: 0.15, lw: 0.8 },
    ];

    // Sparkle particles on wave paths
    const particles = Array.from({ length: 20 }, () => ({
      waveIdx: Math.floor(Math.random() * waves.length),
      xFrac: Math.random(),
      size: 1 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.8 + Math.random() * 2.0,
    }));

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);

      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;
      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, displayWidth, displayHeight);

      const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      let r = 224, g = 49, b = 49;
      if (accentColor.startsWith("#") && accentColor.length >= 7) {
        r = parseInt(accentColor.slice(1, 3), 16);
        g = parseInt(accentColor.slice(3, 5), 16);
        b = parseInt(accentColor.slice(5, 7), 16);
      }

      const t = performance.now() / 1000;

      // Compute and render each wave
      for (const wave of waves) {
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < wave.segs; i++) {
          const x = (i / (wave.segs - 1)) * displayWidth;
          const xn = i / (wave.segs - 1); // normalized 0..1
          const yNorm = 0.6 * Math.sin(t * wave.speed + wave.phase + 0.7 * xn * Math.PI * 2)
            + 0.3 * Math.sin(t * wave.speed * 1.7 + 0.5 * wave.phase + 1.3 * xn * Math.PI * 2)
            + 0.1 * Math.cos(t * wave.speed * 0.5 + 2.1 * xn * Math.PI * 2);
          const y = wave.yOff * displayHeight - yNorm * wave.amp * displayHeight;
          points.push({ x, y });
        }

        // Glow stroke (wider, semi-transparent)
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha * 0.3})`;
        ctx.lineWidth = wave.lw + 4;
        ctx.lineJoin = "bevel";
        ctx.lineCap = "round";
        ctx.stroke();

        // Main stroke
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha})`;
        ctx.lineWidth = wave.lw;
        ctx.lineJoin = "bevel";
        ctx.lineCap = "round";
        ctx.stroke();

        // Gradient fill below wave
        const gradient = ctx.createLinearGradient(0, wave.yOff * displayHeight - wave.amp * displayHeight, 0, displayHeight);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${wave.alpha * 0.12})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.lineTo(displayWidth, displayHeight);
        ctx.lineTo(0, displayHeight);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Sparkle particles placed on wave paths
      for (const p of particles) {
        const wave = waves[p.waveIdx];
        const xn = p.xFrac;
        const yNorm = 0.6 * Math.sin(t * wave.speed + wave.phase + 0.7 * xn * Math.PI * 2)
          + 0.3 * Math.sin(t * wave.speed * 1.7 + 0.5 * wave.phase + 1.3 * xn * Math.PI * 2)
          + 0.1 * Math.cos(t * wave.speed * 0.5 + 2.1 * xn * Math.PI * 2);
        const px = xn * displayWidth;
        const py = wave.yOff * displayHeight - yNorm * wave.amp * displayHeight;
        const tw = 0.3 + 0.7 * Math.pow(Math.sin(t * p.twinkle + p.phase), 2);
        const alpha = tw * (0.3 + wave.alpha * 0.5);
        const size = p.size * (0.5 + tw * 0.5);

        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      }
    };

    draw();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [currentTrack?.id]);

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

        if (cancelled) return;

        if (currentTrack.source === "soundcloud" && currentTrack.scTrackId) {
          // Inline SoundCloud stream resolution (no separate callback to avoid extra async hop)
          setPlaybackMode("soundcloud");
          resetCorsState(); // will be auto-detected — proxy has CORS so real data will work

          const stream = await resolveSoundCloudStream(currentTrack.scTrackId);
          if (cancelled) return;

          if (stream && stream.url) {
            // If using our proxy (same-origin), set crossOrigin for real frequency data
            if (stream.url.startsWith('/api/')) {
              audioEl.crossOrigin = "anonymous";
            } else {
              audioEl.crossOrigin = "";
            }
            audioEl.src = stream.url;

            // Wait for audio to be ready before playing/crossfading
            await new Promise<void>((resolve) => {
              const onCanPlay = () => { audioEl.removeEventListener("canplay", onCanPlay); resolve(); };
              const onError = () => { audioEl.removeEventListener("error", onError); resolve(); };
              audioEl.addEventListener("canplay", onCanPlay);
              audioEl.addEventListener("error", onError);
              audioEl.load();
              // Timeout fallback
              setTimeout(resolve, 5000);
            });

            if (cancelled) return;

            if (canCrossfade) {
              // Crossfade: start new audio and fade between elements
              crossfadeRef.current = true;
              audioEl.play().catch(() => {});
              crossfadeTo(audioEl);
              prevTrackIdForCrossfade.current = currentTrack.id;
            } else {
              // No crossfade: direct play on active element
              cancelCrossfade();
              audioEl.play().catch(() => {});
              prevTrackIdForCrossfade.current = currentTrack.id;
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
        } else if (currentTrack.audioUrl) {
          setPlaybackMode("soundcloud");
          audioEl.crossOrigin = "anonymous";
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
    getAudioElement().volume = volume / 100;
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
      // Check if wheel is over volume section or any part of player bar
      const volEl = volumeSectionRef.current;
      if (volEl) {
        const rect = volEl.getBoundingClientRect();
        // Expand detection area: include the whole right side of player bar
        const playerRect = el.getBoundingClientRect();
        if (e.clientX > playerRect.width * 0.5) {
          e.preventDefault();
          e.stopPropagation();
          const delta = e.deltaY > 0 ? -5 : 5;
          useAppStore.getState().setVolume(Math.round(Math.max(0, Math.min(100, useAppStore.getState().volume + delta))));
        }
      }
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
          <motion.button whileTap={{ scale: 0.9 }} onClick={toggleShuffle} className="p-1 min-w-[28px] min-h-[28px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center"
            style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
            <Shuffle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </motion.button>
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
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={nextTrack}
            className="p-1.5 sm:p-2 min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center" style={{ color: "var(--mq-text)" }}>
            <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={toggleRepeat} className="p-1 min-w-[28px] min-h-[28px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center"
            style={{ color: repeat !== "off" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
            {repeat === "one" ? <Repeat1 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Repeat className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
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
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => toggleDislike(currentTrack.id)}
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

          {/* PiP — desktop only */}
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setPiPActive(!isPiPActive)}
            className="p-1 flex-shrink-0 items-center justify-center hidden lg:flex"
            style={{ color: isPiPActive ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
            <PictureInPicture2 className="w-4 h-4" />
          </motion.button>

          {/* Volume — mute button always visible, slider & percentage hidden on mobile */}
          <div ref={volumeSectionRef} className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setVolume(volume > 0 ? 0 : 70)}
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

    </motion.div>
  );
}
