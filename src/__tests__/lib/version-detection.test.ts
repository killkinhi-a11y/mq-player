/**
 * Version detection tests — the foundation of the PlaybackResolver's
 * alternate-version penalties.
 *
 * The core scenario (user spec §7/§35): catalog track "Goosebumps" (3:46)
 * must NEVER be mistaken for "Goosebumps Live" (8:41), "Goosebumps Remix",
 * "Goosebumps Slowed + Reverb", or "Goosebumps Karaoke".
 */

import { describe, it, expect } from "vitest";
import {
  detectVersion,
  normalizeText,
  tokenSimilarity,
  exactTitle,
} from "@/lib/playback/versions";

describe("detectVersion", () => {
  it("detects ORIGINAL for a plain title", () => {
    const r = detectVersion("Goosebumps");
    expect(r.version).toBe("original");
    expect(r.isAlternate).toBe(false);
    expect(r.markers).toEqual([]);
  });

  it("detects ORIGINAL for feat. qualifiers (brackets stripped from identity)", () => {
    const r = detectVersion("Goosebumps (feat. Kendrick Lamar)");
    expect(r.version).toBe("original");
    expect(r.isAlternate).toBe(false);
  });

  it.each([
    ["Goosebumps - LIVE", "live"],
    ["Goosebumps (Live at Wembley)", "live"],
    ["goosebumps live version", "live"],
  ])("detects LIVE: %s", (title, expected) => {
    expect(detectVersion(title).version).toBe(expected);
  });

  it.each([
    ["Goosebumps (Remix)", "remix"],
    ["Goosebumps - Trym Remix", "remix"],
    ["Goosebumps Bootleg Mix", "remix"],
    ["Goosebumps VIP Mix", "remix"],
  ])("detects REMIX: %s", (title, expected) => {
    expect(detectVersion(title).version).toBe(expected);
  });

  it.each([
    ["Goosebumps Karaoke Version", "karaoke"],
    ["Goosebumps (Karaoke)", "karaoke"],
    ["Goosebumps - No Vocals", "karaoke"],
  ])("detects KARAOKE: %s", (title, expected) => {
    expect(detectVersion(title).version).toBe(expected);
  });

  it.each([
    ["Goosebumps Slowed + Reverb", "slowed"],
    ["Goosebumps (slowed)", "slowed"],
    ["Goosebumps Sped Up", "sped_up"],
    ["Goosebumps Nightcore", "sped_up"],
  ])("detects SLOWED/SPED-UP tiers: %s", (title, expected) => {
    expect(detectVersion(title).version).toBe(expected);
  });

  it("detects COVER and tribute", () => {
    expect(detectVersion("Goosebumps (Cover Version)").version).toBe("cover");
    expect(detectVersion("Goosebumps - Tribute Band").version).toBe("cover");
  });

  it("detects ACOUSTIC / INSTRUMENTAL / RADIO EDIT", () => {
    expect(detectVersion("Goosebumps Acoustic").version).toBe("acoustic");
    expect(detectVersion("Goosebumps Instrumental").version).toBe("instrumental");
    expect(detectVersion("Goosebumps - Radio Edit").version).toBe("radio_edit");
  });

  it("detects REMASTER with a milder tag", () => {
    expect(detectVersion("Goosebumps (2016 Remastered)").version).toBe("remaster");
  });

  it("scans the album field too", () => {
    const r = detectVersion("Goosebumps", "Astroworld (Live Edition)");
    expect(r.isAlternate).toBe(true);
    expect(r.version).toBe("live");
  });

  it("karaoke outranks remix when both present", () => {
    // "Karaoke Remix" — the most dangerous for identity is karaoke.
    const r = detectVersion("Goosebumps Karaoke Remix");
    expect(r.version).toBe("karaoke");
  });

  it("does not false-positive on substrings of ordinary words", () => {
    // "Edition" contains "edit" — must NOT fire the edit marker.
    expect(detectVersion("Special Edition").isAlternate).toBe(false);
    // "Believe" contains "live" as a substring — word boundaries prevent it.
    expect(detectVersion("Believe").isAlternate).toBe(false);
    expect(detectVersion("Liverpool Sound").isAlternate).toBe(false); // "Liverpool" is one word — no standalone "live"
    // Standalone "live" DOES fire.
    expect(detectVersion("Goosebumps Live at Wembley").version).toBe("live");
  });
});

describe("normalizeText", () => {
  it("strips feat. qualifiers and punctuation", () => {
    expect(normalizeText("Goosebumps (feat. Kendrick Lamar)")).toBe("goosebumps");
    expect(normalizeText("Goosebumps - Kendrick Lamar")).toBe("goosebumps kendrick lamar");
  });

  it("normalizes diacritics and $", () => {
    expect(normalizeText("Travis $cott")).toBe("travis scott");
    expect(normalizeText("Beyoncé")).toBe("beyonce");
  });

  it("normalizes & to and", () => {
    expect(normalizeText("Simon & Garfunkel")).toBe("simon and garfunkel");
  });

  it("collapses whitespace and case", () => {
    expect(normalizeText("  SUNNY   Day ")).toBe("sunny day");
  });
});

describe("tokenSimilarity", () => {
  it("returns 1 for identical titles", () => {
    expect(tokenSimilarity("Goosebumps", "goosebumps")).toBe(1);
  });

  it("survives reordering and small additions", () => {
    const sim = tokenSimilarity("Travis Scott Goosebumps", "Goosebumps - Travis Scott");
    expect(sim).toBeGreaterThanOrEqual(0.66);
  });

  it("returns 0 for unrelated titles", () => {
    expect(tokenSimilarity("Goosebumps", "Sicko Mode")).toBe(0);
  });
});

describe("exactTitle", () => {
  it("matches across normalization noise", () => {
    expect(exactTitle("Goosebumps (feat. Kendrick Lamar)", "goosebumps")).toBe(true);
    expect(exactTitle("Goosebumps", "Sicko Mode")).toBe(false);
  });
});
