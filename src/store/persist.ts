// Persistence contract for useAppStore: key, version, storage, partialize/migrate/merge.
// DO NOT change the output format without bumping STORE_VERSION + adding a migration.
import type { AppState } from "@/store/types";
import { MAX_HISTORY_ENTRIES } from "@/store/internal/helpers";
import type { PersistOptions, StateStorage } from "zustand/middleware";
import type { Track } from "@/lib/musicApi";
import { initialState } from "@/store/initialState";
import { persistWindow, restoreIndex } from "@/lib/core/queue";

// ── Storage versioning ──
// Bump this number to force a fresh store for all users with old data.
// v10: bumped to force migration that resets radioMode (was persisting
// "wave always active" bug from v8/v9 localStorage).
// v11: persist username/email/avatar for instant display on reload
// v12: wasmEngineEnabled reset to false — the WASM engine is now
// opt-in (default-ON shipped audible crackle to every user; persisted
// "true" was almost never an explicit choice, so migration clears it).
export const STORE_VERSION = 12;

export const STORAGE_KEY = "mq-store-v8";

// Nuke stale data BEFORE Zustand tries to hydrate.
// This runs at module-import time, so there is no React error boundary to catch failures.
if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const storedVersion = parsed?.version ?? 0;
      if (storedVersion < STORE_VERSION) {
        // Migration is handled by the persist migrate function
        // Do NOT clear localStorage here — it causes data loss on version updates
        console.warn(`[MQ Store] version ${storedVersion} < ${STORE_VERSION} – will migrate via persist`);
      }
    }
  } catch {
    console.warn("[MQ Store] corrupt localStorage – clearing");
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { console.warn("[store]", e); }
  }
}

