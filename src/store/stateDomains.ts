// AppState data fields grouped by owning domain (= the store slice that
// writes them; fields reset by auth on login/logout belong to their domain).
// Generated from the Stage IV store analysis (docs/STORE_STATE_MAP.md) and
// checked at compile time: every key of initialState must be listed here,
// and only data keys (no actions) are allowed. Tests enforce "exactly once".
import type { initialState } from "@/store/initialState";
import type { AppState } from "@/store/types";

/** Keys of the store's data (non-action) fields. */
export type AppDataKey = keyof typeof initialState;
/** Keys of store actions. */
export type AppActionKey = Exclude<keyof AppState, AppDataKey>;
/** Data part of AppState (what persist/partialize and selectors work with). */
export type AppData = Pick<AppState, AppDataKey>;

export const STATE_DOMAINS = {
  /** session identity, auth flow step, demo flag */
  auth: [
    "isAuthenticated",
    "userId",
    "username",
    "email",
    "telegramUsername",
    "avatar",
    "currentView",
    "authStep",
    "userRole",
    "selectedGroupId",
    "demoLoading",
    "_authGeneration",
    "_hasHydrated",
  ],
  /** server sync status */
  sync: [
    "lastSyncAt",
    "isSyncing",
    "syncError",
    "_cobaltJwt",
    "_cobaltJwtExpiry",
  ],
  /** theme, motion, typography, layout preferences */
  appearance: [
    "currentTheme",
    "customAccent",
    "animationsEnabled",
    "reduceMotion",
    "fullPlayerMode",
    "spatialActionsPosition",
    "lyricsFontFamily",
    "lyricsFontSize",
    "lyricsFontWeight",
    "lyricsLineHeight",
    "lyricsLetterSpacing",
    "lyricsAnimated",
    "waveformEnabled",
    "compactMode",
    "fontSize",
    "liquidGlassEnabled",
    "liquidGlassMobile",
    "currentStyle",
    "styleVariant",
  ],
  /** current track, transport, progress, engine status */
  playback: [
    "currentTrack",
    "currentPlaylistId",
    "isPlaying",
    "volume",
    "progress",
    "duration",
    "playbackState",
    "isBuffering",
    "isDragging",
    "_playLock",
    "catalogResolving",
    "lowConfidencePick",
    "_seekOnLoad",
    "sourceSwitcher",
    "sessionStartTime",
    "abRepeat",
    "playbackRate",
  ],
  /** playback queue and up-next */
  queue: [
    "queue",
    "queueIndex",
    "upNext",
    "shuffle",
    "repeat",
    "playbackMode",
    "smartShuffle",
    "smartQueueAutoplay",
  ],
  /** audio processing preferences (EQ, crossfade, spatial, engine) */
  audio: [
    "spatialAudioEnabled",
    "spatialMood",
    "spatialAutoDetect",
    "crossfadeEnabled",
    "crossfadeDuration",
    "gaplessEnabled",
    "wasmEngineEnabled",
    "replayGainEnabled",
    "eqEnabled",
    "eqBands",
    "limiterEnabled",
    "limiterThreshold",
    "eqPreset",
  ],
  /** sleep timer */
  sleepTimer: [
    "sleepTimerActive",
    "sleepTimerMinutes",
    "sleepTimerRemaining",
    "sleepTimerEndTime",
  ],
  /** playlists, likes, history, public playlists */
  library: [
    "likedTrackIds",
    "dislikedTrackIds",
    "dislikedTracksData",
    "likedTracksData",
    "brokenTrackIds",
    "playlists",
    "history",
    "publicPlaylists",
    "publicPlaylistsLoading",
    "publicPlaylistsTotal",
    "favoriteArtists",
    "onboardingComplete",
    "publicPlaylistsPage",
    "publicPlaylistsSearch",
    "publicPlaylistsSort",
  ],
  /** home feed, recommendations, release radar, catalog */
  discovery: [
    "similarTracks",
    "similarTracksLoading",
    "recommendedPlaylists",
    "recommendedPlaylistsLoading",
    "releaseRadarTracks",
    "releaseRadarLoading",
    "homeRecCategories",
    "homeCuratedPlaylists",
    "homeFeedLoading",
    "homeFeedError",
    "homeFeedFetchedAt",
    "homeFeedTasteSig",
  ],
  /** MQ Wave radio session */
  wave: [
    "radioMode",
    "radioSeedTrack",
    "radioSkipCount",
    "waveSession",
    "waveQueue",
    "waveMemory",
    "waveSessionEvents",
    "waveLoading",
    "waveError",
  ],
  /** taste signals: feedback, listening events, skip profile */
  taste: [
    "dislikedTags",
    "listeningEvents",
    "skipProfile",
    "trackFeedback",
    "feedbackBatch",
    "tasteGenres",
    "tasteArtists",
    "tasteMoods",
    "excludedArtists",
  ],
  /** messages, contacts, typing, notifications */
  messenger: [
    "messages",
    "selectedContactId",
    "unreadCounts",
    "contacts",
    "typingUsers",
    "supportUnreadCount",
    "notificationCount",
    "notifPanelOpen",
  ],
  /** social graph */
  social: [
    "listenSession",
  ],
  /** transient UI: views, panels, selections, search */
  ui: [
    "searchQuery",
    "selectedGenre",
    "isLoading",
    "librarySearchQuery",
    "librarySort",
    "isFullTrackViewOpen",
    "isEqOpen",
    "shortcutsHelpOpen",
    "showSimilarRequested",
    "showLyricsRequested",
    "shareSheet",
    "selectedPlaylistId",
    "publicPlaylistDeepLink",
    "selectedArtist",
    "selectedSpotifyAlbum",
    "miniPlayerHidden",
    "aiRecsHidden",
  ],
  /** MQ cat companion */
  cat: [
    "catEnabled",
    "catFrequency",
    "catMood",
    "catSize",
    "catLastSeen",
    "catPetCount",
  ],
} as const satisfies Record<string, readonly AppDataKey[]>;

export type StateDomain = keyof typeof STATE_DOMAINS;
type ListedKey = (typeof STATE_DOMAINS)[StateDomain][number];
/** Compile-time exhaustiveness: fails to type-check if a data key is unassigned. */
type Unassigned = Exclude<AppDataKey, ListedKey>;
export const STATE_DOMAINS_EXHAUSTIVE: [Unassigned] extends [never] ? true : { missing: Unassigned } = true;

/** Domain that owns a data field. */
export function domainOf(key: AppDataKey): StateDomain {
  for (const d of Object.keys(STATE_DOMAINS) as StateDomain[]) {
    if ((STATE_DOMAINS[d] as readonly string[]).includes(key)) return d;
  }
  throw new Error(`unassigned store key: ${String(key)}`);
}
