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
  const radioMode = useAppStore((s) => s.radioMode);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const queue = useAppStore((s) => s.queue);
  const queueIndex = useAppStore((s) => s.queueIndex);
  const likedTracksData = useAppStore((s) => s.likedTracksData);
  const history = useAppStore((s) => s.history);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const recordSkip = useAppStore((s) => s.recordSkip);

  const [waveLoading, setWaveLoading] = useState(false);
  const [waveError, setWaveError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);
  // In-flight fetch guard: prevents parallel auto-refill fetches when the
  // effect re-runs (queue/queueIndex/currentTrack change) before the previous
  // fetch resolves. Without this, rapid track changes trigger 2-3 parallel
  // /api/music/radio requests, wasting rate-limit budget and causing
  // duplicate-track races in the queue.
  const inflightRef = useRef<Promise<Track[]> | null>(null);

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

  // ── Fetch tracks for wave ──
  // INITIAL start (no current track): /api/music/recommendations?wave=1
  // REFILL/SKIP (current track playing): /api/music/radio?scTrackId=<cur>
  // Falls back to recommendations if radio fails.
  const fetchWaveTracks = useCallback(async (count: number = 15): Promise<Track[]> => {
    const tp = tasteProfile.current;
    const disliked = useAppStore.getState().dislikedTrackIds || [];
    const state = useAppStore.getState();
    const cur = state.currentTrack;

    // Client-side dedup — exclude recently played + queue + disliked
    const excludeSet = new Set<string>([
      ...((state.history || []).slice(0, 200).map(h => h.track?.id).filter(Boolean) as string[]),
      ...((state.queue || []).map(t => t?.id).filter(Boolean) as string[]),
      ...(disliked || []),
    ]);

    // ── Try radio endpoint when we have a current SC track ──
    if (cur?.scTrackId && cur.scTrackId > 0) {
      try {
        const params = new URLSearchParams();
        params.set("scTrackId", String(cur.scTrackId));
        // Honest seed context — real data from the CURRENT track.
        if (cur.artist) params.set("seedArtist", cur.artist);
        if (cur.genre) params.set("seedGenre", cur.genre);

        // History SC IDs (prevent repeats)
        const playedScIds = [
          ...state.history.map(h => h.track?.scTrackId).filter((id): id is number => !!id),
          ...state.queue.map(t => t?.scTrackId).filter((id): id is number => !!id),
        ];
        const uniquePlayed = [...new Set(playedScIds)].slice(0, 80).join(",");
        if (uniquePlayed) params.set("historyScIds", uniquePlayed);

        // Heavy-rotation fatigue signal: artists played >=2 times in the last
        // 15 history entries, EXCLUDING liked artists (favorites stay strong).
        const likedArtistSet = new Set(
          (state.likedTracksData || []).map((t: any) => (t?.artist || "").toLowerCase().trim()).filter(Boolean)
        );
        const artistPlays = new Map<string, number>();
        for (const h of (state.history || []).slice(0, 15)) {
          const a = (h.track?.artist || "").toLowerCase().trim();
          if (!a) continue;
          artistPlays.set(a, (artistPlays.get(a) || 0) + 1);
        }
        const fatigue = [...artistPlays.entries()]
          .filter(([a, n]) => n >= 2 && !likedArtistSet.has(a))
          .map(([a]) => a)
          .slice(0, 12);
        if (fatigue.length > 0) params.set("recentArtists", fatigue.join(","));

        // Skipped/disliked artists
        const dislikedArtists = (state.dislikedTracksData || [])
          .map(t => t.artist).filter(Boolean).slice(0, 10);
        if (dislikedArtists.length > 0) params.set("skippedArtists", dislikedArtists.join(","));

        // Liked artists (positive signal)
        const likedArtists = (state.likedTracksData || [])
          .map(t => t.artist).filter(Boolean).slice(0, 5);
        if (likedArtists.length > 0) params.set("likedArtists", likedArtists.join(","));

        // Liked genres
        const likedGenres = (state.likedTracksData || [])
          .map(t => t.genre).filter(Boolean).slice(0, 5);
        if (likedGenres.length > 0) params.set("likedGenres", likedGenres.join(","));

        // Disliked SC IDs
        const dislikedScIds = (state.dislikedTracksData || [])
          .map(t => t.scTrackId).filter((id): id is number => !!id).slice(0, 50);
        if (dislikedScIds.length > 0) params.set("dislikedScIds", dislikedScIds.join(","));

        // Language preference
        const langCounts: Record<string, number> = { russian: 0, english: 0 };
        for (const h of (state.history || []).slice(0, 20)) {
          const text = `${h.track?.title || ""} ${h.track?.artist || ""}`;
          const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
          const latin = (text.match(/[a-zA-Z]/g) || []).length;
          if (cyrillic / (cyrillic + latin + 1) > 0.4) langCounts.russian++;
          else if (latin / (cyrillic + latin + 1) > 0.6) langCounts.english++;
        }
        const topLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
        if (topLang[0]?.[1] > 5) params.set("lang", topLang[0][0]);

        const res = await fetch(`/api/music/radio?${params}`);
        if (res.ok) {
          const data = await res.json();
          let tracks: Track[] = (data.tracks || []).filter(
            (t: Track) => !disliked.includes(t.id) && !excludeSet.has(t.id),
          );
          // Client-side artist diversity: max 1 per artist
          const artistCount = new Map<string, number>();
          tracks = tracks.filter(t => {
            const a = (t.artist || "").toLowerCase().trim();
            if (!a) return true;
            const c = artistCount.get(a) || 0;
            if (c >= 1) return false;
            artistCount.set(a, c + 1);
            return true;
          });
          if (tracks.length > 0) return tracks.slice(0, count);
        }
      } catch {
        // Fall through to recommendations
      }
    }

    // ── Fallback: recommendations based on taste profile ──
    const recParams = new URLSearchParams();
    if (tp.topGenres.length > 0) recParams.set("genres", tp.topGenres.join(","));
    const favArtists = (useAppStore.getState().favoriteArtists || []).map(a => a.username);
    const allArtists = [...new Set([...favArtists, ...tp.topArtists])];
    if (allArtists.length > 0) recParams.set("artists", allArtists.slice(0, 5).join(","));
    if (disliked.length > 0) recParams.set("dislikedIds", disliked.join(","));
    recParams.set("wave", "1");
    recParams.set("count", String(count));
    const likedScIds = (useAppStore.getState().likedTracksData || [])
      .map((t: any) => t.scTrackId).filter((id: any): id is number => !!id).slice(0, 5).join(",");
    if (likedScIds) recParams.set("likedScIds", likedScIds);
    const historyScIds = (useAppStore.getState().history || []).slice(0, 10)
      .map((h: any) => h.track?.scTrackId).filter((id: any): id is number => !!id).join(",");
    if (historyScIds) recParams.set("historyScIds", historyScIds);
    const excludeArr = [...excludeSet];
    if (excludeArr.length > 0) recParams.set("excludeIds", excludeArr.join(","));

    try {
      const res = await fetch(`/api/music/recommendations?${recParams}`);
      if (res.ok) {
        const data = await res.json();
        return (data.tracks || []).filter(
          (t: Track) => !disliked.includes(t.id) && !excludeSet.has(t.id),
        ).slice(0, count);
      }
    } catch {}

    return [];
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

  // ── Deduplicated fetch wrapper ──
  // If a fetch is already in-flight, returns the same promise instead of
  // starting a parallel request. Used by auto-refill effect (which re-runs
  // on every queue/queueIndex/currentTrack change) and skipTrack.
  const fetchWaveTracksDedup = useCallback(async (count: number = 20): Promise<Track[]> => {
    if (inflightRef.current) return inflightRef.current;
    const p = fetchWaveTracks(count).finally(() => {
      inflightRef.current = null;
    });
    inflightRef.current = p;
    return p;
  }, [fetchWaveTracks]);

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

  // ── Start Wave FROM current track ──
  // Unlike startWave() which always builds a fresh queue from the taste profile,
  // this keeps the currently playing track AS the seed and only fetches
  // subsequent tracks via /api/music/radio?scTrackId=<cur>. This lets the user
  // turn ANY track into a radio seed without losing their place.
  // Used by PlayerBar's "Радио от трека" button.
  const startWaveFromCurrentTrack = useCallback(async () => {
    const cur = useAppStore.getState().currentTrack;
    if (!cur) {
      // No current track — fall back to regular start
      return startWave();
    }
    if (waveLoading) return;
    setWaveLoading(true);
    setWaveError(null);

    try {
      // Fetch tracks seeded by current track.
      // fetchWaveTracks internally tries /api/music/radio?scTrackId=<cur> first,
      // and falls back to /api/music/recommendations?wave=1 if radio fails
      // or returns too few tracks (merging the partial radio result with recs).
      const tracks = await fetchWaveTracks(15);
      const shuffled = shuffle(tracks).filter(t => t.id !== cur.id);

      if (shuffled.length === 0) {
        // No tracks found from radio OR recommendations — show error,
        // don't touch the queue (user keeps their current playback).
        setWaveError("Не удалось подобрать похожие треки. Попробуйте позже.");
        return;
      }

      // Use setState DIRECTLY (not playTrack) — playTrack resets progress to 0
      // and is also blocked by _playLock when called with the same track id.
      // We want to PRESERVE the current playback position and only update the
      // queue so the next track after `cur` is the first radio-fetched track.
      const state = useAppStore.getState();
      const currentQueue = Array.isArray(state.queue) ? state.queue : [];
      const currentIdx = typeof state.queueIndex === "number" ? state.queueIndex : 0;
      const curInQueue = currentIdx >= 0 && currentQueue[currentIdx]?.id === cur.id;

      let newQueue: Track[];
      let newQueueIndex: number;
      if (curInQueue) {
        // Common case: cur is the current track in the queue. Keep everything
        // up to and including cur (so "previous" navigation still works),
        // then append radio tracks. Drop future tracks — user is switching modes.
        newQueue = [...currentQueue.slice(0, currentIdx + 1), ...shuffled];
        newQueueIndex = currentIdx;
      } else {
        // Edge case: cur is playing but not in the queue (e.g., queue was
        // cleared or replaced). Put cur at the front, then radio tracks.
        newQueue = [cur, ...shuffled];
        newQueueIndex = 0;
      }

      useAppStore.setState({
        radioMode: true,
        radioSeedTrack: cur,
        radioSkipCount: 0,
        queue: newQueue,
        queueIndex: newQueueIndex,
        upNext: [], // clear upNext — radio takes over
        // currentTrack / progress / duration / isPlaying left untouched
      });
    } catch {
      setWaveError("Не удалось запустить радио от трека");
    } finally {
      setWaveLoading(false);
    }
  }, [waveLoading, fetchWaveTracks, shuffle, startWave]);

  // ── Pause/Resume (doesn't stop wave, just pauses playback) ──
  const pauseWave = useCallback(() => {
    useAppStore.getState().togglePlay();
  }, []);

  // ── Skip current track ──
  const skipTrack = useCallback(async () => {
    if (currentTrack) {
      recordSkip(currentTrack.id);
    }

    const state = useAppStore.getState();
    const remainingInQueue = state.queue.length - state.queueIndex - 1;

    // If queue has more tracks ahead, just call nextTrack — it will
    // advance queueIndex by 1 and play the next track.
    if (remainingInQueue > 0) {
      nextTrack();
      return;
    }

    // Queue is empty (no tracks ahead). Fetch new radio tracks and
    // append to queue, THEN call nextTrack to advance to the first
    // new track. Previously this called nextTrack() even when fetch
    // failed/returned 0 — which triggered the store's radio refill
    // block (nextIdx = 0 bug) causing "skip goes in circles".
    setWaveLoading(true);
    try {
      const newTracks = await fetchWaveTracksDedup(15);
      if (newTracks.length > 0) {
        const shuffled = shuffle(newTracks);
        // Dedup against current queue
        const currentState = useAppStore.getState();
        const currentQueue = Array.isArray(currentState.queue) ? currentState.queue : [];
        const existingIds = new Set(currentQueue.map(t => t.id));
        const filtered = shuffled.filter(t => !existingIds.has(t.id));
        if (filtered.length > 0) {
          const updatedQueue = [...currentQueue, ...filtered];
          useAppStore.setState({ queue: updatedQueue });
          // Now nextTrack will find a track at queueIndex + 1
          nextTrack();
        } else {
          // All fetched tracks were duplicates — try one more time with
          // a different seed (or just stop). For now, stop playback.
          setWaveError("Не удалось найти новые треки. Попробуйте позже.");
        }
      } else {
        // No new tracks from radio — show error, don't loop
        setWaveError("Не удалось загрузить следующие треки.");
      }
    } catch {
      setWaveError("Ошибка загрузки следующих треков.");
    } finally {
      setWaveLoading(false);
    }
  }, [currentTrack, recordSkip, nextTrack, fetchWaveTracksDedup, shuffle]);

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
  // Preemptive refill: trigger when 5 or fewer tracks remaining (was 2).
  // This ensures the wave NEVER runs out of tracks — by the time the user
  // reaches the end of the current batch, the next batch is already loaded.
  // Combined with the inflight dedup guard, this creates a truly infinite
  // stream without parallel-fetch races.
  useEffect(() => {
    if (!radioMode) return;
    if (!currentTrack) return;

    const remaining = queue.length - queueIndex - 1;
    // Preemptive refill threshold — 5 tracks ahead
    if (remaining <= 5) {
      const now = Date.now();
      // Throttle: don't fetch more than once per 8 seconds (was 10 —
      // lowered to keep up with faster skip rates)
      if (now - lastFetchRef.current < 8000) return;
      lastFetchRef.current = now;

      // Deduplicated fetch — if skipTrack already started a fetch, this
      // returns the same promise instead of starting a parallel one
      fetchWaveTracksDedup(15).then(newTracks => {
        if (newTracks.length > 0) {
          const shuffled = shuffle(newTracks);
          const state = useAppStore.getState();
          // Avoid duplicates against current queue
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
  }, [radioMode, currentTrack, queue, queueIndex, fetchWaveTracksDedup, shuffle]);

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
    startWaveFromCurrentTrack,
    stopWave,
    pauseWave,
    skipTrack,
    dislikeTrack,
    likeTrack,
  };
}
