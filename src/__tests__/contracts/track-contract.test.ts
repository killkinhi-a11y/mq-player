import { describe, expect, it } from "vitest";
import fixtures from "../../../shared/test-fixtures/track.cases.json";
import type { Track } from "@/lib/musicApi";
import { TRACK_CONTRACT, parseTrack, validateTrack } from "@/lib/contracts/track";

interface Case {
  id: string;
  description: string;
  input: unknown;
  expected: { valid: boolean; errors: string[]; warnings: string[]; normalized?: Record<string, unknown> };
}

const cases = fixtures.cases as Case[];

// Compile-time list of every key of the web Track type. Adding a field to Track
// without listing it here fails `tsc`; the test below then fails until the
// shared contract (and therefore Android) knows about it too.
const TRACK_KEYS: Record<keyof Track, true> = {
  id: true, title: true, artist: true, album: true, duration: true, cover: true, genre: true,
  audioUrl: true, previewUrl: true, source: true, scTrackId: true, scStreamPolicy: true,
  scIsFull: true, createdAt: true, _reason: true, _seedArtist: true, _src: true,
  _srcTrackId: true, _srcAlbumId: true, _srcPlaylistKind: true, catalogProvider: true,
  catalogId: true, catalogArtistId: true, playbackProvider: true, playbackId: true,
  _resolveConfidence: true, versionTag: true,
};

describe("shared Track contract", () => {
  it("fixtures target the current contract version", () => {
    expect(fixtures.contract).toBe("track");
    expect(fixtures.contractVersion).toBe(TRACK_CONTRACT.version);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it("web Track type and shared contract list exactly the same fields", () => {
    expect(Object.keys(TRACK_KEYS).sort()).toEqual(Object.keys(TRACK_CONTRACT.fields).sort());
  });

  it("covers the required scenarios (valid + invalid)", () => {
    const ids = cases.map((c) => c.id);
    for (const must of [
      "track-soundcloud-full", "track-no-cover", "track-multiple-artists", "track-local-file",
      "track-yandex-import", "track-spotify-lazy", "track-missing-id", "track-unknown-source",
    ]) expect(ids).toContain(must);
    expect(cases.some((c) => !c.expected.valid)).toBe(true);
  });

  for (const c of cases) {
    it(`${c.id}: ${c.description}`, () => {
      const res = validateTrack(c.input);
      expect(res.valid).toBe(c.expected.valid);
      expect(res.errors.sort()).toEqual([...c.expected.errors].sort());
      expect(res.warnings.sort()).toEqual([...c.expected.warnings].sort());

      const parsed = parseTrack(c.input);
      expect(parsed.ok).toBe(c.expected.valid);
      if (parsed.ok && c.expected.normalized) {
        // Defaults match the Android model's defaults; unknown fields survive.
        expect(parsed.track).toEqual(c.expected.normalized);
        // JSON round trip is lossless.
        expect(JSON.parse(JSON.stringify(parsed.track))).toEqual(
          JSON.parse(JSON.stringify(c.expected.normalized)),
        );
        // Re-validating the normalized form is stable.
        expect(validateTrack(parsed.track).errors).toEqual([]);
      }
    });
  }
});
