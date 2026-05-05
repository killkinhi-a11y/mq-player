import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type Track, type Message as ChatMessage } from "@/lib/musicApi";
import { themes, applyThemeToDOM } from "@/lib/themes";

// ── Storage versioning ──
// Bump this number to force a fresh store for all users with old data.
const STORE_VERSION = 6;
const STORAGE_KEY = "mq-store-v6";

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

export type ViewType = "auth" | "main" | "search" | "messenger" | "settings" | "profile" | "playlists" | "public-playlists" | "history" | "stories" | "onboarding" | "spatial" | "friends" | "favorites";

export type Mood = "chill" | "bassy" | "melodic" | "dark" | "upbeat" | "romantic" | "aggressive" | "dreamy";

export interface FavoriteArtist {
  id: number;
  username: string;
  avatar: string;
  genre: string;
  followers: number;
  trackCount: number;
}
export type AuthStep = "login" | "register" | "confirm" | "confirmed" | "forgot-password" | "telegram" | "telegram-register" | "telegram-link";

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
  playCount: number; // how many times this track was played
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
  telegramUsername: string | null;
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
  currentPlaylistId: string | null;
  queue: Track[];
  queueIndex: number;
  upNext: Track[];
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

  // Style
  currentStyle: string;
  styleVariant: string;

  // History
  history: HistoryEntry[];

  // Spatial Audio
  spatialAudioEnabled: boolean;
  spatialMood: Mood | null;
  spatialAutoDetect: boolean;

  // Radio mode — "Моя волна" (Yandex Music style)
  radioMode: boolean;
  radioSeedTrack: Track | null;
  radioSkipCount: number;

  // Smart Shuffle (Spotify style)
  smartShuffle: boolean;

  // Feedback signals (Apple Music / Yandex style)
  trackFeedback: Record<string, { skips: number; completes: number; listenTime: number; totalListenTime: number; lastPlayedAt: number; skipPositions: number[] }>;

  // Feedback batching for server sync
  feedbackBatch: {
    completedGenres: string[];
    skippedGenres: string[];
    completedArtists: string[];
    skippedArtists: string[];
    genreListenTimes: Record<string, number>;
    artistListenTimes: Record<string, number>;
    lastSync: number;
    pendingCount: number;
  };

  // Release Radar state
  releaseRadarTracks: Track[];
  releaseRadarLoading: boolean;

  // Actions
  setAuth: (userId: string, username: string, email: string, role?: string, avatar?: string | null, telegramUsername?: string | null) => void;
  logout: () => void;
  syncToServer: () => Promise<void>;
  syncFromServer: () => Promise<void>;
  scheduleSyncToServer: () => void;
  setView: (view: ViewType) => void;
  setAuthStep: (step: AuthStep) => void;

  // Theme actions
  setTheme: (theme: string) => void;
  setCustomAccent: (color: string | null) => void;
  setAnimationsEnabled: (enabled: boolean) => void;
  setCompactMode: (compact: boolean) => void;
  setFontSize: (size: number) => void;
  setLiquidGlassEnabled: (enabled: boolean) => void;

  // UpNext actions
  addToUpNext: (track: Track) => void;
  addToUpNextMultiple: (tracks: Track[]) => void;
  removeFromUpNext: (index: number) => void;
  moveInUpNext: (fromIndex: number, toIndex: number) => void;
  clearUpNext: () => void;

  // Player actions
  playTrack: (track: Track, queue?: Track[], playlistId?: string | null) => void;
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

  // Favorite artists
  setFavoriteArtists: (artists: FavoriteArtist[]) => void;
  addFavoriteArtist: (artist: FavoriteArtist) => void;
  removeFavoriteArtist: (artistId: number) => void;
  setOnboardingComplete: (complete: boolean) => void;
  saveFavoriteArtistsToServer: () => Promise<void>;
  loadFavoriteArtistsFromServer: () => Promise<void>;

  // Disliked playlist tags (for recommendations filtering)
  dislikedTags: string[];

  // Favorite artists (onboarding + taste profile)
  favoriteArtists: FavoriteArtist[];
  onboardingComplete: boolean;

  // Group chat
  selectedGroupId: string | null;

  // Artist detail view (shared across views)
  selectedArtist: { name: string; avatar?: string; followers?: number; genre?: string; trackCount?: number } | null;
  setSelectedArtist: (artist: { name: string; avatar?: string; followers?: number; genre?: string; trackCount?: number } | null) => void;

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

  // Style action
  setStyle: (styleId: string) => void;
  setStyleVariant: (variant: string) => void;

  // History actions
  addToHistory: (track: Track) => void;
  clearHistory: () => void;

  // Spatial Audio actions
  setSpatialAudioEnabled: (enabled: boolean) => void;
  setSpatialMood: (mood: Mood | null) => void;
  setSpatialAutoDetect: (enabled: boolean) => void;

  // Radio mode actions
  toggleRadioMode: () => void;

  // Smart Shuffle actions
  toggleSmartShuffle: () => void;

  // Feedback actions
  recordSkip: (trackId: string, progressAtSkip?: number) => void;
  recordComplete: (trackId: string, listenTime: number) => void;
  syncFeedbackToServer: () => Promise<void>;

  // Release Radar actions
  fetchReleaseRadar: () => Promise<void>;

  // Taste Profile
  tasteGenres: Record<string, number>;
  tasteArtists: Record<string, number>;
  tasteMoods: Record<string, number>;
  excludedArtists: string[];
  setTasteGenre: (genre: string, level: number) => void;
  setTasteArtist: (artist: string, level: number) => void;
  setTasteMood: (mood: string, level: number) => void;
  toggleExcludedArtist: (artist: string) => void;
  resetTasteProfile: () => void;

  // Cat mascot
  catEnabled: boolean;
  catFrequency: "rare" | "normal" | "often";
  catMood: "chill" | "dreamy" | "panic" | "lazy";
  catSize: "small" | "medium" | "large";
  catLastSeen: number;
  catPetCount: number;
  setCatEnabled: (enabled: boolean) => void;
  setCatFrequency: (freq: "rare" | "normal" | "often") => void;
  setCatMood: (mood: "chill" | "dreamy" | "panic" | "lazy") => void;
  setCatSize: (size: "small" | "medium" | "large") => void;
  petCat: () => void;

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
  telegramUsername: null as string | null,
  avatar: null as string | null,
  currentView: "auth" as ViewType,
  authStep: "telegram" as AuthStep,
  currentTheme: "default",
  customAccent: null as string | null,
  animationsEnabled: true,
  compactMode: false,
  fontSize: 16,
  liquidGlassEnabled: false,
  currentTrack: null as Track | null,
  currentPlaylistId: null as string | null,
  queue: [] as Track[],
  queueIndex: 0,
  upNext: [] as Track[],
  isPlaying: false,
  volume: 30,
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
  favoriteArtists: [] as FavoriteArtist[],
  onboardingComplete: false as boolean,
  selectedGroupId: null as string | null,
  selectedArtist: null as { name: string; avatar?: string; followers?: number; genre?: string; trackCount?: number } | null,

  // Collaborative listening
  listenSession: null as any,

  // Spatial Audio
  spatialAudioEnabled: false,
  spatialMood: null as Mood | null,
  spatialAutoDetect: true,

  // Radio mode
  radioMode: false,
  radioSeedTrack: null as Track | null,
  radioSkipCount: 0,

  // Smart Shuffle
  smartShuffle: true,

  // Feedback signals
  trackFeedback: {} as Record<string, { skips: number; completes: number; listenTime: number; totalListenTime: number; lastPlayedAt: number; skipPositions: number[] }>,

  // Feedback batching for server sync
  feedbackBatch: {
    completedGenres: [] as string[],
    skippedGenres: [] as string[],
    completedArtists: [] as string[],
    skippedArtists: [] as string[],
    genreListenTimes: {} as Record<string, number>,
    artistListenTimes: {} as Record<string, number>,
    lastSync: 0,
    pendingCount: 0,
  },

  // Release Radar
  releaseRadarTracks: [] as Track[],
  releaseRadarLoading: false,

  // Style
  currentStyle: "",
  styleVariant: "dark" as string,

  // Taste Profile
  tasteGenres: {} as Record<string, number>,
  tasteArtists: {} as Record<string, number>,
  tasteMoods: {} as Record<string, number>,
  excludedArtists: [] as string[],

  // Cat mascot
  catEnabled: false as boolean,
  catFrequency: "normal" as "rare" | "normal" | "often",
  catMood: "chill" as "chill" | "dreamy" | "panic" | "lazy",
  catSize: "medium" as "small" | "medium" | "large",
  catLastSeen: 0 as number,
  catPetCount: 0 as number,
};

