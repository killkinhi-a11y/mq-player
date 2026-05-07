"use client";

import { useEffect, useCallback, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";

/**
 * Global keyboard shortcuts for music playback.
 *
 * Shortcuts only fire when the user is NOT typing in an input, textarea,
 * or contentEditable element.
 *
 * | Key          | Action                    |
 * |--------------|---------------------------|
 * | Space        | Toggle play / pause       |
 * | ArrowRight   | Seek forward 10 s         |
 * | ArrowLeft    | Seek backward 10 s        |
 * | ArrowUp      | Volume up 5               |
 * | ArrowDown    | Volume down 5             |
 * | n / N        | Next track                |
 * | p / P        | Previous track            |
 * | m / M        | Toggle mute / unmute      |
 * | l / L        | Toggle like on current track |
 * | f / F        | Toggle full track view    |
 * | b / B        | Toggle A-B repeat           |
 * | Escape       | Close full track view     |
 */
export function useKeyboardShortcuts() {
  // We keep a ref to the volume *before* muting so we can restore it.
  const preMuteVolume = useRef<number | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // ── Ignore when user is typing in an input / textarea / contentEditable ──
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }

    const store = useAppStore.getState();
    const {
      isPlaying,
      togglePlay,
      nextTrack,
      prevTrack,
      volume,
      setVolume,
      progress,
      setProgress,
      duration,
      isFullTrackViewOpen,
      setFullTrackViewOpen,
      currentTrack,
      toggleLike,
      likedTrackIds,
    } = store;

    const key = e.key;

    switch (key) {
      // ── Space: toggle play / pause ──
      case " ": {
        e.preventDefault();
        togglePlay();
        break;
      }

      // ── ArrowRight: seek forward 10 s ──
      case "ArrowRight": {
        e.preventDefault();
        const audio = document.querySelector("audio");
        if (audio && duration > 0) {
          const newTime = Math.min(audio.currentTime + 10, duration);
          audio.currentTime = newTime;
          setProgress(newTime);
        }
        break;
      }

      // ── ArrowLeft: seek backward 10 s ──
      case "ArrowLeft": {
        e.preventDefault();
        const audio = document.querySelector("audio");
        if (audio && duration > 0) {
          const newTime = Math.max(audio.currentTime - 10, 0);
          audio.currentTime = newTime;
          setProgress(newTime);
        }
        break;
      }

      // ── ArrowUp: volume up 5 ──
      case "ArrowUp": {
        e.preventDefault();
        const newVol = Math.min(volume + 5, 100);
        setVolume(newVol);
        // Also update the audio element directly for instant feedback
        const audio = document.querySelector("audio");
        if (audio) audio.volume = newVol / 100;
        // If we were muted, restore the pre-mute ref
        if (preMuteVolume.current !== null && newVol > 0) {
          preMuteVolume.current = null;
        }
        break;
      }

      // ── ArrowDown: volume down 5 ──
      case "ArrowDown": {
        e.preventDefault();
        const newVol = Math.max(volume - 5, 0);
        setVolume(newVol);
        const audio = document.querySelector("audio");
        if (audio) audio.volume = newVol / 100;
        if (newVol === 0 && preMuteVolume.current === null) {
          preMuteVolume.current = volume;
        }
        break;
      }

      // ── n / N: next track ──
      case "n":
      case "N": {
        nextTrack();
        break;
      }

      // ── p / P: previous track ──
      case "p":
      case "P": {
        prevTrack();
        break;
      }

      // ── m / M: toggle mute / unmute ──
      case "m":
      case "M": {
        if (volume === 0) {
          // Unmute — restore pre-mute volume (default to 30)
          const restore = preMuteVolume.current ?? 30;
          setVolume(restore);
          const audio = document.querySelector("audio");
          if (audio) audio.volume = restore / 100;
          preMuteVolume.current = null;
        } else {
          // Mute
          preMuteVolume.current = volume;
          setVolume(0);
          const audio = document.querySelector("audio");
          if (audio) audio.volume = 0;
        }
        break;
      }

      // ── l / L: toggle like on current track ──
      case "l":
      case "L": {
        if (currentTrack) {
          toggleLike(currentTrack.id, currentTrack);
        }
        break;
      }

      // ── f / F: toggle full track view ──
      case "f":
      case "F": {
        setFullTrackViewOpen(!isFullTrackViewOpen);
        break;
      }

      // ── b / B: toggle A-B repeat ──
      case "b":
      case "B": {
        const abState = useAppStore.getState().abRepeat;
        if (abState.active) {
          useAppStore.getState().clearAbRepeat();
        } else if (abState.pointA !== null) {
          useAppStore.getState().setAbRepeatPoint('B');
        } else {
          useAppStore.getState().setAbRepeatPoint('A');
        }
        break;
      }

      // ── Escape: close full track view if open ──
      case "Escape": {
        if (isFullTrackViewOpen) {
          setFullTrackViewOpen(false);
        }
        break;
      }

      default:
        break;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
