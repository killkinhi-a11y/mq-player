"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PlaybackEngine, type PlaybackState, type PlaybackMemory } from "@/lib/playbackEngine";
import type { Track } from "@/lib/musicApi";

// ── State shape exposed by the hook ──

export interface PlaybackEngineState {
  // Playback state
  state: PlaybackState;
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  volume: number;
  isPlaying: boolean;
  isLoading: boolean;
  isBuffering: boolean;
  hasError: boolean;
  errorMessage: string | null;

  // Queue
  queue: Track[];
  queueIndex: number;

  // Buffered
  buffered: number;
}

const INITIAL_STATE: PlaybackEngineState = {
  state: "idle",
  currentTrack: null,
  currentTime: 0,
  duration: 0,
  volume: 30,
  isPlaying: false,
  isLoading: false,
  isBuffering: false,
  hasError: false,
  errorMessage: null,
  queue: [],
  queueIndex: -1,
  buffered: 0,
};

// ── Helper: read a full snapshot from the engine ──

function snapshotEngine(engine: PlaybackEngine, errorMessage: string | null): PlaybackEngineState {
  const { tracks, currentIndex } = engine.getQueue();
  return {
    state: engine.state,
    currentTrack: engine.currentTrack,
    currentTime: engine.currentTime,
    duration: engine.duration,
    volume: engine.volume,
    isPlaying: engine.isPlaying,
    isLoading: engine.isLoading,
    isBuffering: engine.state === "buffering",
    hasError: engine.state === "error",
    errorMessage,
    queue: tracks,
    queueIndex: currentIndex,
    buffered: engine.buffered,
  };
}

// ── Main hook ──

