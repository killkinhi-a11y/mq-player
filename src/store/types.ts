// Store types (moved verbatim from useAppStore.ts in Stage III).
import type { CatalogAlbumDTO } from "@/lib/spotify/types";
import type { CatalogTrackInput, ResolveCandidate } from "@/lib/playback/client";
import type { Message as ChatMessage, Track } from "@/lib/musicApi";
import type { SkipEventV3, SkipProfile } from "@/lib/listening/skipIntelligence";
import type { StateCreator } from "zustand";

// NOTE: PlaybackEngine + usePlaybackEngine were deleted in M3 (dead code —
// useAudioEngine is the active engine, syncWithPlaybackEngine was disabled
// in AppShell since 2025-Q2).
// PlaybackState type was originally exported from playbackEngine.ts.
// We redefine it inline here for backwards-compat with the persisted
// store shape. Values actually used by useAudioEngine: 'idle' | 'buffering'
// | 'playing' | 'paused'. The other variants from the original enum
// ('loading', 'error', 'ended') are kept for forwards-compat in case
// future code adds them.
export type PlaybackState = "idle" | "buffering" | "loading" | "playing" | "paused" | "error" | "ended";

export type ViewType = "auth" | "main" | "search" | "messenger" | "settings" | "profile" | "playlists" | "public-playlists" | "history" | "stories" | "onboarding" | "spatial" | "friends" | "favorites" | "sleepTimer" | "library";

export type Mood = "chill" | "bassy" | "melodic" | "dark" | "upbeat" | "romantic" | "aggressive" | "dreamy";

export interface FavoriteArtist {
  id: number;
  username: string;
  avatar: string;
  genre: string;
  followers: number;
  trackCount: number;
}

export type AuthStep = "login" | "register" | "confirm" | "confirmed" | "forgot-password" | "telegram" | "telegram-register" | "telegram-link" | "telegram-widget-register";

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
  /** Editorial marker — the app's own curated feed selections (no real
   *  DB playlist behind them). Only used by the Home recommendations
   *  deep-link so the existing public-playlist detail screen can hide
   *  author/social fields that don't exist for editorial picks. */
  editorial?: boolean;
}

export interface HistoryEntry {
  track: Track;
  playedAt: number;
  playCount: number; // how many times this track was played
}

export interface SelectedPlaylist {
  id: string;
}

// ── Home feed cache types (Task 2: stop repeated reloads) ──
export interface HomeRecCategory {
  id: string;
  title: string;
  icon: string;
  tracks: Track[];
}

export interface HomeCuratedPlaylist {
  id: string;
  name: string;
  subtitle: string;
  gradient: string;
  tracks: Track[];
}

export interface AppState {
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
  reduceMotion: boolean; // P5.1: master kill switch — overrides animationsEnabled when true
  compactMode: boolean;
  fontSize: number;
  liquidGlassEnabled: boolean;
  /** v8 Full Player Themes: which Full Player UI opens on isFullTrackViewOpen.
   *  "classic" (default) = existing FullTrackView / FullTrackViewMobile;
   *  "spatial" = new SpatialFullPlayer (reference depth-carousel mode).
   *  Local-only preference (persisted via partialize; NOT synced to server —
   *  no backend schema needed). Switching must never touch playback state. */
  fullPlayerMode: "classic" | "spatial";
  /** v9 Spatial Player polish: which side of the carousel the floating
   *  Like/Dislike/More action rail lives on. "left" (default) mirrors the
   *  reference. Local-only preference (persisted via partialize; NOT synced
   *  to server). Switching must never touch playback/track/queue state. */
  spatialActionsPosition: "left" | "right";

  // ── v11 Player extension: lyrics appearance + waveform prefs ──
  /** Local-only (like fullPlayerMode). Custom lyrics font internal family
   *  ("" = MQ default; "MQFont_<id>" = user-uploaded font). */
  lyricsFontFamily: string;
  /** Lyrics font size px (0 = auto per variant). */
  lyricsFontSize: number;
  /** Lyrics font weight (0 = auto; else 300..900 — applies to ALL lines). */
  lyricsFontWeight: number;
  /** Lyrics line-height multiplier (0 = auto; else 1.0..2.4). */
  lyricsLineHeight: number;
  /** Lyrics letter-spacing em (0 = auto; else -0.05..0.2). */
  lyricsLetterSpacing: number;
  /** Animated (water-fill karaoke) lyrics — false = static active highlight
   *  (accessibility: a way to disable animated lyrics, spec §11). */
  lyricsAnimated: boolean;
  /** Waveform visualization in full players (spec §5). */
  waveformEnabled: boolean;

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
  /** "soundcloud" = element/WASM engine (SoundCloud/Audius/local);
   *  "idle" = nothing loaded. Free playback mode: every catalog track
   *  (Spotify/Deezer metadata) resolves through the PlaybackResolver —
   *  no official SDK mode exists (2026-10-11 direction change). */
  playbackMode: "soundcloud" | "idle";
  playbackState: PlaybackState;
  isBuffering: boolean;
  isDragging: boolean;

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