// Simple energy estimation for smart shuffle
function estimateTrackEnergy(track: Track): number {
  if (!track) return 0.5;
  const title = (track.title || "").toLowerCase();
  const genre = (track.genre || "").toLowerCase();
  const dur = track.duration || 0;

  const highKw = ["remix", "edit", "mix", "club", "bass boosted", "extended", "hard", "banger", "drop", "festival", "rave", "workout", "bootleg"];
  const lowKw = ["acoustic", "live", "unplugged", "piano", "ambient", "sleep", "meditation", "relax", "chill", "lo-fi", "lofi", "slow", "ballad"];

  let s = 0;
  if (highKw.some(kw => title.includes(kw))) s += 1;
  if (lowKw.some(kw => title.includes(kw))) s -= 1;

  const highG = ["edm", "techno", "dubstep", "drum and bass", "hardstyle", "trap", "reggaeton", "dance pop", "trance", "drill"];
  const lowG = ["ambient", "classical", "lo-fi", "lofi", "piano", "bossa nova", "downtempo", "jazz", "blues"];

  if (highG.some(g => genre.includes(g))) s += 2;
  else if (lowG.some(g => genre.includes(g))) s -= 2;
  if (dur > 0) { if (dur < 150) s += 1; else if (dur > 360) s -= 1; }

  if (s >= 2) return 1;
  if (s <= -2) return 0;
  if (s >= 1) return 0.75;
  if (s <= -1) return 0.25;
  return 0.5;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setAuth: (userId, username, email, role, avatar, telegramUsername) => {
        set({ isAuthenticated: true, userId, username, email, telegramUsername: telegramUsername || null, userRole: role || "user", avatar: avatar || null, currentView: "main" });
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
          // Load favorite artists and check onboarding
          get().loadFavoriteArtistsFromServer().then(() => {
            const state = useAppStore.getState();
            if (!state.onboardingComplete) {
              set({ currentView: "onboarding" });
            }
          });
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

      // ── UpNext actions ──
      addToUpNext: (track) => set((s) => ({ upNext: [...s.upNext, track] })),

      addToUpNextMultiple: (tracks) => set((s) => ({ upNext: [...s.upNext, ...tracks] })),

      removeFromUpNext: (index) => set((s) => ({
        upNext: s.upNext.filter((_, i) => i !== index),
      })),

      moveInUpNext: (fromIndex, toIndex) => set((s) => {
        const updated = [...s.upNext];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        return { upNext: updated };
      }),

      clearUpNext: () => set({ upNext: [] as Track[] }),

      playTrack: (track, queue, playlistId) => {
        const state = get();
        const newQueue = queue || state.queue;
        const index = newQueue.findIndex((t) => t.id === track.id);
        set({
          currentTrack: track,
          currentPlaylistId: playlistId ?? (queue ? state.currentPlaylistId : null),
          queue: newQueue,
          queueIndex: index >= 0 ? index : 0,
          isPlaying: true,
          progress: 0,
          duration: track.duration,
          // Clear upNext when a new queue is explicitly set
          ...(queue ? { upNext: [] as Track[] } : {}),
        });
        // Auto-add to history
        get().addToHistory(track);
      },

      togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

      setVolume: (volume) => set({ volume: Math.round(volume) }),

      setProgress: (progress) => set({ progress }),

      setDuration: (duration) => set({ duration }),

      nextTrack: () => {
        const { queue, queueIndex, shuffle, repeat, upNext, currentTrack, smartShuffle, radioMode } = get();

        // ── UpNext priority: play from upNext first (FIFO) ──
        if (upNext.length > 0) {
          const [next, ...remaining] = upNext;
          const newQueue = [next, ...remaining, ...queue];
          set({
            currentTrack: next,
            queue: newQueue,
            queueIndex: 0,
            upNext: [],
            progress: 0,
            duration: next.duration,
            isPlaying: true,
          });
          get().addToHistory(next);
          return;
        }

        let nextIdx: number;
        if (shuffle) {
          if (queue.length <= 1) { nextIdx = 0; }
          else if (smartShuffle && currentTrack) {
            // Smart Shuffle: score each candidate by transition smoothness + likes/dislikes
            const currentEnergy = estimateTrackEnergy(currentTrack);
            const currentGenre = (currentTrack.genre || "").toLowerCase();
            const st = get();

            let bestIdx = -1;
            let bestScore = -Infinity;

            const candidates = Array.from({ length: Math.min(queue.length, 20) }, () =>
              Math.floor(Math.random() * queue.length)
            ).filter(i => i !== queueIndex);

            // Pre-compute disliked/liked artists and genres for performance
            const dislikedArtistsSet = new Set(st.dislikedTracksData.map(t => t.artist.toLowerCase()));
            const dislikedGenresSet = new Set(st.dislikedTracksData.map(t => (t.genre || "").toLowerCase()).filter(Boolean));
            const likedArtistsSet = new Set(st.likedTracksData.map(t => t.artist.toLowerCase()));

            for (const candidateIdx of candidates) {
              const candidate = queue[candidateIdx];
              if (!candidate) continue;

              let score = Math.random() * 10; // base randomness

              // ── Likes/Dislikes signals (strongest factor) ──
              if (st.likedTrackIds.includes(candidate.id)) score += 25;
              if (st.dislikedTrackIds.includes(candidate.id)) score -= 50;
              if (dislikedArtistsSet.has((candidate.artist || "").toLowerCase())) score -= 30;
              if (candidate.genre && dislikedGenresSet.has(candidate.genre.toLowerCase())) score -= 20;
              if (likedArtistsSet.has((candidate.artist || "").toLowerCase())) score += 15;

              // Energy transition penalty (smooth transitions)
              const candidateEnergy = estimateTrackEnergy(candidate);
              const energyDiff = Math.abs(candidateEnergy - currentEnergy);
              score -= energyDiff * 20;

              // Same artist penalty (but not as harsh — allow occasionally)
              if (candidate.artist === currentTrack.artist) score -= 15;

              // Genre match bonus
              if (candidate.genre && currentGenre &&
                  candidate.genre.toLowerCase() === currentGenre) score += 5;

              if (score > bestScore) {
                bestScore = score;
                bestIdx = candidateIdx;
              }
            }

            nextIdx = bestIdx >= 0 ? bestIdx : Math.floor(Math.random() * queue.length);
          } else {
            // Original random shuffle as fallback
            const currentArtist = currentTrack?.artist;
            if (queue.length <= 1) { nextIdx = 0; }
            else {
              nextIdx = queueIndex;
              for (let attempt = 0; attempt < 10; attempt++) {
                const candidate = Math.floor(Math.random() * queue.length);
                if (candidate !== queueIndex) {
                  if (!currentArtist || queue[candidate]?.artist !== currentArtist) {
                    nextIdx = candidate; break;
                  }
                }
              }
              if (nextIdx === queueIndex) {
                do { nextIdx = Math.floor(Math.random() * queue.length); } while (nextIdx === queueIndex);
              }
            }
          }
        } else {
          nextIdx = queueIndex + 1;
          if (nextIdx >= queue.length) {
            if (repeat === "all") nextIdx = 0;
            // Radio mode — "Моя волна" (Яндекс Music style): auto-fill queue via radio API
            else if (radioMode) {
              const currentT = get().currentTrack;
              const st = get();
              if (currentT?.scTrackId) {
                // Build history of recently played SC IDs for the radio API
                const recentHistory = st.history.slice(0, 5).map(h => h.track.scTrackId).filter((id): id is number => !!id).join(",");
                // Build skipped genres/artists from feedback data
                const fb = st.trackFeedback;
                const skippedIds = Object.entries(fb)
                  .filter(([, v]) => v.skips > v.completes && v.skips >= 2)
                  .map(([id]) => id);
                const skippedArtists = skippedIds.map(id => {
                  const entry = st.history.find(h => h.track.id === id);
                  return entry?.track.artist;
                }).filter(Boolean).slice(0, 5).join(",");

                // ── Include disliked artists from likes/dislikes (user's explicit preference) ──
                const dislikedArtistsFromLikes = st.dislikedTracksData
                  .map(t => t.artist)
                  .filter(Boolean)
                  .slice(0, 10);
                // Combine feedback-skipped + disliked into one list
                const allSkippedArtists = [...new Set([
                  ...skippedArtists.split(",").filter(Boolean),
                  ...dislikedArtistsFromLikes,
                ])].join(",");

                // ── Include disliked genres from likes/dislikes ──
                const dislikedGenresFromLikes = st.dislikedTracksData
                  .map(t => t.genre)
                  .filter(Boolean)
                  .slice(0, 5);
                const skippedGenresParam = st.feedbackBatch.skippedGenres.length > 0
                  ? [...new Set([...st.feedbackBatch.skippedGenres, ...dislikedGenresFromLikes])].join(",")
                  : dislikedGenresFromLikes.join(",");
                
                // ── Include liked artists as positive signals ──
                const likedArtistsFromLikes = st.likedTracksData
                  .map(t => t.artist)
                  .filter(Boolean)
                  .slice(0, 5);

                // ── Include liked genres as positive signals ──
                const likedGenresFromLikes = st.likedTracksData
                  .map(t => t.genre)
                  .filter(Boolean)
                  .slice(0, 5);
                // Also extract genres from history for better signal
                const historyGenres = st.history.slice(0, 30)
                  .map(h => h.track.genre)
                  .filter(Boolean);
                const genreCount: Record<string, number> = {};
                for (const g of historyGenres) genreCount[g] = (genreCount[g] || 0) + 1;
                const topHistoryGenres = Object.entries(genreCount)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([g]) => g);
                const allLikedGenres = [...new Set([...likedGenresFromLikes, ...topHistoryGenres])].join(",");
                
                const params = new URLSearchParams();
                params.set("scTrackId", String(currentT.scTrackId));
                if (recentHistory) params.set("historyScIds", recentHistory);
                if (allSkippedArtists) params.set("skippedArtists", allSkippedArtists);
                if (skippedGenresParam) params.set("skippedGenres", skippedGenresParam);
                if (likedArtistsFromLikes.length > 0) params.set("likedArtists", likedArtistsFromLikes.join(","));
                if (allLikedGenres) params.set("likedGenres", allLikedGenres);
                
                // Detect language from history
                const langCounts: Record<string, number> = { russian: 0, english: 0 };
                for (const h of st.history.slice(0, 20)) {
                  const text = `${h.track.title || ""} ${h.track.artist || ""}`;
                  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
                  const latin = (text.match(/[a-zA-Z]/g) || []).length;
                  if (cyrillic / (cyrillic + latin + 1) > 0.4) langCounts.russian++;
                  else if (latin / (cyrillic + latin + 1) > 0.6) langCounts.english++;
                }
                const topLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
                if (topLang[0]?.[1] > 5) params.set("lang", topLang[0][0]);

                fetch(`/api/music/radio?${params}`)
                  .then(res => res.ok ? res.json() : null)
                  .then(data => {
                    if (!data || !data.tracks || data.tracks.length === 0) return;
                    const newTracks = data.tracks.slice(0, 12);
                    const state = get();
                    const existingIds = new Set(state.queue.map(t => t.id));
                    const fresh = newTracks.filter(t => !existingIds.has(t.id));
                    if (fresh.length === 0) return;
                    set({ queue: [...state.queue, ...fresh] });
                  })
                  .catch(() => {});
              }
              // Wrap to start while new tracks load
              nextIdx = 0;
            } else {
              set({ isPlaying: false }); return;
            }
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
        const { userId, likedTracksData, history, dislikedTags, dislikedTracksData } = get();
        set({ recommendedPlaylistsLoading: true });

        // Build taste profile from store if not provided
        let tags = likedTags;
        let artists = likedArtists;
        const genreCount: Record<string, number> = {};
        const artistCount: Record<string, number> = {};
        if (tags.length === 0 && artists.length === 0) {
          const allTracks = [...likedTracksData, ...history.slice(0, 50).map((h) => h.track)];
          for (const t of allTracks) {
            if (t.genre) genreCount[t.genre] = (genreCount[t.genre] || 0) + 2;
            if (t.artist) artistCount[t.artist] = (artistCount[t.artist] || 0) + 1;
          }
          tags = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
          artists = Object.entries(artistCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a);
        }

        // Build disliked genres from disliked tracks
        const dislikedGenresSet = new Set<string>();
        for (const track of (dislikedTracksData || [])) {
          if (track.genre) dislikedGenresSet.add(track.genre.toLowerCase());
        }

        // Detect language preference
        const langCounts: Record<string, number> = { russian: 0, english: 0, latin: 0 };
        function detectLang(text: string): string {
          if (!text) return "other";
          const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
          const latin = (text.match(/[a-zA-Z]/g) || []).length;
          const total = cyrillic + latin;
          if (total === 0) return "other";
          if (cyrillic / total > 0.4) return "russian";
          if (latin / total > 0.6) return "english";
          return "latin";
        }
        for (const t of likedTracksData) {
          const l = detectLang(`${t.title} ${t.artist}`);
          if (l in langCounts) langCounts[l] += 3;
        }
        for (const h of history.slice(0, 30)) {
          const l = detectLang(`${h.track.title} ${h.track.artist}`);
          if (l in langCounts) langCounts[l] += 1;
        }
        const sortedLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
        const totalLang = sortedLang.reduce((s, e) => s + e[1], 0);
        const languagePref = totalLang > 0 && sortedLang[0][1] >= totalLang * 0.4 ? sortedLang[0][0] : "mixed";

        try {
          const sp = new URLSearchParams({ limit: '10' });
          if (tags.length > 0) sp.set('likedTags', tags.join(','));
          if (artists.length > 0) sp.set('likedArtists', artists.join(','));
          if (dislikedTags.length > 0) sp.set('dislikedTags', dislikedTags.join(','));
          // v4: send richer signals
          if (tags.length > 0) sp.set('topGenres', tags.join(','));
          if (dislikedGenresSet.size > 0) sp.set('dislikedGenres', [...dislikedGenresSet].join(','));
          if (languagePref !== 'mixed') sp.set('lang', languagePref);
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

      // ── Favorite artists ──
      setFavoriteArtists: (artists) => set({ favoriteArtists: artists }),
      addFavoriteArtist: (artist) => {
        set((s) => {
          if (s.favoriteArtists.some(a => a.id === artist.id)) return s;
          return { favoriteArtists: [...s.favoriteArtists, artist] };
        });
        get().saveFavoriteArtistsToServer();
      },

      // ── Artist detail view ──
      setSelectedArtist: (artist) => {
        set({ selectedArtist: artist });
        // Auto-switch to main view where artist detail is rendered
        if (artist) {
          get().setView("main");
        }
      },
      removeFavoriteArtist: (artistId) => {
        set((s) => ({
          favoriteArtists: s.favoriteArtists.filter(a => a.id !== artistId),
        }));
        get().saveFavoriteArtistsToServer();
      },
      setOnboardingComplete: (complete) => set({ onboardingComplete: complete }),
      saveFavoriteArtistsToServer: async () => {
        const { userId, favoriteArtists } = get();
        if (!userId) return;
        try {
          await fetch('/api/user/favorite-artists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ artists: favoriteArtists }),
          });
        } catch {}
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
        } catch {}
      },

      // ── Liquid Glass Mobile ──
      setLiquidGlassMobile: (enabled) => set({ liquidGlassMobile: enabled }),

      // ── Style ──
      setStyle: (styleId) => {
        set({ currentStyle: styleId });
        // Apply/remove data-style attribute on document
        if (typeof document !== "undefined") {
          if (styleId) {
            document.documentElement.setAttribute("data-style", styleId);
          } else {
            document.documentElement.removeAttribute("data-style");
            // Also clear variant when style is deactivated
            document.documentElement.removeAttribute("data-style-variant");
          }
        }
        // Persist to localStorage
        try {
          if (styleId) {
            localStorage.setItem("mq-style", styleId);
          } else {
            localStorage.removeItem("mq-style");
 }
        } catch {}
      },

      // ── Style Variant (Light/Dark) ──
      setStyleVariant: (styleVariant) => {
        set({ styleVariant });
        if (typeof document !== "undefined") {
          if (styleVariant) {
            document.documentElement.setAttribute("data-style-variant", styleVariant);
          } else {
            document.documentElement.removeAttribute("data-style-variant");
          }
        }
        try {
          if (styleVariant) {
            localStorage.setItem("mq-style-variant", styleVariant);
          } else {
            localStorage.removeItem("mq-style-variant");
          }
        } catch {}
      },

      // ── History actions ──
      addToHistory: (track) => {
        set((s) => {
          // Check if track already in history — increment playCount
          const existing = s.history.find((h) => h.track.id === track.id);
          if (existing) {
            // Move to front with incremented playCount
            const filtered = s.history.filter((h) => h.track.id !== track.id);
            return {
              history: [{ track, playedAt: Date.now(), playCount: (existing.playCount || 0) + 1 }, ...filtered].slice(0, 200),
            };
          }
          // New entry
          return {
            history: [{ track, playedAt: Date.now(), playCount: 1 }, ...s.history].slice(0, 200),
          };
        });
        // Debounced sync to server
        get().scheduleSyncToServer();
      },

      clearHistory: () => set({ history: [] }),

      // ── Spatial Audio actions ──
      setSpatialAudioEnabled: (enabled) => set({ spatialAudioEnabled: enabled }),
      setSpatialMood: (mood) => set({ spatialMood: mood }),
      setSpatialAutoDetect: (enabled) => set({ spatialAutoDetect: enabled }),

      // ── Radio mode actions ──
      toggleRadioMode: () => {
        const { currentTrack, radioMode } = get();
        if (radioMode) {
          // Stop radio
          set({ radioMode: false, radioSeedTrack: null, radioSkipCount: 0 });
        } else if (currentTrack) {
          // Start radio from current track
          set({ radioMode: true, radioSeedTrack: currentTrack, radioSkipCount: 0 });
        }
      },

      // ── Smart Shuffle actions ──
      toggleSmartShuffle: () => set((s) => ({ smartShuffle: !s.smartShuffle })),

      // ── Feedback actions ──
      recordSkip: (trackId: string, progressAtSkip?: number) => {
        set((s) => {
          const fb = { ...s.trackFeedback };
          const existing = fb[trackId] || { skips: 0, completes: 0, listenTime: 0, totalListenTime: 0, lastPlayedAt: 0, skipPositions: [] };
          const skipPos = typeof progressAtSkip === "number" ? progressAtSkip : 0;
          const skipPositions = [...(existing.skipPositions || []), skipPos].slice(-10);
          fb[trackId] = { ...existing, skips: existing.skips + 1, lastPlayedAt: Date.now(), skipPositions };

          // Accumulate for server sync
          const batch = { ...s.feedbackBatch };
          const historyEntry = s.history.find(h => h.track.id === trackId);
          const likedEntry = s.likedTracksData.find(t => t.id === trackId);
          const trackData = historyEntry?.track || likedEntry;
          const skipGenre = (trackData?.genre || "").toLowerCase().trim();
          const skipArtist = (trackData?.artist || "").toLowerCase().trim();
          if (skipGenre) {
            batch.skippedGenres = [...batch.skippedGenres, skipGenre];
          }
          if (skipArtist) {
            batch.skippedArtists = [...batch.skippedArtists, skipArtist];
          }
          batch.pendingCount++;

          return { trackFeedback: fb, radioSkipCount: s.radioMode ? s.radioSkipCount + 1 : 0, feedbackBatch: batch };
        });

        // Auto-sync when batch reaches 10 pending items
        const st = get();
        if (st.feedbackBatch.pendingCount >= 10) {
          get().syncFeedbackToServer();
        }
      },

      recordComplete: (trackId: string, listenTime: number) => {
        set((s) => {
          const fb = { ...s.trackFeedback };
          const existing = fb[trackId] || { skips: 0, completes: 0, listenTime: 0, totalListenTime: 0, lastPlayedAt: 0, skipPositions: [] };
          fb[trackId] = {
            ...existing,
            completes: existing.completes + 1,
            listenTime,
            totalListenTime: (existing.totalListenTime || 0) + listenTime,
            lastPlayedAt: Date.now(),
          };

          // Accumulate for server sync
          const batch = { ...s.feedbackBatch };
          const historyEntry = s.history.find(h => h.track.id === trackId);
          const likedEntry = s.likedTracksData.find(t => t.id === trackId);
          const trackData = historyEntry?.track || likedEntry;
          const completeGenre = (trackData?.genre || "").toLowerCase().trim();
          const completeArtist = (trackData?.artist || "").toLowerCase().trim();
          if (completeGenre) {
            batch.completedGenres = [...batch.completedGenres, completeGenre];
            batch.genreListenTimes = { ...batch.genreListenTimes, [completeGenre]: (batch.genreListenTimes[completeGenre] || 0) + listenTime };
          }
          if (completeArtist) {
            batch.completedArtists = [...batch.completedArtists, completeArtist];
            batch.artistListenTimes = { ...batch.artistListenTimes, [completeArtist]: (batch.artistListenTimes[completeArtist] || 0) + listenTime };
          }
          batch.pendingCount++;

          return { trackFeedback: fb, feedbackBatch: batch };
        });

        // Auto-sync when batch reaches 10 pending items
        const st = get();
        if (st.feedbackBatch.pendingCount >= 10) {
          get().syncFeedbackToServer();
        }
      },

      syncFeedbackToServer: async () => {
        const st = get();
        if (st.feedbackBatch.pendingCount === 0) return;
        if (Date.now() - st.feedbackBatch.lastSync < 30000) return; // 30s debounce

        try {
          let anonId = '';
          if (typeof window !== 'undefined') {
            anonId = localStorage.getItem('mq_anon_id') || '';
            if (!anonId) {
              anonId = crypto.randomUUID();
              localStorage.setItem('mq_anon_id', anonId);
            }
          }

          const res = await fetch('/api/music/recommendations/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              anonId,
              ...st.feedbackBatch,
            }),
          });

          if (res.ok) {
            set({
              feedbackBatch: {
                completedGenres: [],
                skippedGenres: [],
                completedArtists: [],
                skippedArtists: [],
                genreListenTimes: {},
                artistListenTimes: {},
                lastSync: Date.now(),
                pendingCount: 0,
              },
            });
          }
        } catch (e) {
          console.error('[feedback] Sync failed:', e);
        }
      },

      // ── Release Radar actions ──
      fetchReleaseRadar: async () => {
        const { likedTracksData } = get();
        set({ releaseRadarLoading: true });
        try {
          // Extract top artists from liked tracks
          const artistCounts: Record<string, number> = {};
          for (const t of likedTracksData) {
            if (t.artist) artistCounts[t.artist] = (artistCounts[t.artist] || 0) + 1;
          }
          const topArtists = Object.entries(artistCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([a]) => a);

          if (topArtists.length === 0) {
            set({ releaseRadarTracks: [], releaseRadarLoading: false });
            return;
          }

          // Search for recent tracks from top artists
          const allTracks: Track[] = [];
          const seen = new Set<string>();

          for (const artist of topArtists.slice(0, 3)) {
            try {
              const res = await fetch(`/api/music/search?q=${encodeURIComponent(artist + " 2025 2026")}&limit=10`);
              if (res.ok) {
                const data = await res.json();
                const tracks: Track[] = data.tracks || [];
                for (const t of tracks) {
                  if (!seen.has(t.id)) {
                    seen.add(t.id);
                    allTracks.push(t);
                  }
                }
              }
            } catch {}
          }

          set({ releaseRadarTracks: allTracks.slice(0, 20), releaseRadarLoading: false });
        } catch {
          set({ releaseRadarTracks: [], releaseRadarLoading: false });
        }
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

      // ── Collaborative listening actions ──
      setListenSession: (session) => set({ listenSession: session }),
      clearListenSession: () => set({ listenSession: null }),

      // ── Taste Profile actions ──
      setTasteGenre: (genre, level) => set((s) => {
        const newGenres = { ...s.tasteGenres, [genre]: level };
        // Sync with dislikedTags
        const currentDisliked = s.dislikedTags.filter(g => g.toLowerCase() !== genre.toLowerCase());
        if (level < 10 && !currentDisliked.includes(genre)) {
          currentDisliked.push(genre);
        }
        if (level > 70) {
          const idx = currentDisliked.findIndex(g => g.toLowerCase() === genre.toLowerCase());
          if (idx >= 0) currentDisliked.splice(idx, 1);
        }
        return { tasteGenres: newGenres, dislikedTags: currentDisliked };
      }),
      setTasteArtist: (artist, level) => set((s) => ({ tasteArtists: { ...s.tasteArtists, [artist]: level } })),
      setTasteMood: (mood, level) => set((s) => ({ tasteMoods: { ...s.tasteMoods, [mood]: level } })),
      toggleExcludedArtist: (artist) => set((s) => {
        const isExcluded = s.excludedArtists.includes(artist);
        return {
          excludedArtists: isExcluded
            ? s.excludedArtists.filter(a => a !== artist)
            : [...s.excludedArtists, artist],
          tasteArtists: { ...s.tasteArtists, [artist]: isExcluded ? 50 : 0 },
        };
      }),
      resetTasteProfile: () => set({ tasteGenres: {}, tasteArtists: {}, tasteMoods: {}, excludedArtists: [] }),

      // ── Cat mascot actions ──
      setCatEnabled: (enabled) => set({ catEnabled: enabled }),
      setCatFrequency: (freq) => set({ catFrequency: freq }),
      setCatMood: (mood) => set({ catMood: mood }),
      setCatSize: (size) => set({ catSize: size }),
      petCat: () => set((s) => ({ catPetCount: s.catPetCount + 1, catLastSeen: Date.now() })),

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
        favoriteArtists: state.favoriteArtists,
        onboardingComplete: state.onboardingComplete,
        playlists: state.playlists,
        history: state.history,
        trackFeedback: state.trackFeedback,
        feedbackBatch: state.feedbackBatch,
        liquidGlassMobile: state.liquidGlassMobile,
        currentStyle: state.currentStyle,
        shuffle: state.shuffle,
        repeat: state.repeat,
        // Cat mascot settings
        catEnabled: state.catEnabled,
        catFrequency: state.catFrequency,
        catMood: state.catMood,
        catSize: state.catSize,
        catLastSeen: state.catLastSeen,
        catPetCount: state.catPetCount,
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
          if (!Array.isArray(s.favoriteArtists)) fixes.favoriteArtists = [];
          if (typeof s.onboardingComplete !== "boolean") fixes.onboardingComplete = false;
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
                useAppStore.getState().setAuth(me.userId, me.username, me.email, me.role, me.avatar, me.telegramUsername);
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
          if (typeof window !== "undefined") {
            setInterval(() => {
              const currentState = useAppStore.getState();
              if (currentState.feedbackBatch.pendingCount > 0) {
                currentState.syncFeedbackToServer();
              }
            }, 60000);
          }
        };
      },
    }
  )
);
