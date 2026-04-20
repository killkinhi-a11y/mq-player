import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type Track, type Message as ChatMessage } from "@/lib/musicApi";
import { themes, applyThemeToDOM } from "@/lib/themes";

// ── Storage versioning ──
// Bump this number to force a fresh store for all users with old data.
const STORE_VERSION = 5;
const STORAGE_KEY = "mq-store-v5";

// Nuke stale data BEFORE Zustand tries to hydrate.
// This runs at module-import time, so there is no React error boundary to catch failures.
if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const storedVersion = parsed?.version ?? 0;
      if (storedVersion < STORE_VERSION) {
        console.warn(`[MQ Store] version ${storedVersion} < ${STORE_VERSION} – clearing stale data`);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch {
    console.warn("[MQ Store] corrupt localStorage – clearing");
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}

export type ViewType = "auth" | "main" | "search" | "messenger" | "settings" | "profile" | "playlists" | "public-playlists" | "history" | "stories";
export type AuthStep = "login" | "register" | "confirm" | "confirmed" | "forgot-password";

export interface UserPlaylist {
  id: string;
  name: string;
  description: string;
  cover: string;
  tracks: Track[];
  createdAt: number;
}

export interface PublicPlaylist {
  id: string;
  userId: string;
  username: string;
  name: string;
  description: string;
  cover: string;
  isPublic: boolean;
  tags: string[];
  tracks: Track[];
  trackCount: number;
  likeCount: number;
  playCount: number;
  isLiked: boolean;
  score?: number;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  track: Track;
  playedAt: number;
}

export interface SelectedPlaylist {
  id: string;
}

interface AppState {
  // Auth
  isAuthenticated: boolean;
  userId: string | null;
  username: string | null;
  email: string | null;
  avatar: string | null;
  userRole: string;
  currentView: ViewType;
  authStep: AuthStep;

  // Sync
  lastSyncAt: number | null;
  isSyncing: boolean;
  syncError: string | null;

  // Theme
  currentTheme: string;
  customAccent: string | null;
  animationsEnabled: boolean;
  compactMode: boolean;
  fontSize: number;
  liquidGlassEnabled: boolean;

  // Player
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  playbackMode: "soundcloud" | "idle";

  // Sleep timer
  sleepTimerActive: boolean;
  sleepTimerMinutes: number;
  sleepTimerRemaining: number;
  sleepTimerEndTime: number | null;

  // Messenger
  messages: ChatMessage[];
  selectedContactId: string | null;
  unreadCounts: Record<string, number>;
  contacts: { id: string; name: string; username: string; avatar: string; online: boolean; lastSeen: string }[];

  // Typing indicator
  typingUsers: Record<string, number>; // contactId → last typing timestamp

  // Support chat
  supportUnreadCount: number;

  // Notifications
  notificationCount: number;
  notifPanelOpen: boolean;

  // Search
  searchQuery: string;
  selectedGenre: string;
  isLoading: boolean;

  // Full-screen track view
  isFullTrackViewOpen: boolean;

  // Likes/Dislikes
  likedTrackIds: string[];
  dislikedTrackIds: string[];
  likedTracksData: Track[];
  dislikedTracksData: Track[];

  // PiP
  isPiPActive: boolean;

  // Similar tracks panel
  similarTracks: Track[];
  similarTracksLoading: boolean;
  showSimilarRequested: boolean;
  showLyricsRequested: boolean;

  // Playlists
  playlists: UserPlaylist[];
  selectedPlaylistId: string | null;

  // Liquid Glass Mobile
  liquidGlassMobile: boolean;

  // History
  history: HistoryEntry[];

  // Actions
  setAuth: (userId: string, username: string, email: string, role?: string, avatar?: string | null) => void;
  logout: () => void;
  syncToServer: () => Promise<void>;
  syncFromServer: () => Promise<void>;
  setView: (view: ViewType) => void;
  setAuthStep: (step: AuthStep) => void;

  // Theme actions
  setTheme: (theme: string) => void;
  setCustomAccent: (color: string | null) => void;
  setAnimationsEnabled: (enabled: boolean) => void;
  setCompactMode: (compact: boolean) => void;
  setFontSize: (size: number) => void;
  setLiquidGlassEnabled: (enabled: boolean) => void;

  // Player actions
  playTrack: (track: Track, queue?: Track[]) => void;
  togglePlay: () => void;
  setVolume: (volume: number) => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setPlaybackMode: (mode: "soundcloud" | "idle") => void;

  // Sleep timer actions
  startSleepTimer: (minutes: number) => void;
  stopSleepTimer: () => void;
  updateSleepTimer: () => void;

  // Messenger actions
  addMessage: (message: ChatMessage) => void;
  setSelectedContact: (contactId: string | null) => void;
  loadMessages: (messages: ChatMessage[]) => void;
  clearUnread: (contactId: string) => void;
  addContact: (contact: { id: string; name: string; username: string; avatar: string; online: boolean; lastSeen: string }) => void;
  deleteMessagesForContact: (contactId: string) => void;
  setTypingUser: (contactId: string) => void;
  clearTypingUser: (contactId: string) => void;

  // Search actions
  setSearchQuery: (query: string) => void;
  setSelectedGenre: (genre: string) => void;
  setIsLoading: (loading: boolean) => void;

  // Full-screen track view actions
  setFullTrackViewOpen: (open: boolean) => void;

  // Like/Dislike actions
  toggleLike: (trackId: string, trackData?: Track) => void;
  toggleDislike: (trackId: string, trackData?: Track) => void;
  isTrackLiked: (trackId: string) => boolean;
  isTrackDisliked: (trackId: string) => boolean;

  // PiP actions
  setPiPActive: (active: boolean) => void;

  // Similar tracks actions
  setSimilarTracks: (tracks: Track[]) => void;
  setSimilarTracksLoading: (loading: boolean) => void;
  requestShowSimilar: () => void;
  clearShowSimilarRequest: () => void;
  requestShowLyrics: () => void;
  clearShowLyricsRequest: () => void;

  // Playlist actions
  createPlaylist: (name: string, description?: string) => void;
  deletePlaylist: (playlistId: string) => void;
  renamePlaylist: (playlistId: string, name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  setSelectedPlaylistId: (id: string | null) => void;

  // Public playlist actions
  publishPlaylist: (playlistId: string, tags?: string[]) => Promise<boolean>;
  unpublishPlaylist: (playlistId: string) => Promise<boolean>;
  togglePlaylistLike: (playlistId: string) => Promise<boolean>;
  fetchPublicPlaylists: (params?: { search?: string; sort?: string; page?: number }) => Promise<void>;
  fetchPlaylistRecommendations: (likedTags?: string[], likedArtists?: string[]) => Promise<void>;
  addDislikedTags: (tags: string[]) => void;
  removeDislikedTag: (tag: string) => void;

  // Disliked playlist tags (for recommendations filtering)
  dislikedTags: string[];

  // Group chat
  selectedGroupId: string | null;

  // Collaborative listening
  listenSession: {
    id: string;
    hostId: string;
    hostName: string;
    guestId: string | null;
    guestName: string | null;
    trackId: string;
    trackTitle: string;
    trackArtist: string;
    trackCover: string;
    scTrackId: number | null;
    audioUrl: string;
    source: string;
    progress: number;
    isPlaying: boolean;
    isHost: boolean;
  } | null;
  setListenSession: (session: any) => void;
  clearListenSession: () => void;

  // Public playlists
  publicPlaylists: PublicPlaylist[];
  recommendedPlaylists: PublicPlaylist[];
  publicPlaylistsLoading: boolean;
  recommendedPlaylistsLoading: boolean;
  publicPlaylistsTotal: number;

  // Support chat actions
  setSupportUnreadCount: (count: number) => void;
  incrementSupportUnread: () => void;

  // Notification actions
  setNotificationCount: (count: number) => void;
  setNotifPanelOpen: (open: boolean) => void;

  // Liquid Glass Mobile action
  setLiquidGlassMobile: (enabled: boolean) => void;

  // History actions
  addToHistory: (track: Track) => void;
  clearHistory: () => void;

  // Reset
  reset: () => void;
}

const initialState = {
  isAuthenticated: false,
  lastSyncAt: null as number | null,
  isSyncing: false,
  syncError: null as string | null,
  userId: null as string | null,
  username: null as string | null,
  email: null as string | null,
  avatar: null as string | null,
  currentView: "auth" as ViewType,
  authStep: "login" as AuthStep,
  currentTheme: "default",
  customAccent: null as string | null,
  animationsEnabled: true,
  compactMode: false,
  fontSize: 16,
  liquidGlassEnabled: false,
  currentTrack: null as Track | null,
  queue: [] as Track[],
  queueIndex: 0,
  isPlaying: false,
  volume: 70,
  progress: 0,
  duration: 0,
  shuffle: false,
  repeat: "off" as "off" | "all" | "one",
  playbackMode: "idle" as "soundcloud" | "idle",
  sleepTimerActive: false,
  sleepTimerMinutes: 30,
  sleepTimerRemaining: 0,
  sleepTimerEndTime: null as number | null,
  messages: [] as ChatMessage[],
  selectedContactId: null as string | null,
  unreadCounts: {} as Record<string, number>,
  contacts: [] as { id: string; name: string; username: string; avatar: string; online: boolean; lastSeen: string }[],
  typingUsers: {} as Record<string, number>,
  searchQuery: "",
  selectedGenre: "",
  isLoading: false,
  supportUnreadCount: 0 as number,
  notificationCount: 0 as number,
  notifPanelOpen: false as boolean,
  isFullTrackViewOpen: false,
  likedTrackIds: [] as string[],
  dislikedTrackIds: [] as string[],
  dislikedTracksData: [] as Track[],
  likedTracksData: [] as Track[],
  isPiPActive: false,
  similarTracks: [] as Track[],
  similarTracksLoading: false,
  showSimilarRequested: false,
  showLyricsRequested: false,
  playlists: [] as UserPlaylist[],
  selectedPlaylistId: null as string | null,

  userRole: "user" as string,

  // Public playlists
  liquidGlassMobile: false as boolean,
  history: [] as HistoryEntry[],
  publicPlaylists: [] as PublicPlaylist[],
  recommendedPlaylists: [] as PublicPlaylist[],
  publicPlaylistsLoading: false,
  publicPlaylistsPage: 1,
  publicPlaylistsTotal: 0,
  publicPlaylistsSearch: "",
  publicPlaylistsSort: "popular",
  recommendedPlaylistsLoading: false,
  dislikedTags: [] as string[],
  selectedGroupId: null as string | null,

  // Collaborative listening
  listenSession: null as any,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setAuth: (userId, username, email, role, avatar) => {
        set({ isAuthenticated: true, userId, username, email, userRole: role || "user", avatar: avatar || null, currentView: "main" });
        // Load saved theme from account
        fetch('/api/user/theme')
          .then(r => r.json())
          .then(data => {
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
        setTimeout(() => {
          get().syncFromServer();
        }, 1500);
      },

      logout: () => {
        set({ ...initialState });
        // Also clear the JWT cookie on the server
        fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      },

      setView: (view) => {
        set({ currentView: view });
        // Sync with browser history for back/forward button support
        if (typeof window !== "undefined") {
          const url = view === "main" ? "/play" : `/play?v=${view}`;
          window.history.pushState({ view }, "", url);
        }
      },

      setAuthStep: (step) => set({ authStep: step }),

      setTheme: (theme) => {
        set({ currentTheme: theme });
        // Save theme to account if logged in
        const { userId } = get();
        if (userId) {
          fetch('/api/user/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme }),
          }).catch(() => {});
        }
      },

      setCustomAccent: (color) => {
        set({ customAccent: color });
        // Save accent to account if logged in (including null to clear)
        const { userId } = get();
        if (userId) {
          fetch('/api/user/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accent: color }),
          }).catch(() => {});
        }
      },

      setAnimationsEnabled: (enabled) => set({ animationsEnabled: enabled }),

      setCompactMode: (compact) => set({ compactMode: compact }),

      setFontSize: (size) => set({ fontSize: size }),

      setLiquidGlassEnabled: (enabled) => set({ liquidGlassEnabled: enabled }),

      playTrack: (track, queue) => {
        const state = get();
        const newQueue = queue || state.queue;
        const index = newQueue.findIndex((t) => t.id === track.id);
        set({
          currentTrack: track,
          queue: newQueue,
          queueIndex: index >= 0 ? index : 0,
          isPlaying: true,
          progress: 0,
          duration: track.duration,
        });
        // Auto-add to history
        get().addToHistory(track);
      },

      togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

      setVolume: (volume) => set({ volume: Math.round(volume) }),

      setProgress: (progress) => set({ progress }),

      setDuration: (duration) => set({ duration }),

      nextTrack: () => {
        const { queue, queueIndex, shuffle, repeat } = get();
        let nextIdx: number;
        if (shuffle) {
          if (queue.length <= 1) { nextIdx = 0; }
          else {
            do { nextIdx = Math.floor(Math.random() * queue.length); } while (nextIdx === queueIndex);
          }
        } else {
          nextIdx = queueIndex + 1;
          if (nextIdx >= queue.length) {
            if (repeat === "all") nextIdx = 0;
            else { set({ isPlaying: false }); return; }
          }
        }
        const track = queue[nextIdx];
        if (track) {
          set({
            currentTrack: track,
            queueIndex: nextIdx,
            progress: 0,
            duration: track.duration,
            isPlaying: true,
          });
          get().addToHistory(track);
        }
      },

      prevTrack: () => {
        const { queue, queueIndex, progress } = get();
        if (progress > 3) {
          set({ progress: 0 });
          return;
        }
        let prevIdx = queueIndex - 1;
        if (prevIdx < 0) prevIdx = queue.length - 1;
        const track = queue[prevIdx];
        if (track) {
          set({
            currentTrack: track,
            queueIndex: prevIdx,
            progress: 0,
            duration: track.duration,
            isPlaying: true,
          });
          get().addToHistory(track);
        }
      },

      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

      toggleRepeat: () =>
        set((s) => ({
          repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off",
        })),

      setPlaybackMode: (mode) => set({ playbackMode: mode }),

      startSleepTimer: (minutes) => {
        const endTime = Date.now() + minutes * 60 * 1000;
        set({
          sleepTimerActive: true,
          sleepTimerMinutes: minutes,
          sleepTimerRemaining: minutes * 60,
          sleepTimerEndTime: endTime,
        });
      },

      stopSleepTimer: () =>
        set({
          sleepTimerActive: false,
          sleepTimerRemaining: 0,
          sleepTimerEndTime: null,
        }),

      updateSleepTimer: () => {
        const { sleepTimerEndTime, sleepTimerActive } = get();
        if (!sleepTimerActive || !sleepTimerEndTime) return;
        const remaining = Math.max(0, Math.floor((sleepTimerEndTime - Date.now()) / 1000));
        if (remaining <= 0) {
          set({
            sleepTimerActive: false,
            sleepTimerRemaining: 0,
            sleepTimerEndTime: null,
            isPlaying: false,
          });
        } else {
          set({ sleepTimerRemaining: remaining });
        }
      },

      addMessage: (message) =>
        set((s) => {
          // Basic validation
          if (!message?.id || !message.senderId) return s;
          // Dedup: skip messages with same ID
          if (s.messages.some((m) => m.id === message.id)) return s;
          const updated = [...s.messages, message];
          // Keep max 1000 messages in memory to prevent performance issues
          if (updated.length > 1000) return { messages: updated.slice(-1000) };
          return { messages: updated };
        }),

      setSelectedContact: (contactId) => set({ selectedContactId: contactId, unreadCounts: { ...get().unreadCounts, [contactId as string]: 0 } }),

      loadMessages: (incoming) => set((s) => {
        const existingIds = new Set(s.messages.map(m => m.id));
        const existingSignatures = new Set(
          s.messages.map(m => `${m.content}|${m.senderId}|${m.receiverId}`)
        );
        const newMsgs = incoming.filter(m => {
          if (existingIds.has(m.id)) return false;
          const sig = `${m.content}|${m.senderId}|${m.receiverId}`;
          if (existingSignatures.has(sig)) return false;
          return true;
        });
        return { messages: [...s.messages, ...newMsgs] };
      }),

      clearUnread: (contactId) =>
        set((s) => ({ unreadCounts: { ...s.unreadCounts, [contactId]: 0 } })),

      addContact: (contact) =>
        set((s) => {
          if (s.contacts.some((c) => c.id === contact.id)) return s;
          return { contacts: [...s.contacts, contact] };
        }),

      deleteMessagesForContact: (contactId) =>
        set((s) => ({
          messages: s.messages.filter(
            (m) => m.senderId !== contactId && m.receiverId !== contactId
          ),
        })),

      setTypingUser: (contactId) => set((s) => ({
        typingUsers: { ...s.typingUsers, [contactId]: Date.now() },
      })),
      clearTypingUser: (contactId) => set((s) => {
        const next = { ...s.typingUsers };
        delete next[contactId];
        return { typingUsers: next };
 }),

      // ── Support chat actions ──
      setSupportUnreadCount: (count) => set({ supportUnreadCount: count }),
      incrementSupportUnread: () => set((s) => ({ supportUnreadCount: s.supportUnreadCount + 1 })),

      setNotificationCount: (count) => set({ notificationCount: count }),
      setNotifPanelOpen: (open) => set({ notifPanelOpen: open }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setSelectedGenre: (genre) => set({ selectedGenre: genre }),

      setIsLoading: (loading) => set({ isLoading: loading }),

      setFullTrackViewOpen: (open) => set({ isFullTrackViewOpen: open }),

      toggleLike: (trackId, trackData) => {
        const { likedTrackIds, dislikedTrackIds, likedTracksData } = get();
        if (likedTrackIds.includes(trackId)) {
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
      },

      toggleDislike: (trackId, trackData) => {
        const { dislikedTrackIds, dislikedTracksData, likedTrackIds, likedTracksData } = get();
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
        }
      },

      isTrackLiked: (trackId) => get().likedTrackIds.includes(trackId),

      isTrackDisliked: (trackId) => get().dislikedTrackIds.includes(trackId),

      setPiPActive: (active) => set({ isPiPActive: active }),

      setSimilarTracks: (tracks) => set({ similarTracks: tracks }),
      setSimilarTracksLoading: (loading) => set({ similarTracksLoading: loading }),
      requestShowSimilar: () => set({ showSimilarRequested: true, isFullTrackViewOpen: true, showLyricsRequested: false }),
      clearShowSimilarRequest: () => set({ showSimilarRequested: false }),
      requestShowLyrics: () => set({ showLyricsRequested: true, isFullTrackViewOpen: true, showSimilarRequested: false }),
      clearShowLyricsRequest: () => set({ showLyricsRequested: false }),

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
        set((s) => ({ playlists: [...s.playlists, newPlaylist] }));
      },

      deletePlaylist: (playlistId) => {
        set((s) => ({
          playlists: s.playlists.filter((p) => p.id !== playlistId),
          selectedPlaylistId: s.selectedPlaylistId === playlistId ? null : s.selectedPlaylistId,
        }));
      },

      renamePlaylist: (playlistId, name) => {
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId ? { ...p, name } : p
          ),
        }));
      },

      addToPlaylist: (playlistId, track) => {
        set((s) => ({
          playlists: s.playlists.map((p) => {
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
          playlists: s.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            return {
              ...p,
              tracks: p.tracks.filter((t) => t.id !== trackId),
            };
          }),
        }));
      },

      setSelectedPlaylistId: (id) => set({ selectedPlaylistId: id }),

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

      fetchPlaylistRecommendations: async (likedTags = [], likedArtists = []) => {
        const { userId, likedTracksData, history, dislikedTags } = get();
        set({ recommendedPlaylistsLoading: true });

        // Build taste profile from store if not provided
        let tags = likedTags;
        let artists = likedArtists;
        if (tags.length === 0 && artists.length === 0) {
          const allTracks = [...likedTracksData, ...history.slice(0, 50).map((h) => h.track)];
          const genreCount: Record<string, number> = {};
          const artistCount: Record<string, number> = {};
          for (const t of allTracks) {
            if (t.genre) genreCount[t.genre] = (genreCount[t.genre] || 0) + 2;
            if (t.artist) artistCount[t.artist] = (artistCount[t.artist] || 0) + 1;
          }
          tags = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
          artists = Object.entries(artistCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a);
        }

        try {
          const sp = new URLSearchParams({ limit: '10' });
          if (tags.length > 0) sp.set('likedTags', tags.join(','));
          if (artists.length > 0) sp.set('likedArtists', artists.join(','));
          if (dislikedTags.length > 0) sp.set('dislikedTags', dislikedTags.join(','));
          const res = await fetch(`/api/playlists/recommendations?${sp}`);
          if (res.ok) {
            const data = await res.json();
            set({ recommendedPlaylists: data.playlists || [], recommendedPlaylistsLoading: false });
          } else {
            set({ recommendedPlaylistsLoading: false });
          }
        } catch {
          set({ recommendedPlaylistsLoading: false });
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

      // ── Liquid Glass Mobile ──
      setLiquidGlassMobile: (enabled) => set({ liquidGlassMobile: enabled }),

      // ── History actions ──
      addToHistory: (track) => {
        set((s) => {
          // Remove existing entry for same track
          const filtered = s.history.filter((h) => h.track.id !== track.id);
          // Add to front, keep max 200 entries
          return {
            history: [{ track, playedAt: Date.now() }, ...filtered].slice(0, 200),
          };
        });
      },

      clearHistory: () => set({ history: [] }),

      // ── Server sync actions ──
      syncToServer: async () => {
        const state = get();
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
          const res = await fetch('/api/sync');
          if (!res.ok) {
            set({ isSyncing: false });
            return;
          }
          const { data } = await res.json();
          if (!data || typeof data !== "object") {
            set({ isSyncing: false, lastSyncAt: Date.now() });
            return;
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
            updates.history = [...newFromServer, ...localHistory].slice(0, 200);
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

      // ── Collaborative listening actions ──
      setListenSession: (session) => set({ listenSession: session }),
      clearListenSession: () => set({ listenSession: null }),

      reset: () => set(initialState),
    }),
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => {
        // Extra safety: wrap getItem so any parse error results in null
        if (typeof window === "undefined") return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        return {
          getItem: (key: string) => {
            try { return localStorage.getItem(key); } catch { return null; }
          },
          setItem: (key: string, val: string) => {
            try { localStorage.setItem(key, val); } catch {}
          },
          removeItem: (key: string) => {
            try { localStorage.removeItem(key); } catch {}
          },
        };
      }),
      partialize: (state) => ({
        currentTheme: state.currentTheme,
        customAccent: state.customAccent,
        animationsEnabled: state.animationsEnabled,
        compactMode: state.compactMode,
        fontSize: state.fontSize,
        liquidGlassEnabled: state.liquidGlassEnabled,
        volume: state.volume,
        isAuthenticated: state.isAuthenticated,
        // SECURITY: do NOT persist userId, username, email, avatar, userRole
        // These come from the JWT httpOnly cookie via /api/auth/me
        messages: state.messages.length > 300 ? state.messages.slice(-300) : state.messages,
        unreadCounts: state.unreadCounts,
        contacts: state.contacts,
        currentView: state.currentView,
        likedTrackIds: state.likedTrackIds,
        dislikedTrackIds: state.dislikedTrackIds,
        dislikedTracksData: state.dislikedTracksData,
        likedTracksData: state.likedTracksData,
        dislikedTags: state.dislikedTags,
        playlists: state.playlists,
        history: state.history,
        liquidGlassMobile: state.liquidGlassMobile,
        shuffle: state.shuffle,
        repeat: state.repeat,
        // typingUsers is intentionally excluded — it's ephemeral real-time state
      }),
      migrate: (persisted: unknown, version: number) => {
        // On any version mismatch, start completely fresh
        console.warn(`[MQ Store] migrating from version ${version} to ${STORE_VERSION} — resetting`);
        return { ...initialState };
      },
      merge: (persisted, current) => {
        // If persisted is null/undefined (cleared by version check), use defaults
        if (!persisted) return current;
        const p = persisted as Record<string, unknown>;
        const merged = { ...current };
        // Only copy known state keys from persisted data
        for (const key of Object.keys(initialState)) {
          if (p[key] !== undefined) {
            (merged as Record<string, unknown>)[key] = p[key];
          }
        }
        return merged;
      },
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error("[MQ Store] rehydration error – clearing localStorage:", error);
            try { localStorage.removeItem(STORAGE_KEY); } catch {}
            return;
          }
          if (!state) return;
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
          if (typeof s.publicPlaylistsLoading !== "boolean") fixes.publicPlaylistsLoading = false;
          if (typeof s.recommendedPlaylistsLoading !== "boolean") fixes.recommendedPlaylistsLoading = false;
          if (typeof s.publicPlaylistsPage !== "number") fixes.publicPlaylistsPage = 1;
          if (typeof s.publicPlaylistsTotal !== "number") fixes.publicPlaylistsTotal = 0;
          if (typeof s.publicPlaylistsSearch !== "string") fixes.publicPlaylistsSearch = "";
          if (typeof s.publicPlaylistsSort !== "string") fixes.publicPlaylistsSort = "popular";
          if (typeof s.currentTheme !== "string" || !s.currentTheme) fixes.currentTheme = "default";
          if (typeof s.volume !== "number") fixes.volume = 70;
          if (typeof s.fontSize !== "number") fixes.fontSize = 16;
          if (typeof s.shuffle !== "boolean") fixes.shuffle = false;
          if (typeof s.repeat !== "string") fixes.repeat = "off";
          if (typeof s.queueIndex !== "number") fixes.queueIndex = 0;
          if (Object.keys(fixes).length > 0) {
            console.warn("[MQ Store] fixing missing fields:", Object.keys(fixes));
            useAppStore.setState(fixes);
          }

          // Auto-sync on rehydrate (after page reload)
          // Check session via JWT cookie — if valid, restore user info from server
          if (s.isAuthenticated) {
            fetch('/api/auth/me')
              .then(async (res) => {
                if (!res.ok) {
                  // Session expired or invalid — logout
                  console.warn("[MQ Store] session expired on rehydrate — logging out");
                  useAppStore.getState().logout();
                  return;
                }
                // Session valid — restore user info from server
                const me = await res.json();
                useAppStore.getState().setAuth(me.userId, me.username, me.email, me.role, me.avatar);
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
        };
      },
    }
  )
);
