/**
 * Search suggestions — W02 real-data builder (pure, testable).
 *
 * Builds the autocomplete list from the user's ACTUAL state: search
 * history, listening history, favorite/recent artists, playlists, the
 * genre catalog. No invented "popular" entries, no placeholder numbers —
 * if the user has no data, the list is honestly short/empty.
 *
 * Empty query → useful recents; non-empty → substring matches + the
 * direct-search row (the caller renders it separately).
 */

export type SuggestionKind = "search" | "track" | "artist" | "playlist" | "genre";

export interface SuggestionSourceTrack {
  id: string;
  title: string;
  artist: string;
  cover?: string;
}

export interface SuggestionSourceArtist {
  name: string;
  avatar?: string;
  count: number;
}

export interface SuggestionSourcePlaylist {
  id: string;
  name: string;
  trackCount: number;
}

export interface SuggestionItem {
  kind: SuggestionKind;
  label: string;
  sub?: string;
  icon: SuggestionKind;
  cover?: string;
  track?: SuggestionSourceTrack;
  playlistId?: string;
  genre?: string;
}

export const GENRE_LABELS: Record<string, string> = {
  "Pop": "Поп",
  "Rock": "Рок",
  "Electronic": "Электроника",
  "Hip-Hop": "Хип-хоп",
  "Jazz": "Джаз",
  "Classical": "Классика",
  "R&B": "R&B",
  "Indie": "Инди",
};

export const MAX_SUGGESTIONS = 10;

interface BuildSuggestionsInput {
  query: string;
  searchHistory: string[];
  recentTracks: SuggestionSourceTrack[];
  artists: SuggestionSourceArtist[];
  playlists: SuggestionSourcePlaylist[];
}

export function buildSuggestions({
  query,
  searchHistory,
  recentTracks,
  artists,
  playlists,
}: BuildSuggestionsInput): SuggestionItem[] {
  const q = query.trim().toLowerCase();
  const items: SuggestionItem[] = [];
  const seen = new Set<string>();
  const push = (item: SuggestionItem) => {
    const key = item.kind + ":" + item.label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  if (!q) {
    // ── Empty query: useful REAL recents ──
    searchHistory.slice(0, 4).forEach((term) =>
      push({ kind: "search", label: term, sub: "Недавний запрос", icon: "search" })
    );
    recentTracks.slice(0, 4).forEach((t) =>
      push({ kind: "track", label: t.title, sub: t.artist, icon: "track", cover: t.cover, track: t })
    );
    artists.slice(0, 4).forEach((a) =>
      push({ kind: "artist", label: a.name, sub: "Артист", icon: "artist", cover: a.avatar })
    );
    playlists
      .filter((p) => p.trackCount > 0)
      .slice(0, 3)
      .forEach((p) =>
        push({ kind: "playlist", label: p.name, sub: `${p.trackCount} треков`, icon: "playlist", playlistId: p.id })
      );
    return items.slice(0, MAX_SUGGESTIONS);
  }

  // ── Non-empty query: matches across every real source ──
  searchHistory
    .filter((h) => h.toLowerCase().includes(q) && h.toLowerCase() !== q)
    .slice(0, 3)
    .forEach((term) =>
      push({ kind: "search", label: term, sub: "Недавний запрос", icon: "search" })
    );
  recentTracks
    .filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((t) =>
      push({ kind: "track", label: t.title, sub: t.artist, icon: "track", cover: t.cover, track: t })
    );
  artists
    .filter((a) => a.name.toLowerCase().includes(q))
    .slice(0, 3)
    .forEach((a) =>
      push({ kind: "artist", label: a.name, sub: "Артист", icon: "artist", cover: a.avatar })
    );
  playlists
    .filter((p) => p.name.toLowerCase().includes(q))
    .slice(0, 3)
    .forEach((p) =>
      push({ kind: "playlist", label: p.name, sub: `${p.trackCount} треков`, icon: "playlist", playlistId: p.id })
    );
  Object.entries(GENRE_LABELS)
    .filter(([en, ru]) => en.toLowerCase().includes(q) || ru.toLowerCase().includes(q))
    .slice(0, 3)
    .forEach(([en, ru]) =>
      push({ kind: "genre", label: ru, sub: "Жанр", icon: "genre", genre: en })
    );

  return items.slice(0, MAX_SUGGESTIONS);
}
