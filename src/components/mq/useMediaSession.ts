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

// Detect if running inside Capacitor (native app)
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

export function useMediaSession({ currentTrack, isPlaying, progress, duration, playbackRate }: UseMediaSessionParams) {
  const lastPositionUpdate = useRef(0);

  // Effect 1: Set metadata + action handlers when track changes
  useEffect(() => {
    if (!currentTrack) return;

    const setupNative = async () => {
      const native = await getNativeMediaSession();
      if (!native) return;

      try {
        await native.setMetadata({
          title: currentTrack.title || "Unknown",
          artist: currentTrack.artist || "Unknown",
          album: currentTrack.album || "mq",
          artwork: currentTrack.cover ? [{ src: currentTrack.cover, sizes: "512x512", type: "image/jpeg" }] : [],
        });

        await native.setActionHandler({ action: "play" }, () => {
          resumeAudioContext();
          const st = useAppStore.getState();
          if (!st.isPlaying) st.togglePlay();
        });
        await native.setActionHandler({ action: "pause" }, () => {
          const st = useAppStore.getState();
          if (st.isPlaying) st.togglePlay();
        });
        await native.setActionHandler({ action: "previoustrack" }, () => {
          const st = useAppStore.getState();
          if (st.progress > 3) {
            const audio = getAudioElement();
            if (audio && audio.src) audio.currentTime = 0;
            st.setProgress(0);
          } else {
            st.prevTrack();
          }
        });
        await native.setActionHandler({ action: "nexttrack" }, () => {
          const st = useAppStore.getState();
          if (st.currentTrack?.id) st.recordSkip(st.currentTrack.id, st.progress || 0);
          st.nextTrack();
        });
        await native.setActionHandler({ action: "seekto" }, (details: any) => {
          const audio = getAudioElement();
          if (audio && details.seekTime !== undefined) {
            audio.currentTime = details.seekTime;
            useAppStore.getState().setProgress(audio.currentTime);
          }
        });
        await native.setActionHandler({ action: "seekbackward" }, (details: any) => {
          const audio = getAudioElement();
          if (audio) {
            audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10));
            useAppStore.getState().setProgress(audio.currentTime);
          }
        });
        await native.setActionHandler({ action: "seekforward" }, (details: any) => {
          const audio = getAudioElement();
          if (audio) {
            audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (details.seekOffset || 10));
            useAppStore.getState().setProgress(audio.currentTime);
          }
        });
        await native.setActionHandler({ action: "stop" }, () => {
          const st = useAppStore.getState();
          if (st.isPlaying) st.togglePlay();
        });
      } catch (e) {
        // Plugin not available, fall back to web MediaSession
      }
    };

    // Web MediaSession (browser / PWA)
    const setupWeb = () => {
      if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title || "Unknown",
          artist: currentTrack.artist || "Unknown",
          album: currentTrack.album || "mq",
          artwork: currentTrack.cover ? [{ src: currentTrack.cover, sizes: "512x512", type: "image/jpeg" }] : [],
        });

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
          const st = useAppStore.getState();
          if (st.progress > 3) {
            const audio = getAudioElement();
            if (audio && audio.src) audio.currentTime = 0;
            st.setProgress(0);
          } else {
            st.prevTrack();
          }
        });
        navigator.mediaSession.setActionHandler("nexttrack", () => {
          const st = useAppStore.getState();
          if (st.currentTrack?.id) st.recordSkip(st.currentTrack.id, st.progress || 0);
          st.nextTrack();
        });
        navigator.mediaSession.setActionHandler("seekto", (details) => {
          const audio = getAudioElement();
          if (audio && details.seekTime !== undefined) {
            audio.currentTime = details.seekTime;
            useAppStore.getState().setProgress(audio.currentTime);
          }
        });
        navigator.mediaSession.setActionHandler("seekbackward", (details) => {
          const audio = getAudioElement();
          if (audio) {
            audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10));
            useAppStore.getState().setProgress(audio.currentTime);
          }
        });
        navigator.mediaSession.setActionHandler("seekforward", (details) => {
          const audio = getAudioElement();
          if (audio) {
            audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (details.seekOffset || 10));
            useAppStore.getState().setProgress(audio.currentTime);
          }
        });
        navigator.mediaSession.setActionHandler("stop", () => {
          const st = useAppStore.getState();
          if (st.isPlaying) st.togglePlay();
        });
      } catch {}
    };

    if (isCapacitor()) {
      setupNative();
    } else {
      setupWeb();
    }
  }, [currentTrack]);

  // Effect 2: Update playback state
  useEffect(() => {
    if (isCapacitor()) {
      getNativeMediaSession().then(native => {
        if (!native) {
          // Fall back to web
          if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
            navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
          }
          return;
        }
        native.setPlaybackState({ playbackState: isPlaying ? "playing" : "paused" }).catch(() => {});
      });
    } else {
      if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
  }, [isPlaying]);

  // Effect 3: Update position state (throttled to ~1Hz)
  useEffect(() => {
    const now = Date.now();
    if (now - lastPositionUpdate.current < 1000) return;
    lastPositionUpdate.current = now;

    const pos = Math.max(0, Math.min(progress, duration || 0));
    const dur = Math.max(0, duration || 0);
    const rate = playbackRate || 1;

    if (isCapacitor()) {
      getNativeMediaSession().then(native => {
        if (!native) {
          if (typeof navigator !== "undefined" && "mediaSession" in navigator && "setPositionState" in navigator.mediaSession) {
            try {
              navigator.mediaSession.setPositionState({ duration: dur, playbackRate: rate, position: pos });
            } catch {}
          }
          return;
        }
        native.setPositionState({ duration: dur, playbackRate: rate, position: pos }).catch(() => {});
      });
    } else {
      if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
      if ("setPositionState" in navigator.mediaSession) {
        try {
          navigator.mediaSession.setPositionState({ duration: dur, playbackRate: rate, position: pos });
        } catch {}
      }
    }
  }, [progress, duration, playbackRate]);
}
