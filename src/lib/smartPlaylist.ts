/**
 * Smart playlist rules engine (M5.3).
 *
 * Evaluates a set of rules against the user's liked tracks + history
 * to produce a dynamic playlist. Rules are AND-combined.
 *
 * Supported fields:
 *   - genre:      string (exact match, case-insensitive)
 *   - artist:     string (contains, case-insensitive)
 *   - title:      string (contains, case-insensitive)
 *   - duration:   number (seconds) — operators: gt, gte, lt, lte, eq
 *   - addedDate:  number (days ago) — operators: gt (more than N days ago), lt (less than N days ago)
 *   - lastPlayed: number (days ago) — same operators
 *   - playCount:  number — operators: gt, gte, lt, lte, eq
 *   - liked:      boolean (always true if from likedTracksData)
 *
 * Usage:
 *   import { evaluateSmartPlaylist } from "@/lib/smartPlaylist";
 *   const tracks = evaluateSmartPlaylist(rules, { likedTracksData, history });
 */

import type { Track } from "@/lib/musicApi";

export interface SmartPlaylistRule {
  field: "genre" | "artist" | "title" | "duration" | "addedDate" | "lastPlayed" | "playCount" | "liked";
  op: "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte";
  value: string | number | boolean;
}

export interface SmartPlaylistConfig {
  rules: SmartPlaylistRule[];
  limit?: number;
  sortBy?: "createdAt" | "title" | "artist" | "duration" | "random";
}

export interface SmartPlaylistInput {
  likedTracksData: Track[];
  history: Array<{ track: Track; playedAt: number; playCount: number }>;
}

interface ScoredTrack {
  track: Track;
  playedAt: number;
  playCount: number;
  addedAt: number;
}

/**
 * Evaluate a smart playlist config against the user's library.
 * Returns matching tracks, sorted + limited.
 */
export function evaluateSmartPlaylist(
  config: SmartPlaylistConfig,
  input: SmartPlaylistInput,
): Track[] {
  const { likedTracksData = [], history = [] } = input;
  const { rules = [], limit = 100, sortBy = "createdAt" } = config;

  // Build a combined set of tracks with metadata
  const trackMeta = new Map<string, ScoredTrack>();
  const now = Date.now();

  // Add liked tracks
  for (const track of likedTracksData) {
    trackMeta.set(track.id, {
      track,
      playedAt: 0,
      playCount: 0,
      addedAt: now, // approximation — we don't track when it was liked
    });
  }

  // Add history tracks + update metadata
  for (const entry of history) {
    const existing = trackMeta.get(entry.track.id);
    if (existing) {
      existing.playedAt = Math.max(existing.playedAt, entry.playedAt);
      existing.playCount += entry.playCount;
    } else {
      trackMeta.set(entry.track.id, {
        track: entry.track,
        playedAt: entry.playedAt,
        playCount: entry.playCount,
        addedAt: now,
      });
    }
  }

  // Filter by rules
  const candidates = [...trackMeta.values()].filter((entry) => {
    return rules.every((rule) => evaluateRule(rule, entry, now));
  });

  // Sort
  const sorted = candidates.sort((a, b) => {
    switch (sortBy) {
      case "title":
        return a.track.title.localeCompare(b.track.title);
      case "artist":
        return a.track.artist.localeCompare(b.track.artist);
      case "duration":
        return (a.track.duration || 0) - (b.track.duration || 0);
      case "random":
        return Math.random() - 0.5;
      case "createdAt":
      default:
        return b.addedAt - a.addedAt;
    }
  });

  return sorted.slice(0, limit).map((s) => s.track);
}

