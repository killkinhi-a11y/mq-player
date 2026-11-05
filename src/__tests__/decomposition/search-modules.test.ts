import { describe, it, expect, beforeEach } from "vitest";
import { normalizeName, nameMatchesQuery } from "@/components/mq/search/matching";
import { getSearchHistory, saveSearchHistory, SEARCH_HISTORY_KEY, MAX_HISTORY } from "@/components/mq/search/searchHistory";
import { registerLocalBlobUrl, getLocalBlobUrl } from "@/lib/localBlobUrls";
import * as legacy from "@/components/mq/SearchView";

describe("search/matching (extracted from SearchView)", () => {
  it("normalizes punctuation, symbols and case", () => {
    expect(normalizeName("  AC/DC — Back!!  In  Black ")).toBe("ac dc back in black");
  });
  it("follows the strength ladder", () => {
    const q = normalizeName("faded alan walker");
    expect(nameMatchesQuery("Faded", q, false)).toBe(false); // album must not capture
    expect(nameMatchesQuery("Alan Walker", q, true)).toBe(true); // artist containment
    expect(nameMatchesQuery("Random Access Memories", normalizeName("random acce"), false)).toBe(true);
    expect(nameMatchesQuery("X", "x", true)).toBe(false); // too short
  });
});

describe("search/searchHistory — localStorage contract unchanged", () => {
  beforeEach(() => localStorage.clear());
  it("uses the same key and caps at MAX_HISTORY", () => {
    expect(SEARCH_HISTORY_KEY).toBe("mq-search-history");
    saveSearchHistory(Array.from({ length: 30 }, (_, i) => `q${i}`));
    expect(JSON.parse(localStorage.getItem("mq-search-history")!)).toHaveLength(MAX_HISTORY);
    expect(getSearchHistory()[0]).toBe("q0");
  });
  it("returns [] on corrupt data", () => {
    localStorage.setItem(SEARCH_HISTORY_KEY, "{bad");
    expect(getSearchHistory()).toEqual([]);
  });
});

describe("lib/localBlobUrls (moved out of SearchView to break lib → component cycle)", () => {
  it("registers and resolves blob urls; SearchView re-exports the same functions", () => {
    registerLocalBlobUrl("local-1", "blob:abc");
    expect(getLocalBlobUrl("local-1")).toBe("blob:abc");
    expect(getLocalBlobUrl("nope")).toBeNull();
    expect(legacy.getLocalBlobUrl).toBe(getLocalBlobUrl);
    expect(legacy.registerLocalBlobUrl).toBe(registerLocalBlobUrl);
  });
});
