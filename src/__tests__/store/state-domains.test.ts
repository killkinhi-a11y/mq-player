import { describe, it, expect } from "vitest";
import { STATE_DOMAINS, domainOf, type AppDataKey } from "@/store/stateDomains";
import { initialState } from "@/store/initialState";
import { useAppStore } from "@/store/useAppStore";
import { partializeState } from "@/store/persist";

const listed = Object.values(STATE_DOMAINS).flat() as string[];

describe("STATE_DOMAINS", () => {
  it("lists every initialState key exactly once", () => {
    const dupes = listed.filter((k, i) => listed.indexOf(k) !== i);
    expect(dupes).toEqual([]);
    expect([...listed].sort()).toEqual(Object.keys(initialState).sort());
  });
  it("contains data fields only (no actions)", () => {
    const st = useAppStore.getState() as unknown as Record<string, unknown>;
    expect(listed.filter((k) => typeof st[k] === "function")).toEqual([]);
  });
  it("every store action is a function and is not listed as data", () => {
    const st = useAppStore.getState() as unknown as Record<string, unknown>;
    const actions = Object.keys(st).filter((k) => typeof st[k] === "function");
    expect(actions.length).toBeGreaterThan(100);
    expect(actions.filter((k) => listed.includes(k))).toEqual([]);
  });
  it("domainOf resolves owners", () => {
    expect(domainOf("userId")).toBe("auth");
    expect(domainOf("queue" as AppDataKey)).toBe("queue");
    expect(domainOf("currentTrack")).toBe("playback");
  });

  it("persisted field set is explicit (update docs/STORE_STATE_MAP.md when it changes)", () => {
    const persisted = Object.keys((partializeState as unknown as (s: unknown) => Record<string, unknown>)(useAppStore.getState())).sort();
    expect(persisted).toEqual(PERSISTED);
  });
});

const PERSISTED = [
  "_cobaltJwt",
  "_cobaltJwtExpiry",
  "animationsEnabled",
  "avatar",
  "catEnabled",
  "catFrequency",
  "catLastSeen",
  "catMood",
  "catPetCount",
  "catSize",
  "compactMode",
  "contacts",
  "crossfadeDuration",
  "crossfadeEnabled",
  "currentPlaylistId",
  "currentStyle",
  "currentTheme",
  "currentTrack",
  "currentView",
  "customAccent",
  "dislikedTags",
  "dislikedTrackIds",
  "dislikedTracksData",
  "email",
  "eqBands",
  "eqEnabled",
  "eqPreset",
  "excludedArtists",
  "favoriteArtists",
  "feedbackBatch",
  "fontSize",
  "fullPlayerMode",
  "history",
  "isAuthenticated",
  "likedTrackIds",
  "likedTracksData",
  "limiterEnabled",
  "limiterThreshold",
  "liquidGlassEnabled",
  "liquidGlassMobile",
  "lyricsAnimated",
  "lyricsFontFamily",
  "lyricsFontSize",
  "lyricsFontWeight",
  "lyricsLetterSpacing",
  "lyricsLineHeight",
  "messages",
  "onboardingComplete",
  "playbackRate",
  "playlists",
  "queue",
  "queueIndex",
  "reduceMotion",
  "repeat",
  "replayGainEnabled",
  "shuffle",
  "spatialActionsPosition",
  "styleVariant",
  "tasteArtists",
  "tasteGenres",
  "tasteMoods",
  "trackFeedback",
  "unreadCounts",
  "upNext",
  "userId",
  "userRole",
  "username",
  "volume",
  "wasmEngineEnabled",
  "waveformEnabled",
];
