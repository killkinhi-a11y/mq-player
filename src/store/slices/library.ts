// Store slice: Likes/dislikes, playlists (own + public), favorite artists, history, broken tracks.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE.md.
import { MAX_HISTORY_ENTRIES } from "@/store/internal/helpers";
import type { StoreSlice, UserPlaylist } from "@/store/types";
import { appendSkipEvent, buildSkipEvent, buildSkipProfile } from "@/lib/listening/skipIntelligence";

export type LibrarySliceKeys =
  | "toggleLike"
  | "toggleDislike"
  | "isTrackLiked"
  | "isTrackDisliked"
  | "markTrackBroken"
  | "clearBrokenTracks"
  | "createPlaylist"
  | "deletePlaylist"
  | "renamePlaylist"
  | "addToPlaylist"
  | "removeFromPlaylist"
  | "publishPlaylist"
  | "unpublishPlaylist"
  | "togglePlaylistLike"
  | "fetchPublicPlaylists"
  | "addDislikedTags"
  | "removeDislikedTag"
  | "setFavoriteArtists"
  | "addFavoriteArtist"
  | "removeFavoriteArtist"
  | "saveFavoriteArtistsToServer"
  | "loadFavoriteArtistsFromServer"
  | "addToHistory"
  | "clearHistory";

