"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { extractTasteProfile } from "@/lib/tasteProfile";
import type { Track } from "@/lib/musicApi";

// ═════════════════════════════════════════════════════════════════════════
// useWaveEngine — Wave (radio mode) logic, separated from UI
// ═════════════════════════════════════════════════════════════════════════
//
// Responsibilities:
// 1. Start wave: fetch recommendations based on taste profile, play first track
// 2. Auto-continue: when track ends in radio mode, fetch more tracks
// 3. Skip: skip current track, fetch more if queue running low
// 4. Dislike: mark track as disliked, skip to next
// 5. Stop: turn off radio mode
//
// The hook is pure logic — no UI. WaveCard component handles all visuals.

export function useWaveEngine() {
  const playTrack = useAppStore((s) => s.playTrack);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const toggleRadioMode = useAppStore((s) => s.toggleRadioMode);
  const radioMode = useAppStore((s) => s.radioMode);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const queue = useAppStore((s) => s.queue);
  const queueIndex = useAppStore((s) => s.queueIndex);
  const likedTracksData = useAppStore((s) => s.likedTracksData);
  const history = useAppStore((s) => s.history);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const recordSkip = useAppStore((s) => s.recordSkip);

  const [waveLoading, setWaveLoading] = useState(false);
  const [waveError, setWaveError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);

  // ── Build taste profile ──
  const tasteProfile = useRef(extractTasteProfile({
    history: Array.isArray(history) ? history : [],
    likedTracksData: Array.isArray(likedTracksData) ? likedTracksData : [],
    dislikedTrackIds: Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [],
  }));

  // Update taste profile when inputs change (debounced via ref)
  useEffect(() => {
    tasteProfile.current = extractTasteProfile({
      history: Array.isArray(history) ? history : [],
      likedTracksData: Array.isArray(likedTracksData) ? likedTracksData : [],
      dislikedTrackIds: Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [],
    });
  }, [history, likedTracksData, dislikedTrackIds]);

  // ── Fetch tracks from recommendations API ──
  const fetchWaveTracks = useCallback(async (count: number = 20): Promise<Track[]> => {
    const tp = tasteProfile.current;
    const disliked = useAppStore.getState().dislikedTrackIds || [];
    const params = new URLSearchParams();

    if (tp.topGenres.length > 0) params.set("genres", tp.topGenres.join(","));
    const favArtists = (useAppStore.getState().favoriteArtists || []).map(a => a.username);
    const allArtists = [...new Set([...favArtists, ...tp.topArtists])];
    if (allArtists.length > 0) params.set("artists", allArtists.slice(0, 5).join(","));
    if (disliked.length > 0) params.set("dislikedIds", disliked.join(","));
    params.set("wave", "1");
    params.set("count", String(count));

    const likedScIds = useAppStore.getState().likedTracksData
      .map((t: any) => t.scTrackId).filter((id: any): id is number => !!id).slice(0, 5).join(",");
    if (likedScIds) params.set("likedScIds", likedScIds);

    const historyScIds = useAppStore.getState().history.slice(0, 10)
      .map((h: any) => h.track?.scTrackId).filter((id: any): id is number => !!id).join(",");
    if (historyScIds) params.set("historyScIds", historyScIds);

    // Exclude ALL recently played track IDs (not just 10) to prevent repeats
    const recentTrackIds = (useAppStore.getState().history || [])
      .slice(0, 50)
      .map((h: any) => h.track?.id)
      .filter(Boolean) as string[];
    // Also exclude current queue track IDs
    const queueIds = (useAppStore.getState().queue || [])
      .map((t: any) => t.id)
      .filter(Boolean) as string[];
    const excludeIds = [...new Set([...recentTrackIds, ...queueIds])];
    if (excludeIds.length > 0) params.set("excludeIds", excludeIds.join(","));

    const res = await fetch(`/api/music/recommendations?${params}`);
    if (!res.ok) throw new Error(`Wave fetch failed: ${res.status}`);
    const data = await res.json();
    // Client-side dedup: filter out tracks already in history or queue
    const excludeSet = new Set(excludeIds);
    let tracks = (data.tracks || []).filter((t: Track) => !disliked.includes(t.id) && !excludeSet.has(t.id));

    // If we got fewer than requested, also fetch from trending to fill
    if (tracks.length < count) {
      try {
        const trendingRes = await fetch(`/api/music/trending?limit=${count - tracks.length}`);
        if (trendingRes.ok) {
          const tData = await trendingRes.json();
          const extra = (tData.tracks || [])
            .filter((t: Track) => !disliked.includes(t.id))
            .filter((t: Track) => !excludeSet.has(t.id))
            .filter((t: Track) => !tracks.some(existing => existing.id === t.id));
          tracks = [...tracks, ...extra];
        }
      } catch {}

      // Also try Apple Music Top + Spotify charts for more variety
      if (tracks.length < count) {
        try {
          const userCountry = "RU"; // Default
          const [appleRes, spotifyRes] = await Promise.all([
            fetch(`/api/music/apple-charts?country=${userCountry}`).catch(() => null),
            fetch(`/api/music/spotify-charts?country=${userCountry}`).catch(() => null),
          ]);
          for (const res of [appleRes, spotifyRes]) {
            if (res && res.ok) {
              const aData = await res.json();
              const extra = (aData.tracks || [])
                .filter((t: Track) => !disliked.includes(t.id))
                .filter((t: Track) => !excludeSet.has(t.id))
                .filter((t: Track) => !tracks.some(existing => existing.id === t.id))
                // Prefer playable tracks
                .filter((t: Track) => t.scIsFull || t.scStreamPolicy === "ALLOW");
              tracks = [...tracks, ...extra];
            }
          }
        } catch {}
      }
    }

    return tracks;
  }, []);

  // ── Shuffle array (Fisher-Yates) ──
  const shuffle = useCallback(<T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, []);

  // ── Start Wave ──
  const startWave = useCallback(async () => {
    if (waveLoading) return;
    setWaveLoading(true);
    setWaveError(null);
    lastFetchRef.current = Date.now();

    try {
      let tracks = await fetchWaveTracks(20);
      if (tracks.length === 0) {
        setWaveError("Не удалось загрузить треки. Попробуйте позже.");
        return;
      }

      tracks = shuffle(tracks);

      // P3-fix: set radioMode DIRECTLY (not toggle) — toggleRadioMode
      // requires currentTrack to be set, which it isn't on first launch.
      // This was causing the "need to click 2 times" bug.
      useAppStore.setState({
        radioMode: true,
        radioSeedTrack: tracks[0],
        radioSkipCount: 0,
      });
      playTrack(tracks[0], tracks);
    } catch (err) {
      setWaveError("Ошибка загрузки Волны");
    } finally {
      setWaveLoading(false);
    }
  }, [waveLoading, fetchWaveTracks, shuffle, playTrack]);

  // ── Stop Wave ──
  const stopWave = useCallback(() => {
    // P3-fix: set radioMode DIRECTLY to false (not toggle) — toggle could
    // accidentally re-enable radio if state was inconsistent.
    useAppStore.setState({
      radioMode: false,
      radioSeedTrack: null,
      radioSkipCount: 0,
    });
  }, []);

  // ── Pause/Resume (doesn't stop wave, just pauses playback) ──
  const pauseWave = useCallback(() => {
    useAppStore.getState().togglePlay();
  }, []);

  // ── Skip current track ──
  const skipTrack = useCallback(async () => {
    if (currentTrack) {
      recordSkip(currentTrack.id);
    }

    // If queue has more tracks, just next
    const state = useAppStore.getState();
    const remainingInQueue = state.queue.length - state.queueIndex - 1;

    if (remainingInQueue > 0) {
      nextTrack();
      return;
    }

    // Queue running low — fetch more tracks
    setWaveLoading(true);
    try {
      let newTracks = await fetchWaveTracks(10);
      if (newTracks.length > 0) {
        newTracks = shuffle(newTracks);
        // Add to queue and play first
        const currentQueue = useAppStore.getState().queue;
        const updatedQueue = [...currentQueue, ...newTracks];
        useAppStore.setState({ queue: updatedQueue });
        nextTrack();
      } else {
        // No new tracks — just next (will loop or stop)
        nextTrack();
      }
    } catch {
      nextTrack();
    } finally {
      setWaveLoading(false);
    }
  }, [currentTrack, recordSkip, nextTrack, fetchWaveTracks, shuffle]);

  // ── Dislike current track (skip + mark as disliked) ──
  const dislikeTrack = useCallback(() => {
    if (!currentTrack) return;
    // toggleDislike handles: adds to disliked list + auto-skips if current track
    const toggleDislike = useAppStore.getState().toggleDislike;
    toggleDislike(currentTrack.id, currentTrack);
  }, [currentTrack]);

  // ── Like current track ──
  const likeTrack = useCallback(() => {
    if (currentTrack) {
      toggleLike(currentTrack.id, currentTrack);
    }
  }, [currentTrack, toggleLike]);

  // ── Auto-refill when queue is low in radio mode ──
  useEffect(() => {
    if (!radioMode) return;
    if (!currentTrack) return;

    const remaining = queue.length - queueIndex - 1;
    // Refill when 2 or fewer tracks remaining
    if (remaining <= 2) {
      const now = Date.now();
      // Throttle: don't fetch more than once per 10 seconds
      if (now - lastFetchRef.current < 10000) return;
      lastFetchRef.current = now;

      fetchWaveTracks(10).then(newTracks => {
        if (newTracks.length > 0) {
          const shuffled = shuffle(newTracks);
          const state = useAppStore.getState();
          // Avoid duplicates
          const existingIds = new Set(state.queue.map(t => t.id));
          const filtered = shuffled.filter(t => !existingIds.has(t.id));
          if (filtered.length > 0) {
            useAppStore.setState({ queue: [...state.queue, ...filtered] });
          }
        }
      }).catch(() => {
        // Silent — auto-refill is best-effort
      });
    }
  }, [radioMode, currentTrack, queue, queueIndex, fetchWaveTracks, shuffle]);

  // ── Auto-stop wave when queue is empty and no current track ──
  useEffect(() => {
    if (radioMode && !currentTrack && queue.length === 0) {
      // Wait a bit, then stop if still empty
      const timer = setTimeout(() => {
        const state = useAppStore.getState();
        if (state.radioMode && !state.currentTrack && state.queue.length === 0) {
          useAppStore.setState({
            radioMode: false,
            radioSeedTrack: null,
            radioSkipCount: 0,
          });
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [radioMode, currentTrack, queue]);

  return {
    waveLoading,
    waveError,
    radioMode,
    startWave,
    stopWave,
    pauseWave,
    skipTrack,
    dislikeTrack,
    likeTrack,
  };
}
