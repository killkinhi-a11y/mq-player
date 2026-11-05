// Store slice: Server sync (to/from), cobalt JWT.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE_STORE.md.
import { MAX_HISTORY_ENTRIES } from "@/store/internal/helpers";
import type { StoreSlice } from "@/store/types";
import { canPollProtected } from "@/lib/authGate";

export type SyncSliceKeys =
  | "setCobaltJwt"
  | "getCobaltJwt"
  | "scheduleSyncToServer"
  | "syncToServer"
  | "syncFromServer";

/** Server sync (to/from), cobalt JWT. */
export const createSyncSlice: StoreSlice<SyncSliceKeys> = (set, get) => ({
      setCobaltJwt: (jwt, expiry) => set({ _cobaltJwt: jwt, _cobaltJwtExpiry: expiry }),
      getCobaltJwt: () => {
        const s = get();
        if (!s._cobaltJwt) return null;
        if (s._cobaltJwtExpiry && Date.now() > s._cobaltJwtExpiry) {
          set({ _cobaltJwt: null, _cobaltJwtExpiry: null });
          return null;
        }
        return s._cobaltJwt;
      },

      // ── Server sync actions ──
      scheduleSyncToServer: () => {
        // Debounced sync: wait 5 seconds after the last change, then sync once
        if (typeof window !== "undefined") {
          const w = window as Window & { _mqSyncTimer?: ReturnType<typeof setTimeout> };
          if (w._mqSyncTimer) clearTimeout(w._mqSyncTimer);
          w._mqSyncTimer = setTimeout(() => {
            get().syncToServer();
          }, 5000);
        }
      },

      syncToServer: async () => {
        const state = get();
        // Phase 2C: demo/unauthenticated sessions are local-only — server
        // sync would 401 (demo has no session cookie).
        if (!canPollProtected(state.userId, state.isAuthenticated)) return;
        if (!state.userId) return;
        set({ isSyncing: true, syncError: null });
        try {
          const payload = {
            data: {
              history: state.history,
              playlists: state.playlists,
              likedTracks: state.likedTrackIds,
              dislikedTracks: state.dislikedTrackIds,
              likedTracksData: state.likedTracksData,
              dislikedTracksData: state.dislikedTracksData,
              settings: {
                volume: state.volume,
                compactMode: state.compactMode,
                fontSize: state.fontSize,
                animationsEnabled: state.animationsEnabled,
                liquidGlassEnabled: state.liquidGlassEnabled,
                liquidGlassMobile: state.liquidGlassMobile,
                shuffle: state.shuffle,
                repeat: state.repeat,
              },
            },
          };
          const res = await fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            set({ lastSyncAt: Date.now(), isSyncing: false });
          } else {
            set({ isSyncing: false, syncError: "sync_failed" });
          }
        } catch {
          set({ isSyncing: false, syncError: "sync_failed" });
        }
      },

      syncFromServer: async () => {
        const state = get();
        if (!state.userId) return;
        set({ isSyncing: true, syncError: null });
        try {
          // Fetch both UserSync data AND Playlist table data in parallel
          const [syncRes, playlistsRes] = await Promise.all([
            fetch('/api/sync').catch(() => null),
            fetch('/api/playlists?myOnly=true&limit=50').catch(() => null),
          ]);

          // ── Parse UserSync data ──
          let data: Record<string, any> = {};
          if (syncRes?.ok) {
            const json = await syncRes.json();
            data = json.data || {};
          }

          // ── Parse Playlist table data (bot-created playlists) ──
          let dbPlaylists: any[] = [];
          if (playlistsRes?.ok) {
            const json = await playlistsRes.json();
            dbPlaylists = json.playlists || [];
          }

          const updates: Record<string, unknown> = {};

          // Merge history: combine server + local, deduplicate by track.id
          if (Array.isArray(data.history)) {
            const localHistory = state.history || [];
            const serverMap = new Map<string, typeof localHistory[0]>();
            for (const entry of data.history) {
              if (entry?.track?.id) serverMap.set(entry.track.id, entry);
            }
            // Server entries that aren't in local
            const localIds = new Set(localHistory.map(h => h.track?.id));
            const newFromServer = data.history.filter(
              (e: any) => e?.track?.id && !localIds.has(e.track.id)
            );
            updates.history = [...newFromServer, ...localHistory].slice(0, MAX_HISTORY_ENTRIES);
          }

          // Merge playlists: take server version if newer (by track count for local playlists without timestamps)
          if (Array.isArray(data.playlists)) {
            const localPlaylists = state.playlists || [];
            const merged = [...localPlaylists];
            for (const pl of data.playlists) {
              const localIdx = merged.findIndex(p => p.id === pl.id);
              if (localIdx === -1) {
                // New playlist from server
                merged.push(pl);
              } else {
                // Update if server version has more tracks or local has no description but server does
                const serverTracks = pl.tracks?.length || 0;
                const localTracks = merged[localIdx].tracks?.length || 0;
                if (serverTracks > localTracks) {
                  merged[localIdx] = pl;
                }
              }
            }
            updates.playlists = merged;
          }

          // ── Merge bot-created playlists from Playlist DB table ──
          // Convert Playlist rows to UserPlaylist format and merge into store
          if (dbPlaylists.length > 0) {
            const existing = (updates.playlists as any[] || state.playlists || []);
            const merged = [...existing];
            for (const pl of dbPlaylists) {
              const localIdx = merged.findIndex((p: any) => p.id === pl.id);
              const dbTrackCount = (pl.tracks || []).length;
              if (localIdx === -1) {
                // New playlist from DB (created via bot) — convert to UserPlaylist format
                merged.push({
                  id: pl.id,
                  name: pl.name,
                  description: pl.description || "",
                  cover: pl.cover || "",
                  tracks: pl.tracks || [],
                  createdAt: pl.createdAt ? new Date(pl.createdAt).getTime() : Date.now(),
                  // Extra fields from DB
                  isPublic: pl.isPublic,
                  tags: pl.tags || [],
                });
              } else {
                // Existing playlist — update if DB version has more tracks (bot added something)
                const localTracks = (merged[localIdx].tracks || []).length;
                if (dbTrackCount > localTracks) {
                  merged[localIdx] = {
                    ...merged[localIdx],
                    tracks: pl.tracks || merged[localIdx].tracks,
                    name: pl.name || merged[localIdx].name,
                    description: pl.description || merged[localIdx].description,
                    cover: pl.cover || merged[localIdx].cover,
                  };
                }
              }
            }
            updates.playlists = merged;
          }

          // Merge liked tracks: union of server + local
          if (Array.isArray(data.likedTracks)) {
            const local = state.likedTrackIds || [];
            const combined = [...new Set([...data.likedTracks, ...local])];
            updates.likedTrackIds = combined;
          }

          // Merge disliked tracks: union of server + local
          if (Array.isArray(data.dislikedTracks)) {
            const local = state.dislikedTrackIds || [];
            const combined = [...new Set([...data.dislikedTracks, ...local])];
            updates.dislikedTrackIds = combined;
          }

          // Merge liked tracks data
          if (Array.isArray(data.likedTracksData)) {
            const local = state.likedTracksData || [];
            const localIds = new Set(local.map(t => t.id));
            const merged = [...local];
            for (const t of data.likedTracksData) {
              if (!localIds.has(t.id)) merged.push(t);
            }
            updates.likedTracksData = merged;
          }

          // Merge disliked tracks data
          if (Array.isArray(data.dislikedTracksData)) {
            const local = state.dislikedTracksData || [];
            const localIds = new Set(local.map(t => t.id));
            const merged = [...local];
            for (const t of data.dislikedTracksData) {
              if (!localIds.has(t.id)) merged.push(t);
            }
            updates.dislikedTracksData = merged;
          }

          // Apply settings from server
          if (data.settings && typeof data.settings === "object") {
            const s = data.settings;
            if (typeof s.volume === "number") updates.volume = s.volume;
            if (typeof s.compactMode === "boolean") updates.compactMode = s.compactMode;
            if (typeof s.fontSize === "number") updates.fontSize = s.fontSize;
            if (typeof s.animationsEnabled === "boolean") updates.animationsEnabled = s.animationsEnabled;
            if (typeof s.liquidGlassEnabled === "boolean") updates.liquidGlassEnabled = s.liquidGlassEnabled;
            if (typeof s.liquidGlassMobile === "boolean") updates.liquidGlassMobile = s.liquidGlassMobile;
            if (typeof s.shuffle === "boolean") updates.shuffle = s.shuffle;
            if (typeof s.repeat === "string") updates.repeat = s.repeat;
          }

          if (Object.keys(updates).length > 0) {
            set(updates as any);
          }

          set({ isSyncing: false, lastSyncAt: Date.now() });
        } catch {
          set({ isSyncing: false, syncError: "sync_failed" });
        }
      },
});

