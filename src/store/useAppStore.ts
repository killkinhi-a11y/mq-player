// MQ global store — composition root.
// Stage III: state shape lives in ./types + ./initialState, actions in ./slices/*,
// persistence contract in ./persist. Public API (useAppStore, getLastVolume and all
// exported types) is unchanged; existing imports from "@/store/useAppStore" keep working.
import type { AppState } from "@/store/types";
import { STORAGE_KEY, STORE_VERSION, createQuotaManagedStorage, mergeState, migrateState, partializeState } from "@/store/persist";
import { buildSkipProfile, loadSkipEvents } from "@/lib/listening/skipIntelligence";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { initialState } from "@/store/initialState";
import { createAuthSlice, createAppearanceSlice, createPlaybackSlice, createQueueSlice, createAudioSlice, createSleepTimerSlice, createLibrarySlice, createDiscoverySlice, createWaveSlice, createTasteSlice, createMessengerSlice, createUiSlice, createSocialSlice, createSyncSlice, createCatSlice } from "@/store/slices";

export type { PlaybackState, ViewType, Mood, FavoriteArtist, AuthStep, UserPlaylist, PublicPlaylist, HistoryEntry, SelectedPlaylist, HomeRecCategory, HomeCuratedPlaylist, AppState } from "@/store/types";
export { getLastVolume } from "@/store/internal/helpers";

