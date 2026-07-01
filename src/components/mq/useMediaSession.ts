import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { resumeAudioContext, getAudioElement } from "@/lib/audioEngine";
import type { Track } from "@/lib/musicApi";

interface UseMediaSessionParams {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  playbackRate: number;
}

// Detect if running inside Capacitor (native app / APK)
function isCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

// Dynamically import the native plugin (only loaded in Capacitor context)
let nativeMediaSession: any = null;
async function getNativeMediaSession() {
  if (nativeMediaSession) return nativeMediaSession;
  try {
    const mod = await import("@capgo/capacitor-media-session");
    nativeMediaSession = mod.MediaSession;
    return nativeMediaSession;
  } catch {
    return null;
  }
}

// Convert relative cover URL to absolute (required by native MediaSession + Android lockscreen)
function absoluteCoverUrl(cover?: string): string | null {
  if (!cover) return null;
  if (cover.startsWith("http://") || cover.startsWith("https://")) return cover;
  if (cover.startsWith("/")) {
    // In Capacitor WebView, window.location.origin is https://localhost or the server URL
    const origin = typeof window !== "undefined" ? window.location.origin : "https://mq1.vercel.app";
    return `${origin}${cover}`;
  }
  // data: URLs or other protocols — pass through
  return cover;
}

export function useMediaSession({ currentTrack, isPlaying, progress, duration, playbackRate }: UseMediaSessionParams) {
  const lastPositionUpdate = useRef(0);
  const nativeAvailableRef = useRef<boolean | null>(null); // null = not checked yet

  // ── Helper: set up action handlers (shared between native + web) ──
  const setupActions = (isNative: boolean) => {
    const setAction = (action: string, handler: () => void) => {
      if (isNative) {
        nativeMediaSession?.setActionHandler({ action }, handler).catch(() => {});
      } else {
        try {
          navigator.mediaSession.setActionHandler(action as any, handler as any);
        } catch {}
      }
    };

    setAction("play", () => {
      resumeAudioContext();
      const st = useAppStore.getState();
      if (!st.isPlaying) st.togglePlay();
    });
    setAction("pause", () => {
      const st = useAppStore.getState();
      if (st.isPlaying) st.togglePlay();
    });
    setAction("previoustrack", () => {
      const st = useAppStore.getState();
      if (st.progress > 3) {
        const audio = getAudioElement();
        if (audio && audio.src) audio.currentTime = 0;
        st.setProgress(0);
      } else {
        st.prevTrack();
      }
    });
    setAction("nexttrack", () => {
      const st = useAppStore.getState();
      if (st.currentTrack?.id) st.recordSkip(st.currentTrack.id, st.progress || 0);
      st.nextTrack();
    });
    setAction("stop", () => {
      const st = useAppStore.getState();
      if (st.isPlaying) st.togglePlay();
    });
  };

  // ── Effect 1: Set metadata + action handlers when track changes ──
  useEffect(() => {
    if (!currentTrack) return;
    let cancelled = false;

    const setup = async () => {
      const artworkUrl = absoluteCoverUrl(currentTrack.cover);
      const artwork = artworkUrl ? [{ src: artworkUrl, sizes: "512x512", type: "image/jpeg" }] : [];

      const metadata = {
        title: currentTrack.title || "Unknown",
        artist: currentTrack.artist || "Unknown",
        album: currentTrack.album || "MQ Player",
        artwork,
      };

      // Try native plugin first (APK / Capacitor)
      if (isCapacitor()) {
        const native = await getNativeMediaSession();
        if (cancelled) return;

        if (native) {
          nativeAvailableRef.current = true;
          try {
            await native.setMetadata(metadata);
            setupActions(true);

            // Also set web MediaSession as fallback (some Android WebViews support it)
            if ("mediaSession" in navigator) {
              try {
                navigator.mediaSession.metadata = new MediaMetadata(metadata);
              } catch {}
            }
            return;
          } catch (e) {
            console.warn("[MediaSession] native plugin failed, falling back to web:", e);
          }
        } else {
          console.warn("[MediaSession] native plugin not available, using web fallback");
        }
      }

      // Web MediaSession (browser / PWA / fallback)
      nativeAvailableRef.current = false;
      if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

      try {
        navigator.mediaSession.metadata = new MediaMetadata(metadata);
        setupActions(false);
      } catch (e) {
        console.warn("[MediaSession] web setup failed:", e);
      }
    };

    setup();
    return () => { cancelled = true; };
  }, [currentTrack]);

  // ── Effect 2: Update playback state ──
  useEffect(() => {
    if (nativeAvailableRef.current === true && isCapacitor()) {
      getNativeMediaSession().then(native => {
        native?.setPlaybackState({ playbackState: isPlaying ? "playing" : "paused" }).catch(() => {});
      });
    }
    // Always update web MediaSession too (works in most WebViews)
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
  }, [isPlaying]);

  // ── Effect 3: Update position state (throttled to ~1Hz) ──
  useEffect(() => {
    const now = Date.now();
    if (now - lastPositionUpdate.current < 1000) return;
    lastPositionUpdate.current = now;

    const pos = Math.max(0, Math.min(progress, duration || 0));
    const dur = Math.max(0, duration || 0);
    const rate = playbackRate || 1;

    if (nativeAvailableRef.current === true && isCapacitor()) {
      getNativeMediaSession().then(native => {
        native?.setPositionState({ duration: dur, playbackRate: rate, position: pos }).catch(() => {});
      });
    }

    // Web MediaSession position state
    if (typeof navigator !== "undefined" && "mediaSession" in navigator && "setPositionState" in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState({ duration: dur, playbackRate: rate, position: pos });
      } catch {}
    }
  }, [progress, duration, playbackRate]);
}
