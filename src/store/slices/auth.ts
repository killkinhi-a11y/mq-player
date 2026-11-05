// Store slice: Auth & navigation: session, auth steps, current view, onboarding flag.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE.md.
import type { StoreSlice } from "@/store/types";
import { applyThemeToDOM, themes } from "@/lib/themes";
import { initialState } from "@/store/initialState";
import { resetPollingSuspension } from "@/lib/authGate";

export type AuthSliceKeys =
  | "setAuth"
  | "logout"
  | "setView"
  | "setAuthStep"
  | "setOnboardingComplete";

/** Auth & navigation: session, auth steps, current view, onboarding flag. */
export const createAuthSlice: StoreSlice<AuthSliceKeys> = (set, get) => ({

      setAuth: (userId, username, email, role, avatar, telegramUsername) => {
        // Capture a generation counter to prevent stale async writes after logout
        const authGeneration = Date.now();
        // Fresh auth generation → polling gets a clean slate (Phase 2C:
        // login resumes protected polling after a 401 suspension).
        resetPollingSuspension();
        const isDemoLogin = userId === "demo-user-id";
        // isPlaying: false — never auto-play on login, even if persisted state had it
        set({ isAuthenticated: true, userId, username, email, telegramUsername: telegramUsername || null, userRole: role || "user", avatar: avatar || null, currentView: "main", _authGeneration: authGeneration, isPlaying: false, playbackState: 'idle', isBuffering: false });

        // Phase 2C: demo sessions are local-only — skip ALL server round-trips
        // (theme fetch + sync would 401: demo has no session cookie).
        if (isDemoLogin) {
          set({ onboardingComplete: true });
          return;
        }

        // Load saved theme from account — check generation before writing
        fetch('/api/user/theme')
          .then(r => r.json())
          .then(data => {
            if (get()._authGeneration !== authGeneration) return; // Stale after logout
            if (data.theme && data.theme !== "default") {
              const themeConfig = themes[data.theme];
              if (themeConfig) {
                applyThemeToDOM(themeConfig, data.accent || undefined);
                set({ currentTheme: data.theme, customAccent: data.accent || null });
              }
            }
          })
          .catch(() => {});
        // Sync data from server after a short delay (let localStorage hydrate first)
        const syncTimer = setTimeout(() => {
          if (get()._authGeneration !== authGeneration) return; // Stale after logout
          get().syncFromServer();
          // Load favorite artists and check onboarding
          get().loadFavoriteArtistsFromServer().then(() => {
            if (get()._authGeneration !== authGeneration) return; // Stale after logout
            const state = get();
            if (!state.onboardingComplete) {
              set({ currentView: "onboarding" });
            }
          });
        }, 1500);
        // Store timer ref so logout can clear it
        (get() as any)._syncTimer = syncTimer;
      },

      logout: () => {
        // Phase 2C: logout stops all protected polling (fresh slate for
        // the next login; also mirrors the login-side reset).
        resetPollingSuspension();
        // Clear any pending sync timer
        const timerRef = (get() as any)._syncTimer;
        if (timerRef) clearTimeout(timerRef);
        // Clear feedback sync interval to prevent memory leak
        if (typeof window !== "undefined") {
          const w = window as Window & { _mqFeedbackSyncInterval?: ReturnType<typeof setInterval> };
          if (w._mqFeedbackSyncInterval) {
            clearInterval(w._mqFeedbackSyncInterval);
            w._mqFeedbackSyncInterval = undefined;
          }
        }
        // Increment generation to invalidate any in-flight async operations
        // Keep _hasHydrated: true to prevent hydration loop
        set({ ...initialState, _authGeneration: Date.now(), _hasHydrated: true });
        // Use sendBeacon to survive page unload — fire-and-forget fetch may not complete
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon('/api/auth/logout');
        } else {
          fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        }
      },

      setView: (view) => {
        // P3-fix: scroll to top BEFORE changing the view so the user
        // never sees the new view at a scrolled-down position. Doing
        // this synchronously (before set()) means the scroll reset
        // happens in the same frame as the view switch.
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "auto" });
          const main = document.getElementById("main-content");
          if (main) main.scrollTop = 0;
        }
        // When navigating to "main", close all overlays/panels without stopping music
        if (view === "main") {
          const state = get();
          const alreadyOnMain = state.currentView === "main";
          set({
            currentView: view,
            isFullTrackViewOpen: false,
            showSimilarRequested: false,
            showLyricsRequested: false,
            // Close artist card only when clicking Home while already on main
            ...(alreadyOnMain ? { selectedArtist: null } : {}),
            notifPanelOpen: false,
            searchQuery: "",
            selectedGenre: "",
            selectedContactId: null,
            selectedGroupId: null,
          });
        } else {
          set({ currentView: view });
        }
        // Sync with browser history for back/forward button support
        if (typeof window !== "undefined") {
          const url = view === "main" ? "/play" : `/play?v=${view}`;
          window.history.pushState({ view }, "", url);
        }
      },

      setAuthStep: (step) => set({ authStep: step }),
      setOnboardingComplete: (complete) => set({ onboardingComplete: complete }),
});

