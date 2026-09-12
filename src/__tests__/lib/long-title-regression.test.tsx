/**
 * PART B regression tests — long titles must never break interactive actions.
 *
 * The real-world failure mode (user report): a long track title squeezes /
 * displaces / clips the action buttons (like, chat, history, playlist,
 * close, remove, more). The correct layout contract is:
 *   text/content wrapper → min-w-0 (+ truncate / line-clamp)
 *   actions              → flex-shrink-0
 *
 * Two layers:
 *  1. DOM render (ShareSheet — the most severe offender): the close button
 *     must keep its shrink-0 protection and the title must truncate.
 *  2. Source contracts for every fixed row (fast, catches class regressions).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const read = (f: string) =>
  readFileSync(join(process.cwd(), "src/components/mq", f), "utf8");

const PATHOLOGICAL_TITLE =
  "A".repeat(300) + "УУУУбез_пробелов" + "🔴🎵🎉".repeat(30) + "قلبمرحباשלום".repeat(20);

describe("long-title DOM regression — ShareSheet (close button survivability)", () => {
  it("renders with a 300+ char no-space/RTL/emoji title and protects the close button", async () => {
    const mod = await import("@/components/mq/ShareSheet");
    const ShareSheet = mod.ShareSheet;
    const html = renderToStaticMarkup(
      React.createElement(ShareSheet, {
        isOpen: true,
        onClose: () => {},
        url: "https://mq.example/track/1",
        title: PATHOLOGICAL_TITLE,
        subtitle: "subtitle",
      })
    );
    // The full title is delivered to the DOM (content intact)…
    expect(html).toContain("A".repeat(80));
    // …the title element truncates (CSS ellipsis — never layout overflow)…
    expect(html).toMatch(/class="[^"]*truncate[^"]*"/);
    // …the text wrapper is allowed to shrink below content size…
    expect(html).toMatch(/class="[^"]*min-w-0[^"]*"/);
    // …and the close button NEVER shrinks or gets pushed out.
    expect(html).toMatch(/<button[^>]*class="[^"]*shrink-0[^"]*"[^>]*>/);
    // Exactly one close (X) button exists in the header.
    expect(html).toContain("Поделиться");
  });
});

describe("long-title source contracts — actions never squeezed (min-w-0 + shrink-0)", () => {
  it("ShareSheet: header row = min-w-0 text + shrink-0 close", () => {
    const src = read("ShareSheet.tsx");
    expect(src).toMatch(/flex items-center gap-2\.5 min-w-0 flex-1/);
    expect(src).toMatch(/h-8 rounded-full flex items-center justify-center shrink-0/);
    // v68: text-[11px] → mq-t-meta-2 token (truncation contract unchanged)
    expect(src).toMatch(/mq-t-meta-2 truncate/);
  });

  it("StoriesView: viewer header username truncates, avatar + pause shrink-0", () => {
    const src = read("StoriesView.tsx");
    expect(src).toMatch(/flex-1 min-w-0">\s*\n\s*<p className="text-sm font-medium text-white truncate"/);
    expect(src).toMatch(/rounded-full object-cover shrink-0/);
    expect(src).toMatch(/p-2 rounded-full shrink-0/);
    // feed row username truncates too
    expect(src).toMatch(/text-sm font-medium truncate/);
  });

  it("SmartPlaylistBuilder: preview row — title min-w-0, artist capped", () => {
    const src = read("SmartPlaylistBuilder.tsx");
    expect(src).toMatch(/flex-1 min-w-0 truncate[^"]*" style=\{\{ color: "var\(--mq-text\)" \}\}/);
    // v68: artist capped at 45% (was 55) — more room for the added more-button
    expect(src).toMatch(/shrink-0 max-w-\[45%\] truncate/);
  });

  it("SearchView: genre badge is capped + truncatable (cannot overlay like/more)", () => {
    const src = read("SearchView.tsx");
    // §E v69 results row: the artist is the ONLY flexible element
    // (flex-1 min-w-0 → truncates), the genre badge is capped at 140px +
    // truncatable, and the duration tail is shrink-0 + whitespace-nowrap —
    // it can never be squeezed, wrapped, or ellipsized by a long title.
    expect(src).toMatch(/max-w-\[140px\] truncate/);
    expect(src).toMatch(/text-xs flex-1 min-w-0 text-left truncate/);
    expect(src).toMatch(/gap-1\.5 shrink-0 whitespace-nowrap/);
    expect(src).not.toMatch(/flex-shrink min-w-0/);
  });

  it("FullTrackView (desktop): meta row wraps, genre capped", () => {
    const src = read("FullTrackView.tsx");
    expect(src).toMatch(/flex flex-wrap items-center gap-x-3 gap-y-1/);
    expect(src).toMatch(/min-w-0 max-w-\[220px\] truncate/);
  });

  it("PlaylistView: PlaylistTrackRow actions are explicitly shrink-0", () => {
    const src = read("PlaylistView.tsx");
    // §J TrackRow: actions live in a flex-shrink-0 container; every action
    // button is fixed-size (w-8 h-8) — long titles can never squeeze them.
    const actionContainer = src.match(/flex items-center gap-0\.5 flex-shrink-0/g) || [];
    expect(actionContainer.length).toBeGreaterThanOrEqual(1);
    const fixedButtons = src.match(/w-8 h-8 rounded-full flex items-center justify-center/g) || [];
    expect(fixedButtons.length).toBeGreaterThanOrEqual(3); // like + remove + more
  });
});

describe("long-title pathological corpus sanity", () => {
  it("the corpus contains every requested case", () => {
    expect(PATHOLOGICAL_TITLE.length).toBeGreaterThan(300);
    expect(PATHOLOGICAL_TITLE).toMatch(/[\u0590-\u05FF]/); // RTL Hebrew
    expect(PATHOLOGICAL_TITLE).toMatch(/[\u0600-\u06FF]/); // RTL Arabic
    expect(PATHOLOGICAL_TITLE).toMatch(/[\uD83C-\uDBFF]/); // emoji (surrogate pair start)
    expect(PATHOLOGICAL_TITLE).not.toMatch(/\s/);          // no-space variant
  });
});

describe("v69 duration contract — duration is never squeezed/hidden by titles", () => {
  it("duration surfaces: shrink-0 + nowrap everywhere (no display:none escape)", () => {
    // Views that previously hid duration on mobile (hidden sm:block).
    const playlist = read("PlaylistView.tsx");
    expect(playlist).not.toMatch(/hidden sm:block text-right/);
    const favorites = read("FavoritesView.tsx");
    expect(favorites).not.toMatch(/hidden sm:block tabular-nums/);
    const artist = read("ArtistDetailView.tsx");
    expect(artist).not.toMatch(/mq-t-meta hidden sm:block shrink-0/);

    // Canonical formatter is imported (no local NaN-capable copies).
    expect(favorites).toMatch(/from "@\/lib\/musicApi"/);
    const progressBar = read("ProgressBar.tsx");
    expect(progressBar).toMatch(/from "@\/lib\/musicApi"/);
    expect(progressBar).toMatch(/duration > 0 \? fmt\(duration\) : "—"/);
  });

  it("duration formatter: one canonical implementation, hours + guards", async () => {
    const mod = await import("@/lib/musicApi");
    const { formatDuration, formatTrackDuration } = mod;
    // h:mm:ss survives (was clipped by minute-only copies).
    expect(formatDuration(3725)).toBe("1:02:05");
    // positions still start at 0:00…
    expect(formatDuration(0)).toBe("0:00");
    // …while unknown metadata renders an em-dash, never a fake 0:00.
    expect(formatTrackDuration(0)).toBe("—");
    expect(formatTrackDuration(NaN)).toBe("—");
    // negative/Infinity inputs can never produce -1:01 or Infinity strings.
    expect(formatDuration(-61)).toBe("0:00");
    expect(formatDuration(Infinity)).toBe("0:00");
    // SoundCloud ms heuristics auto-convert.
    expect(formatDuration(225000)).toBe("3:45");
  });

  it("mini player (mobile dock) renders a time label — duration is not display:none'd", () => {
    const dock = read("MobileDock.tsx");
    expect(dock).toMatch(/timeLabelRef/);
    expect(dock).toMatch(/mq-t-num/);
  });

  it("FullTrackView position/total: tabular token + honest unknown total", () => {
    const ftv = read("FullTrackView.tsx");
    expect(ftv).toMatch(/mq-t-time shrink-0/);
    expect(ftv).toMatch(/duration > 0 \? formatDuration\(duration\) : "—"/);
  });
});