  // Library search + sort (functional filtering within library tabs)
  librarySearchQuery: string;
  librarySort: "recent" | "title" | "artist";
  setLibrarySearchQuery: (q: string) => void;
  setLibrarySort: (mode: "recent" | "title" | "artist") => void;

  // Full-screen track view
  isFullTrackViewOpen: boolean;

  // Equalizer modal
  isEqOpen: boolean;

  // Keyboard shortcuts help modal (M4.2)
  shortcutsHelpOpen: boolean;

  // Likes/Dislikes
  likedTrackIds: string[];
  dislikedTrackIds: string[];
  likedTracksData: Track[];
  dislikedTracksData: Track[];
  /** Tracks that failed to play (404, CORS, network). Skipped by nextTrack. */
  brokenTrackIds: Set<string>;
  /** Prevents race condition when playTrack is called while previous load is in progress. */
  _playLock: boolean;

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

  // Crossfade
  crossfadeEnabled: boolean;
  crossfadeDuration: number;

  // Gapless playback
  gaplessEnabled: boolean;

  // Rust/WASM audio engine (progressive non-DRM tracks; falls back to the
  // element path automatically on any failure — see src/lib/wasm-audio)
  wasmEngineEnabled: boolean;

  // ReplayGain (M5.1) — normalizes perceived loudness across tracks
  replayGainEnabled: boolean;

  // Cobalt SNIP bypass (no subscription required)
  _cobaltJwt: string | null;
  _cobaltJwtExpiry: number | null;

  // Radio mode — "Моя волна" (Yandex Music style)
  radioMode: boolean;
  radioSeedTrack: Track | null;
  radioSkipCount: number;

  // ── MQ Wave v1 — personalized radio engine state (lib/wave) ──
  // Logical wave session + queue, SEPARATE from the user's playback queue
  // (§12: user queue / upNext always has priority). Ephemeral — never
  // persisted (same policy as radioMode).
  waveSession: import("@/lib/wave").WaveSessionState | null;
  waveQueue: import("@/lib/wave").WaveQueueItem<Track>[];
  waveMemory: import("@/lib/wave").WaveMemory;
  waveSessionEvents: import("@/lib/wave").WaveEvent[];
  waveLoading: boolean;
  waveError: string | null;

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

  // ── Home feed cache (Task 2: survive view remounts, TTL + taste signature) ──
  // In-memory only (NOT persisted): a refresh may refetch once — that is
  // honest fresh data — but navigation/remount/refocus must NOT refetch.
  homeRecCategories: HomeRecCategory[];
  homeCuratedPlaylists: HomeCuratedPlaylist[];
  homeFeedLoading: boolean;
  homeFeedError: "offline" | "api" | "empty" | null;
  homeFeedFetchedAt: number;
  homeFeedTasteSig: string;
  loadHomeFeed: (opts: { force?: boolean; tasteSig: string; topGenres: string[]; topArtists: string[] }) => Promise<void>;

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
  setReduceMotion: (enabled: boolean) => void;
  /** v8 Full Player Themes — pure UI preference write; must not touch
   *  currentTrack/queue/queueIndex/progress/volume/EQ/lyrics state. */
  setFullPlayerMode: (mode: "classic" | "spatial") => void;
  /** v9 — pure UI preference write; must not touch currentTrack/queue/
   *  queueIndex/progress/volume/lyrics state (pinned by tests). */
  setSpatialActionsPosition: (position: "left" | "right") => void;

  // ── v11 Player extension: lyrics appearance + waveform ──
  setLyricsFontFamily: (family: string) => void;
  setLyricsFontSize: (size: number) => void;
  setLyricsFontWeight: (weight: number) => void;
  setLyricsLineHeight: (lh: number) => void;
  setLyricsLetterSpacing: (ls: number) => void;
  setLyricsAnimated: (animated: boolean) => void;
  setWaveformEnabled: (enabled: boolean) => void;
  setCompactMode: (compact: boolean) => void;
  setFontSize: (size: number) => void;
  setLiquidGlassEnabled: (enabled: boolean) => void;

  // UpNext actions
  addToUpNext: (track: Track) => void;
  addToUpNextMultiple: (tracks: Track[]) => void;
  removeFromUpNext: (index: number) => void;
  moveInUpNext: (fromIndex: number, toIndex: number) => void;
  clearUpNext: () => void;