export function usePlaybackEngine() {
  const engine = useMemo(() => PlaybackEngine.getInstance(), []);

  // Hold the latest error message in a ref so state_change can read it
  // without needing an extra render cycle.
  const errorMsgRef = useRef<string | null>(null);

  const [state, setState] = useState<PlaybackEngineState>(() =>
    snapshotEngine(engine, null),
  );

  // Keep a ref to the latest state so event handlers can derive patches
  // without going through a stale closure.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    // ── Subscribe to every engine event ──

    const unsubStateChange = engine.events.on("state_change", ({ to }) => {
      setState((prev) => ({
        ...prev,
        state: to,
        isPlaying: to === "playing",
        isLoading: to === "loading" || to === "buffering",
        isBuffering: to === "buffering",
        hasError: to === "error",
        // Clear the error message when leaving the error state
        errorMessage: to !== "error" ? null : prev.errorMessage,
      }));
    });

    const unsubTrackChange = engine.events.on("track_change", ({ track }) => {
      setState((prev) => ({
        ...prev,
        currentTrack: track,
      }));
    });

    const unsubTimeUpdate = engine.events.on("time_update", ({ currentTime, duration }) => {
      setState((prev) => ({
        ...prev,
        currentTime,
        duration,
      }));
    });

    const unsubBufferUpdate = engine.events.on("buffer_update", ({ buffered }) => {
      setState((prev) => ({
        ...prev,
        buffered,
      }));
    });

    const unsubVolumeChange = engine.events.on("volume_change", ({ volume }) => {
      setState((prev) => ({
        ...prev,
        volume,
      }));
    });

    const unsubError = engine.events.on("error", ({ error }) => {
      errorMsgRef.current = error;
      setState((prev) => ({
        ...prev,
        hasError: true,
        errorMessage: error,
      }));
    });

    const unsubQueueUpdate = engine.events.on("queue_update", ({ queue, index }) => {
      setState((prev) => ({
        ...prev,
        queue,
        queueIndex: index,
      }));
    });

    const unsubLoadingProgress = engine.events.on("loading_progress", ({ progress }) => {
      // Reuse buffered for loading progress since the engine emits the same
      // value for both buffer_update and loading_progress.
      setState((prev) => ({
        ...prev,
        buffered: progress,
      }));
    });

    const unsubRestoreAvailable = engine.events.on("restore_available", ({ memory }) => {
      // Components can opt into handling this; we just store it as a
      // side-effect hint (e.g. show "resume where you left off?" toast).
      // No direct state field — consumers can use engine.restoreFromMemory().
      console.log("[usePlaybackEngine] restore_available:", memory.lastTrackId, "at", memory.lastPosition);
    });

    // ── Resync on mount in case events fired before subscription ──
    setState(snapshotEngine(engine, errorMsgRef.current));

    // ── Cleanup ──
    return () => {
      unsubStateChange();
      unsubTrackChange();
      unsubTimeUpdate();
      unsubBufferUpdate();
      unsubVolumeChange();
      unsubError();
      unsubQueueUpdate();
      unsubLoadingProgress();
      unsubRestoreAvailable();
    };
  }, [engine]);

  // ── Convenience methods (stable references) ──

  const play = useCallback(
    (track: Track, queue?: Track[]) => engine.play(track, queue),
    [engine],
  );

  const pause = useCallback(() => engine.pause(), [engine]);
  const resume = useCallback(() => engine.resume(), [engine]);
  const togglePlayPause = useCallback(() => engine.togglePlayPause(), [engine]);
  const seek = useCallback((time: number) => engine.seek(time), [engine]);
  const next = useCallback(() => engine.next(), [engine]);
  const previous = useCallback(() => engine.previous(), [engine]);
  const setVolume = useCallback((vol: number) => engine.setVolume(vol), [engine]);
  const mute = useCallback(() => engine.mute(), [engine]);
  const unmute = useCallback(() => engine.unmute(), [engine]);

  const addToQueue = useCallback(
    (track: Track, position?: "next" | "last") => engine.addToQueue(track, position),
    [engine],
  );

  const removeFromQueue = useCallback(
    (index: number) => engine.removeFromQueue(index),
    [engine],
  );

  const reorderQueue = useCallback(
    (from: number, to: number) => engine.reorderQueue(from, to),
    [engine],
  );

  const setQueue = useCallback(
    (tracks: Track[], startIndex?: number) => engine.setQueue(tracks, startIndex),
    [engine],
  );

  const restoreFromMemory = useCallback(
    (trackLookup?: Map<string, Track>) => engine.restoreFromMemory(trackLookup),
    [engine],
  );

  return {
    ...state,
    engine,

    // Playback controls
    play,
    pause,
    resume,
    togglePlayPause,
    seek,
    next,
    previous,

    // Volume
    setVolume,
    mute,
    unmute,

    // Queue
    addToQueue,
    removeFromQueue,
    reorderQueue,
    setQueue,

    // Persistence
    restoreFromMemory,
  };
}

// ── Lightweight hook for components that only need basic info ──
// Used by mini-player indicators, now-playing displays, etc.

export interface PlaybackStateLite {
  isPlaying: boolean;
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
}

export function usePlaybackState(): PlaybackStateLite {
  const engine = useMemo(() => PlaybackEngine.getInstance(), []);

  const [lite, setLite] = useState<PlaybackStateLite>(() => ({
    isPlaying: engine.isPlaying,
    currentTrack: engine.currentTrack,
    currentTime: engine.currentTime,
    duration: engine.duration,
  }));

  useEffect(() => {
    const unsubState = engine.events.on("state_change", ({ to }) => {
      setLite((prev) => ({
        ...prev,
        isPlaying: to === "playing",
      }));
    });

    const unsubTrack = engine.events.on("track_change", ({ track }) => {
      setLite((prev) => ({
        ...prev,
        currentTrack: track,
      }));
    });

    const unsubTime = engine.events.on("time_update", ({ currentTime, duration }) => {
      setLite((prev) => ({
        ...prev,
        currentTime,
        duration,
      }));
    });

    // Resync on mount
    setLite({
      isPlaying: engine.isPlaying,
      currentTrack: engine.currentTrack,
      currentTime: engine.currentTime,
      duration: engine.duration,
    });

    return () => {
      unsubState();
      unsubTrack();
      unsubTime();
    };
  }, [engine]);

  return lite;
}
