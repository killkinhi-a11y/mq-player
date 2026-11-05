// Store slice: Transient UI: modals, panels, search query, selections, sheets.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE.md.
import type { StoreSlice } from "@/store/types";

export type UiSliceKeys =
  | "setSearchQuery"
  | "setLibrarySearchQuery"
  | "setLibrarySort"
  | "setSelectedGenre"
  | "setIsLoading"
  | "setFullTrackViewOpen"
  | "setEqOpen"
  | "setShortcutsHelpOpen"
  | "requestShowSimilar"
  | "clearShowSimilarRequest"
  | "requestShowLyrics"
  | "clearShowLyricsRequest"
  | "openShareSheet"
  | "closeShareSheet"
  | "setSelectedPlaylistId"
  | "openPublicPlaylistDetail"
  | "setSelectedArtist"
  | "openSpotifyAlbum"
  | "closeSpotifyAlbum"
  | "setMiniPlayerHidden"
  | "setAiRecsHidden";

/** Transient UI: modals, panels, search query, selections, sheets. */
export const createUiSlice: StoreSlice<UiSliceKeys> = (set, get) => ({

      setSearchQuery: (query) => set({ searchQuery: query }),

      setLibrarySearchQuery: (q) => set({ librarySearchQuery: q }),
      setLibrarySort: (mode) => set({ librarySort: mode }),

      setSelectedGenre: (genre) => set({ selectedGenre: genre }),

      setIsLoading: (loading) => set({ isLoading: loading }),

      setFullTrackViewOpen: (open) => set({ isFullTrackViewOpen: open }),

      setEqOpen: (open) => set({ isEqOpen: open }),

      setShortcutsHelpOpen: (open) => set({ shortcutsHelpOpen: open }),
      requestShowSimilar: () => set({ showSimilarRequested: true, isFullTrackViewOpen: true, showLyricsRequested: false }),
      clearShowSimilarRequest: () => set({ showSimilarRequested: false }),
      requestShowLyrics: () => set({ showLyricsRequested: true, isFullTrackViewOpen: true, showSimilarRequested: false }),
      clearShowLyricsRequest: () => set({ showLyricsRequested: false }),

      // ── Share sheet (global, QR-powered) ──
      openShareSheet: (payload) => set({ shareSheet: payload }),
      closeShareSheet: () => set({ shareSheet: null }),

      setSelectedPlaylistId: (id) => set({ selectedPlaylistId: id }),

      // ── Public playlist deep-link (Home recommendations → full page) ──
      // Stashes the playlist and navigates to the EXISTING public-playlists
      // view via the normal setView path (scroll-reset etc. included);
      // PublicPlaylistsView picks the stash up on mount and opens its detail.
      openPublicPlaylistDetail: (playlist) => {
        set({ publicPlaylistDeepLink: playlist });
        get().setView("public-playlists");
      },

      // ── Artist detail view ──
      setSelectedArtist: (artist) => {
        set({ selectedArtist: artist });
        // Auto-switch to main view only if not already there
        // (avoids setView("main") clearing the artist we just set)
        if (artist && get().currentView !== "main") {
          get().setView("main");
        }
      },

      openSpotifyAlbum: (album) => {
        set({ selectedSpotifyAlbum: album });
        if (get().currentView !== "main") {
          get().setView("main");
        }
      },

      closeSpotifyAlbum: () => set({ selectedSpotifyAlbum: null }),

      setMiniPlayerHidden: (hidden: boolean) => set({ miniPlayerHidden: hidden }),

      setAiRecsHidden: (hidden: boolean) => set({ aiRecsHidden: hidden }),
});

