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

  // ── Fetch tracks from recommendations API ──
  // For INITIAL start (no current track yet): uses /api/music/recommendations?wave=1
  //   which is based on the user's full taste profile (liked/history/genres).
  // For REFILL / SKIP (current track playing): uses /api/music/radio?scTrackId=<cur>
  //   which is seeded by the CURRENTLY PLAYING track — far more relevant for
  //   continuous radio. Falls back to recommendations if radio fails or no scTrackId.
  const fetchWaveTracks = useCallback(async (count: number = 20): Promise<Track[]> => {
    const tp = tasteProfile.current;
    const disliked = useAppStore.getState().dislikedTrackIds || [];
    const state = useAppStore.getState();
    const cur = state.currentTrack;

    // Client-side dedup set — used by BOTH radio and recommendations paths
    const excludeSet = new Set<string>([
      ...((state.history || []).slice(0, 50).map(h => h.track?.id).filter(Boolean) as string[]),
      ...((state.queue || []).map(t => t?.id).filter(Boolean) as string[]),
    ]);

    // ── Helper: fetch from /api/music/recommendations + trending + charts ──
    // Used as a fallback when radio doesn't return enough tracks, OR as the
    // primary source on initial wave start (no current track).
    const fetchRecsFallback = async (needed: number): Promise<Track[]> => {
      const params = new URLSearchParams();
      if (tp.topGenres.length > 0) params.set("genres", tp.topGenres.join(","));
      const favArtists = (useAppStore.getState().favoriteArtists || []).map(a => a.username);
      const allArtists = [...new Set([...favArtists, ...tp.topArtists])];
      if (allArtists.length > 0) params.set("artists", allArtists.slice(0, 5).join(","));
      if (disliked.length > 0) params.set("dislikedIds", disliked.join(","));
      params.set("wave", "1");
      params.set("count", String(needed));

      const likedScIds = (useAppStore.getState().likedTracksData || [])
        .map((t: any) => t.scTrackId).filter((id: any): id is number => !!id).slice(0, 5).join(",");
      if (likedScIds) params.set("likedScIds", likedScIds);

      const historyScIds = (useAppStore.getState().history || []).slice(0, 10)
        .map((h: any) => h.track?.scTrackId).filter((id: any): id is number => !!id).join(",");
      if (historyScIds) params.set("historyScIds", historyScIds);

      const excludeArr = [...excludeSet];
      if (excludeArr.length > 0) params.set("excludeIds", excludeArr.join(","));

      let result: Track[] = [];
      try {
        const res = await fetch(`/api/music/recommendations?${params}`);
        if (res.ok) {
          const data = await res.json();
          result = (data.tracks || []).filter(
            (t: Track) => !disliked.includes(t.id) && !excludeSet.has(t.id),
          );
        }
      } catch {
        // Network error — fall through to trending/charts
      }

      // Fill from trending if we don't have enough
      if (result.length < needed) {
        try {
          const trendingRes = await fetch(`/api/music/trending?limit=${needed - result.length}`);
          if (trendingRes.ok) {
            const tData = await trendingRes.json();
            const extra = (tData.tracks || [])
              .filter((t: Track) => !disliked.includes(t.id))
              .filter((t: Track) => !excludeSet.has(t.id))
              .filter((t: Track) => !result.some(existing => existing.id === t.id));
            result = [...result, ...extra];
          }
        } catch {}

        // Last resort: Apple Music Top + Spotify charts
        if (result.length < needed) {
          try {
            const userCountry = "RU";
            const [appleRes, spotifyRes] = await Promise.all([
              fetch(`/api/music/apple-charts?country=${userCountry}`).catch(() => null),
              fetch(`/api/music/spotify-charts?country=${userCountry}`).catch(() => null),
            ]);
            for (const r of [appleRes, spotifyRes]) {
              if (r && r.ok) {
                const aData = await r.json();
                const extra = (aData.tracks || [])
                  .filter((t: Track) => !disliked.includes(t.id))
                  .filter((t: Track) => !excludeSet.has(t.id))
                  .filter((t: Track) => !result.some(existing => existing.id === t.id))
                  .filter((t: Track) => t.scIsFull || t.scStreamPolicy === "ALLOW");
                result = [...result, ...extra];
              }
            }
          } catch {}
        }
      }

      return result;
    };

    // ── Try radio endpoint first when we have a current SC track ──
    // This is the key fix: refills use the currently playing track as a seed
    // (instead of a generic taste-profile query), so the Wave actually flows
    // from one track to related ones — like Yandex/Spotify radio.
    if (cur?.scTrackId && cur.scTrackId > 0) {
      try {
        const radioParams = new URLSearchParams();
        radioParams.set("scTrackId", String(cur.scTrackId));

        // Pass recent history (so radio doesn't repeat tracks)
        const playedScIds = [
          ...state.history.map(h => h.track?.scTrackId).filter((id): id is number => !!id),
          ...state.queue.map(t => t?.scTrackId).filter((id): id is number => !!id),
        ];
        const uniquePlayedScIds = [...new Set(playedScIds)].slice(0, 80).join(",");
        if (uniquePlayedScIds) radioParams.set("historyScIds", uniquePlayedScIds);

        // Skipped artists/genres from feedback + disliked
        const fb = state.trackFeedback || {};
        const skippedIds = Object.entries(fb)
          .filter(([, v]) => v && v.skips > v.completes && v.skips >= 2)
          .map(([id]) => id);
        const skippedArtists = skippedIds.map(id => {
          const entry = state.history.find(h => h.track.id === id);
          return entry?.track.artist;
        }).filter(Boolean).slice(0, 5) as string[];
        const dislikedArtistsFromLikes = (state.dislikedTracksData || [])
          .map(t => t.artist).filter(Boolean).slice(0, 10);
        const allSkippedArtists = [...new Set([...skippedArtists, ...dislikedArtistsFromLikes])];
        if (allSkippedArtists.length > 0) radioParams.set("skippedArtists", allSkippedArtists.join(","));

        const dislikedGenresFromLikes = (state.dislikedTracksData || [])
          .map(t => t.genre).filter(Boolean).slice(0, 5);
        const skippedGenres = state.feedbackBatch?.skippedGenres || [];
        const allSkippedGenres = [...new Set([...skippedGenres, ...dislikedGenresFromLikes])];
        if (allSkippedGenres.length > 0) radioParams.set("skippedGenres", allSkippedGenres.join(","));

        // Positive signals: liked artists/genres
        const likedArtistsFromLikes = (state.likedTracksData || [])
          .map(t => t.artist).filter(Boolean).slice(0, 5);
        if (likedArtistsFromLikes.length > 0) radioParams.set("likedArtists", likedArtistsFromLikes.join(","));

        const likedGenresFromLikes = (state.likedTracksData || [])
          .map(t => t.genre).filter(Boolean).slice(0, 5);
        const historyGenres = (state.history || []).slice(0, 30)
          .map(h => h.track?.genre).filter(Boolean) as string[];
        const genreCount: Record<string, number> = {};
        for (const g of historyGenres) genreCount[g] = (genreCount[g] || 0) + 1;
        const topHistoryGenres = Object.entries(genreCount)
          .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
        const allLikedGenres = [...new Set([...likedGenresFromLikes, ...topHistoryGenres])];
        if (allLikedGenres.length > 0) radioParams.set("likedGenres", allLikedGenres.join(","));

        // Taste profile (explicit user sliders)
        const tasteG = state.tasteGenres || {};
        const tasteGenreEntries = Object.entries(tasteG).filter(([, v]) => v >= 20);
        if (tasteGenreEntries.length > 0) {
          tasteGenreEntries.sort((a, b) => b[1] - a[1]);
          radioParams.set("tasteGenres", tasteGenreEntries.slice(0, 8).map(([g, v]) => `${g}:${v}`).join(","));
        }
        const tasteA = state.tasteArtists || {};
        const tasteArtistEntries = Object.entries(tasteA).filter(([, v]) => v >= 20);
        if (tasteArtistEntries.length > 0) {
          tasteArtistEntries.sort((a, b) => b[1] - a[1]);
          radioParams.set("tasteArtists", tasteArtistEntries.slice(0, 5).map(([a, v]) => `${a}:${v}`).join(","));
        }

        // Language preference from history
        const langCounts: Record<string, number> = { russian: 0, english: 0 };
        for (const h of (state.history || []).slice(0, 20)) {
          const text = `${h.track?.title || ""} ${h.track?.artist || ""}`;
          const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
          const latin = (text.match(/[a-zA-Z]/g) || []).length;
          if (cyrillic / (cyrillic + latin + 1) > 0.4) langCounts.russian++;
          else if (latin / (cyrillic + latin + 1) > 0.6) langCounts.english++;
        }
        const topLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
        if (topLang[0]?.[1] > 5) radioParams.set("lang", topLang[0][0]);

        // Session duration for mood adaptation
        if (state.sessionStartTime) {
          const sessionMinutes = Math.floor((Date.now() - state.sessionStartTime) / 60000);
          if (sessionMinutes > 0) radioParams.set("sessionDuration", String(sessionMinutes));
        }

        // Disliked SC IDs hard exclusion
        const dislikedScIds = (state.dislikedTracksData || [])
          .map(t => t.scTrackId).filter((id): id is number => !!id).slice(0, 50);
        if (dislikedScIds.length > 0) radioParams.set("dislikedScIds", dislikedScIds.join(","));

        // Completed genres (genres user actually finishes — strong positive signal)
        const completedGenres = state.feedbackBatch?.completedGenres || [];
        const completedFromFB: string[] = [];
        for (const [trackId, fbb] of Object.entries(fb)) {
          if (fbb && fbb.completes > fbb.skips && fbb.completes >= 1) {
            const he = state.history.find(h => h.track.id === trackId);
            if (he?.track?.genre) completedFromFB.push(he.track.genre.toLowerCase().trim());
          }
        }
        const allCompletedGenres = [...new Set([...completedGenres, ...completedFromFB])].slice(0, 5);
        if (allCompletedGenres.length > 0) radioParams.set("completedGenres", allCompletedGenres.join(","));

        const radioRes = await fetch(`/api/music/radio?${radioParams}`);
        if (radioRes.ok) {
          const radioData = await radioRes.json();
          const radioTracks: Track[] = (radioData.tracks || []).filter(
            (t: Track) => !disliked.includes(t.id) && !excludeSet.has(t.id),
          );

          if (radioTracks.length >= count) {
            // Enough tracks from radio — return them
            return radioTracks.slice(0, count);
          }

          if (radioTracks.length > 0) {
            // Radio returned SOME tracks but not enough — MERGE with
            // recommendations fallback instead of dropping the radio tracks.
            // Radio tracks are higher-relevance (seeded by current track),
            // so they go first; recs fill the rest.
            const fillNeeded = count - radioTracks.length;
            const recsTracks = await fetchRecsFallback(fillNeeded);
            // Dedup against radio tracks
            const radioIds = new Set(radioTracks.map(t => t.id));
            const uniqueRecs = recsTracks.filter(t => !radioIds.has(t.id));
            return [...radioTracks, ...uniqueRecs].slice(0, count);
          }
          // Radio returned 0 tracks — fall through to pure recommendations
        }
      } catch {
        // Silent — fall through to recommendations fallback
      }
    }

    // ── Fallback: generic recommendations based on taste profile ──
    // Used on initial wave start (no current track) or when radio endpoint fails.
    return fetchRecsFallback(count);
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

    // If queue has more tracks, just next
    const state = useAppStore.getState();
    const remainingInQueue = state.queue.length - state.queueIndex - 1;

    if (remainingInQueue > 0) {
      nextTrack();
      return;
    }

    // Queue running low — fetch more tracks (deduplicated to prevent
    // parallel fetches if auto-refill effect is also running)
    setWaveLoading(true);
    try {
      let newTracks = await fetchWaveTracksDedup(10);
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

      // Deduplicated fetch — if skipTrack already started a fetch, this
      // returns the same promise instead of starting a parallel one
      fetchWaveTracksDedup(10).then(newTracks => {
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
