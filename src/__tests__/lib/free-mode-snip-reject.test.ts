/**
 * Free Mode §2 regression — findAudiusAlternative must be SCORED and must
 * never offer a low-confidence or preview-length alternative; when nothing
 * clears the bar it returns null (→ the engine honestly REJECTS the track
 * instead of playing the 30s SNIP preview — verified live on prod
 * 2026-10-08: cf-preview-media stream played as "normal" playback).
 *
 * fetch is stubbed with in-memory Audius-shaped responses.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { findAudiusAlternative } from "@/lib/audius";

interface TrackDto {
  id: string;
  title: string;
  user: { name: string };
  duration: number;
}

function audiusResponse(tracks: TrackDto[]) {
  return {
    ok: true,
    json: async () => ({ data: tracks }),
  } as unknown as Response;
}

const GOOD = { id: "111", title: "Never Gonna Give You Up", user: { name: "Rick Astley" }, duration: 211 };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).startsWith("https://api.audius.co")) {
      // Host discovery — one healthy host.
      return {
        ok: true,
        json: async () => ({ data: ["https://discoveryprovider.audius.co"] }),
      } as unknown as Response;
    }
    // search endpoint
    return audiusResponse((globalThis as any).__tracks ?? []);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  (globalThis as any).__tracks = undefined;
});

describe("findAudiusAlternative (Free Mode §9/§10)", () => {
  it("returns a confident full-length alternative for a solid match", async () => {
    (globalThis as any).__tracks = [GOOD];
    const res = await findAudiusAlternative("Rick Astley", "Never Gonna Give You Up", 213);
    expect(res).not.toBeNull();
    expect(res!.url).toContain("/v1/tracks/111/stream");
    expect(res!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("returns null when the only candidate is a ~30s preview-length track", async () => {
    (globalThis as any).__tracks = [
      { ...GOOD, id: "222", duration: 30 }, // §6 short-duration reject
    ];
    const res = await findAudiusAlternative("Rick Astley", "Never Gonna Give You Up", 213);
    expect(res).toBeNull();
  });

  it("returns null for karaoke/cover noise even with a matching title", async () => {
    (globalThis as any).__tracks = [
      { id: "333", title: "Never Gonna Give You Up (Karaoke Version)", user: { name: "Karaoke Band" }, duration: 213 },
      { id: "334", title: "Never Gonna Give You Up AI Cover", user: { name: "Neural" }, duration: 213 },
    ];
    const res = await findAudiusAlternative("Rick Astley", "Never Gonna Give You Up", 213);
    expect(res).toBeNull();
  });

  it("returns null when nothing matches at all (no silent source switch)", async () => {
    (globalThis as any).__tracks = [
      { id: "444", title: "Completely Different Song", user: { name: "Someone Else" }, duration: 200 },
    ];
    const res = await findAudiusAlternative("Rick Astley", "Never Gonna Give You Up", 213);
    expect(res).toBeNull();
  });
});
