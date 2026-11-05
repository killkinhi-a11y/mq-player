// Initial store state (moved verbatim from useAppStore.ts in Stage III).
import type { AuthStep, FavoriteArtist, HistoryEntry, HomeCuratedPlaylist, HomeRecCategory, Mood, PlaybackState, PublicPlaylist, UserPlaylist, ViewType } from "@/store/types";
import type { CatalogAlbumDTO } from "@/lib/spotify/types";
import type { CatalogTrackInput, ResolveCandidate } from "@/lib/playback/client";
import type { Message as ChatMessage, Track } from "@/lib/musicApi";

export const initialState = {
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
  reduceMotion: false as boolean,
  // v8 Full Player Themes — default "classic": existing users must NOT
  // see the Full Player change suddenly. Spatial is strictly opt-in.
  fullPlayerMode: "classic" as "classic" | "spatial",
  spatialActionsPosition: "left" as "left" | "right",
  // v11 Player extension — lyrics appearance + waveform (local-only prefs)
  lyricsFontFamily: "",
  lyricsFontSize: 0,
  lyricsFontWeight: 0,
  lyricsLineHeight: 0,
  lyricsLetterSpacing: 0,
  lyricsAnimated: true,
  waveformEnabled: true,
  compactMode: false,
  fontSize: 16,
  liquidGlassEnabled: false,
  currentTrack: null as Track | null,
  currentPlaylistId: null as string | null,
  queue: [] as Track[],
  queueIndex: 0,
  upNext: [] as Track[],
  isPlaying: false,
  volume: 70,
  progress: 0,
  duration: 0,
  shuffle: false,
  repeat: "off" as "off" | "all" | "one",
  playbackMode: "idle" as "soundcloud" | "idle",
  playbackState: "idle" as PlaybackState,
  isBuffering: false,
  isDragging: false,
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
  librarySearchQuery: "",
  librarySort: "recent" as "recent" | "title" | "artist",
  supportUnreadCount: 0 as number,
  notificationCount: 0 as number,
  notifPanelOpen: false as boolean,
  isFullTrackViewOpen: false,
  isEqOpen: false as boolean,
  shortcutsHelpOpen: false as boolean,
  likedTrackIds: [] as string[],
  dislikedTrackIds: [] as string[],
  dislikedTracksData: [] as Track[],
  likedTracksData: [] as Track[],
  brokenTrackIds: new Set<string>(),
  _playLock: false,

  similarTracks: [] as Track[],
  similarTracksLoading: false,
  showSimilarRequested: false,
  showLyricsRequested: false,
  shareSheet: null,
  playlists: [] as UserPlaylist[],
  selectedPlaylistId: null as string | null,

  userRole: "user" as string,

  // Public playlists
  liquidGlassMobile: false as boolean,
  history: [] as HistoryEntry[],
  publicPlaylists: [] as PublicPlaylist[],
  recommendedPlaylists: [] as PublicPlaylist[],
  publicPlaylistDeepLink: null as PublicPlaylist | null,
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
  selectedArtist: null as { name: string; avatar?: string; followers?: number; genre?: string; trackCount?: number; catalogArtistId?: string; catalogProvider?: "spotify" | "deezer" } | null,

  // V2 multi-provider engine
  catalogResolving: false,
  lowConfidencePick: null as { catalog: CatalogTrackInput; alternatives: ResolveCandidate[] } | null,
  _seekOnLoad: null as { trackId: string; position: number } | null,
  selectedSpotifyAlbum: null as CatalogAlbumDTO | null,
  sourceSwitcher: null as { alternatives: ResolveCandidate[]; currentId: string | null } | null,

  // Collaborative listening
  listenSession: null as any,

  // Spatial Audio
  spatialAudioEnabled: false,
  spatialMood: null as Mood | null,
  spatialAutoDetect: true,

  // Crossfade
  crossfadeEnabled: true,
  crossfadeDuration: 2,

  // Gapless playback
  gaplessEnabled: true as boolean,
  // WASM Rust engine — OFF by default (v71). Production telemetry:
  // the AudioWorklet ring (~0.74s) accumulates underruns at track start /
  // seek / gapless handoff → audible crackle ("пердит"). Opt-in only:
  // Settings → Звук → WASM-движок (experimental).
  wasmEngineEnabled: false as boolean,
  replayGainEnabled: false as boolean,

  // Cobalt SNIP bypass
  _cobaltJwt: null as string | null,
  _cobaltJwtExpiry: null as number | null,

  // Radio mode
  radioMode: false,
  radioSeedTrack: null as Track | null,
  radioSkipCount: 0,

  // MQ Wave v1 (lib/wave) — logical session/queue/memory, ephemeral
  waveSession: null as import("@/lib/wave").WaveSessionState | null,
  waveQueue: [] as import("@/lib/wave").WaveQueueItem<Track>[],
  waveMemory: { tracks: [], artists: [], genres: [], seeds: [], playedCount: 0 } as import("@/lib/wave").WaveMemory,
  waveSessionEvents: [] as import("@/lib/wave").WaveEvent[],
  waveLoading: false,
  waveError: null as string | null,

  // Smart Shuffle
  smartShuffle: true,
  // ── V3 §24-27: Skip Intelligence state ──
  listeningEvents: [],
  skipProfile: { artists: {}, genres: {}, styles: {}, tracks: {} },
  smartQueueAutoplay: true,

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

  // Home feed cache
  homeRecCategories: [] as HomeRecCategory[],
  homeCuratedPlaylists: [] as HomeCuratedPlaylist[],
  homeFeedLoading: false,
  homeFeedError: null as "offline" | "api" | "empty" | null,
  homeFeedFetchedAt: 0,
  homeFeedTasteSig: "",

  // Style
  currentStyle: "",
  styleVariant: "" as string,

  // Taste Profile
  tasteGenres: {} as Record<string, number>,
  tasteArtists: {} as Record<string, number>,
  tasteMoods: {} as Record<string, number>,
  excludedArtists: [] as string[],
  sessionStartTime: null as number | null,

  // Cat mascot
  catEnabled: false as boolean,
  catFrequency: "normal" as "rare" | "normal" | "often",
  catMood: "chill" as "chill" | "dreamy" | "panic" | "lazy",
  catSize: "medium" as "small" | "medium" | "large",
  catLastSeen: 0 as number,
  catPetCount: 0 as number,

  // EQ
  eqEnabled: false,
  eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as number[],
  limiterEnabled: false,
  limiterThreshold: -1.0,
  eqPreset: "flat",

  // A-B Repeat
  abRepeat: { pointA: null as number | null, pointB: null as number | null, active: false },

  // Playback speed
  playbackRate: 1.0 as number,

  // Mini player visibility
  miniPlayerHidden: false as boolean,

  // AI Recommendations visibility
  aiRecsHidden: true as boolean,

  // Demo loading indicator
  demoLoading: false as boolean,

  // Auth generation counter
  _authGeneration: 0,

  // Hydration flag
  _hasHydrated: false,
};