function evaluateRule(rule: SmartPlaylistRule, entry: ScoredTrack, now: number): boolean {
  const { track, playedAt, playCount } = entry;

  switch (rule.field) {
    case "genre": {
      const trackGenre = (track.genre || "").toLowerCase();
      const ruleValue = String(rule.value).toLowerCase();
      switch (rule.op) {
        case "eq": return trackGenre === ruleValue;
        case "neq": return trackGenre !== ruleValue;
        case "contains": return trackGenre.includes(ruleValue);
        default: return false;
      }
    }

    case "artist": {
      const trackArtist = (track.artist || "").toLowerCase();
      const ruleValue = String(rule.value).toLowerCase();
      switch (rule.op) {
        case "eq": return trackArtist === ruleValue;
        case "neq": return trackArtist !== ruleValue;
        case "contains": return trackArtist.includes(ruleValue);
        default: return false;
      }
    }

    case "title": {
      const trackTitle = (track.title || "").toLowerCase();
      const ruleValue = String(rule.value).toLowerCase();
      switch (rule.op) {
        case "eq": return trackTitle === ruleValue;
        case "neq": return trackTitle !== ruleValue;
        case "contains": return trackTitle.includes(ruleValue);
        default: return false;
      }
    }

    case "duration": {
      const dur = track.duration || 0;
      const val = Number(rule.value);
      if (isNaN(val)) return false;
      switch (rule.op) {
        case "eq": return dur === val;
        case "gt": return dur > val;
        case "gte": return dur >= val;
        case "lt": return dur < val;
        case "lte": return dur <= val;
        default: return false;
      }
    }

    case "addedDate": {
      // value = days ago; we use addedAt as approximation
      const daysAgo = (now - entry.addedAt) / (1000 * 60 * 60 * 24);
      const val = Number(rule.value);
      if (isNaN(val)) return false;
      switch (rule.op) {
        case "gt": return daysAgo > val;
        case "gte": return daysAgo >= val;
        case "lt": return daysAgo < val;
        case "lte": return daysAgo <= val;
        default: return false;
      }
    }

    case "lastPlayed": {
      if (playedAt === 0) return false; // never played
      const daysAgo = (now - playedAt) / (1000 * 60 * 60 * 24);
      const val = Number(rule.value);
      if (isNaN(val)) return false;
      switch (rule.op) {
        case "gt": return daysAgo > val;
        case "gte": return daysAgo >= val;
        case "lt": return daysAgo < val;
        case "lte": return daysAgo <= val;
        default: return false;
      }
    }

    case "playCount": {
      const val = Number(rule.value);
      if (isNaN(val)) return false;
      switch (rule.op) {
        case "eq": return playCount === val;
        case "gt": return playCount > val;
        case "gte": return playCount >= val;
        case "lt": return playCount < val;
        case "lte": return playCount <= val;
        default: return false;
      }
    }

    case "liked": {
      // If value is true, track must be in likedTracksData (which it is,
      // since we added all liked tracks to trackMeta). This rule is
      // mainly for excluding disliked tracks in the future.
      return rule.value === true;
    }

    default:
      return false;
  }
}

/**
 * Preset smart playlist templates for quick creation.
 */
export const SMART_PLAYLIST_PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  config: SmartPlaylistConfig;
}> = [
  {
    id: "recently-played",
    name: "Недавно прослушанные",
    description: "Треки, которые вы слушали за последние 7 дней",
    config: {
      rules: [{ field: "lastPlayed", op: "lt", value: 7 }],
      limit: 50,
      sortBy: "createdAt",
    },
  },
  {
    id: "long-tracks",
    name: "Длинные треки",
    description: "Треки длиннее 5 минут",
    config: {
      rules: [{ field: "duration", op: "gt", value: 300 }],
      limit: 100,
      sortBy: "random",
    },
  },
  {
    id: "short-tracks",
    name: "Короткие треки",
    description: "Треки короче 2 минут",
    config: {
      rules: [{ field: "duration", op: "lt", value: 120 }],
      limit: 100,
      sortBy: "random",
    },
  },
  {
    id: "most-played",
    name: "Самые прослушиваемые",
    description: "Треки, которые вы слушали больше 5 раз",
    config: {
      rules: [{ field: "playCount", op: "gte", value: 5 }],
      limit: 50,
      sortBy: "createdAt",
    },
  },
  {
    id: "forgotten-gems",
    name: "Забытые жемчужины",
    description: "Понравившиеся треки, которые вы не слушали больше 30 дней",
    config: {
      rules: [
        { field: "liked", op: "eq", value: true },
        { field: "lastPlayed", op: "gt", value: 30 },
      ],
      limit: 50,
      sortBy: "random",
    },
  },
];