export const useAppStore = create<AppState>()(
  persist(
    (set, get, api) => ({
      ...initialState,
      ...createAuthSlice(set, get, api),
      ...createAppearanceSlice(set, get, api),
      ...createPlaybackSlice(set, get, api),
      ...createQueueSlice(set, get, api),
      ...createAudioSlice(set, get, api),
      ...createSleepTimerSlice(set, get, api),
      ...createLibrarySlice(set, get, api),
      ...createDiscoverySlice(set, get, api),
      ...createWaveSlice(set, get, api),
      ...createTasteSlice(set, get, api),
      ...createMessengerSlice(set, get, api),
      ...createUiSlice(set, get, api),
      ...createSocialSlice(set, get, api),
      ...createSyncSlice(set, get, api),
      ...createCatSlice(set, get, api),

      reset: () => set(initialState),
    }),
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => {
        // SSR safety: return no-op storage on server
        if (typeof window === "undefined") return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        return createQuotaManagedStorage();
      }),
      partialize: partializeState,
      migrate: migrateState,
      merge: mergeState,
      onRehydrateStorage: () => {
        return (state, error) => {
          // ── CRITICAL FIX (TDZ / "site not opening" root cause) ──────────────
          // The persist middleware invokes this callback SYNCHRONOUSLY during
          // `create()` — i.e. while the module-level `const useAppStore` is
          // still in its Temporal Dead Zone. Every useAppStore.setState() /
          // .getState() call below then throws
          // "Cannot access 'useAppStore' before initialization",
          // `_hasHydrated` is never set, and the UI stays stuck on the
          // loading screen until the 3s emergency timeout in AppShell fires
          // (5+ seconds of black screen — perceived as "site not opening").
          // Deferring the body by ONE microtask lets `create()` finish
          // assigning the binding first; this still runs long before React
          // hydrates, so there is no UI-flash risk.
          const runRehydrate = () => {
          if (error) {
            // Distinguish REAL corruption from transient failures (TDZ during
            // HMR, storage races). The old code wiped localStorage on ANY
            // rehydrate error — a transient error would silently destroy all
            // user data (likes, history, playlists). Now we only remove the
            // persisted blob when it is genuinely unparseable; otherwise the
            // data stays and gets rewritten by the next successful save.
            let corrupted = false;
            try {
              const raw = localStorage.getItem(STORAGE_KEY);
              if (raw !== null) JSON.parse(raw);
            } catch {
              corrupted = true;
              try { localStorage.removeItem(STORAGE_KEY); } catch (e) { console.warn("[store]", e); }
            }
            console.warn(
              `[MQ Store] rehydration ${corrupted ? "failed (corrupted payload — cleared)" : "error (data preserved)"}:`,
              error instanceof Error ? error.message : error
            );
            // CRITICAL: Even on rehydration error, mark hydration as complete.
            // Otherwise the UI stays stuck on the "mq" loading screen forever.
            useAppStore.setState({ _hasHydrated: true });
            return;
          }
          if (!state) return;

          // V3 §24: rehydrate the skip-intelligence event log + derived
          // profile from their dedicated localStorage ring buffer.
          try {
            const events = loadSkipEvents();
            if (events.length > 0) {
              useAppStore.setState({
                listeningEvents: events,
                skipProfile: buildSkipProfile(events),
              });
            }
          } catch { /* events are optional — never block rehydration */ }

          // Clear demo auth on rehydration — user must explicitly enter demo mode each session.
          // IMPORTANT: batch ALL state changes (including _hasHydrated) in ONE setState call.
          // Previously this did a separate setState for _hasHydrated which could arrive after
          // AppShell read the store, causing a flash of authenticated demo UI.
          if (state.userId === "demo-user-id") {
            useAppStore.setState({
              userId: null,
              username: null,
              email: null,
              telegramUsername: null,
              avatar: null,
              isAuthenticated: false,
              currentView: "auth",
              isPlaying: false,
              playbackState: "idle",
              currentTrack: null,
              _hasHydrated: true,  // Mark hydrated IN THE SAME BATCH — prevents race
            });
            return; // Skip the rest of the handler — hydration is complete
          }

          // Safety: if isAuthenticated is true but userId is null (stale/inconsistent state from
          // older versions that didn't persist userId), force logout to prevent ghost sessions
          if (state.isAuthenticated && !state.userId) {
            console.warn("[MQ Store] isAuthenticated=true but userId=null — forcing logout");
            useAppStore.setState({
              isAuthenticated: false,
              currentView: "auth",
              isPlaying: false,
              playbackState: "idle",
              _hasHydrated: true,
            });
            return;
          }

          // Validate every critical field – belt and suspenders
          const s = state as unknown as Record<string, unknown>;
          const fixes: Record<string, unknown> = {};
          if (!Array.isArray(s.likedTrackIds)) fixes.likedTrackIds = [];
          if (!Array.isArray(s.dislikedTrackIds)) fixes.dislikedTrackIds = [];
          if (!Array.isArray(s.dislikedTracksData)) fixes.dislikedTracksData = [];
          if (!Array.isArray(s.likedTracksData)) fixes.likedTracksData = [];
          if (!Array.isArray(s.queue)) fixes.queue = [];
          if (!Array.isArray(s.history)) fixes.history = [];
          if (!Array.isArray(s.playlists)) fixes.playlists = [];
          if (!Array.isArray(s.messages)) fixes.messages = [];
          if (!Array.isArray(s.contacts)) fixes.contacts = [];
          if (!Array.isArray(s.similarTracks)) fixes.similarTracks = [];
          if (!Array.isArray(s.publicPlaylists)) fixes.publicPlaylists = [];
          if (!Array.isArray(s.recommendedPlaylists)) fixes.recommendedPlaylists = [];
          if (!Array.isArray(s.dislikedTags)) fixes.dislikedTags = [];
          if (!Array.isArray(s.favoriteArtists)) fixes.favoriteArtists = [];
          if (typeof s.onboardingComplete !== "boolean") fixes.onboardingComplete = false;
          if (typeof s.publicPlaylistsLoading !== "boolean") fixes.publicPlaylistsLoading = false;
          if (typeof s.recommendedPlaylistsLoading !== "boolean") fixes.recommendedPlaylistsLoading = false;
          if (typeof s.publicPlaylistsPage !== "number") fixes.publicPlaylistsPage = 1;
          if (typeof s.publicPlaylistsTotal !== "number") fixes.publicPlaylistsTotal = 0;
          if (typeof s.publicPlaylistsSearch !== "string") fixes.publicPlaylistsSearch = "";
          if (typeof s.publicPlaylistsSort !== "string") fixes.publicPlaylistsSort = "popular";
          if (typeof s.currentTheme !== "string" || !s.currentTheme) fixes.currentTheme = "default";
          // Never auto-play on rehydration — always start paused
          if (s.isPlaying === true) fixes.isPlaying = false;
          // CRITICAL: Always reset radioMode on rehydration. Previously
          // radioMode could be persisted in old localStorage (before it
          // was excluded from partialize), and merge() would copy it
          // back — causing "wave always active" bug on page reload.
          // Even if not persisted, a stale radioMode=true from a crashed
          // session would survive. Force false on every rehydration.
          if (s.radioMode === true) fixes.radioMode = false;
          if (s.radioSeedTrack !== null) fixes.radioSeedTrack = null;
          if (s.radioSkipCount !== 0) fixes.radioSkipCount = 0;
          if (typeof s.volume !== "number") fixes.volume = 70;
          if (typeof s.fontSize !== "number") fixes.fontSize = 16;
          if (typeof s.shuffle !== "boolean") fixes.shuffle = false;
          if (typeof s.repeat !== "string") fixes.repeat = "off";
          // Cat mascot validation
          if (typeof s.catEnabled !== "boolean") fixes.catEnabled = false;
          if (!["rare", "normal", "often"].includes(s.catFrequency as string)) fixes.catFrequency = "normal";
          if (!["chill", "dreamy", "panic", "lazy"].includes(s.catMood as string)) fixes.catMood = "chill";
          if (!["small", "medium", "large"].includes(s.catSize as string)) fixes.catSize = "medium";
          if (typeof s.catPetCount !== "number") fixes.catPetCount = 0;
          if (typeof s.queueIndex !== "number") fixes.queueIndex = 0;
          const fb = s.feedbackBatch as Record<string, unknown> | undefined;
          if (!fb || typeof fb.pendingCount !== "number") {
            fixes.feedbackBatch = {
              completedGenres: [],
              skippedGenres: [],
              completedArtists: [],
              skippedArtists: [],
              genreListenTimes: {},
              artistListenTimes: {},
              lastSync: 0,
              pendingCount: 0,
            };
          }
          if (Object.keys(fixes).length > 0) {
            console.warn("[MQ Store] fixing missing fields:", Object.keys(fixes));
            fixes._hasHydrated = true;
            useAppStore.setState(fixes);
          } else {
            // Mark hydration as complete — UI can now safely render
            useAppStore.setState({ _hasHydrated: true });
          }

          // Auto-sync on rehydrate (after page reload)
          // Check session via JWT cookie — if valid, restore user info from server
          // IMPORTANT: Use the CURRENT store state (after demo/guest reset), not the
          // persisted `s` — otherwise demo-user reset above gets overridden by /api/auth/me
          const currentState = useAppStore.getState();
          if (currentState.isAuthenticated && currentState.userId && currentState.userId !== "demo-user-id") {
            // Retry up to 3 times with increasing delays to handle:
            // - WebView cookie race on cold start
            // - Vercel serverless cold start (function not warmed up)
            // - Transient network issues
            const fetchMe = (attempt: number) => fetch('/api/auth/me', { credentials: 'include' })
              .then(async (res) => {
                if (res.status === 401) {
                  // Actual auth failure — session expired or invalid
                  if (attempt < 3) {
                    // Retry with increasing delay: 500ms, 1s, 2s
                    const delay = 500 * Math.pow(2, attempt);
                    await new Promise(r => setTimeout(r, delay));
                    return fetchMe(attempt + 1);
                  }
                  // 401 after 3 retries — session truly expired
                  console.warn("[MQ Store] /api/auth/me 401 after 3 retries — session expired");
                  return { _expired: true } as any;
                }
                if (!res.ok) {
                  // Server error (500, 502, etc.) — NOT an auth failure.
                  // Don't logout — keep local state, will retry on next interaction.
                  console.warn("[MQ Store] /api/auth/me returned", res.status, "— server error, keeping session");
                  return null;
                }
                return res.json();
              })
              .catch((err) => {
                // Network error — don't logout, keep local session
                console.warn("[MQ Store] /api/auth/me network error:", err.message);
                return null;
              });
            fetchMe(0)
              .then((me) => {
                if (me && (me as any)._expired) {
                  // Session truly expired — force logout
                  console.warn("[MQ Store] forcing logout — session expired");
                  useAppStore.setState({
                    isAuthenticated: false,
                    userId: null,
                    username: null,
                    email: null,
                    avatar: null,
                    currentView: "auth",
                    isPlaying: false,
                    playbackState: "idle",
                  });
                  return;
                }
                if (!me) {
                  // Server error or network issue — keep local session, ensure
                  // user stays on main view (not kicked to auth)
                  console.warn("[MQ Store] /api/auth/me unavailable — keeping local session");
                  const cs = useAppStore.getState();
                  if (cs.isAuthenticated && cs.currentView === "auth") {
                    useAppStore.setState({ currentView: "main" });
                  }
                  return;
                }
                useAppStore.setState({
                  userId: me.userId,
                  username: me.username,
                  email: me.email,
                  userRole: me.role || "user",
                  avatar: me.avatar || null,
                  telegramUsername: me.telegramUsername || null,
                });
                // Sync data from server
                useAppStore.getState().syncFromServer();
                // Load favorite artists — only redirect to onboarding if NOT completed
                // AND user is still on the auth view (not yet on main)
                useAppStore.getState().loadFavoriteArtistsFromServer().then(() => {
                  const cs = useAppStore.getState();
                  if (!cs.onboardingComplete && cs.currentView === "auth") {
                    useAppStore.setState({ currentView: "onboarding" });
                  }
                });
                // Sync local data to server after short delay
                setTimeout(() => {
                  useAppStore.getState().syncToServer();
                }, 3000);
              })
              .catch(() => {
                // Network error — keep local state, will retry on next interaction
                console.warn("[MQ Store] /api/auth/me failed on rehydrate — skipping");
              });
          }

          // Periodic feedback sync: every 60 seconds if there are pending items
          // Guard against HMR/StrictMode duplicate intervals
          if (typeof window !== "undefined") {
            const w = window as Window & { _mqFeedbackSyncInterval?: ReturnType<typeof setInterval> };
            if (w._mqFeedbackSyncInterval) clearInterval(w._mqFeedbackSyncInterval);
            w._mqFeedbackSyncInterval = setInterval(() => {
              const currentState = useAppStore.getState();
              if (currentState.feedbackBatch.pendingCount > 0) {
                currentState.syncFeedbackToServer();
              }
            }, 60000);
          }
          }; // ── end of runRehydrate ──────────────────────────────────────────

          // TDZ guard: run the body one microtask later, after `create()` has
          // assigned the `useAppStore` binding. The .catch() is the last-resort
          // safety net so hydration NEVER leaves the UI stuck on the loader.
          Promise.resolve().then(runRehydrate).catch((e: unknown) => {
            console.warn("[MQ Store] rehydration deferred run failed:", e instanceof Error ? e.message : e);
            try {
              useAppStore.setState({ _hasHydrated: true });
            } catch {
              // Binding still uninitialized — AppShell's 3s timeout is the fallback.
            }
          });
        };
      },
    },
  ),
);

