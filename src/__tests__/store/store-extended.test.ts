/**
 * Extended unit tests for Zustand App Store
 * Tests: messenger, notifications, search, favorites, taste profile, style, mini player,
 *        store persistence, and quota management
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import type { FavoriteArtist } from "@/store/useAppStore";

// Clear localStorage + reset store before each test (same pattern as existing tests)
beforeEach(() => {
  localStorage.clear();
  const store = useAppStore.getState();
  if (store.reset) store.reset();
});

// ── Helper: create a mock chat message ──────────────────────────────────────────
function createMockMessage(overrides: Partial<{
  id: string; content: string; senderId: string; receiverId: string;
}> = {}) {
  return {
    id: overrides.id ?? `msg-${Date.now()}-${Math.random()}`,
    content: overrides.content ?? "Hello!",
    senderId: overrides.senderId ?? "user-1",
    receiverId: overrides.receiverId ?? "user-2",
    encrypted: false,
    createdAt: new Date().toISOString(),
  };
}

// ── Messenger Tests ──────────────────────────────────────────────────────────────

describe("Messenger — addMessage", () => {
  it("should add a valid message to the store", () => {
    const msg = createMockMessage();
    useAppStore.getState().addMessage(msg);
    expect(useAppStore.getState().messages).toHaveLength(1);
    expect(useAppStore.getState().messages[0].id).toBe(msg.id);
  });

  it("should skip messages without id", () => {
    const msg = createMockMessage({ id: "" });
    useAppStore.getState().addMessage({ ...msg, id: "" } as any);
    expect(useAppStore.getState().messages).toHaveLength(0);
  });

  it("should skip messages without senderId", () => {
    const msg = createMockMessage();
    useAppStore.getState().addMessage({ ...msg, senderId: "" } as any);
    expect(useAppStore.getState().messages).toHaveLength(0);
  });

  it("should deduplicate messages with the same id", () => {
    const msg = createMockMessage({ id: "dup-1" });
    useAppStore.getState().addMessage(msg);
    useAppStore.getState().addMessage(msg);
    expect(useAppStore.getState().messages).toHaveLength(1);
  });

  it("should cap messages at 1000 in memory", () => {
    // Add 1001 messages
    for (let i = 0; i <= 1001; i++) {
      useAppStore.getState().addMessage(createMockMessage({ id: `msg-${i}` }));
    }
    expect(useAppStore.getState().messages.length).toBeLessThanOrEqual(1000);
  });
});

describe("Messenger — setSelectedContact", () => {
  it("should set the selected contact id", () => {
    useAppStore.getState().setSelectedContact("contact-1");
    expect(useAppStore.getState().selectedContactId).toBe("contact-1");
  });

  it("should clear unread count for the selected contact", () => {
    // Set up some unread counts
    useAppStore.getState().clearUnread("contact-1"); // ensure key exists
    useAppStore.setState({ unreadCounts: { "contact-1": 5, "contact-2": 3 } });

    useAppStore.getState().setSelectedContact("contact-1");
    expect(useAppStore.getState().unreadCounts["contact-1"]).toBe(0);
    expect(useAppStore.getState().unreadCounts["contact-2"]).toBe(3);
  });

  it("should allow setting null to deselect", () => {
    useAppStore.getState().setSelectedContact("contact-1");
    useAppStore.getState().setSelectedContact(null);
    expect(useAppStore.getState().selectedContactId).toBeNull();
  });
});

describe("Messenger — clearUnread", () => {
  it("should clear unread count for a specific contact", () => {
    useAppStore.setState({ unreadCounts: { "contact-1": 5, "contact-2": 3 } });
    useAppStore.getState().clearUnread("contact-1");
    expect(useAppStore.getState().unreadCounts["contact-1"]).toBe(0);
    expect(useAppStore.getState().unreadCounts["contact-2"]).toBe(3);
  });
});

describe("Messenger — addContact", () => {
  const mockContact = {
    id: "c1", name: "Alice", username: "alice", avatar: "/a.jpg",
    online: true, lastSeen: new Date().toISOString(),
  };

  it("should add a new contact", () => {
    useAppStore.getState().addContact(mockContact);
    expect(useAppStore.getState().contacts).toHaveLength(1);
    expect(useAppStore.getState().contacts[0].id).toBe("c1");
  });

  it("should not add a duplicate contact", () => {
    useAppStore.getState().addContact(mockContact);
    useAppStore.getState().addContact(mockContact);
    expect(useAppStore.getState().contacts).toHaveLength(1);
  });
});

describe("Messenger — deleteMessagesForContact", () => {
  it("should delete all messages involving a contact", () => {
    useAppStore.getState().addMessage(createMockMessage({ id: "m1", senderId: "me", receiverId: "c1" }));
    useAppStore.getState().addMessage(createMockMessage({ id: "m2", senderId: "c1", receiverId: "me" }));
    useAppStore.getState().addMessage(createMockMessage({ id: "m3", senderId: "me", receiverId: "c2" }));

    useAppStore.getState().deleteMessagesForContact("c1");
    const msgs = useAppStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe("m3");
  });
});

describe("Messenger — setTypingUser / clearTypingUser", () => {
  it("should set typing indicator for a contact", () => {
    useAppStore.getState().setTypingUser("c1");
    expect(useAppStore.getState().typingUsers["c1"]).toBeDefined();
    expect(typeof useAppStore.getState().typingUsers["c1"]).toBe("number");
  });

  it("should clear typing indicator for a contact", () => {
    useAppStore.getState().setTypingUser("c1");
    useAppStore.getState().clearTypingUser("c1");
    expect(useAppStore.getState().typingUsers["c1"]).toBeUndefined();
  });

  it("should not affect other contacts' typing indicators", () => {
    useAppStore.getState().setTypingUser("c1");
    useAppStore.getState().setTypingUser("c2");
    useAppStore.getState().clearTypingUser("c1");
    expect(useAppStore.getState().typingUsers["c2"]).toBeDefined();
  });
});

// ── Notification Tests ──────────────────────────────────────────────────────────

describe("Notifications", () => {
  it("should set notification count", () => {
    useAppStore.getState().setNotificationCount(5);
    expect(useAppStore.getState().notificationCount).toBe(5);

    useAppStore.getState().setNotificationCount(0);
    expect(useAppStore.getState().notificationCount).toBe(0);
  });

  it("should set notification panel open state", () => {
    useAppStore.getState().setNotifPanelOpen(true);
    expect(useAppStore.getState().notifPanelOpen).toBe(true);

    useAppStore.getState().setNotifPanelOpen(false);
    expect(useAppStore.getState().notifPanelOpen).toBe(false);
  });
});

// ── Search Tests ────────────────────────────────────────────────────────────────

describe("Search", () => {
  it("should set search query", () => {
    useAppStore.getState().setSearchQuery("bonobo");
    expect(useAppStore.getState().searchQuery).toBe("bonobo");

    useAppStore.getState().setSearchQuery("");
    expect(useAppStore.getState().searchQuery).toBe("");
  });

  it("should set selected genre", () => {
    useAppStore.getState().setSelectedGenre("electronic");
    expect(useAppStore.getState().selectedGenre).toBe("electronic");

    useAppStore.getState().setSelectedGenre("");
    expect(useAppStore.getState().selectedGenre).toBe("");
  });

  it("should set loading state", () => {
    useAppStore.getState().setIsLoading(true);
    expect(useAppStore.getState().isLoading).toBe(true);

    useAppStore.getState().setIsLoading(false);
    expect(useAppStore.getState().isLoading).toBe(false);
  });
});

// ── Favorites Tests ────────────────────────────────────────────────────────────

describe("Favorite Artists", () => {
  const artist1: FavoriteArtist = {
    id: 101, username: "artist1", avatar: "/a1.jpg",
    genre: "electronic", followers: 1000, trackCount: 50,
  };
  const artist2: FavoriteArtist = {
    id: 102, username: "artist2", avatar: "/a2.jpg",
    genre: "rock", followers: 500, trackCount: 25,
  };

  it("should set favorite artists list", () => {
    useAppStore.getState().setFavoriteArtists([artist1, artist2]);
    expect(useAppStore.getState().favoriteArtists).toHaveLength(2);
    expect(useAppStore.getState().favoriteArtists[0].id).toBe(101);
  });

  it("should add a favorite artist", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    useAppStore.getState().addFavoriteArtist(artist1);
    expect(useAppStore.getState().favoriteArtists).toHaveLength(1);
    expect(useAppStore.getState().favoriteArtists[0].id).toBe(101);

    vi.restoreAllMocks();
  });

  it("should not add a duplicate favorite artist", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    useAppStore.getState().addFavoriteArtist(artist1);
    useAppStore.getState().addFavoriteArtist(artist1);
    expect(useAppStore.getState().favoriteArtists).toHaveLength(1);

    vi.restoreAllMocks();
  });

  it("should remove a favorite artist by id", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    useAppStore.getState().setFavoriteArtists([artist1, artist2]);
    useAppStore.getState().removeFavoriteArtist(101);
    expect(useAppStore.getState().favoriteArtists).toHaveLength(1);
    expect(useAppStore.getState().favoriteArtists[0].id).toBe(102);

    vi.restoreAllMocks();
  });

  it("should set onboarding complete", () => {
    expect(useAppStore.getState().onboardingComplete).toBe(false);

    useAppStore.getState().setOnboardingComplete(true);
    expect(useAppStore.getState().onboardingComplete).toBe(true);

    useAppStore.getState().setOnboardingComplete(false);
    expect(useAppStore.getState().onboardingComplete).toBe(false);
  });
});

// ── Taste Profile Tests ────────────────────────────────────────────────────────

describe("Taste Profile", () => {
  it("should set taste genre with level", () => {
    useAppStore.getState().setTasteGenre("electronic", 80);
    expect(useAppStore.getState().tasteGenres["electronic"]).toBe(80);
  });

  it("should add genre to dislikedTags when level is below 10", () => {
    useAppStore.getState().setTasteGenre("country", 5);
    expect(useAppStore.getState().dislikedTags).toContain("country");
  });

  it("should remove genre from dislikedTags when level is above 70", () => {
    // First add as disliked
    useAppStore.getState().setTasteGenre("pop", 5);
    expect(useAppStore.getState().dislikedTags).toContain("pop");

    // Then set high level
    useAppStore.getState().setTasteGenre("pop", 80);
    expect(useAppStore.getState().dislikedTags).not.toContain("pop");
  });

  it("should set taste artist with level", () => {
    useAppStore.getState().setTasteArtist("Bonobo", 60);
    expect(useAppStore.getState().tasteArtists["Bonobo"]).toBe(60);
  });

  it("should set taste mood with level", () => {
    useAppStore.getState().setTasteMood("chill", 75);
    expect(useAppStore.getState().tasteMoods["chill"]).toBe(75);
  });

  it("should toggle excluded artist — add", () => {
    useAppStore.getState().toggleExcludedArtist("BadArtist");
    expect(useAppStore.getState().excludedArtists).toContain("BadArtist");
    // When excluding, tasteArtists level should be set to 0
    expect(useAppStore.getState().tasteArtists["BadArtist"]).toBe(0);
  });

  it("should toggle excluded artist — remove", () => {
    useAppStore.getState().toggleExcludedArtist("BadArtist");
    expect(useAppStore.getState().excludedArtists).toContain("BadArtist");

    useAppStore.getState().toggleExcludedArtist("BadArtist");
    expect(useAppStore.getState().excludedArtists).not.toContain("BadArtist");
    // When un-excluding, tasteArtists level should be set to 50
    expect(useAppStore.getState().tasteArtists["BadArtist"]).toBe(50);
  });

  it("should reset taste profile", () => {
    useAppStore.getState().setTasteGenre("electronic", 80);
    useAppStore.getState().setTasteArtist("Bonobo", 60);
    useAppStore.getState().setTasteMood("chill", 75);
    useAppStore.getState().toggleExcludedArtist("BadArtist");

    useAppStore.getState().resetTasteProfile();

    const state = useAppStore.getState();
    expect(state.tasteGenres).toEqual({});
    expect(state.tasteArtists).toEqual({});
    expect(state.tasteMoods).toEqual({});
    expect(state.excludedArtists).toEqual([]);
  });
});

// ── Style Tests ────────────────────────────────────────────────────────────────

describe("Style", () => {
  it("should set current style", () => {
    useAppStore.getState().setStyle("neon");
    expect(useAppStore.getState().currentStyle).toBe("neon");
  });

  it("should persist style to localStorage", () => {
    useAppStore.getState().setStyle("japan");
    expect(localStorage.getItem("mq-style")).toBe("japan");
  });

  it("should clear localStorage when style is empty", () => {
    useAppStore.getState().setStyle("pixel-flower");
    useAppStore.getState().setStyle("");
    expect(localStorage.getItem("mq-style")).toBeNull();
  });

  it("should set style variant", () => {
    useAppStore.getState().setStyleVariant("light");
    expect(useAppStore.getState().styleVariant).toBe("light");
  });

  it("should persist style variant to localStorage", () => {
    useAppStore.getState().setStyleVariant("light");
    expect(localStorage.getItem("mq-style-variant")).toBe("light");
  });

  it("should clear localStorage when variant is empty", () => {
    useAppStore.getState().setStyleVariant("light");
    useAppStore.getState().setStyleVariant("");
    expect(localStorage.getItem("mq-style-variant")).toBeNull();
  });
});

// ── Mini Player Tests ──────────────────────────────────────────────────────────

describe("Mini Player", () => {
  it("should set mini player hidden", () => {
    expect(useAppStore.getState().miniPlayerHidden).toBe(false);

    useAppStore.getState().setMiniPlayerHidden(true);
    expect(useAppStore.getState().miniPlayerHidden).toBe(true);

    useAppStore.getState().setMiniPlayerHidden(false);
    expect(useAppStore.getState().miniPlayerHidden).toBe(false);
  });
});

// ── Store Persistence Tests ────────────────────────────────────────────────────

describe("Store Persistence", () => {
  it("should persist state to localStorage on state change", () => {
    useAppStore.getState().setVolume(75);
    useAppStore.getState().setTheme("neon");

    // The persist middleware should write to localStorage
    const stored = localStorage.getItem("mq-store-v8");
    expect(stored).not.toBeNull();

    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.state.volume).toBe(75);
      expect(parsed.state.currentTheme).toBe("neon");
    }
  });

  it("should include version number in persisted data", () => {
    useAppStore.getState().setVolume(50);

    const stored = localStorage.getItem("mq-store-v8");
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.version).toBeDefined();
      expect(typeof parsed.version).toBe("number");
    }
  });

  it("should rehydrate state from localStorage", () => {
    // Set some state and let it persist
    useAppStore.getState().setVolume(88);
    useAppStore.getState().setTheme("minimal");

    // Read what was persisted
    const stored = localStorage.getItem("mq-store-v8");
    expect(stored).not.toBeNull();

    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.state.volume).toBe(88);
      expect(parsed.state.currentTheme).toBe("minimal");
    }
  });
});

// ── Store Quota Management Tests ───────────────────────────────────────────────

describe("Store Quota Management", () => {
  it("should trim history when it exceeds MAX_HISTORY (200)", () => {
    // We test this by checking that the localStorage adapter trims
    // The store's quota-managed storage should trim history > 200
    // We'll verify by checking the persisted data
    const track = {
      id: "t1", title: "T1", artist: "A1", album: "AL1", cover: "",
      duration: 100, genre: "pop", scTrackId: 1, source: "soundcloud" as const, audioUrl: "",
    };

    // Add more than 200 history entries
    for (let i = 0; i < 210; i++) {
      useAppStore.getState().addToHistory({ ...track, id: `t-${i}` });
    }

    // The in-memory store may have more, but the persisted store should trim
    const stored = localStorage.getItem("mq-store-v8");
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.state.history.length).toBeLessThanOrEqual(200);
    }
  });

  it("should trim messages when they exceed MAX_MESSAGES (500) in persisted data", () => {
    // Add a lot of messages to push past the 500 limit
    for (let i = 0; i < 510; i++) {
      useAppStore.getState().addMessage(createMockMessage({
        id: `msg-${i}`,
        senderId: "user-1",
        receiverId: "user-2",
      }));
    }

    const stored = localStorage.getItem("mq-store-v8");
    if (stored) {
      const parsed = JSON.parse(stored);
      // Persisted messages should be trimmed to 500
      expect(parsed.state.messages.length).toBeLessThanOrEqual(500);
    }
  });

  it("should handle localStorage write gracefully on error", () => {
    // Mock localStorage.setItem to throw
    const originalSetItem = localStorage.setItem.bind(localStorage);
    let callCount = 0;
    localStorage.setItem = (...args) => {
      callCount++;
      if (callCount === 1) throw new Error("QuotaExceededError");
      return originalSetItem(...args);
    };

    // This should not throw
    expect(() => {
      useAppStore.getState().setVolume(50);
    }).not.toThrow();

    // Restore
    localStorage.setItem = originalSetItem;
  });
});

// ── Support Chat Tests ─────────────────────────────────────────────────────────

describe("Support Chat", () => {
  it("should set support unread count", () => {
    useAppStore.getState().setSupportUnreadCount(5);
    expect(useAppStore.getState().supportUnreadCount).toBe(5);
  });

  it("should increment support unread count", () => {
    useAppStore.getState().setSupportUnreadCount(2);
    useAppStore.getState().incrementSupportUnread();
    expect(useAppStore.getState().supportUnreadCount).toBe(3);
  });
});
