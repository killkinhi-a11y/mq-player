"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence, useSpring } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1,
  Shuffle, Music, Loader2, ListMusic,
  Heart, ThumbsDown, FileText, Download, ListEnd, Share2, Waves, Brain, Headphones,
} from "lucide-react";
import { initSpatialAudio, enableSpatialAudio, setMoodPreset, detectMoodFromTrack } from "@/lib/spatialAudio";
import { formatDuration } from "@/lib/musicApi";
import { getAudioElement, initAudioEngine, getAnalyser, resumeAudioContext, resetCorsState, getInactiveAudio, crossfadeTo, cancelCrossfade } from "@/lib/audioEngine";
import { getLocalBlobUrl } from "./SearchView";
import { toast } from "@/hooks/use-toast";
import TrackCommentsPanel from "./TrackCommentsPanel";

import QueueView from "./QueueView";
import Hls from "hls.js";
import type { HlsConfig } from "hls.js";

// ── Error Logger ──
const PlayerErrorLogger = {
  logs: [] as Array<{ time: string; track: string; error: string; action: string; fixed: boolean }>,
  maxLogs: 100,

  log(trackTitle: string, errorMsg: string, action: string = "retry") {
    const entry = {
      time: new Date().toISOString(),
      track: trackTitle || "unknown",
      error: errorMsg,
      action,
      fixed: false,
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    console.log(`%c[MQ-Player Error] %c${entry.track}%c: ${entry.error} (${entry.action})`, 
      "color:#ef4444;font-weight:bold", "color:#fbbf24", "color:#94a3b8");
    return entry;
  },

  markFixed(time: string) {
    const entry = this.logs.find(e => e.time === time);
    if (entry) entry.fixed = true;
  },

  getUnfixed() {
    return this.logs.filter(e => !e.fixed);
  },

  autoFix() {
    const unfixed = this.getUnfixed();
    if (unfixed.length === 0) return;
    
    const patterns: Record<string, number> = {};
    for (const entry of unfixed) {
      const key = entry.error.slice(0, 80);
      patterns[key] = (patterns[key] || 0) + 1;
    }
    
    console.log(`%c[MQ AutoFix] Found ${unfixed.length} unfixed errors in ${Object.keys(patterns).length} categories`, "color:#22c55e;font-weight:bold");
    
    const abortCount = unfixed.filter(e => e.error.includes("AbortError")).length;
    if (abortCount >= 2) {
      console.log("[MQ AutoFix] Multiple AbortErrors detected — resetting CORS state");
      resetCorsState?.();
      unfixed.filter(e => e.error.includes("AbortError")).forEach(e => this.markFixed(e.time));
    }
    
    const allowedCount = unfixed.filter(e => e.error.includes("NotAllowedError")).length;
    if (allowedCount >= 2) {
      console.log("[MQ AutoFix] NotAllowedError — autoplay policy, user interaction needed");
      unfixed.filter(e => e.error.includes("NotAllowedError")).forEach(e => this.markFixed(e.time));
    }
  }
};

// Run auto-fix every 15 seconds
if (typeof window !== "undefined") {
  setInterval(() => PlayerErrorLogger.autoFix(), 15000);
}


interface StreamResult {
  url: string;
  isPreview: boolean;
  duration: number;
  fullDuration: number;
  isHls: boolean;
  isEncrypted: boolean;
  protocol?: string;
  licenseUrl?: string;
  fallbackStreams?: Array<{
    url: string;
    protocol: string;
    isHls: boolean;
    isEncrypted: boolean;
    licenseUrl?: string;
  }>;
  drmRestricted?: boolean;
}

async function resolveSoundCloudStream(scTrackId: number): Promise<StreamResult | null> {
  try {
    const res = await fetch(`/api/music/soundcloud/stream?trackId=${scTrackId}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    // Best case: Edge Function resolved the URL directly
    if (data.url) {
      return {
        url: data.url,
        isPreview: !!data.isPreview,
        duration: data.duration || 0,
        fullDuration: data.fullDuration || 0,
        isHls: !!data.isHls,
        isEncrypted: !!data.isEncrypted,
        protocol: data.protocol || null,
        licenseUrl: data.licenseUrl || null,
        fallbackStreams: data.fallbackStreams || null,
        drmRestricted: !!data.drmRestricted,
      };
    }

    // Fallback: Edge couldn't resolve — try our CORS proxy with the template URL
    if (data.resolveUrl) {
      console.warn("[Player] Edge resolve failed, trying CORS proxy...");
      try {
        let proxyUrl = `/api/music/soundcloud/resolve-proxy?url=${encodeURIComponent(data.resolveUrl)}`;
        // Pass track_authorization for DRM-protected tracks
        if (data.trackAuthorization) {
          proxyUrl += `&track_authorization=${encodeURIComponent(data.trackAuthorization)}`;
        }
        const proxyRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
        if (proxyRes.ok) {
          const proxyData = await proxyRes.json();
          if (proxyData.url) {
            return {
              url: proxyData.url,
              isPreview: !!data.isPreview,
              duration: data.duration || 0,
              fullDuration: data.fullDuration || 0,
              isHls: !!data.isHls,
              isEncrypted: !!data.isEncrypted,
              protocol: data.protocol || null,
              licenseUrl: data.licenseUrl || null,
            };
          }
        }
      } catch {
        // CORS proxy failed too
      }
    }

    return null;
  } catch (err) {
    console.warn("[resolveSoundCloudStream] failed:", err);
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

function MagneticPlayButton({ children, onClick, className, style, disabled }: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  const contentX = useSpring(0, { stiffness: 400, damping: 25 });
  const contentY = useSpring(0, { stiffness: 400, damping: 25 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const strength = 0.35;
    contentX.set((e.clientX - cx) * strength);
    contentY.set((e.clientY - cy) * strength);
  }, [contentX, contentY]);

  const handleMouseLeave = useCallback(() => {
    contentX.set(0);
    contentY.set(0);
  }, [contentX, contentY]);

  return (
    <motion.button
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={className}
      style={style}
      disabled={disabled}
    >
      <motion.span style={{ x: contentX, y: contentY, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </motion.span>
    </motion.button>
  );
}

export default function PlayerBar() {
  const {
    currentTrack, isPlaying, volume, progress, duration,
    shuffle, repeat, togglePlay, nextTrack, prevTrack,
    setVolume, setProgress, setDuration, toggleShuffle, toggleRepeat,
    animationsEnabled, compactMode,
    setFullTrackViewOpen,
    setPlaybackMode, requestShowSimilar, requestShowLyrics,
    toggleLike, toggleDislike, likedTrackIds, dislikedTrackIds,
    upNext, currentStyle, radioMode, smartShuffle, toggleRadioMode,
    spatialAudioEnabled, setSpatialAudioEnabled, setSpatialMood, spatialAutoDetect, spatialMood,
  } = useAppStore();

  const [showQueue, setShowQueue] = useState(false);

  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const crossfadeRef = useRef(false); // track if crossfade is in progress
  const prevTrackIdForCrossfade = useRef<string | null>(null);
  const startLoadingTimeoutRef = useRef<((generation: number) => void) | null>(null); // bridge to event listener effect

  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
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
  const loadGenerationRef = useRef(0); // prevents stale timeouts from interfering with new loads
  const clearLoadingTimeoutRef = useRef<(() => void) | null>(null); // bridge to cancel loading timeout
  const fallbackStreamsRef = useRef<StreamResult['fallbackStreams']>(null); // backup streams if primary fails

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
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);

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
      if (a && a.duration && isFinite(a.duration) && a.currentTime > a.duration) return;
      if (!isDraggingRef.current && a) setProgressRef.current(a.currentTime);
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
    const onLoaded = (e: Event) => {
      // Ignore metadata events from inactive element during crossfade
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;
      const a = getActive();
      if (a?.duration && isFinite(a.duration)) setDurationRef.current(a.duration);
    };
    const onEnded = (e: Event) => {
      // CRITICAL FIX: Only handle 'ended' from the currently active audio element.
      // During crossfade, the old fading-out element also fires 'ended',
      // but we must ignore it — the new track is already playing.
      // Without this check, every crossfade caused an extra nextTrack() call,
      // skipping tracks and draining the queue prematurely.
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;

      setPlayError(false);
      crossfadeRef.current = false;
      const st = useAppStore.getState();
      const currentTrackId = st.currentTrack?.id;
      // Record track completion for feedback (only ONCE — not in both branches)
      if (currentTrackId && st.progress > 0) {
        useAppStore.getState().recordComplete(currentTrackId, st.progress);
      }
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
    const onError = (e: Event) => {
      // Only handle errors from the active audio element.
      // During crossfade, the old element may error (src cleared, etc.)
      // — we must ignore those to prevent spurious retries.
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;

      // Prevent concurrent retries — only one retry chain at a time
      if (retryingRef.current) return;

      const audioEl = getActive();
      const st = useAppStore.getState();
      const isSCTrack = !!st.currentTrack?.scTrackId;

      // Log error for diagnostics
      const trackTitle = st.currentTrack?.title || "unknown";

      // Don't retry if track has already changed
      if (st.currentTrack?.id !== useAppStore.getState().currentTrack?.id) return;

      const errorCode = audioEl?.error?.code || 0;
      const errorMessages: Record<number, string> = {
        1: "MEDIA_ERR_ABORTED",
        2: "MEDIA_ERR_NETWORK",
        3: "MEDIA_ERR_DECODE",
        4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
      };
      const errorMsg = errorMessages[errorCode] || `code ${errorCode}`;
      PlayerErrorLogger.log(trackTitle, errorMsg, `retry ${retryCountRef.current + 1}`);

      // Save playback position for mid-playback recovery
      const savedPosition = audioEl?.currentTime || 0;
      const wasMidPlayback = savedPosition > 1 && !isLoadingTrackRef.current;

      // Helper: skip to next track with toast notification
      const skipToNextWithError = (message: string) => {
        setPlayError(true);
        setIsLoadingTrack(false);
        retryingRef.current = false; // safety: ensure not stuck
        prevTrackIdForCrossfade.current = null; // prevent crossfade from errored track
        const errTrackId = st.currentTrack?.id; // capture to avoid skipping wrong track
        try {
          toast({
            title: "Ошибка воспроизведения",
            description: message,
          });
        } catch {}
        setTimeout(() => {
          // Only skip if user hasn't already changed tracks
          if (useAppStore.getState().currentTrack?.id === errTrackId) {
            nextTrackRef.current();
          }
        }, 1500);
      };

      // For SoundCloud tracks: re-resolve stream URL instead of reloading same (possibly expired) URL
      if (isSCTrack && st.currentTrack?.scTrackId && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        retryingRef.current = true;
        const scId = st.currentTrack.scTrackId;
        console.warn(`[Player] Error on SC track${wasMidPlayback ? ' (mid-playback)' : ''}, re-resolving stream (attempt ${retryCountRef.current}/${maxRetries})`);

        resolveSoundCloudStream(scId).then(stream => {
          // Always reset retryingRef in finally-like pattern to prevent stuck state
          retryingRef.current = false;

          // Check if track hasn't changed during retry
          const currentSt = useAppStore.getState();
          if (currentSt.currentTrack?.scTrackId !== scId) return;

          if (stream?.url) {
            // Use audioEl captured at error time, not getActive() which may have changed
            const a = audioEl;
            if (a) {
              // Clean up any previous HLS instance before switching source
              const prevHls = (a as any)._hlsInstance;
              if (prevHls) { try { prevHls.destroy(); } catch {} delete (a as any)._hlsInstance; }

              a.crossOrigin = 'anonymous';

              if (stream.isHls && Hls.isSupported()) {
                // HLS streams MUST use HLS.js — setting .src directly on .m3u8 will fail in non-Safari
                const hls = new Hls({
                  enableWorker: true,
                  lowLatencyMode: false,
                  maxBufferLength: 30,
                  maxMaxBufferLength: 60,
                });
                hls.loadSource(stream.url);
                hls.attachMedia(a);
                // Manifest timeout — if HLS doesn't parse within 8s, skip to next
                const retryManifestTimeout = setTimeout(() => {
                  if (a.paused && !a.currentTime) {
                    console.error("[Player] HLS retry manifest timeout — skipping");
                    hls.destroy(); delete (a as any)._hlsInstance;
                    skipToNextWithError(`Таймаут загрузки: ${trackTitle}`);
                  }
                }, 8000);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                  clearTimeout(retryManifestTimeout);
                  a.play().then(() => {
                    if (wasMidPlayback && isFinite(savedPosition)) {
                      a.currentTime = savedPosition;
                    }
                  }).catch(() => {});
                });
                hls.on(Hls.Events.ERROR, (_ev, data) => {
                  clearTimeout(retryManifestTimeout);
                  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    console.warn("[Player] Attempting HLS network recovery during retry...");
                    hls.startLoad();
                  } else if (data.fatal) {
                    console.error("[Player] HLS fatal error during retry:", data.type, data.details);
                    hls.destroy(); delete (a as any)._hlsInstance;
                    skipToNextWithError(`Ошибка HLS: ${trackTitle}`);
                  }
                });
                (a as any)._hlsInstance = hls;
              } else {
                // Progressive stream or native HLS (Safari)
                a.src = stream.url;
                a.load();
                a.play().then(() => {
                  if (wasMidPlayback && isFinite(savedPosition)) {
                    a.currentTime = savedPosition;
                  }
                }).catch(() => {});
              }
            }
          } else {
            // Stream resolve returned null — track unavailable
            skipToNextWithError(`Не удалось загрузить: ${trackTitle}`);
          }
        }).catch((err) => {
          retryingRef.current = false;
          console.warn("[Player] Stream resolve failed:", err);
          skipToNextWithError(`Ошибка сети: ${trackTitle}`);
        });
        return;
      }

      // Non-SC tracks or max retries: try reloading same URL once more
      if (audioEl?.src && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        resetCorsState();
        retryingRef.current = true;
        console.warn(`[Player] Error loading track, retry ${retryCountRef.current}/${maxRetries}`);
        setTimeout(() => {
          retryingRef.current = false;
          // Check track hasn't changed
          const currentSt = useAppStore.getState();
          if (currentSt.currentTrack?.id !== st.currentTrack?.id) return;

          // Try clearing src and re-setting to force a fresh network request
          const savedSrc = audioEl.src;
          audioEl.removeAttribute('src');
          audioEl.load();
          setTimeout(() => {
            audioEl.src = savedSrc;
            audioEl.load();
            audioEl.play().then(() => {
              // Playback recovered
            }).catch(() => {
              // Still failing — skip to next
              skipToNextWithError(`Не удалось воспроизвести: ${trackTitle}`);
            });
          }, 100);
        }, 1000 * retryCountRef.current);
      } else {
        // Max retries exhausted — always skip to next track
        console.warn(`[Player] Max retries reached, skipping to next track`);
        skipToNextWithError(`Не удалось воспроизвести: ${trackTitle}`);
      }
    };
    const onCanPlay = () => {
      setIsLoadingTrack(false);
      setPlayError(false);
      retryCountRef.current = 0; // reset retry count on successful load
      // Cancel loading timeout — track loaded successfully
      if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
      // Cancel stall timeout — not stalled anymore
      if (stallTimeoutId) { clearTimeout(stallTimeoutId); stallTimeoutId = null; }
      // Log error fix
      if (PlayerErrorLogger.logs.length > 0) {
        const st = useAppStore.getState();
        const lastUnfixed = [...PlayerErrorLogger.getUnfixed()].reverse()[0];
        if (lastUnfixed) {
          PlayerErrorLogger.markFixed(lastUnfixed.time);
          console.log(`%c[MQ-Player] Fixed: %c${lastUnfixed.track}`, "color:#22c55e;font-weight:bold", "color:#94a3b8");
        }
      }
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
      // Cancel loading timeout — playback confirmed
      if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
      // Cancel stall timeout — playing again
      if (stallTimeoutId) { clearTimeout(stallTimeoutId); stallTimeoutId = null; }
      // Log error fix
      const lastUnfixed = [...PlayerErrorLogger.getUnfixed()].reverse()[0];
      if (lastUnfixed) {
        PlayerErrorLogger.markFixed(lastUnfixed.time);
        console.log(`%c[MQ-Player] Playing: %c${lastUnfixed.track}`, "color:#22c55e;font-weight:bold", "color:#94a3b8");
      }
      resumeAudioContext();
      // Only auto-resume if this event is from the currently active audio element
      // Prevents secondary crossfade element from re-triggering play after user pauses
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;
      // Don't toggle play during crossfade — the fade-in is intentional
      if (!useAppStore.getState().isPlaying && !crossfadeRef.current) {
        useAppStore.getState().togglePlay();
      }
      // Reset crossfade flag after playback confirmed
      crossfadeRef.current = false;
    };

    // Listen on both audio elements
    // Safety timeout: if stuck loading for >10s, force retry
    let loadingTimeoutId: ReturnType<typeof setTimeout> | null = null;
    // Stall detection timeout — if audio stalls mid-playback for >8s, force retry
    let stallTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const startLoadingTimeout = (generation: number) => {
      if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
      loadingTimeoutId = setTimeout(() => {
        // Guard: only fire if we're still on the same load generation
        if (loadGenerationRef.current !== generation) return;
        const st = useAppStore.getState();
        if (st.currentTrack && !playErrorRef.current && isLoadingTrackRef.current) {
          const a = getActive();
          if (a && (a.readyState < 2 || a.paused) && st.isPlaying) {
            console.warn("[Player] Loading timeout — forcing retry");
            PlayerErrorLogger.log(st.currentTrack?.title || "unknown", "Loading timeout (10s)", "force retry");
            // For SC tracks: re-resolve stream URL (may have expired)
            if (st.currentTrack?.scTrackId && !retryingRef.current) {
              retryingRef.current = true; // prevent concurrent retries
              resolveSoundCloudStream(st.currentTrack.scTrackId).then(stream => {
                retryingRef.current = false;
                if (!stream?.url || !a) return;
                // Check track hasn't changed
                if (useAppStore.getState().currentTrack?.scTrackId !== st.currentTrack?.scTrackId) return;
                const prevHls = (a as any)._hlsInstance;
                if (prevHls) { try { prevHls.destroy(); } catch {} delete (a as any)._hlsInstance; }
                a.crossOrigin = 'anonymous';
                if (stream.isHls && Hls.isSupported()) {
                  // HLS streams MUST use HLS.js
                  const hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30, maxMaxBufferLength: 60 });
                  hls.loadSource(stream.url);
                  hls.attachMedia(a);
                  hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setIsLoadingTrack(false);
                    a.play().catch(() => {});
                  });
                  hls.on(Hls.Events.ERROR, (_ev, data) => {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                      hls.startLoad(); // try recovery
                    } else if (data.fatal) {
                      console.error("[Player] HLS fatal after loading timeout retry:", data.type, data.details);
                      hls.destroy(); delete (a as any)._hlsInstance;
                      setIsLoadingTrack(false);
                      setPlayError(true);
                      prevTrackIdForCrossfade.current = null;
                      setTimeout(() => nextTrackRef.current(), 1500);
                    }
                  });
                  (a as any)._hlsInstance = hls;
                } else {
                  a.src = stream.url;
                  a.load();
                  a.play().catch(() => {});
                }
              }).catch(() => {
                retryingRef.current = false;
                a.play().then(() => {}).catch(() => {});
              });
            } else {
              a.play().then(() => {
                console.log("[Player] Force play succeeded after timeout");
              }).catch(() => {});
            }
          }
        }
      }, 10000);
    };
    
    // Stall detection: if audio stalls for >8s mid-playback, force retry/skip
    const onWaiting = (e: Event) => {
      const target = e.target as HTMLAudioElement | null;
      if (target && target !== getActive()) return;
      // Only detect stalls during active playback (not initial load)
      if (!isLoadingTrackRef.current && useAppStore.getState().isPlaying) {
        if (stallTimeoutId) clearTimeout(stallTimeoutId);
        stallTimeoutId = setTimeout(() => {
          const a = getActive();
          if (a && a.paused && useAppStore.getState().isPlaying && !playErrorRef.current) {
            console.warn("[Player] Stall detected (8s) — forcing retry");
            PlayerErrorLogger.log(useAppStore.getState().currentTrack?.title || "unknown", "Stall timeout (8s)", "force retry");
            // Trigger error recovery by firing onError logic
            const st = useAppStore.getState();
            if (st.currentTrack?.scTrackId && !retryingRef.current) {
              retryingRef.current = true;
              resolveSoundCloudStream(st.currentTrack.scTrackId).then(stream => {
                retryingRef.current = false;
                if (!stream?.url || !a) {
                  setPlayError(true);
                  setTimeout(() => nextTrackRef.current(), 1500);
                  return;
                }
                if (useAppStore.getState().currentTrack?.scTrackId !== st.currentTrack?.scTrackId) return;
                const prevHls = (a as any)._hlsInstance;
                if (prevHls) { try { prevHls.destroy(); } catch {} delete (a as any)._hlsInstance; }
                a.crossOrigin = 'anonymous';
                if (stream.isHls && Hls.isSupported()) {
                  const hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30, maxMaxBufferLength: 60 });
                  hls.loadSource(stream.url);
                  hls.attachMedia(a);
                  hls.on(Hls.Events.MANIFEST_PARSED, () => { a.play().catch(() => {}); });
                  hls.on(Hls.Events.ERROR, (_ev, data) => {
                    if (data.fatal) {
                      console.error("[Player] HLS fatal error after stall retry:", data.type, data.details);
                      hls.destroy(); delete (a as any)._hlsInstance;
                      setPlayError(true);
                      setTimeout(() => nextTrackRef.current(), 1500);
                    }
                  });
                  (a as any)._hlsInstance = hls;
                } else {
                  a.src = stream.url;
                  a.load();
                  a.play().catch(() => {});
                }
              }).catch(() => {
                retryingRef.current = false;
                setPlayError(true);
                setTimeout(() => nextTrackRef.current(), 1500);
              });
            } else {
              setPlayError(true);
              setTimeout(() => nextTrackRef.current(), 1500);
            }
          }
        }, 8000);
      }
    };

    const addListeners = (el: HTMLAudioElement) => {
      el.addEventListener("timeupdate", onTimeUpdate);
      el.addEventListener("loadedmetadata", onLoaded);
      el.addEventListener("canplay", onCanPlay);
      el.addEventListener("durationchange", onLoaded);
      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);
      el.addEventListener("playing", onPlaying);
      el.addEventListener("waiting", onWaiting);
    };
    const removeListeners = (el: HTMLAudioElement) => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("durationchange", onLoaded);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("waiting", onWaiting);
    };

    // Expose startLoadingTimeout to track change effect
    startLoadingTimeoutRef.current = startLoadingTimeout;

    addListeners(audio);
    // Also listen on the secondary audio element for crossfade
    const secondary = getInactiveAudio();
    if (secondary) addListeners(secondary);

    // Expose clearLoadingTimeout so onCanPlay/onPlaying can cancel it
    clearLoadingTimeoutRef.current = () => {
      if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
      if (stallTimeoutId) { clearTimeout(stallTimeoutId); stallTimeoutId = null; }
    };

    return () => {
      if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
      if (stallTimeoutId) { clearTimeout(stallTimeoutId); stallTimeoutId = null; }
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

  // ── Spatial Audio: auto-detect mood when track changes ──
  useEffect(() => {
    if (!spatialAudioEnabled || !spatialAutoDetect || !currentTrack) return;
    const mood = detectMoodFromTrack(currentTrack.title, currentTrack.genre);
    setMoodPreset(mood);
    setSpatialMood(mood);
  }, [currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Spatial Audio: enable/disable ──
  useEffect(() => {
    if (spatialAudioEnabled) {
      const ok = initSpatialAudio();
      if (ok) {
        enableSpatialAudio(true);
        if (currentTrack) {
          const mood = detectMoodFromTrack(currentTrack.title, currentTrack.genre);
          setMoodPreset(mood);
          setSpatialMood(mood);
        }
      }
    } else {
      enableSpatialAudio(false);
    }
    return () => { enableSpatialAudio(false); };
  }, [spatialAudioEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Style-Aware Canvas Visualization ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isMobileView = typeof window !== 'undefined' && window.innerWidth < 768;

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
      setIsLoadingTrack(false);
      return;
    }

    if (currentTrack.id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = currentTrack.id;
      setProgress(0);
      // Use track metadata duration immediately — onLoaded/durationchange will overwrite with actual
      setDuration(currentTrack.duration || 0);
      retryCountRef.current = 0;
    }

    // Cancellation flag — prevents race conditions from rapid track switching
    let cancelled = false;
    const pendingTimeouts: ReturnType<typeof setTimeout>[] = []; // track all timeouts for cleanup

    // Increment load generation — prevents stale timeouts from interfering
    loadGenerationRef.current++;
    const currentGeneration = loadGenerationRef.current;

    // Helper: try fallback streams when primary HLS fails (e.g. CTR CDN 403 → try CBC)
    // Returns true if a fallback was attempted, false if no fallback available
    const tryFallbackStream = (audioEl: HTMLAudioElement, track: typeof currentTrack, isCancelled: boolean): boolean => {
      const fallbacks = fallbackStreamsRef.current;
      if (!fallbacks || fallbacks.length === 0 || isCancelled) return false;

      const fallback = fallbacks[0]; // use first fallback
      console.warn(`[Player] Primary stream failed, trying fallback: ${fallback.protocol} (${fallback.isEncrypted ? 'encrypted' : 'plain'})`);

      // Shift fallbacks array (consume this one)
      fallbackStreamsRef.current = fallbacks.slice(1);

      // Clean up current HLS instance
      const prevHls = (audioEl as any)._hlsInstance;
      if (prevHls) { try { prevHls.destroy(); } catch {} delete (audioEl as any)._hlsInstance; }

      audioEl.crossOrigin = 'anonymous';

      if (fallback.isHls && Hls.isSupported()) {
        const hlsConfig: Partial<HlsConfig> = {
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        };

        // Set up EME for encrypted fallback (e.g. CBC-HLS with FairPlay)
        if (fallback.isEncrypted && fallback.licenseUrl) {
          hlsConfig.emeEnabled = true;
          const proxyUrl = "/api/music/soundcloud/license-proxy";
          const realLicenseUrl = fallback.licenseUrl;

          // Determine DRM system from protocol
          if (fallback.protocol === "ctr-encrypted-hls") {
            hlsConfig.drmSystems = { "com.widevine.alpha": { licenseUrl: proxyUrl } };
          } else if (fallback.protocol === "cbc-encrypted-hls") {
            hlsConfig.drmSystems = { "com.apple.fps": { licenseUrl: proxyUrl } };
          }

          hlsConfig.licenseXhrSetup = function (xhr: XMLHttpRequest, _url: string, _ctx: any, _challenge: Uint8Array) {
            const originalOpen = xhr.open.bind(xhr);
            const originalSend = xhr.send.bind(xhr);
            originalOpen("POST", proxyUrl, true);
            xhr.withCredentials = false;
            try { xhr.setRequestHeader("Content-Type", "application/json"); } catch {}
            xhr.send = function (body: any) {
              const rawBody = body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(body);
              const challengeBase64 = btoa(String.fromCharCode(...rawBody));
              originalSend(JSON.stringify({ licenseUrl: realLicenseUrl, challenge: challengeBase64 }));
            };
          };

          hlsConfig.licenseResponseCallback = (xhr: XMLHttpRequest): ArrayBuffer => {
            try {
              const responseBuf = xhr.response as ArrayBuffer;
              if (!responseBuf || responseBuf.byteLength === 0) return new ArrayBuffer(0);
              const responseText = new TextDecoder().decode(new Uint8Array(responseBuf));
              const data = JSON.parse(responseText);
              if (data.license) {
                const decoded = atob(data.license);
                const bytes = new Uint8Array(decoded.length);
                for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
                return bytes.buffer as ArrayBuffer;
              }
            } catch {}
            return new ArrayBuffer(0);
          };
        }

        const hls = new Hls(hlsConfig);
        hls.loadSource(fallback.url);
        hls.attachMedia(audioEl);

        // Manifest timeout for fallback
        const fbTimeout = setTimeout(() => {
          if (audioEl.paused && !audioEl.currentTime && !isCancelled) {
            console.error("[Player] Fallback stream manifest timeout — giving up");
            hls.destroy(); delete (audioEl as any)._hlsInstance;
            setIsLoadingTrack(false);
            setPlayError(true);
            prevTrackIdForCrossfade.current = null;
            setTimeout(() => nextTrackRef.current(), 1500);
          }
        }, 10000);
        pendingTimeouts.push(fbTimeout);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          clearTimeout(fbTimeout);
          if (!isCancelled) {
            setIsLoadingTrack(false);
            setPlayError(false);
            resumeAudioContext();
            audioEl.play().catch((err) => {
              if (err.name !== "NotAllowedError") {
                console.error("[Player] Fallback play() failed:", err.name, err.message);
              }
            });
          }
        });

        hls.on(Hls.Events.ERROR, (_ev, data) => {
          clearTimeout(fbTimeout);
          if (data.fatal) {
            console.error("[Player] Fallback HLS also failed:", data.type, data.details);
            hls.destroy(); delete (audioEl as any)._hlsInstance;
            // Try next fallback if available
            if (tryFallbackStream(audioEl, track, isCancelled)) return;
            // No more fallbacks — skip
            setIsLoadingTrack(false);
            setPlayError(true);
            prevTrackIdForCrossfade.current = null;
            setTimeout(() => nextTrackRef.current(), 1500);
          }
        });

        (audioEl as any)._hlsInstance = hls;
      } else {
        // Non-HLS fallback (progressive)
        audioEl.src = fallback.url;
        audioEl.load();
        audioEl.play().catch(() => {});
      }

      PlayerErrorLogger.log(track?.title || "unknown", `Fallback to ${fallback.protocol}`, "fallback");
      return true;
    };

    const loadTrack = async () => {
      try {
        setIsLoadingTrack(true);
        setPlayError(false);
        retryCountRef.current = 0;
        fallbackStreamsRef.current = null; // reset fallback streams for new track
        // Safety timeout: if stuck loading >10s, force retry
        // Pass current generation so the timeout can check it's still relevant
        if (startLoadingTimeoutRef.current) startLoadingTimeoutRef.current(currentGeneration);

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
            // Save fallback streams for retry if primary fails
            fallbackStreamsRef.current = stream.fallbackStreams || null;
            const isHlsStream = stream.isHls && Hls.isSupported();

            if (isHlsStream) {
              // Use HLS.js for HLS streams (some tracks only have HLS, no progressive MP3)
              // Support encrypted HLS via EME (Widevine/FairPlay)
              audioEl.crossOrigin = "anonymous";

              const hlsConfig: Partial<HlsConfig> = {
                enableWorker: true,
                lowLatencyMode: false,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                // For encrypted HLS: longer manifest loading timeout — EME initialization
                // and license acquisition add latency before the first segment can play.
                manifestLoadingMaxRetry: 4,
                manifestLoadingRetryDelay: 2000,
                levelLoadingMaxRetry: 4,
                levelLoadingRetryDelay: 2000,
                fragLoadingMaxRetry: 6,
                fragLoadingRetryDelay: 2000,
              };

              // Configure EME for encrypted HLS streams via drmSystems (HLS.js 1.5+ API)
              // SoundCloud uses separate license endpoints per DRM system
              // CRITICAL: SC license server has NO CORS headers — must proxy through our API
              //
              // HLS.js 1.6 sets xhr.responseType='arraybuffer' BEFORE calling licenseXhrSetup,
              // so xhr.responseText is UNAVAILABLE in licenseResponseCallback.
              // We must read xhr.response (ArrayBuffer) and decode it manually.
              if (stream.isEncrypted && stream.licenseUrl) {
                hlsConfig.emeEnabled = true;
                const proxyUrl = "/api/music/soundcloud/license-proxy";
                const realLicenseUrl = stream.licenseUrl;

                if (stream.protocol === "ctr-encrypted-hls") {
                  // Widevine (CTR) — Chrome/Firefox/Edge
                  hlsConfig.drmSystems = {
                    "com.widevine.alpha": {
                      licenseUrl: proxyUrl,
                    },
                  };
                } else if (stream.protocol === "cbc-encrypted-hls") {
                  // FairPlay (CBC) — Safari
                  hlsConfig.drmSystems = {
                    "com.apple.fps": {
                      licenseUrl: proxyUrl,
                    },
                  };
                }

                // Intercept XHR: wrap the CDM challenge in our proxy format.
                // HLS.js 1.6 calls: setupLicenseXHR() → licenseXhrSetup(xhr, url, ctx, challenge)
                // After our callback, it sends the challenge (or our return value) via xhr.send().
                // We override send to POST JSON { licenseUrl, challenge } to our proxy.
                // HLS.js 1.6 signature: (xhr, url, keyContext, licenseChallenge)
                hlsConfig.licenseXhrSetup = function (xhr: XMLHttpRequest, _url: string, _ctx: any, _challenge: Uint8Array) {
                  const originalOpen = xhr.open.bind(xhr);
                  const originalSend = xhr.send.bind(xhr);

                  // Re-open XHR pointing to our same-origin proxy
                  originalOpen("POST", proxyUrl, true);
                  xhr.withCredentials = false;

                  // Set Content-Type so our proxy can parse JSON body
                  try { xhr.setRequestHeader("Content-Type", "application/json"); } catch {}

                  // Override send: wrap raw binary challenge as base64 JSON for our proxy
                  xhr.send = function (body: any) {
                    const rawBody = body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(body);
                    const challengeBase64 = btoa(
                      String.fromCharCode(...rawBody),
                    );
                    const payload = JSON.stringify({
                      licenseUrl: realLicenseUrl,
                      challenge: challengeBase64,
                    });
                    originalSend(payload);
                  };
                };

                // Our proxy returns { license: "<base64>" } — decode to ArrayBuffer.
                // CRITICAL: xhr.responseType is 'arraybuffer' (set by HLS.js before our setup),
                // so we MUST use xhr.response, NOT xhr.responseText (which is empty/throws).
                hlsConfig.licenseResponseCallback = (xhr: XMLHttpRequest): ArrayBuffer => {
                  try {
                    // Decode the ArrayBuffer response to a string, then parse JSON
                    const responseBuf = xhr.response as ArrayBuffer;
                    if (!responseBuf || responseBuf.byteLength === 0) {
                      console.error("[Player] Empty license response");
                      return new ArrayBuffer(0);
                    }
                    const responseText = new TextDecoder().decode(new Uint8Array(responseBuf));
                    const data = JSON.parse(responseText);
                    if (data.license) {
                      const decoded = atob(data.license);
                      const bytes = new Uint8Array(decoded.length);
                      for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
                      console.log("[Player] License acquired via proxy,", bytes.length, "bytes");
                      return bytes.buffer as ArrayBuffer;
                    }
                    if (data.error) {
                      console.error("[Player] License proxy error:", data.error);
                    }
                  } catch (e) {
                    console.error("[Player] Failed to parse license proxy response", e);
                  }
                  return new ArrayBuffer(0);
                };
              }

              // Set up XHR for CDN segment loading — SC CDN returns CORS headers
              // but some edge cases need explicit configuration (encrypted segments)
              if (stream.isEncrypted) {
                hlsConfig.xhrSetup = function (xhr: XMLHttpRequest, url: string) {
                  xhr.withCredentials = false;
                  // Some SC CDN segments may need proper Accept header
                  if (url.endsWith(".m3u8") || url.includes("playlist")) {
                    try { xhr.setRequestHeader("Accept", "*/*"); } catch {}
                  }
                };
              }

              const hls = new Hls(hlsConfig);
              hls.loadSource(stream.url);
              hls.attachMedia(audioEl);

              // Timeout: if HLS manifest never parses within 15s, treat as fatal
              // Encrypted streams need more time: EME init + license acquisition before playback
              const hlsManifestTimeout = setTimeout(() => {
                if (!cancelled && audioEl.paused && !audioEl.currentTime) {
                  console.error("[Player] HLS manifest parse timeout — trying fallback");
                  try { hls.destroy(); } catch {}
                  delete (audioEl as any)._hlsInstance;
                  prevTrackIdForCrossfade.current = null;
                  // Try fallback streams before giving up
                  if (!tryFallbackStream(audioEl, currentTrack, cancelled)) {
                    setIsLoadingTrack(false);
                    setPlayError(true);
                    PlayerErrorLogger.log(currentTrack?.title || "unknown", "HLS manifest timeout (15s)", "skip");
                    pendingTimeouts.push(setTimeout(() => nextTrackRef.current(), 1500));
                  }
                }
              }, 15000);
              pendingTimeouts.push(hlsManifestTimeout);

              // DRM diagnostic logging
              hls.on(Hls.Events.KEY_LOADING, (_event, data) => {
                console.log("[Player] DRM key loading:", data.frag?.url?.slice(-40));
              });
              hls.on(Hls.Events.KEY_LOADED, (_event, data) => {
                console.log("[Player] DRM key acquired:", data.frag?.url?.slice(-40));
              });
              hls.on(Hls.Events.FRAG_DECRYPTED, (_event, data) => {
                console.log("[Player] Segment decrypted OK:", data.frag?.url?.slice(-40));
              });
              // @ts-expect-error KEY_STATUS may not be in all hls.js versions
              hls.on(Hls.Events.KEY_STATUS, (_event, data: any) => {
                if (data.status !== "usable") {
                  console.warn("[Player] DRM key status:", data.status, "for", data.frag?.url?.slice(-40));
                }
              });

              // Timeout: if no decrypted audio after 25s, show error and skip
              // License acquisition via proxy + EME key exchange can be slow
              const drmTimeout = setTimeout(() => {
                if (audioEl.paused && !audioEl.currentTime && !cancelled) {
                  console.error("[Player] DRM playback timeout — license may be invalid");
                  setIsLoadingTrack(false);
                  setPlayError(true);
                  prevTrackIdForCrossfade.current = null; // prevent broken crossfade
                  try { hls.destroy(); } catch {}
                  delete (audioEl as any)._hlsInstance;
                  PlayerErrorLogger.log(currentTrack?.title || "unknown", "DRM timeout (25s)", "skip");
                  pendingTimeouts.push(setTimeout(() => nextTrackRef.current(), 2000));
                }
              }, 25000);
              pendingTimeouts.push(drmTimeout);

              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (!cancelled) {
                  clearTimeout(hlsManifestTimeout); // Manifest loaded OK
                  // Clear timeout if playback starts
                  const clearT = () => { clearTimeout(drmTimeout); };
                  audioEl.addEventListener("playing", clearT, { once: true });

                  if (canCrossfade) {
                    crossfadeRef.current = true;
                    crossfadeTo(audioEl);
                  } else {
                    cancelCrossfade();
                  }

                  // Try to play — may fail due to autoplay policy
                  resumeAudioContext();
                  audioEl.play().catch((err) => {
                    if (err.name === "NotAllowedError") {
                      // Autoplay blocked — user needs to click play manually
                      console.warn("[Player] Autoplay blocked — need user gesture");
                    } else {
                      console.error("[Player] play() failed:", err.name, err.message);
                    }
                  });
                  prevTrackIdForCrossfade.current = currentTrack.id;
                }
              });

              hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data.type === Hls.ErrorTypes.KEY_SYSTEM_ERROR) {
                  console.error("[Player] DRM/Key system error:", data.details, data.fatal);
                  clearTimeout(drmTimeout);
                  setIsLoadingTrack(false);
                  setPlayError(true);
                  prevTrackIdForCrossfade.current = null;
                  // DRM key error — try fallback streams (e.g. CBC-HLS instead of CTR-HLS)
                  if (tryFallbackStream(audioEl, currentTrack, cancelled)) return;
                  setTimeout(() => nextTrackRef.current(), 2000);
                  return;
                }
                if (data.fatal) {
                  console.error("[Player] HLS fatal error:", data.type, data.details);
                  clearTimeout(drmTimeout);
                  // Try to recover: if it's a network error, HLS.js can sometimes recover
                  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    console.warn("[Player] Attempting HLS network recovery...");
                    // Try fallback streams first (e.g. CTR CDN returns 403, try CBC)
                    if (tryFallbackStream(audioEl, currentTrack, cancelled)) return;
                    // No fallback — try HLS.js recovery
                    hls.startLoad();
                    // If recovery fails, the next ERROR event will handle it
                  } else {
                    // Non-recoverable: frag error, manifest error, etc.
                    // Try fallback streams before giving up
                    if (tryFallbackStream(audioEl, currentTrack, cancelled)) return;
                    hls.destroy();
                    delete (audioEl as any)._hlsInstance;
                    setIsLoadingTrack(false);
                    setPlayError(true);
                    prevTrackIdForCrossfade.current = null;
                    PlayerErrorLogger.log(currentTrack?.title || "unknown", `HLS fatal: ${data.type}/${data.details}`, "skip");
                    setTimeout(() => nextTrackRef.current(), 1500);
                  }
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
            // No stream URL and no audioUrl — track unavailable
            console.warn(`[Player] No stream URL for SC track: ${currentTrack.title}`);
            setPlayError(true);
            setIsLoadingTrack(false);
            prevTrackIdForCrossfade.current = null;
            const isDrm = stream?.drmRestricted;
            PlayerErrorLogger.log(currentTrack.title || "unknown", isDrm ? "DRM restricted (no playable stream)" : "No stream URL", "skip");
            try {
              toast({
                title: "Трек недоступен",
                description: isDrm
                  ? `"${currentTrack.title || "неизвестный"}" — защищён DRM, воспроизведение невозможно`
                  : `Трек недоступен: ${currentTrack.title || "неизвестный"}`,
              });
            } catch {}
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
              try {
                toast({ title: "Ошибка воспроизведения", description: "Локальный файл не найден (перезагрузите страницу)" });
              } catch {}
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
          // No source at all
          console.warn(`[Player] No audio source for track: ${currentTrack.title}`);
          setPlayError(true);
          setIsLoadingTrack(false);
          try {
            toast({ title: "Ошибка воспроизведения", description: `Нет источника: ${currentTrack.title || "неизвестный"}` });
          } catch {}
          setTimeout(() => nextTrackRef.current(), 1500);
        }
      } catch (err) {
        console.error("loadTrack error:", err);
        setPlayError(true);
        setIsLoadingTrack(false);
        try {
          toast({ title: "Ошибка воспроизведения", description: "Произошла ошибка при загрузке трека" });
        } catch {}
        setTimeout(() => nextTrackRef.current(), 2000);
      }
    };

    loadTrack();

    return () => { cancelled = true; pendingTimeouts.forEach(t => clearTimeout(t)); };
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
      album: currentTrack.album || "mq",
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

  return (
    <motion.div
      ref={playerBarRef}
      initial={animationsEnabled ? { y: 100 } : undefined}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
      className="fixed left-0 right-0 z-40 lg:bottom-0 bottom-[56px] h-auto"
      style={{ backgroundColor: "var(--mq-player-bg)", borderTop: "1px solid var(--mq-border)", touchAction: "none" }}
    >
      {/* Progress bar */}
      <div
        ref={progressRef}
        onMouseDown={handleProgressMouseDown}
        onTouchStart={handleProgressTouchStart}
        className={`w-full ${compactMode ? "h-1 sm:h-1.5" : "h-1.5"} cursor-pointer group relative`}
        style={{ backgroundColor: "var(--mq-border)" }}
      >
        <div className="h-full transition-all duration-100" style={{
          width: `${progressPct}%`,
          backgroundColor: playError ? "#ef4444" : "var(--mq-accent)",
          boxShadow: "0 0 8px var(--mq-glow)",
        }} />
        <div className="absolute top-1/2 w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-opacity sm:opacity-0 sm:group-hover:opacity-100 opacity-100" style={{
          left: `${progressPct}%`,
          backgroundColor: playError ? "#ef4444" : "var(--mq-accent)",
          transform: "translate(-50%, -50%)",
          boxShadow: "0 0 6px var(--mq-glow)",
        }} />
        {/* Time text - always visible (not just sm:block) */}
        <div className="absolute top-full left-1 text-[9px] mt-0.5 hidden sm:block" style={{ color: "var(--mq-text-muted)" }}>
          {formatDuration(Math.floor(Math.min(progress, duration || 0)))}
        </div>
        <div className="absolute top-full right-1 text-[9px] mt-0.5 hidden sm:block" style={{ color: "var(--mq-text-muted)" }}>
          {formatDuration(Math.floor(duration))}
        </div>
      </div>

      <div className={`flex items-center justify-between ${compactMode ? "px-1.5 py-1 lg:px-4 lg:py-2" : "px-3 py-2 lg:px-6 lg:py-3"} max-w-screen-2xl mx-auto overflow-hidden`}>
        {/* Track info — fixed flex-basis to prevent layout shift */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 cursor-pointer flex-shrink" style={{ flexBasis: "35%", maxWidth: "40%" }} onClick={() => setFullTrackViewOpen(true)}>
          {currentTrack.cover ? (
            <img src={currentTrack.cover} alt={currentTrack.album} className={`${compactMode ? "w-7 h-7 sm:w-9 sm:h-9 lg:w-10 lg:h-10" : "w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12"} rounded-lg object-cover flex-shrink-0`} />
          ) : (
            <div className={`${compactMode ? "w-7 h-7 sm:w-9 sm:h-9 lg:w-10 lg:h-10" : "w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12"} rounded-lg flex-shrink-0 flex items-center justify-center`} style={{ backgroundColor: "var(--mq-accent)", opacity: 0.5 }}>
              <Music className="w-4 h-4 sm:w-5 h-5" style={{ color: "var(--mq-text)" }} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
            <p className="text-[10px] sm:text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
              {currentTrack.artist}
              {playError && <span className="ml-1.5 px-1.5 py-0 rounded text-[9px] inline-flex-shrink-0" style={{ backgroundColor: "rgba(239,68,68,0.2)", color: "#ef4444" }}>Ошибка</span>}
            </p>
          </div>
        </div>

        {/* Controls — center, essential buttons always visible */}
        <div className="flex items-center gap-0.5 sm:gap-2 lg:gap-4 mx-0.5 sm:mx-2 lg:mx-4 flex-shrink-0">
          {/* Shuffle — hidden on mobile */}
          <div className="relative p-1 min-w-[28px] min-h-[28px] sm:min-w-[32px] sm:min-h-[32px] items-center justify-center hidden sm:flex">
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleShuffle} className="flex items-center justify-center"
              style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
              <Shuffle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </motion.button>
            {shuffle && smartShuffle && (
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--mq-accent)" }}>
              </div>
            )}
          </div>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handlePrevTrack}
            className="p-1.5 sm:p-2 min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center" style={{ color: "var(--mq-text)" }}>
            <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
          <MagneticPlayButton onClick={togglePlay}
            className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)", boxShadow: isPlaying ? "0 0 20px var(--mq-glow)" : "none" }}
            disabled={isLoadingTrack}>
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
          </MagneticPlayButton>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => {
            const st = useAppStore.getState();
            if (st.currentTrack?.id) st.recordSkip(st.currentTrack.id, st.progress || 0);
            nextTrack();
          }}
            className="p-1.5 sm:p-2 min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center" style={{ color: "var(--mq-text)" }}>
            <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
          {/* Repeat — hidden on mobile */}
          <motion.button whileTap={{ scale: 0.9 }} onClick={toggleRepeat} className="p-1 min-w-[28px] min-h-[28px] sm:min-w-[32px] sm:min-h-[32px] items-center justify-center hidden sm:flex"
            style={{ color: repeat !== "off" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
            {repeat === "one" ? <Repeat1 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Repeat className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
          </motion.button>
          {/* Wave Mode Toggle — sm+ only */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              const st = useAppStore.getState();
              st.toggleRadioMode();
            }}
            className="relative p-1 min-w-[28px] min-h-[28px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center hidden md:flex"
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
          {/* Spatial Audio Toggle — visible on all screens */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              const st = useAppStore.getState();
              st.setSpatialAudioEnabled(!st.spatialAudioEnabled);
              if (!st.spatialAudioEnabled) {
                st.setView("spatial");
              }
            }}
            className="relative p-1 min-w-[28px] min-h-[28px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center"
            style={{
              color: spatialAudioEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)",
            }}
            title={spatialAudioEnabled ? "Spatial Audio — ON" : "Spatial Audio"}
          >
            <Headphones className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${spatialAudioEnabled ? "fill-current" : ""}`} />
            {spatialAudioEnabled && (
              <motion.div
                layoutId="spatial-indicator"
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                style={{ backgroundColor: "var(--mq-accent)" }}
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              />
            )}
          </motion.button>
        </div>

        {/* Action buttons — right side, progressively shown on larger screens */}
        <div className="flex items-center gap-1 lg:gap-2 justify-end min-w-0 flex-shrink overflow-hidden" style={{ flexBasis: "35%", maxWidth: "40%" }}>
          <span className="text-xs hidden lg:block flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>
            {formatDuration(Math.floor(Math.min(progress, duration || 0)))} / {formatDuration(Math.floor(duration))}
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

          {/* Dislike button — lg+ only */}
          {(() => {
            const isDisliked = (Array.isArray(dislikedTrackIds) ? dislikedTrackIds : []).includes(currentTrack.id);
            return (
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => toggleDislike(currentTrack.id, currentTrack)}
                className="p-1 flex-shrink-0 hidden lg:flex items-center justify-center" style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }}>
                <ThumbsDown className={`w-4 h-4 ${isDisliked ? "fill-current" : ""}`} />
              </motion.button>
            );
          })()}

          {/* Similar tracks — lg+ only */}
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => requestShowSimilar()}
            className="p-1 flex-shrink-0 items-center justify-center hidden lg:flex"
            style={{ color: "var(--mq-text-muted)" }} title="Похожие">
            <ListMusic className="w-4 h-4" />
          </motion.button>

          {/* Queue — lg+ only */}
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowQueue(true)}
            className="p-1 flex-shrink-0 items-center justify-center hidden lg:flex relative"
            style={{ color: upNext.length > 0 ? "var(--mq-accent)" : "var(--mq-text-muted)" }} title="Очередь">
            <ListEnd className="w-4 h-4" />
            {upNext.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold"
                style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>{upNext.length}</span>
            )}
          </motion.button>

          {/* Lyrics — lg+ only */}
          <motion.button whileTap={{ scale: 0.9 }}
            onClick={() => { setFullTrackViewOpen(true); requestShowLyrics(); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg flex-shrink-0 hidden lg:flex"
            style={{ color: "var(--mq-text-muted)", backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
            title="Текст">
            <FileText className="w-3.5 h-3.5" />
            <span className="text-[10px] hidden xl:inline">Текст</span>
          </motion.button>

          {/* Download — lg+ only */}
          <motion.button whileTap={{ scale: 0.85 }} onClick={async () => {
            const audio = audioRef.current || getAudioElement();
            const t = useAppStore.getState().currentTrack;
            if (audio && audio.src && t) {
              try {
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

          {/* Share — lg+ only */}
          {currentTrack.scTrackId && (
            <div className="hidden lg:block flex-shrink-0">
              <ShareButton scTrackId={currentTrack.scTrackId} />
            </div>
          )}


          {/* Volume — mute button sm+, slider & percentage md+ */}
          <div ref={volumeSectionRef} className="items-center gap-1 flex-shrink-0 hidden sm:flex">
            <button onClick={() => setVolume(volume > 0 ? 0 : 30)}
              className="p-1 flex-shrink-0"
              style={{ color: "var(--mq-text-muted)" }}>
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <div ref={volumeRef} onClick={handleVolumeClick}
              className="w-16 lg:w-20 h-1.5 rounded-full cursor-pointer flex-shrink-0 hidden md:block"
              style={{ backgroundColor: "var(--mq-border)" }}>
              <div className="h-full rounded-full" style={{ width: `${volume}%`, backgroundColor: "var(--mq-accent)" }} />
            </div>
            <span className="text-[10px] w-8 flex-shrink-0 text-right hidden lg:block"
              style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}%</span>
          </div>
        </div>
      </div>

      {/* Audio visualization waveform — visible on all screen sizes */}
      <canvas
        ref={canvasRef}
        className="w-full pointer-events-none hidden md:block h-3 sm:h-5 lg:h-7"
        style={{ opacity: isPlaying ? 0.7 : 0.1, transition: "opacity 0.3s" }}
      />

      {/* Queue View */}
      <QueueView isOpen={showQueue} onClose={() => setShowQueue(false)} />

    </motion.div>
  );
}
