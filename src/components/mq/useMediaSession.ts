import { useEffect } from "react";
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

export function useMediaSession({ currentTrack, isPlaying, progress, duration, playbackRate }: UseMediaSessionParams) {
  // Effect 1: Set metadata + action handlers when track changes
  useEffect(() => {
    if (!currentTrack || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

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
  }, [currentTrack]);

  // Effect 2: Update playback state and position
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    if ("setPositionState" in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration || 0),
          playbackRate: playbackRate || 1,
          position: Math.max(0, Math.min(progress, duration || 0)),
        });
      } catch {}
    }
  }, [isPlaying, progress, duration, playbackRate]);
}
