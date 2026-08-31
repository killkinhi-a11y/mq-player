/**
 * Unit tests for Zustand App Store
 * Tests: auth, player, queue, playlist, likes, history, theme, sleep timer, EQ, feedback
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";

// Clear localStorage before each test to avoid hydration issues
beforeEach(() => {
  localStorage.clear();
  // Reset store to initial state
  const store = useAppStore.getState();
  if (store.reset) store.reset();
});

// ── Auth Tests ──────────────────────────────────────────────────────────────────

describe("Auth", () => {
  it("should start unauthenticated", () => {
    const { isAuthenticated, userId, username, currentView, authStep } = useAppStore.getState();
    expect(isAuthenticated).toBe(false);
    expect(userId).toBeNull();
    expect(username).toBeNull();
    expect(currentView).toBe("auth");
  });

  it("should set auth state on setAuth", () => {
    // Mock fetch for theme/sync calls inside setAuth
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ theme: "default" }),
    } as Response);

    useAppStore.getState().setAuth("user-1", "testuser", "test@example.com", "user", null, null);

    const state = useAppStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.userId).toBe("user-1");
    expect(state.username).toBe("testuser");
    expect(state.email).toBe("test@example.com");
    expect(state.userRole).toBe("user");
    expect(state.currentView).toBe("main");

    vi.restoreAllMocks();
  });

  it("should clear state on logout", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    useAppStore.getState().setAuth("user-1", "testuser", "test@example.com", "admin", null, null);
    useAppStore.getState().logout();

    const state = useAppStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.userId).toBeNull();
    expect(state.username).toBeNull();
    expect(state.currentView).toBe("auth");
  });

  it("should set auth step", () => {
    useAppStore.getState().setAuthStep("register");
    expect(useAppStore.getState().authStep).toBe("register");

    useAppStore.getState().setAuthStep("telegram");
    expect(useAppStore.getState().authStep).toBe("telegram");
  });
});

// ── Player Tests ──────────────────────────────────────────────────────────────────

describe("Player", () => {
  const mockTrack = {
    id: "track-1",
    title: "Test Song",
    artist: "Test Artist",
    album: "Test Album",
    cover: "/test.jpg",
    duration: 200,
    genre: "electronic",
    scTrackId: 12345,
    source: "soundcloud" as const,
    audioUrl: "https://example.com/audio.mp3",
  };

  const mockTrack2 = {
    id: "track-2",
    title: "Test Song 2",
    artist: "Test Artist 2",
    album: "Test Album 2",
    cover: "/test2.jpg",
    duration: 250,
    genre: "rock",
    scTrackId: 67890,
    source: "soundcloud" as const,
    audioUrl: "https://example.com/audio2.mp3",
  };

  it("should play a track and set queue", () => {
    const queue = [mockTrack, mockTrack2];
    useAppStore.getState().playTrack(mockTrack, queue, "playlist-1");

    const state = useAppStore.getState();
    expect(state.currentTrack).toEqual(mockTrack);
    expect(state.isPlaying).toBe(true);
    expect(state.queue).toEqual(queue);
    expect(state.queueIndex).toBe(0);
    expect(state.currentPlaylistId).toBe("playlist-1");
    expect(state.progress).toBe(0);
  });

  it("should toggle play/pause", () => {
    useAppStore.getState().playTrack(mockTrack, [mockTrack]);
    expect(useAppStore.getState().isPlaying).toBe(true);

    useAppStore.getState().togglePlay();
    expect(useAppStore.getState().isPlaying).toBe(false);

    useAppStore.getState().togglePlay();
    expect(useAppStore.getState().isPlaying).toBe(true);
  });

  it("should set volume", () => {
    useAppStore.getState().setVolume(75);
    expect(useAppStore.getState().volume).toBe(75);

    useAppStore.getState().setVolume(0);
    expect(useAppStore.getState().volume).toBe(0);
  });

  it("should set progress and duration", () => {
    useAppStore.getState().setProgress(45.5);
    expect(useAppStore.getState().progress).toBe(45.5);

    useAppStore.getState().setDuration(200);
    expect(useAppStore.getState().duration).toBe(200);
  });

  it("should navigate to next track", () => {
    useAppStore.getState().playTrack(mockTrack, [mockTrack, mockTrack2]);

    useAppStore.getState().nextTrack();
    const state = useAppStore.getState();
    expect(state.currentTrack?.id).toBe("track-2");
    expect(state.queueIndex).toBe(1);
  });

  it("should navigate to previous track", () => {
    useAppStore.getState().playTrack(mockTrack2, [mockTrack, mockTrack2], null);
    // Manually set queue index to simulate being on track 2
    useAppStore.getState().nextTrack();

    useAppStore.getState().prevTrack();
    const state = useAppStore.getState();
    expect(state.currentTrack?.id).toBe("track-1");
  });

  it("should toggle shuffle", () => {
    const initial = useAppStore.getState().shuffle;
    useAppStore.getState().toggleShuffle();
    expect(useAppStore.getState().shuffle).toBe(!initial);
  });

  it("should cycle repeat mode: off → all → one → off", () => {
    useAppStore.getState().toggleRepeat();
    expect(useAppStore.getState().repeat).toBe("all");

    useAppStore.getState().toggleRepeat();
    expect(useAppStore.getState().repeat).toBe("one");

    useAppStore.getState().toggleRepeat();
    expect(useAppStore.getState().repeat).toBe("off");
  });

  it("should set playback mode", () => {
    useAppStore.getState().setPlaybackMode("soundcloud");
    expect(useAppStore.getState().playbackMode).toBe("soundcloud");

    useAppStore.getState().setPlaybackMode("idle");
    expect(useAppStore.getState().playbackMode).toBe("idle");
  });
});

// ── UpNext Tests ──────────────────────────────────────────────────────────────────

describe("UpNext Queue", () => {
  const track1 = { id: "t1", title: "T1", artist: "A1", album: "AL1", cover: "", duration: 100, genre: "pop", scTrackId: 1, source: "soundcloud" as const, audioUrl: "" };
  const track2 = { id: "t2", title: "T2", artist: "A2", album: "AL2", cover: "", duration: 200, genre: "rock", scTrackId: 2, source: "soundcloud" as const, audioUrl: "" };
  const track3 = { id: "t3", title: "T3", artist: "A3", album: "AL3", cover: "", duration: 300, genre: "jazz", scTrackId: 3, source: "soundcloud" as const, audioUrl: "" };

  it("should add track to upNext", () => {
    useAppStore.getState().addToUpNext(track1);
    expect(useAppStore.getState().upNext).toHaveLength(1);
    expect(useAppStore.getState().upNext[0].id).toBe("t1");
  });

  it("should add multiple tracks to upNext", () => {
    useAppStore.getState().addToUpNextMultiple([track1, track2, track3]);
    expect(useAppStore.getState().upNext).toHaveLength(3);
  });

  it("should remove from upNext by index", () => {
    useAppStore.getState().addToUpNextMultiple([track1, track2, track3]);
    useAppStore.getState().removeFromUpNext(1);
    const upNext = useAppStore.getState().upNext;
    expect(upNext).toHaveLength(2);
    expect(upNext.map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("should move items in upNext", () => {
    useAppStore.getState().addToUpNextMultiple([track1, track2, track3]);
    useAppStore.getState().moveInUpNext(0, 2); // move track1 to end
    expect(useAppStore.getState().upNext.map((t) => t.id)).toEqual(["t2", "t3", "t1"]);
  });

  it("should clear upNext", () => {
    useAppStore.getState().addToUpNextMultiple([track1, track2]);
    useAppStore.getState().clearUpNext();
    expect(useAppStore.getState().upNext).toHaveLength(0);
  });
});

// ── Playlist Tests ──────────────────────────────────────────────────────────────────

describe("Playlists", () => {
  const track1 = { id: "t1", title: "T1", artist: "A1", album: "AL1", cover: "", duration: 100, genre: "pop", scTrackId: 1, source: "soundcloud" as const, audioUrl: "" };

  it("should create a playlist", () => {
    useAppStore.getState().createPlaylist("My Playlist", "A test playlist");
    const playlists = useAppStore.getState().playlists;
    expect(playlists).toHaveLength(1);
    expect(playlists[0].name).toBe("My Playlist");
    expect(playlists[0].description).toBe("A test playlist");
  });

  it("should rename a playlist", () => {
    useAppStore.getState().createPlaylist("Original");
    const plId = useAppStore.getState().playlists[0].id;

    useAppStore.getState().renamePlaylist(plId, "Renamed");
    expect(useAppStore.getState().playlists[0].name).toBe("Renamed");
  });

  it("should add track to playlist", () => {
    useAppStore.getState().createPlaylist("My Playlist");
    const plId = useAppStore.getState().playlists[0].id;

    useAppStore.getState().addToPlaylist(plId, track1);
    expect(useAppStore.getState().playlists[0].tracks).toHaveLength(1);
    expect(useAppStore.getState().playlists[0].tracks[0].id).toBe("t1");
  });

  it("should remove track from playlist", () => {
    useAppStore.getState().createPlaylist("My Playlist");
    const plId = useAppStore.getState().playlists[0].id;

    useAppStore.getState().addToPlaylist(plId, track1);
    useAppStore.getState().removeFromPlaylist(plId, "t1");
    expect(useAppStore.getState().playlists[0].tracks).toHaveLength(0);
  });

  it("should delete a playlist", () => {
    useAppStore.getState().createPlaylist("To Delete");
    const plId = useAppStore.getState().playlists[0].id;

    useAppStore.getState().deletePlaylist(plId);
    expect(useAppStore.getState().playlists).toHaveLength(0);
  });

  it("should set selected playlist id", () => {
    useAppStore.getState().setSelectedPlaylistId("pl-123");
    expect(useAppStore.getState().selectedPlaylistId).toBe("pl-123");

    useAppStore.getState().setSelectedPlaylistId(null);
    expect(useAppStore.getState().selectedPlaylistId).toBeNull();
  });
});

// ── Like/Dislike Tests ──────────────────────────────────────────────────────────────────

describe("Likes / Dislikes", () => {
  const track1 = { id: "t1", title: "T1", artist: "A1", album: "AL1", cover: "", duration: 100, genre: "pop", scTrackId: 1, source: "soundcloud" as const, audioUrl: "" };

  it("should toggle like on a track", () => {
    useAppStore.getState().toggleLike("t1", track1);
    expect(useAppStore.getState().likedTrackIds).toContain("t1");
    expect(useAppStore.getState().isTrackLiked("t1")).toBe(true);

    // Toggle again to unlike
    useAppStore.getState().toggleLike("t1", track1);
    expect(useAppStore.getState().likedTrackIds).not.toContain("t1");
    expect(useAppStore.getState().isTrackLiked("t1")).toBe(false);
  });

  it("should toggle dislike on a track", () => {
    useAppStore.getState().toggleDislike("t2", track1);
    expect(useAppStore.getState().dislikedTrackIds).toContain("t2");
    expect(useAppStore.getState().isTrackDisliked("t2")).toBe(true);

    // Toggle again to un-dislike
    useAppStore.getState().toggleDislike("t2", track1);
    expect(useAppStore.getState().dislikedTrackIds).not.toContain("t2");
  });

  it("should return false for non-liked/non-disliked tracks", () => {
    expect(useAppStore.getState().isTrackLiked("nonexistent")).toBe(false);
    expect(useAppStore.getState().isTrackDisliked("nonexistent")).toBe(false);
  });
});

// ── Theme Tests ──────────────────────────────────────────────────────────────────

describe("Theme", () => {
  it("should set theme", () => {
    useAppStore.getState().setTheme("neon");
    expect(useAppStore.getState().currentTheme).toBe("neon");
  });

  it("should set custom accent color", () => {
    useAppStore.getState().setCustomAccent("#ff0000");
    expect(useAppStore.getState().customAccent).toBe("#ff0000");

    useAppStore.getState().setCustomAccent(null);
    expect(useAppStore.getState().customAccent).toBeNull();
  });

  it("should toggle animations", () => {
    const initial = useAppStore.getState().animationsEnabled;
    useAppStore.getState().setAnimationsEnabled(!initial);
    expect(useAppStore.getState().animationsEnabled).toBe(!initial);
  });

  it("should set compact mode", () => {
    useAppStore.getState().setCompactMode(true);
    expect(useAppStore.getState().compactMode).toBe(true);
  });

  it("should set font size", () => {
    useAppStore.getState().setFontSize(20);
    expect(useAppStore.getState().fontSize).toBe(20);
  });

  it("should set liquid glass", () => {
    useAppStore.getState().setLiquidGlassEnabled(true);
    expect(useAppStore.getState().liquidGlassEnabled).toBe(true);
  });
});

// ── History Tests ──────────────────────────────────────────────────────────────────

describe("History", () => {
  const track1 = { id: "t1", title: "T1", artist: "A1", album: "AL1", cover: "", duration: 100, genre: "pop", scTrackId: 1, source: "soundcloud" as const, audioUrl: "" };

  it("should add track to history", () => {
    useAppStore.getState().addToHistory(track1);
    const history = useAppStore.getState().history;
    expect(history).toHaveLength(1);
    expect(history[0].track.id).toBe("t1");
  });

  it("should increment play count on repeated add", () => {
    useAppStore.getState().addToHistory(track1);
    useAppStore.getState().addToHistory(track1);
    const entry = useAppStore.getState().history.find((h) => h.track.id === "t1");
    expect(entry?.playCount).toBeGreaterThanOrEqual(2);
  });

  it("should clear history", () => {
    useAppStore.getState().addToHistory(track1);
    useAppStore.getState().clearHistory();
    expect(useAppStore.getState().history).toHaveLength(0);
  });
});

// ── Sleep Timer Tests ──────────────────────────────────────────────────────────────────

describe("Sleep Timer", () => {
  it("should start sleep timer", () => {
    useAppStore.getState().startSleepTimer(30);
    const state = useAppStore.getState();
    expect(state.sleepTimerActive).toBe(true);
    expect(state.sleepTimerMinutes).toBe(30);
    expect(state.sleepTimerEndTime).not.toBeNull();
  });

  it("should stop sleep timer", () => {
    useAppStore.getState().startSleepTimer(15);
    useAppStore.getState().stopSleepTimer();
    const state = useAppStore.getState();
    expect(state.sleepTimerActive).toBe(false);
    expect(state.sleepTimerEndTime).toBeNull();
  });
});

// ── EQ Tests ──────────────────────────────────────────────────────────────────────────

describe("Equalizer", () => {
  it("should enable/disable EQ", () => {
    useAppStore.getState().setEqEnabled(true);
    expect(useAppStore.getState().eqEnabled).toBe(true);

    useAppStore.getState().setEqEnabled(false);
    expect(useAppStore.getState().eqEnabled).toBe(false);
  });

  it("should set individual EQ band", () => {
    useAppStore.getState().setEqBand(0, 6);
    expect(useAppStore.getState().eqBands[0]).toBe(6);

    useAppStore.getState().setEqBand(4, -8);
    expect(useAppStore.getState().eqBands[4]).toBe(-8);
  });

  it("should set EQ preset", () => {
    useAppStore.getState().setEqPreset("bass-boost");
    expect(useAppStore.getState().eqPreset).toBe("bass-boost");
    // bass-boost preset is 10-band (see EQ_PRESETS in lib/eq.ts)
    expect(useAppStore.getState().eqBands).toEqual([6, 5, 3, 1, 0, 0, 0, 0, 0, 0]);
  });
});

// ── Spatial Audio Tests ──────────────────────────────────────────────────────────────────

describe("Spatial Audio", () => {
  it("should enable/disable spatial audio", () => {
    useAppStore.getState().setSpatialAudioEnabled(true);
    expect(useAppStore.getState().spatialAudioEnabled).toBe(true);

    useAppStore.getState().setSpatialAudioEnabled(false);
    expect(useAppStore.getState().spatialAudioEnabled).toBe(false);
  });

  it("should set spatial mood", () => {
    useAppStore.getState().setSpatialMood("chill");
    expect(useAppStore.getState().spatialMood).toBe("chill");

    useAppStore.getState().setSpatialMood(null);
    expect(useAppStore.getState().spatialMood).toBeNull();
  });

  it("should set spatial auto detect", () => {
    useAppStore.getState().setSpatialAutoDetect(false);
    expect(useAppStore.getState().spatialAutoDetect).toBe(false);
  });
});

// ── Crossfade Tests ──────────────────────────────────────────────────────────────────

describe("Crossfade", () => {
  it("should enable/disable crossfade", () => {
    useAppStore.getState().setCrossfadeEnabled(false);
    expect(useAppStore.getState().crossfadeEnabled).toBe(false);

    useAppStore.getState().setCrossfadeEnabled(true);
    expect(useAppStore.getState().crossfadeEnabled).toBe(true);
  });

  it("should set crossfade duration", () => {
    useAppStore.getState().setCrossfadeDuration(4);
    expect(useAppStore.getState().crossfadeDuration).toBe(4);
  });
});

// ── Radio Mode Tests ──────────────────────────────────────────────────────────────────

describe("Radio Mode", () => {
  const mockTrack = {
    id: "track-1", title: "Test Song", artist: "Test Artist", album: "Test Album",
    cover: "/test.jpg", duration: 200, genre: "electronic", scTrackId: 12345,
    source: "soundcloud" as const, audioUrl: "https://example.com/audio.mp3",
  };

  it("should not enable radio without current track", () => {
    // radioMode requires a current track to start
    useAppStore.getState().toggleRadioMode();
    expect(useAppStore.getState().radioMode).toBe(false);
  });

  it("should enable radio mode when current track exists", () => {
    useAppStore.getState().playTrack(mockTrack, [mockTrack]);
    expect(useAppStore.getState().isPlaying).toBe(true);

    useAppStore.getState().toggleRadioMode();
    expect(useAppStore.getState().radioMode).toBe(true);
    expect(useAppStore.getState().radioSeedTrack).toEqual(mockTrack);
  });

  it("should disable radio mode when toggled again", () => {
    useAppStore.getState().playTrack(mockTrack, [mockTrack]);
    useAppStore.getState().toggleRadioMode();
    expect(useAppStore.getState().radioMode).toBe(true);

    useAppStore.getState().toggleRadioMode();
    expect(useAppStore.getState().radioMode).toBe(false);
  });
});

// ── Feedback Tests ──────────────────────────────────────────────────────────────────

describe("Feedback", () => {
  it("should record skip", () => {
    useAppStore.getState().recordSkip("t1", 30);
    const feedback = useAppStore.getState().trackFeedback;
    expect(feedback["t1"]).toBeDefined();
    expect(feedback["t1"].skips).toBe(1);
    expect(feedback["t1"].skipPositions).toContain(30);
  });

  it("should record completion", () => {
    useAppStore.getState().recordComplete("t2", 180);
    const feedback = useAppStore.getState().trackFeedback;
    expect(feedback["t2"]).toBeDefined();
    expect(feedback["t2"].completes).toBe(1);
    expect(feedback["t2"].listenTime).toBe(180);
  });
});

// ── View Navigation Tests ──────────────────────────────────────────────────────────────────

describe("View Navigation", () => {
  it("should set view", () => {
    useAppStore.getState().setView("search");
    expect(useAppStore.getState().currentView).toBe("search");

    useAppStore.getState().setView("settings");
    expect(useAppStore.getState().currentView).toBe("settings");
  });

  it("should reset to main view with clean state", () => {
    useAppStore.getState().setView("search");
    useAppStore.getState().setFullTrackViewOpen(true);

    useAppStore.getState().setView("main");
    const state = useAppStore.getState();
    expect(state.currentView).toBe("main");
    expect(state.isFullTrackViewOpen).toBe(false);
    expect(state.searchQuery).toBe("");
  });
});

// ── Cat Mascot Tests ──────────────────────────────────────────────────────────────────

describe("Cat Mascot", () => {
  it("should enable/disable cat", () => {
    useAppStore.getState().setCatEnabled(true);
    expect(useAppStore.getState().catEnabled).toBe(true);
  });

  it("should set cat mood", () => {
    useAppStore.getState().setCatMood("panic");
    expect(useAppStore.getState().catMood).toBe("panic");
  });

  it("should pet cat", () => {
    const initial = useAppStore.getState().catPetCount;
    useAppStore.getState().petCat();
    expect(useAppStore.getState().catPetCount).toBe(initial + 1);
  });
});

// ── A-B Repeat Tests ──────────────────────────────────────────────────────────────────

describe("A-B Repeat", () => {
  it("should set A point", () => {
    useAppStore.getState().setProgress(30);
    useAppStore.getState().setAbRepeatPoint("A");
    expect(useAppStore.getState().abRepeat.pointA).toBe(30);
    expect(useAppStore.getState().abRepeat.pointB).toBeNull();
    expect(useAppStore.getState().abRepeat.active).toBe(false);
  });

  it("should set B point and activate when currentTime > pointA", () => {
    useAppStore.getState().setProgress(30);
    useAppStore.getState().setAbRepeatPoint("A");

    useAppStore.getState().setProgress(120);
    useAppStore.getState().setAbRepeatPoint("B");

    const abState = useAppStore.getState().abRepeat;
    expect(abState.pointA).toBe(30);
    expect(abState.pointB).toBe(120);
    expect(abState.active).toBe(true);
  });

  it("should not activate B point if currentTime <= pointA", () => {
    useAppStore.getState().setProgress(120);
    useAppStore.getState().setAbRepeatPoint("A");

    useAppStore.getState().setProgress(30);
    useAppStore.getState().setAbRepeatPoint("B");

    const abState = useAppStore.getState().abRepeat;
    expect(abState.pointB).toBeNull(); // B not set since 30 <= 120
    expect(abState.active).toBe(false);
  });

  it("should clear A-B repeat", () => {
    useAppStore.getState().setProgress(30);
    useAppStore.getState().setAbRepeatPoint("A");
    useAppStore.getState().setProgress(120);
    useAppStore.getState().setAbRepeatPoint("B");
    useAppStore.getState().clearAbRepeat();

    const abState = useAppStore.getState().abRepeat;
    expect(abState.pointA).toBeNull();
    expect(abState.pointB).toBeNull();
    expect(abState.active).toBe(false);
  });
});