// ── Storage adapter with quota management ──
export function createQuotaManagedStorage(): StateStorage {
  const MAX_HISTORY = MAX_HISTORY_ENTRIES;
  const MAX_LIKED_TRACKS = 100;
  const MAX_DISLIKED_TRACKS = 50;
  const MAX_MESSAGES = 500;
  const MAX_PLAYLIST_TRACKS = 200;

  return {
    getItem: (name: string) => {
      try {
        const str = localStorage.getItem(name);
        return str;
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: string) => {
      try {
        // Before saving, trim the data to prevent overflow
        const parsed = JSON.parse(value);
        const state = parsed?.state;

        if (state) {
          // Trim history
          if (state.history && state.history.length > MAX_HISTORY) {
            state.history = state.history.slice(-MAX_HISTORY);
          }
          // Trim liked tracks data
          if (state.likedTracksData && state.likedTracksData.length > MAX_LIKED_TRACKS) {
            state.likedTracksData = state.likedTracksData.slice(-MAX_LIKED_TRACKS);
            state.likedTrackIds = state.likedTrackIds.slice(-MAX_LIKED_TRACKS);
          }
          // Trim disliked tracks data
          if (state.dislikedTracksData && state.dislikedTracksData.length > MAX_DISLIKED_TRACKS) {
            state.dislikedTracksData = state.dislikedTracksData.slice(-MAX_DISLIKED_TRACKS);
            state.dislikedTrackIds = state.dislikedTrackIds.slice(-MAX_DISLIKED_TRACKS);
          }
          // Trim messages
          if (state.messages && state.messages.length > MAX_MESSAGES) {
            state.messages = state.messages.slice(-MAX_MESSAGES);
          }
          // Trim playlist tracks
          if (state.playlists && Array.isArray(state.playlists)) {
            for (const pl of state.playlists) {
              if (pl.tracks && pl.tracks.length > MAX_PLAYLIST_TRACKS) {
                pl.tracks = pl.tracks.slice(-MAX_PLAYLIST_TRACKS);
              }
            }
          }
          // Trim track feedback (keep last 100 entries)
          if (state.trackFeedback && Object.keys(state.trackFeedback).length > 100) {
            const keys = Object.keys(state.trackFeedback);
            const toRemove = keys.slice(0, keys.length - 100);
            for (const k of toRemove) delete state.trackFeedback[k];
          }
          parsed.state = state;
        }

        const serialized = JSON.stringify(parsed);

        // Check if data exceeds 4MB (leave 1MB for other localStorage usage)
        const sizeInBytes = new Blob([serialized]).size;
        const MAX_SIZE = 4 * 1024 * 1024; // 4MB
        if (sizeInBytes > MAX_SIZE) {
          console.warn(`[MQ Store] localStorage quota risk: ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB — aggressive trimming`);
          // More aggressive trimming
          if (state) {
            state.history = state.history?.slice(-50) || [];
            state.likedTracksData = state.likedTracksData?.slice(-30) || [];
            state.dislikedTracksData = state.dislikedTracksData?.slice(-20) || [];
            state.messages = state.messages?.slice(-100) || [];
            state.trackFeedback = {};
            state.similarTracks = [];
            state.releaseRadarTracks = [];
            state.publicPlaylists = [];
            state.recommendedPlaylists = [];
            parsed.state = state;
          }
          localStorage.setItem(name, JSON.stringify(parsed));
          return;
        }

        localStorage.setItem(name, serialized);
      } catch (e) {
        console.error("[MQ Store] localStorage write failed:", e);
        // If quota exceeded, clear and retry with minimal state
        try {
          localStorage.removeItem(name);
        } catch (e) { console.warn("[store]", e); }
      }
    },
    removeItem: (name: string) => {
      try {
        localStorage.removeItem(name);
      } catch (e) { console.warn("[store]", e); }
    },
  };
}

type Opts = PersistOptions<AppState, unknown>;

/** Strips heavy fields before writing to localStorage (format unchanged). */
function persistedQueue(
  queue: unknown,
  queueIndex: number | undefined,
  currentId: string | null,
  slim: (t: Track) => Track,
): { queue: Track[]; queueIndex: number } {
  const list = Array.isArray(queue) ? (queue as Track[]) : [];
  const idx = restoreIndex(list.map((t) => t.id), queueIndex ?? 0, currentId);
  const win = persistWindow(list, idx);
  return { queue: win.queue.map(slim), queueIndex: win.index };
}

export const partializeState: NonNullable<Opts["partialize"]> = (state) => {
        // ── Strip heavy fields from Track objects for persistence ──
        // Only keep fields needed for display and playback — reduces localStorage size by ~60%
        const slimTrack = (t: Track) => ({
          id: t.id, title: t.title, artist: t.artist, album: t.album,
          duration: t.duration, cover: t.cover, genre: t.genre,
          source: t.source, scTrackId: t.scTrackId, scStreamPolicy: t.scStreamPolicy,
          scIsFull: t.scIsFull, audioUrl: t.audioUrl, previewUrl: t.previewUrl,
          // Import source attribution (yandex public import) — tiny, but the
          // contract requires it to SURVIVE persistence, not just live in RAM.
          ...(t._src ? { _src: t._src, _srcTrackId: t._srcTrackId, _srcAlbumId: t._srcAlbumId, _srcPlaylistKind: t._srcPlaylistKind } : {}),
          // Catalog identity (free-mode): keeps the honest «Каталог → Звук»
          // attribution alive after reload, and lets the engine re-resolve
          // a persisted catalog track through the PlaybackResolver.
          catalogProvider: t.catalogProvider,
          catalogId: t.catalogId,
          playbackProvider: t.playbackProvider,
          playbackId: t.playbackId,
          versionTag: t.versionTag,
        } as Track);

        // ── Size caps to prevent localStorage overflow (~5MB limit) ──
        const MAX_HISTORY = MAX_HISTORY_ENTRIES;
        const MAX_LIKED = 100;
        const MAX_DISLIKED = 50;
        const MAX_PLAYLIST_TRACKS = 200;
        const MAX_FEEDBACK_ENTRIES = 100;
        const MAX_MESSAGES = 300;

        // Prune trackFeedback: keep only last N entries by lastPlayedAt
        const feedbackEntries = Object.entries(state.trackFeedback);
        const prunedFeedback = feedbackEntries.length > MAX_FEEDBACK_ENTRIES
          ? Object.fromEntries(
              feedbackEntries
                .sort((a, b) => b[1].lastPlayedAt - a[1].lastPlayedAt)
                .slice(0, MAX_FEEDBACK_ENTRIES)
            )
          : state.trackFeedback;

        // Destructure out transient state that should NOT be persisted
        // These are either real-time UI state or data that can be re-fetched
        const {
          isPlaying, progress, duration, isLoading, searchQuery,
          similarTracks, similarTracksLoading, showSimilarRequested, showLyricsRequested,
          releaseRadarTracks, releaseRadarLoading,
          publicPlaylistsLoading, recommendedPlaylistsLoading, publicPlaylistsTotal,
          isSyncing, syncError, supportUnreadCount,
          isFullTrackViewOpen, isEqOpen, notifPanelOpen, notificationCount,
          shareSheet,
          sleepTimerActive, sleepTimerRemaining, sleepTimerEndTime,
          miniPlayerHidden,
          playbackState, isBuffering, isDragging,
          // These are also excluded (already not in the whitelist below)
          selectedContactId, selectedGenre, typingUsers,
          selectedPlaylistId, selectedGroupId, selectedArtist,
          spatialAudioEnabled, spatialMood, spatialAutoDetect,
          radioMode, radioSeedTrack, radioSkipCount,
          smartShuffle, sessionStartTime,
          // V3 §24: skip events live in their OWN localStorage ring buffer
          // (mq:v3:listeningEvents) — persisting them here too would double
          // the storage; the profile is derived and recomputed on load.
          listeningEvents, skipProfile,
          listenSession, abRepeat,
          publicPlaylists, recommendedPlaylists,
          _authGeneration,
          _hasHydrated,
          ...persistent
        } = state;

        return {
          // Theme & UI preferences
          currentTheme: persistent.currentTheme,
          customAccent: persistent.customAccent,
          animationsEnabled: persistent.animationsEnabled,
          reduceMotion: persistent.reduceMotion,
          fullPlayerMode: persistent.fullPlayerMode === "spatial" ? "spatial" : "classic",
          spatialActionsPosition: persistent.spatialActionsPosition === "right" ? "right" : "left",
          // v11 Player extension — lyrics appearance + waveform (local-only)
          lyricsFontFamily: typeof persistent.lyricsFontFamily === "string" ? persistent.lyricsFontFamily : "",
          lyricsFontSize: typeof persistent.lyricsFontSize === "number" ? persistent.lyricsFontSize : 0,
          lyricsFontWeight: typeof persistent.lyricsFontWeight === "number" ? persistent.lyricsFontWeight : 0,
          lyricsLineHeight: typeof persistent.lyricsLineHeight === "number" ? persistent.lyricsLineHeight : 0,
          lyricsLetterSpacing: typeof persistent.lyricsLetterSpacing === "number" ? persistent.lyricsLetterSpacing : 0,
          lyricsAnimated: persistent.lyricsAnimated !== false,
          waveformEnabled: persistent.waveformEnabled !== false,
          compactMode: persistent.compactMode,
          fontSize: persistent.fontSize,
          liquidGlassEnabled: persistent.liquidGlassEnabled,
          liquidGlassMobile: persistent.liquidGlassMobile,
          currentStyle: persistent.currentStyle,
          styleVariant: persistent.styleVariant,
          volume: persistent.volume,
          shuffle: persistent.shuffle,
          repeat: persistent.repeat,
          playbackRate: persistent.playbackRate,
          // Playback state — persist so player bar shows last track after reload
          // (isPlaying is NOT persisted — user must press play to resume)
          currentTrack: persistent.currentTrack ? slimTrack(persistent.currentTrack) : null,
          // Queue window (shared rule, src/lib/core/queue.ts): ≤50 items that
          // always CONTAIN the current track, index rebased into the window.
          // Was `.slice(0, 50)` with an unbounded index → after reload with
          // queueIndex ≥ 50 the index pointed past the end and Next stopped.
          ...persistedQueue(persistent.queue, persistent.queueIndex, persistent.currentTrack?.id ?? null, slimTrack),
          upNext: (Array.isArray(persistent.upNext) ? persistent.upNext : []).slice(0, 10).map(slimTrack),
          currentPlaylistId: persistent.currentPlaylistId ?? null,
          // Audio settings — persist user preferences
          crossfadeEnabled: persistent.crossfadeEnabled,
          crossfadeDuration: persistent.crossfadeDuration,
          wasmEngineEnabled: persistent.wasmEngineEnabled,
          replayGainEnabled: persistent.replayGainEnabled,
          // Auth flag — persisted so rehydration can detect demo users
          isAuthenticated: persistent.isAuthenticated,
          // Persist userId so onRehydrateStorage can detect demo-user-id and clear it
          // Non-demo users get their data refreshed from /api/auth/me anyway
          userId: persistent.userId ?? null,
          // Persist username/email/avatar for instant display on page reload.
          // Previously NOT persisted for "security" — but these are just display
          // info, not secrets. JWT stays in httpOnly cookie. Not persisting them
          // caused "User" fallback to show for 1-2 seconds on every reload.
          username: persistent.username ?? null,
          email: persistent.email ?? null,
          avatar: persistent.avatar ?? null,
          userRole: persistent.userRole ?? "user",
          // Messenger
          messages: persistent.messages.length > MAX_MESSAGES ? persistent.messages.slice(-MAX_MESSAGES) : persistent.messages,
          unreadCounts: persistent.unreadCounts,
          contacts: persistent.contacts,
          currentView: persistent.currentView,
          // Likes/Dislikes (capped)
          likedTrackIds: persistent.likedTrackIds.slice(-MAX_LIKED),
          dislikedTrackIds: persistent.dislikedTrackIds.slice(-MAX_DISLIKED),
          dislikedTracksData: persistent.dislikedTracksData.slice(-MAX_DISLIKED).map(slimTrack),
          likedTracksData: persistent.likedTracksData.slice(-MAX_LIKED).map(slimTrack),
          dislikedTags: persistent.dislikedTags,
          favoriteArtists: persistent.favoriteArtists,
          onboardingComplete: persistent.onboardingComplete,
          // Playlists (track arrays capped)
          playlists: persistent.playlists.map(p => ({
            ...p,
            tracks: p.tracks.slice(-MAX_PLAYLIST_TRACKS).map(slimTrack),
          })),
          // History (capped)
          history: persistent.history.slice(-MAX_HISTORY).map(h => ({
            ...h,
            track: slimTrack(h.track),
          })),
          // Feedback data (pruned)
          trackFeedback: prunedFeedback,
          feedbackBatch: persistent.feedbackBatch,
          // Cat mascot settings
          catEnabled: persistent.catEnabled,
          catFrequency: persistent.catFrequency,
          catMood: persistent.catMood,
          catSize: persistent.catSize,
          catLastSeen: persistent.catLastSeen,
          catPetCount: persistent.catPetCount,
          // EQ
          eqEnabled: persistent.eqEnabled,
          eqBands: persistent.eqBands,
          eqPreset: persistent.eqPreset,
          // Limiter
          limiterEnabled: persistent.limiterEnabled,
          limiterThreshold: persistent.limiterThreshold,
          // Taste Profile
          tasteGenres: persistent.tasteGenres,
          tasteArtists: persistent.tasteArtists,
          tasteMoods: persistent.tasteMoods,
          excludedArtists: persistent.excludedArtists,
          // Cobalt SNIP bypass JWT (persisted so user doesn't need to re-solve Turnstile)
          _cobaltJwt: persistent._cobaltJwt,
          _cobaltJwtExpiry: persistent._cobaltJwtExpiry,
        };
      };

/** Versioned migration of persisted data (format unchanged). */
export const migrateState: NonNullable<Opts["migrate"]> = (persisted: unknown, version: number) => {
        console.warn(`[MQ Store] migrating from version ${version} to ${STORE_VERSION}`);
        if (version < STORE_VERSION) {
          // Preserve critical user preferences during migration
          const old = persisted as any;
          return {
            ...initialState,
            volume: old?.volume ?? initialState.volume,
            currentTheme: old?.currentTheme ?? initialState.currentTheme,
            customAccent: old?.customAccent ?? initialState.customAccent,
            animationsEnabled: old?.animationsEnabled ?? initialState.animationsEnabled,
            reduceMotion: old?.reduceMotion ?? initialState.reduceMotion,
            // v11 Player extension — preserved across version migrations
            lyricsFontFamily: old?.lyricsFontFamily ?? initialState.lyricsFontFamily,
            lyricsFontSize: old?.lyricsFontSize ?? initialState.lyricsFontSize,
            lyricsFontWeight: old?.lyricsFontWeight ?? initialState.lyricsFontWeight,
            lyricsLineHeight: old?.lyricsLineHeight ?? initialState.lyricsLineHeight,
            lyricsLetterSpacing: old?.lyricsLetterSpacing ?? initialState.lyricsLetterSpacing,
            lyricsAnimated: old?.lyricsAnimated ?? initialState.lyricsAnimated,
            waveformEnabled: old?.waveformEnabled ?? initialState.waveformEnabled,
            fullPlayerMode: old?.fullPlayerMode === "spatial" ? "spatial" : "classic",
            spatialActionsPosition: old?.spatialActionsPosition === "right" ? "right" : "left",
            compactMode: old?.compactMode ?? initialState.compactMode,
            fontSize: old?.fontSize ?? initialState.fontSize,
            liquidGlassEnabled: old?.liquidGlassEnabled ?? initialState.liquidGlassEnabled,
            liquidGlassMobile: old?.liquidGlassMobile ?? initialState.liquidGlassMobile,
            currentStyle: old?.currentStyle ?? initialState.currentStyle,
            styleVariant: old?.styleVariant ?? initialState.styleVariant,
            spatialAudioEnabled: old?.spatialAudioEnabled ?? initialState.spatialAudioEnabled,
            crossfadeEnabled: old?.crossfadeEnabled ?? initialState.crossfadeEnabled,
            crossfadeDuration: old?.crossfadeDuration ?? initialState.crossfadeDuration,
            gaplessEnabled: old?.gaplessEnabled ?? initialState.gaplessEnabled,
            // v12: NOT carried over — forced to the new default (false).
            // Default-ON WASM shipped audible crackle; persisted "true"
            // was a default, not a user choice. Opt back in via Settings.
            wasmEngineEnabled: false,
            replayGainEnabled: old?.replayGainEnabled ?? initialState.replayGainEnabled,
            eqEnabled: old?.eqEnabled ?? initialState.eqEnabled,
            eqBands: old?.eqBands ?? initialState.eqBands,
            eqPreset: old?.eqPreset ?? initialState.eqPreset,
            limiterEnabled: old?.limiterEnabled ?? initialState.limiterEnabled,
            limiterThreshold: old?.limiterThreshold ?? initialState.limiterThreshold,
            playbackRate: old?.playbackRate ?? initialState.playbackRate,
            // Preserve auth/user info during migration so username shows
            // instantly on reload (before /api/auth/me finishes)
            userId: old?.userId ?? null,
            username: old?.username ?? null,
            email: old?.email ?? null,
            avatar: old?.avatar ?? null,
            userRole: old?.userRole ?? "user",
            isAuthenticated: old?.isAuthenticated ?? false,
            // DO NOT migrate radioMode/radioSeedTrack/radioSkipCount — these
            // are session-only transient state. Migrating them caused the
            // "wave always active on page reload" bug. Always reset to
            // initialState (false/null/0) on migration.
            // smartShuffle is also transient — reset on migration.
            // aiRecsHidden: v9 forces true for migrating users
            aiRecsHidden: true,
          };
        }
        return { ...initialState };
      };

/** Merges persisted data over the fresh state on hydration. */
export const mergeState: NonNullable<Opts["merge"]> = (persisted, current) => {
        // If persisted is null/undefined (cleared by version check), use defaults
        if (!persisted) return current;
        const p = persisted as Record<string, unknown>;
        const merged = { ...current };
        // Transient fields that must NEVER be restored from persisted state
        // (even if old localStorage contains them). These are session-only
        // state that would cause bugs like "wave always active" if restored.
        const TRANSIENT_FIELDS = new Set([
          "radioMode", "radioSeedTrack", "radioSkipCount",
          "waveSession", "waveQueue", "waveMemory", "waveSessionEvents",
          "waveLoading", "waveError",
          "isPlaying", "isBuffering", "isDragging", "playbackState",
          "sessionStartTime", "smartShuffle", "abRepeat",
          "selectedContactId", "selectedGenre", "selectedPlaylistId",
          "selectedGroupId", "selectedArtist", "typingUsers",
          "_authGeneration", "_hasHydrated", "_playLock",
          "spatialAudioEnabled", "spatialMood", "spatialAutoDetect",
          "miniPlayerHidden", "isFullTrackViewOpen", "isEqOpen", "shareSheet",
          "publicPlaylistsLoading", "recommendedPlaylistsLoading",
          "publicPlaylistsPage", "publicPlaylistsTotal",
          "publicPlaylistsSearch", "publicPlaylistsSort",
        ]);
        // Only copy known state keys from persisted data
        for (const key of Object.keys(initialState)) {
          if (TRANSIENT_FIELDS.has(key)) continue;
          if (p[key] !== undefined) {
            (merged as Record<string, unknown>)[key] = p[key];
          }
        }
        // Repair states persisted before the queue-window fix (index past the
        // 50-item slice): point the index at the current track again.
        const mq = merged as unknown as { queue?: Track[]; queueIndex?: number; currentTrack?: Track | null };
        if (Array.isArray(mq.queue) && mq.queue.length > 0) {
          mq.queueIndex = restoreIndex(mq.queue.map((t) => t.id), mq.queueIndex ?? 0, mq.currentTrack?.id ?? null);
        }
        return merged;
      };