  // Queue reorder action
  moveInQueue: (fromIndex: number, toIndex: number) => void;

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
  syncWithPlaybackEngine: () => void;
  restorePlayback: () => Promise<boolean>;

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

  // Equalizer modal actions
  setEqOpen: (open: boolean) => void;

  // Keyboard shortcuts help modal (M4.2)
  setShortcutsHelpOpen: (open: boolean) => void;

  // Like/Dislike actions
  toggleLike: (trackId: string, trackData?: Track) => void;
  toggleDislike: (trackId: string, trackData?: Track) => void;
  isTrackLiked: (trackId: string) => boolean;
  isTrackDisliked: (trackId: string) => boolean;
  markTrackBroken: (trackId: string) => void;
  clearBrokenTracks: () => void;

  // Similar tracks actions
  setSimilarTracks: (tracks: Track[]) => void;
  setSimilarTracksLoading: (loading: boolean) => void;
  requestShowSimilar: () => void;
  clearShowSimilarRequest: () => void;
  requestShowLyrics: () => void;
  clearShowLyricsRequest: () => void;

  // ── Share sheet (global, QR-powered) ──
  /** null = closed. url null = no public link (demo/local content). */
  shareSheet: { url: string | null; title: string; subtitle?: string; cover?: string; openInAppUrl?: string } | null;
  openShareSheet: (payload: { url: string | null; title: string; subtitle?: string; cover?: string; openInAppUrl?: string }) => void;
  closeShareSheet: () => void;

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
  saveFavoriteArtistsToServer: (opts?: { completeOnboarding?: boolean }) => Promise<void>;
  loadFavoriteArtistsFromServer: () => Promise<void>;

  // Disliked playlist tags (for recommendations filtering)
  dislikedTags: string[];

  // Favorite artists (onboarding + taste profile)
  favoriteArtists: FavoriteArtist[];
  onboardingComplete: boolean;

  // Group chat
  selectedGroupId: string | null;

  // Artist detail view (shared across views)
  selectedArtist: { name: string; avatar?: string; followers?: number; genre?: string; trackCount?: number; catalogArtistId?: string; catalogProvider?: "spotify" | "deezer" } | null;
  setSelectedArtist: (artist: { name: string; avatar?: string; followers?: number; genre?: string; trackCount?: number; catalogArtistId?: string; catalogProvider?: "spotify" | "deezer" } | null) => void;

  /* ── V2 multi-provider engine: catalog → playback ── */

  /** True while the PlaybackResolver matches the current catalog track. */
  catalogResolving: boolean;
  /** Low-confidence match → choose-source sheet (autoplay suppressed). */
  lowConfidencePick: { catalog: CatalogTrackInput; alternatives: ResolveCandidate[] } | null;
  dismissLowConfidencePick: () => void;
  /** Play a specific candidate from the low-confidence list. */
  confirmSourcePick: (candidate: ResolveCandidate) => void;
  /** Manual playback-source switch — preserves currentTime when possible. */
  switchPlaybackSource: (candidate: ResolveCandidate) => void;
  /** Pending seek applied once the switched track reaches "playing". */
  _seekOnLoad: { trackId: string; position: number } | null;
  /** Spotify album page context. */
  selectedSpotifyAlbum: CatalogAlbumDTO | null;
  openSpotifyAlbum: (album: CatalogAlbumDTO) => void;
  closeSpotifyAlbum: () => void;
  /** Manual source-switch sheet state (player "change source"). */
  sourceSwitcher: { alternatives: ResolveCandidate[]; currentId: string | null } | null;
  openSourceSwitcher: () => Promise<void>;
  closeSourceSwitcher: () => void;

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
  // Present in initialState (and the persist skip list) but never read or
  // written by the app — typed here so AppState matches the runtime shape.
  // Candidates for removal (docs/STORE_STATE_MAP.md).
  publicPlaylistsPage: number;
  publicPlaylistsSearch: string;
  publicPlaylistsSort: string;
  /** One-shot deep-link: a playlist the Home recommendations section wants
   *  opened in the full public-playlist page. Consumed (and cleared) by
   *  PublicPlaylistsView on mount — transient, never persisted. */
  publicPlaylistDeepLink: PublicPlaylist | null;
  openPublicPlaylistDetail: (playlist: PublicPlaylist) => void;

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

  // Crossfade actions
  setCrossfadeEnabled: (enabled: boolean) => void;
  setCrossfadeDuration: (duration: number) => void;
  setReplayGainEnabled: (enabled: boolean) => void;

