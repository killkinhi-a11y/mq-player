/**
 * Micro-pass: Home recommended playlists → FULL playlist page deep-link.
 *
 * openPublicPlaylistDetail stashes the playlist (one-shot, transient —
 * never persisted) and navigates to the EXISTING public-playlists view via
 * the normal setView path. PublicPlaylistsView consumes (and clears) the
 * stash on mount, opening its existing detail screen. Editorial picks
 * (curated feed selections) carry `editorial: true` so that screen hides
 * the author/social fields that don't exist for them.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore, type PublicPlaylist } from "@/store/useAppStore";

const makePlaylist = (over: Partial<PublicPlaylist> = {}): PublicPlaylist => ({
  id: "pl-1",
  userId: "user-1",
  username: "alice",
  name: "Ночная поездка",
  description: "Тёмный эмбиент для дороги",
  cover: "https://example.com/c.jpg",
  isPublic: true,
  tags: ["ambient"],
  tracks: [],
  trackCount: 0,
  likeCount: 3,
  playCount: 7,
  isLiked: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  const store = useAppStore.getState();
  if (store.reset) store.reset();
  useAppStore.setState({ currentView: "main", publicPlaylistDeepLink: null });
});

describe("Public playlist deep-link (Home → full playlist page)", () => {
  it("starts with no deep-link stashed", () => {
    expect(useAppStore.getState().publicPlaylistDeepLink).toBeNull();
  });

  it("stashes the playlist and navigates to the existing public-playlists view", () => {
    // setView may touch window (scroll reset) — jsdom provides it; fetch is
    // only hit by view data loaders, not by this action.
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    const pl = makePlaylist();
    useAppStore.getState().openPublicPlaylistDetail(pl);

    const s = useAppStore.getState();
    expect(s.publicPlaylistDeepLink).toEqual(pl);
    expect(s.currentView).toBe("public-playlists");

    vi.restoreAllMocks();
  });

  it("is one-shot: consuming clears the stash without touching the view", () => {
    const pl = makePlaylist({ id: "pl-2", editorial: true });
    useAppStore.getState().openPublicPlaylistDetail(pl);
    expect(useAppStore.getState().publicPlaylistDeepLink).not.toBeNull();

    // The consume step PublicPlaylistsView performs on mount:
    useAppStore.setState({ publicPlaylistDeepLink: null });

    const s = useAppStore.getState();
    expect(s.publicPlaylistDeepLink).toBeNull();
    expect(s.currentView).toBe("public-playlists");
  });

  it("keeps the deep-link transient — not part of the persisted snapshot", () => {
    const pl = makePlaylist({ id: "pl-3" });
    useAppStore.getState().openPublicPlaylistDetail(pl);

    // Read what the persist partialize would write (unstorage-style call:
    // persist reads the state, applies partialize, serializes).
    const persistApi = (useAppStore as any).persist;
    expect(persistApi).toBeTruthy();
    const snapshot = persistApi.getOptions().partialize(useAppStore.getState());
    expect(snapshot.publicPlaylistDeepLink).toBeUndefined();
    expect(snapshot.recommendedPlaylists).toBeUndefined();
  });

  it("editorial flag survives on the stashed playlist (curated picks)", () => {
    const pl = makePlaylist({
      id: "genre-chill",
      userId: "",
      username: "",
      description: "Спокойные подборки по вашему вкусу",
      isPublic: false,
      tags: [],
      likeCount: 0,
      playCount: 0,
      editorial: true,
    });
    useAppStore.getState().openPublicPlaylistDetail(pl);
    expect(useAppStore.getState().publicPlaylistDeepLink?.editorial).toBe(true);
  });
});
