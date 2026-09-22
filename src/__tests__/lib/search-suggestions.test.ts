/**
 * Search suggestions builder (W02) — real-data contract tests.
 *
 * Pins the "no fake personalization" rule: the dropdown is built ONLY from
 * the user's actual state (search history, listening history, artists,
 * playlists, genre catalog) — never from invented "popular" entries.
 */
import { describe, it, expect } from "vitest";
import {
  buildSuggestions,
  GENRE_LABELS,
  MAX_SUGGESTIONS,
} from "@/lib/search-suggestions";

const TRACKS = [
  { id: "t1", title: "Blinding Lights", artist: "The Weeknd" },
  { id: "t2", title: "Ночная смена", artist: "Джизус" },
  { id: "t3", title: "Sunset Lover", artist: "Petit Biscuit" },
];

const ARTISTS = [
  { name: "The Weeknd", count: 99 },
  { name: "Джизус", count: 3 },
];

const PLAYLISTS = [
  { id: "p1", name: "Ночная езда", trackCount: 12 },
  { id: "p2", name: "Пустой", trackCount: 0 },
];

describe("buildSuggestions — empty query (useful recents)", () => {
  it("shows recent searches, tracks and artists from REAL data", () => {
    const items = buildSuggestions({
      query: "",
      searchHistory: ["джаз", "the weeknd"],
      recentTracks: TRACKS,
      artists: ARTISTS,
      playlists: PLAYLISTS,
    });
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain("search");
    expect(kinds).toContain("track");
    expect(kinds).toContain("artist");
    // The empty playlist is NOT suggested (nothing to play)
    const pls = items.filter((i) => i.kind === "playlist");
    expect(pls.map((p) => p.label)).toEqual(["Ночная езда"]);
  });

  it("empty state is honest: no data → no suggestions (no fake populars)", () => {
    const items = buildSuggestions({
      query: "",
      searchHistory: [],
      recentTracks: [],
      artists: [],
      playlists: [],
    });
    expect(items).toEqual([]);
  });

  it("caps the list at MAX_SUGGESTIONS", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`,
      title: `Track ${i}`,
      artist: `Artist ${i}`,
    }));
    const items = buildSuggestions({
      query: "",
      searchHistory: [],
      recentTracks: many,
      artists: [],
      playlists: [],
    });
    expect(items.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
  });
});

describe("buildSuggestions — non-empty query (matches)", () => {
  it("matches tracks by title AND artist (case-insensitive)", () => {
    const items = buildSuggestions({
      query: "weeknd",
      searchHistory: [],
      recentTracks: TRACKS,
      artists: ARTISTS,
      playlists: [],
    });
    const tracks = items.filter((i) => i.kind === "track");
    expect(tracks).toHaveLength(1);
    expect(tracks[0].label).toBe("Blinding Lights");
    const artists = items.filter((i) => i.kind === "artist");
    expect(artists.map((a) => a.label)).toEqual(["The Weeknd"]);
  });

  it("matches cyrillic queries", () => {
    const items = buildSuggestions({
      query: "ноч",
      searchHistory: [],
      recentTracks: TRACKS,
      artists: ARTISTS,
      playlists: PLAYLISTS,
    });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Ночная смена");
    expect(labels).toContain("Ночная езда");
  });

  it("matches genres by english and russian labels", () => {
    const en = buildSuggestions({ query: "jazz", searchHistory: [], recentTracks: [], artists: [], playlists: [] });
    expect(en.some((i) => i.kind === "genre" && i.genre === "Jazz")).toBe(true);
    const ru = buildSuggestions({ query: "джаз", searchHistory: [], recentTracks: [], artists: [], playlists: [] });
    expect(ru.some((i) => i.kind === "genre" && i.label === "Джаз")).toBe(true);
  });

  it("excludes the exact query from history matches (no echo)", () => {
    const items = buildSuggestions({
      query: "джаз",
      searchHistory: ["джаз", "джазз альбом"],
      recentTracks: [],
      artists: [],
      playlists: [],
    });
    const searches = items.filter((i) => i.kind === "search").map((i) => i.label);
    expect(searches).not.toContain("джаз");
    expect(searches).toContain("джазз альбом");
  });

  it("no matches → empty list (the direct-search row is rendered by the view)", () => {
    const items = buildSuggestions({
      query: "zzzznothing",
      searchHistory: [],
      recentTracks: TRACKS,
      artists: ARTISTS,
      playlists: [],
    });
    expect(items).toEqual([]);
  });
});

describe("GENRE_LABELS", () => {
  it("covers the app's genre catalog (the ONLY static suggestion source)", () => {
    expect(Object.keys(GENRE_LABELS)).toEqual(
      expect.arrayContaining(["Pop", "Rock", "Jazz", "Hip-Hop"])
    );
  });
});
