import { describe, it, expect } from "vitest";
import { pluralRu, waveReasonText, greeting, getWaveGradient } from "@/components/mq/main/homeUtils";
import { waveReasonText as legacyWaveReasonText } from "@/components/mq/MainView";
import type { Track } from "@/lib/musicApi";

const t = (extra: Partial<Track>) => ({ id: "1", title: "", artist: "", album: "", cover: "", duration: 0, genre: "", audioUrl: "", previewUrl: "", source: "soundcloud", ...extra }) as Track;

describe("main/homeUtils (extracted from MainView)", () => {
  it("pluralRu follows Russian plural rules", () => {
    const f = (n: number) => pluralRu(n, "трек", "трека", "треков");
    expect([1, 2, 5, 11, 12, 21, 22, 25, 101, 111].map(f)).toEqual(
      ["трек", "трека", "треков", "треков", "треков", "трек", "трека", "треков", "трек", "треков"]);
  });
  it("waveReasonText maps reasons and falls back to empty", () => {
    expect(waveReasonText(t({ _reason: "similar_track", _seedArtist: "X" } as Partial<Track>))).toBe("Похоже на «X»");
    expect(waveReasonText(t({ _reason: "trending" } as Partial<Track>))).toBe("Популярно сейчас");
    expect(waveReasonText(t({}))).toBe("");
  });
  it("MainView keeps re-exporting waveReasonText (backward-compatible import)", () => {
    expect(legacyWaveReasonText).toBe(waveReasonText);
  });
  it("greeting / gradient return non-empty strings", () => {
    expect(greeting().length).toBeGreaterThan(0);
    expect(getWaveGradient()).toMatch(/gradient|#|rgb|var\(/);
  });
});