  // Gapless playback actions
  setGaplessEnabled: (enabled: boolean) => void;
  setWasmEngineEnabled: (enabled: boolean) => void;
  setCobaltJwt: (jwt: string | null, expiry: number | null) => void;
  getCobaltJwt: () => string | null;
  peekNextTrack: () => Track | null;

  // Radio mode actions
  toggleRadioMode: () => void;

  // ── MQ Wave actions (lib/wave engine integration, §12–§18) ──
  /** Create/replace the wave session (start or seed change). */
  startWaveSession: (seed: import("@/lib/wave").WaveSeed) => string;
  /** Enqueue a scored batch into the logical wave queue (deduped, capped). */
  enqueueWaveTracks: (batch: Array<{
    track: Track;
    reason: string;
    seedRef?: string;
    /** V2 (PART 11): per-track relevance debug metadata (dev mode). */
    debug?: import("@/lib/wave").WaveRelevanceDebug;
  }>) => void;
  /** Pop the next wave item + record it in wave memory. Null when empty. */
  consumeWaveItem: () => import("@/lib/wave").WaveQueueItem<Track> | null;
  /** Drop wave items matching ids (e.g. broken/unplayable tracks). */
  removeWaveItems: (ids: string[]) => void;
  /** End the wave session + clear logical queue (playback queue untouched). */
  clearWave: () => void;
  /** Push a normalized listening event into the bounded session log. */
  pushWaveEvent: (event: import("@/lib/wave").WaveEvent) => void;
  /** Mark wave tracks as served to the playback queue (memory sync). */
  markWaveTracksServed: (tracks: Track[]) => void;
  /** more_like_this (§17): boost the sound cluster of a track. */
  waveMoreLikeThis: (track: Track) => void;
  /** less_like_this (§18): temporarily downweight the cluster. */
  waveLessLikeThis: (track: Track) => void;
  setWaveLoading: (loading: boolean) => void;
  setWaveError: (error: string | null) => void;

  // Smart Shuffle actions
  toggleSmartShuffle: () => void;

  // ── V3 §24-27: Skip Intelligence + Smart Queue ──
  /** Ring buffer of §24 listening events (skip/complete/replay/favorite). */
  listeningEvents: SkipEventV3[];
  /** Derived §26 profile — recomputed lazily on event append. */
  skipProfile: SkipProfile;
  /** Record a §24 event (ALL plays — not just wave sessions). */
  recordListeningEvent: (kind: SkipEventV3["kind"], playedSeconds?: number) => void;
  /** User-initiated transition (Next/Prev/new play) — honest skip signal. */
  recordSkipFromTransition: () => void;
  /** §27: refill the queue at its end with taste-aware continuation. */
  refillQueueSmart: () => Promise<void>;
  /** §27: smart queue autoplay at queue end (persisted). */
  smartQueueAutoplay: boolean;
  toggleSmartQueueAutoplay: () => void;

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
  sessionStartTime: number | null;
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

  // EQ (10-band equalizer)
  eqEnabled: boolean;
  eqBands: number[]; // 10 bands each -12 to +12
  eqPreset: string;
  setEqEnabled: (enabled: boolean) => void;
  setEqBand: (bandIndex: number, value: number) => void;
  setEqPreset: (preset: string) => void;

  // Look-ahead limiter (Rust DSP on the WASM path; compressor-mode on element)
  limiterEnabled: boolean;
  limiterThreshold: number; // dB ceiling, -12..0
  setLimiterEnabled: (enabled: boolean) => void;
  setLimiterThreshold: (thresholdDb: number) => void;

  // A-B Repeat (loop section)
  abRepeat: { pointA: number | null; pointB: number | null; active: boolean };
  setAbRepeatPoint: (point: 'A' | 'B') => void;
  clearAbRepeat: () => void;

  // Playback speed
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;

  // Mini player visibility
  miniPlayerHidden: boolean;
  setMiniPlayerHidden: (hidden: boolean) => void;

  // AI Recommendations visibility
  aiRecsHidden: boolean;
  setAiRecsHidden: (hidden: boolean) => void;

  // Demo loading indicator
  demoLoading: boolean;

  // Auth generation counter — prevents stale async writes after logout
  _authGeneration: number;

  // Hydration flag — true once Zustand persist has rehydrated from localStorage
  _hasHydrated: boolean;

  // Reset
  reset: () => void;
}

/**
 * A store slice: a factory returning a subset of AppState (state and/or actions).
 * Slices receive the shared persist-wrapped set/get, so cross-slice calls go through get().
 */
export type StoreSlice<K extends keyof AppState> = StateCreator<AppState, [["zustand/persist", unknown]], [], Pick<AppState, K>>;

