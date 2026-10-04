/**
 * Wave Queue Manager tests (§12): enqueue dedup, refill thresholds,
 * consume + memory, playback-queue sync, bounded sizes.
 */

import { describe, it, expect } from "vitest";
import {
  enqueueWaveBatch,
  needsRefill,
  shiftWaveQueue,
  consumeWaveItem,
  pendingForPlaybackQueue,
  createWaveMemory,
  rememberWaveTrack,
  artistAppearanceCount,
  memoryToSignals,
  WAVE_CONFIG,
  type WaveQueueItem,
  type ScoredCandidate,
  type WaveTrackMinimal,
} from "@/lib/wave";

const NOW = 1730000000000;

function mkTrack(i: number, artist = `Artist ${i}`): WaveTrackMinimal & { id: string } {
  return {
    id: `t${i}`,
    title: `T${i}`,
    artist,
    album: "",
    duration: 200,
    genre: "indie",
    cover: "c",
    scTrackId: i,
    scIsFull: true,
  } as WaveTrackMinimal & { id: string };
}

function scored(i: number, reason: ScoredCandidate["reason"] = "taste_profile", artist?: string): ScoredCandidate<WaveTrackMinimal & { id: string }> {
  return {
    track: mkTrack(i, artist),
    score: 100 - i,
    reason,
    channel: "taste",
    exploration: reason === "exploration",
    breakdown: {},
  };
}

describe("wave queue (§12)", () => {
  it("enqueueWaveBatch dedups against existing items and appends reasons", () => {
    const existing: WaveQueueItem<WaveTrackMinimal & { id: string }>[] = [
      { track: mkTrack(1), reason: "taste_profile", enqueuedAt: NOW },
    ];
    const next = enqueueWaveBatch(existing, [scored(1, "exploration"), scored(2, "similar_track")], WAVE_CONFIG, NOW);
    expect(next.map((q) => q.track.id)).toEqual(["t1", "t2"]);
    expect(next[1].reason).toBe("similar_track");
    expect(next[1].enqueuedAt).toBe(NOW);
  });

  it("enqueueWaveBatch caps the queue at maxQueueSize (bounded §24)", () => {
    const big = Array.from({ length: 80 }, (_, i) => scored(i));
    const queue = enqueueWaveBatch([], big, WAVE_CONFIG, NOW);
    expect(queue.length).toBeLessThanOrEqual(WAVE_CONFIG.queue.maxQueueSize);
  });

  it("needsRefill triggers below minBuffer", () => {
    const q: WaveQueueItem<WaveTrackMinimal & { id: string }>[] = Array.from(
      { length: WAVE_CONFIG.queue.minBuffer - 1 },
      (_, i) => ({ track: mkTrack(i), reason: "taste_profile" as const, enqueuedAt: NOW }),
    );
    expect(needsRefill(q, WAVE_CONFIG)).toBe(true);
    const full = [...q, { track: mkTrack(999), reason: "taste_profile" as const, enqueuedAt: NOW }];
    expect(needsRefill(full, WAVE_CONFIG)).toBe(false);
  });

  it("consumeWaveItem pops the head AND records it in memory", () => {
    const queue: WaveQueueItem<WaveTrackMinimal & { id: string }>[] = [
      { track: mkTrack(1, "Head Artist"), reason: "taste_profile", enqueuedAt: NOW },
      { track: mkTrack(2), reason: "exploration", enqueuedAt: NOW },
    ];
    const memory = createWaveMemory();
    const result = consumeWaveItem(queue, memory, WAVE_CONFIG, NOW);
    expect(result?.item.track.id).toBe("t1");
    expect(result?.queue.map((q) => q.track.id)).toEqual(["t2"]);
    expect(result?.memory.tracks[0].value).toBe("t1");
    expect(result?.memory.artists[0].value).toBe("head artist");
    expect(result?.memory.playedCount).toBe(1);
    // Empty queue → null, no crash.
    expect(consumeWaveItem([], memory, WAVE_CONFIG, NOW)).toBeNull();
  });

  it("shiftWaveQueue is a pure head pop", () => {
    const queue: WaveQueueItem<WaveTrackMinimal & { id: string }>[] = [
      { track: mkTrack(1), reason: "taste_profile", enqueuedAt: NOW },
      { track: mkTrack(2), reason: "taste_profile", enqueuedAt: NOW },
    ];
    const shifted = shiftWaveQueue(queue);
    expect(shifted?.item.track.id).toBe("t1");
    expect(shifted?.rest).toHaveLength(1);
    expect(queue).toHaveLength(2); // input not mutated
  });

  it("pendingForPlaybackQueue returns only tracks not yet in the playback queue", () => {
    const waveQueue: WaveQueueItem<WaveTrackMinimal & { id: string }>[] = [
      { track: mkTrack(1), reason: "taste_profile", enqueuedAt: NOW },
      { track: mkTrack(2), reason: "taste_profile", enqueuedAt: NOW },
    ];
    const playback = [mkTrack(1)];
    const pending = pendingForPlaybackQueue(waveQueue, playback);
    expect(pending.map((t) => t.id)).toEqual(["t2"]);
  });
});

describe("wave memory (§21)", () => {
  it("artistAppearanceCount counts within the recent window only", () => {
    let memory = createWaveMemory();
    for (let i = 0; i < 6; i++) {
      memory = rememberWaveTrack(memory, mkTrack(i, "Repeat Artist"), NOW + i, WAVE_CONFIG);
    }
    // Repeat Artist is at the head of the artist list (newest-first).
    expect(artistAppearanceCount(memory, "Repeat Artist", 3)).toBe(1);
    expect(artistAppearanceCount(memory, "repeat artist", 100)).toBe(1);
    expect(artistAppearanceCount(memory, "Nobody", 10)).toBe(0);
  });

  it("memory stays bounded after many plays", () => {
    let memory = createWaveMemory();
    for (let i = 0; i < 300; i++) {
      memory = rememberWaveTrack(memory, mkTrack(i, `A${i % 50}`), NOW + i, WAVE_CONFIG);
    }
    expect(memory.tracks.length).toBeLessThanOrEqual(WAVE_CONFIG.memory.maxTracks);
    expect(memory.artists.length).toBeLessThanOrEqual(WAVE_CONFIG.memory.maxArtists);
  });

  it("memoryToSignals emits compact, pruned signal arrays", () => {
    let memory = createWaveMemory();
    // memoryToSignals prunes against Date.now() — use fresh timestamps.
    memory = rememberWaveTrack(memory, { ...mkTrack(1, "X Artist"), genre: "Pop" }, Date.now(), WAVE_CONFIG);
    const signals = memoryToSignals(memory, WAVE_CONFIG);
    expect(signals.recentWaveArtists).toContain("x artist");
    expect(signals.recentWaveTrackIds).toContain("t1");
  });
});