/** Likes/dislikes, playlists (own + public), favorite artists, history, broken tracks. */
export const createLibrarySlice: StoreSlice<LibrarySliceKeys> = (set, get) => ({

      toggleLike: (trackId, trackData) => {
        const { likedTrackIds, dislikedTrackIds, likedTracksData, currentTrack } = get();
        const wasLiked = likedTrackIds.includes(trackId);
        if (wasLiked) {
          set({
            likedTrackIds: likedTrackIds.filter((id) => id !== trackId),
            likedTracksData: likedTracksData.filter((t) => t.id !== trackId),
          });
        } else {
          set({
            likedTrackIds: [...likedTrackIds, trackId],
            dislikedTrackIds: dislikedTrackIds.filter((id) => id !== trackId),
            likedTracksData: trackData
              ? [...likedTracksData.filter((t) => t.id !== trackId), trackData]
              : likedTracksData,
          });
        }
        // V3 §25: favorite = very strong positive / unfavorite = negative —
        // recorded for ALL plays (not just wave sessions).
        if (currentTrack?.id === trackId) {
          try { get().recordListeningEvent(wasLiked ? "unfavorite" : "favorite"); } catch {}
        } else if (trackData) {
          try {
            const event = buildSkipEvent({ track: trackData, playedSeconds: 0, duration: trackData.duration || 0, kind: wasLiked ? "unfavorite" : "favorite" });
            const events = appendSkipEvent(event);
            set({ listeningEvents: events, skipProfile: buildSkipProfile(events) });
          } catch {}
        }
        // Debounced sync to server
        get().scheduleSyncToServer();
      },

      toggleDislike: (trackId, trackData) => {
        const { dislikedTrackIds, dislikedTracksData, likedTrackIds, likedTracksData, currentTrack } = get();
        if (dislikedTrackIds.includes(trackId)) {
          // Un-dislike: remove from both lists
          set({
            dislikedTrackIds: dislikedTrackIds.filter((id) => id !== trackId),
            dislikedTracksData: dislikedTracksData.filter((t) => t.id !== trackId),
          });
        } else {
          // Dislike: add to disliked, remove from liked
          set({
            dislikedTrackIds: [...dislikedTrackIds, trackId],
            dislikedTracksData: trackData
              ? [...dislikedTracksData.filter((t) => t.id !== trackId), trackData]
              : dislikedTracksData,
            likedTrackIds: likedTrackIds.filter((id) => id !== trackId),
            likedTracksData: likedTracksData.filter((t) => t.id !== trackId),
          });
          // Skip to next track if the disliked track is currently playing
          if (currentTrack && currentTrack.id === trackId) {
            get().nextTrack();
          }
        }
        // Debounced sync to server
        get().scheduleSyncToServer();
      },

      isTrackLiked: (trackId) => get().likedTrackIds.includes(trackId),

      isTrackDisliked: (trackId) => get().dislikedTrackIds.includes(trackId),

      markTrackBroken: (trackId) =>
        set((s) => {
          const newSet = new Set(s.brokenTrackIds);
          newSet.add(trackId);
          return { brokenTrackIds: newSet };
        }),

      clearBrokenTracks: () => set({ brokenTrackIds: new Set<string>() }),

      // ── Playlist actions ──
      createPlaylist: (name, description = "") => {
        const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newPlaylist: UserPlaylist = {
          id,
          name,
          description,
          cover: "",
          tracks: [],
          createdAt: Date.now(),
        };
        set((s) => ({ playlists: [...(Array.isArray(s.playlists) ? s.playlists : []), newPlaylist] }));
      },

      deletePlaylist: (playlistId) => {
        set((s) => ({
          playlists: (Array.isArray(s.playlists) ? s.playlists : []).filter((p) => p.id !== playlistId),
          selectedPlaylistId: s.selectedPlaylistId === playlistId ? null : s.selectedPlaylistId,
        }));
      },

      renamePlaylist: (playlistId, name) => {
        set((s) => ({
          playlists: (Array.isArray(s.playlists) ? s.playlists : []).map((p) =>
            p.id === playlistId ? { ...p, name } : p
          ),
        }));
      },

      addToPlaylist: (playlistId, track) => {
        set((s) => ({
          playlists: (Array.isArray(s.playlists) ? s.playlists : []).map((p) => {
            if (p.id !== playlistId) return p;
            if (p.tracks.some((t) => t.id === track.id)) return p;
            const updatedTracks = [...p.tracks, track];
            return {
              ...p,
              tracks: updatedTracks,
              cover: track.cover || p.cover,
            };
          }),
        }));
      },

      removeFromPlaylist: (playlistId, trackId) => {
        set((s) => ({
          playlists: (Array.isArray(s.playlists) ? s.playlists : []).map((p) => {
            if (p.id !== playlistId) return p;
            return {
              ...p,
              tracks: p.tracks.filter((t) => t.id !== trackId),
            };
          }),
        }));
      },

      // ── Public playlist actions ──
      publishPlaylist: async (playlistId, tags = []) => {
        const { playlists, userId } = get();
        const playlist = playlists.find((p) => p.id === playlistId);
        if (!playlist || !userId) return false;
        try {
          const res = await fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: playlist.name,
              description: playlist.description,
              cover: playlist.cover,
              isPublic: true,
              tags,
              tracks: playlist.tracks,
            }),
          });
          return res.ok;
        } catch { return false; }
      },

      unpublishPlaylist: async (playlistId) => {
        const { userId } = get();
        if (!userId) return false;
        try {
          const res = await fetch('/api/playlists', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: playlistId, isPublic: false }),
          });
          if (res.ok) {
            set((s) => ({ publicPlaylists: s.publicPlaylists.filter((p) => p.id !== playlistId) }));
          }
          return res.ok;
        } catch { return false; }
      },

      togglePlaylistLike: async (playlistId) => {
        const { userId } = get();
        if (!userId) return false;
        try {
          const res = await fetch('/api/playlists/like', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistId }),
          });
          const data = await res.json();
          if (res.ok) {
            set((s) => ({
              publicPlaylists: s.publicPlaylists.map((p) =>
                p.id === playlistId ? { ...p, isLiked: data.liked, likeCount: data.liked ? p.likeCount + 1 : p.likeCount - 1 } : p
              ),
              recommendedPlaylists: s.recommendedPlaylists.map((p) =>
                p.id === playlistId ? { ...p, isLiked: data.liked, likeCount: data.liked ? p.likeCount + 1 : p.likeCount - 1 } : p
              ),
            }));
          }
          return data.liked;
        } catch { return false; }
      },

      fetchPublicPlaylists: async (params = {}) => {
        const { userId } = get();
        set({ publicPlaylistsLoading: true });
        try {
          const sp = new URLSearchParams();
          if (params.search) sp.set('search', params.search);
          if (params.sort) sp.set('sort', params.sort);
          if (params.page) sp.set('page', String(params.page));
          sp.set('limit', '20');
          const res = await fetch(`/api/playlists?${sp}`);
          if (res.ok) {
            const data = await res.json();
            set({
              publicPlaylists: data.playlists || [],
              publicPlaylistsTotal: data.total || 0,
              publicPlaylistsLoading: false,
            });
          } else {
            set({ publicPlaylistsLoading: false });
          }
        } catch {
          set({ publicPlaylistsLoading: false });
        }
      },

      addDislikedTags: (tags) => {
        set((s) => ({
          dislikedTags: [...new Set([...s.dislikedTags, ...tags.map(t => t.toLowerCase().trim())])],
        }));
      },

      removeDislikedTag: (tag) => {
        set((s) => ({
          dislikedTags: s.dislikedTags.filter(t => t !== tag.toLowerCase().trim()),
        }));
      },

      // ── Favorite artists ──
      setFavoriteArtists: (artists) => set({ favoriteArtists: artists }),
      addFavoriteArtist: (artist) => {
        set((s) => {
          const favs = Array.isArray(s.favoriteArtists) ? s.favoriteArtists : [];
          if (favs.some(a => a.id === artist.id)) return s;
          return { favoriteArtists: [...favs, artist] };
        });
        get().saveFavoriteArtistsToServer();
      },

      removeFavoriteArtist: (artistId) => {
        set((s) => ({
          favoriteArtists: (Array.isArray(s.favoriteArtists) ? s.favoriteArtists : []).filter(a => a.id !== artistId),
        }));
        get().saveFavoriteArtistsToServer();
      },
      saveFavoriteArtistsToServer: async (opts) => {
        const { userId, favoriteArtists } = get();
        if (!userId) return;
        try {
          await fetch('/api/user/favorite-artists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artists: favoriteArtists,
              // Task 6: persist onboarding completion SERVER-side too — a
              // fresh device must not re-show the wizard for a finished user.
              ...(opts?.completeOnboarding ? { completeOnboarding: true } : {}),
            }),
          });
        } catch (e) { console.warn("[store]", e); }
      },
      loadFavoriteArtistsFromServer: async () => {
        const { userId } = get();
        if (!userId) return;
        try {
          const res = await fetch('/api/user/favorite-artists');
          if (!res.ok) return;
          const data = await res.json();
          if (Array.isArray(data.artists)) {
            set({ favoriteArtists: data.artists });
          }
          if (typeof data.onboardingComplete === 'boolean') {
            set({ onboardingComplete: data.onboardingComplete });
          }
        } catch (e) { console.warn("[store]", e); }
      },

      // ── History actions ──
      addToHistory: (track) => {
        set((s) => {
          const hist = Array.isArray(s.history) ? s.history : [];
          const existing = hist.find((h) => h.track.id === track.id);
          if (existing) {
            const filtered = hist.filter((h) => h.track.id !== track.id);
            return {
              history: [{ track, playedAt: Date.now(), playCount: (existing.playCount || 0) + 1 }, ...filtered].slice(0, MAX_HISTORY_ENTRIES),
            };
          }
          return {
            history: [{ track, playedAt: Date.now(), playCount: 1 }, ...hist].slice(0, MAX_HISTORY_ENTRIES),
          };
        });
        // Debounced sync to server
        get().scheduleSyncToServer();
      },

      clearHistory: () => set({ history: [] }),
});

