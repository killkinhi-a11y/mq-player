/**
 * Canonical share URL contract (§25.1, §25.8).
 *
 * These URLs are the WEB ↔ ANDROID ↔ QR contract — byte-identical to
 * android/.../deeplink/DeepLinkParser.kt (contract-tested there as
 * "share urls are real https links"). Every share surface (ShareSheet QR,
 * copy link, native share, context menus) must go through these builders.
 */
import { describe, it, expect } from "vitest";

// APP_URL resolves at module load (env || window.origin) — pin the canonical
// production origin BEFORE importing the builders (static imports hoist,
// so the module under test is imported dynamically after the stub).
process.env.NEXT_PUBLIC_APP_URL = "https://mq1.vercel.app";
const { shareTrackUrl, shareArtistUrl, sharePlaylistUrl } = await import("@/lib/share-urls");

describe("shareTrackUrl", () => {
  it("builds the canonical public track URL from scTrackId", () => {
    expect(shareTrackUrl({ scTrackId: 417474360, id: "t1" })).toBe(
      "https://mq1.vercel.app/track/417474360"
    );
  });

  it("returns null for tracks without a public id (demo/local) — no dead links", () => {
    expect(shareTrackUrl({ id: "demo-1" })).toBeNull();
    expect(shareTrackUrl({ scTrackId: undefined, id: "x" })).toBeNull();
  });
});

describe("shareArtistUrl", () => {
  it("builds /play?artist= with proper encoding (the route that resolves)", () => {
    expect(shareArtistUrl("Steve Miller Band")).toBe(
      "https://mq1.vercel.app/play?artist=Steve%20Miller%20Band"
    );
  });

  it("never produces the old broken /artist/{name} route", () => {
    expect(shareArtistUrl("Foo")).not.toContain("/artist/");
  });
});

describe("sharePlaylistUrl", () => {
  it("builds /play?pl= with the playlist id", () => {
    expect(sharePlaylistUrl("pl_123")).toBe("https://mq1.vercel.app/play?pl=pl_123");
  });

  it("encodes ids safely", () => {
    expect(sharePlaylistUrl("a b&c")).toBe("https://mq1.vercel.app/play?pl=a%20b%26c");
  });
});

describe("cross-surface consistency (§25.8)", () => {
  it("track/artist/playlist URLs share ONE canonical origin", () => {
    const urls = [
      shareTrackUrl({ scTrackId: 1, id: "t" })!,
      shareArtistUrl("X"),
      sharePlaylistUrl("p"),
    ];
    expect(urls.every((u) => u.startsWith("https://mq1.vercel.app/"))).toBe(true);
  });
});
