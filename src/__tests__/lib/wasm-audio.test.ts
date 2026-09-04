/**
 * WASM audio engine — pure decision + manifest logic tests (Node/jsdom,
 * no browser audio APIs needed).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { shouldUseWasmBackend, estimateSeekByte, probeWasmCapabilities } from "@/lib/wasm-audio/decide";
import { fetchAudioEngineManifest, assetUrl, resetManifestCache } from "@/lib/wasm-audio/manifest";
import { EXPECTED_WASM_ABI } from "@/lib/wasm-audio/types";

const baseInput = {
  enabled: true,
  isHls: false,
  isEncrypted: false,
  source: "soundcloud",
  playbackRate: 1,
  workletSupported: true,
  wasmSupported: true,
  fetchSupported: true,
};

describe("shouldUseWasmBackend", () => {
  it("routes progressive non-DRM soundcloud/audius/demo tracks to WASM", () => {
    expect(shouldUseWasmBackend(baseInput)).toBe(true);
    expect(shouldUseWasmBackend({ ...baseInput, source: "audius" })).toBe(true);
    expect(shouldUseWasmBackend({ ...baseInput, source: "demo" })).toBe(true);
  });

  it("never routes DRM content through the PCM pipeline (§35.15)", () => {
    expect(shouldUseWasmBackend({ ...baseInput, isEncrypted: true })).toBe(false);
  });

  it("keeps HLS on the hls.js element path", () => {
    expect(shouldUseWasmBackend({ ...baseInput, isHls: true })).toBe(false);
  });

  it("falls back when the engine is disabled by settings", () => {
    expect(shouldUseWasmBackend({ ...baseInput, enabled: false })).toBe(false);
  });

  it("falls back when playbackRate != 1 (no time-stretch in v1)", () => {
    expect(shouldUseWasmBackend({ ...baseInput, playbackRate: 1.5 })).toBe(false);
    expect(shouldUseWasmBackend({ ...baseInput, playbackRate: 0.75 })).toBe(false);
  });

  it("falls back when browser capabilities are missing", () => {
    expect(shouldUseWasmBackend({ ...baseInput, workletSupported: false })).toBe(false);
    expect(shouldUseWasmBackend({ ...baseInput, wasmSupported: false })).toBe(false);
    expect(shouldUseWasmBackend({ ...baseInput, fetchSupported: false })).toBe(false);
  });

  it("falls back for unknown sources (conservative default)", () => {
    expect(shouldUseWasmBackend({ ...baseInput, source: "spotify" })).toBe(false);
    expect(shouldUseWasmBackend({ ...baseInput, source: "local" })).toBe(false);
  });
});

describe("estimateSeekByte (§35.14)", () => {
  it("maps seconds → byte offset linearly", () => {
    expect(estimateSeekByte(30, 120, 480000)).toBe(120000);
    expect(estimateSeekByte(0, 120, 480000)).toBe(0);
    expect(estimateSeekByte(120, 120, 480000)).toBe(479520); // 0.999 clamp
  });

  it("clamps into [0, totalBytes-1] and handles garbage", () => {
    expect(estimateSeekByte(500, 120, 480000)).toBeLessThan(480000);
    expect(estimateSeekByte(-10, 120, 480000)).toBe(0);
    expect(estimateSeekByte(30, 0, 480000)).toBe(0);
    expect(estimateSeekByte(30, 120, 0)).toBe(0);
    expect(estimateSeekByte(NaN, 120, 480000)).toBe(0);
  });
});

describe("probeWasmCapabilities", () => {
  it("returns false everywhere under SSR (no window)", () => {
    // jsdom + this test file has no AudioContext — expect graceful probing
    const caps = probeWasmCapabilities();
    expect(caps).toHaveProperty("workletSupported");
    expect(caps).toHaveProperty("wasmSupported");
    expect(caps).toHaveProperty("fetchSupported");
  });
});

describe("audio engine manifest", () => {
  beforeEach(() => {
    resetManifestCache();
  });

  const validManifest = {
    tag: "5f6658-53a483",
    core: "audio_wasm.wasm",
    codec: "codec_wasm.wasm",
    worklet: "mq-audio-worklet.js",
    worker: "mq-decode-worker.js",
    coreBytes: 400472,
    codecBytes: 736030,
    builtAt: "2026-09-03T17:40:00Z",
    simd: true,
  };

  it("fetches version.json with cache:no-store and builds asset URLs from the tag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => validManifest,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const m = await fetchAudioEngineManifest();
    expect(m.tag).toBe("5f6658-53a483");
    expect(fetchMock).toHaveBeenCalledWith(
      "/audio-engine/version.json",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(assetUrl(m, m.core)).toBe("/audio-engine/5f6658-53a483/audio_wasm.wasm");
    expect(assetUrl(m, m.worker)).toBe("/audio-engine/5f6658-53a483/mq-decode-worker.js");
  });

  it("caches the manifest promise (single fetch per page)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => validManifest,
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await fetchAudioEngineManifest();
    await fetchAudioEngineManifest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed manifests (version consistency guard, §35.9)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag: "no-files" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchAudioEngineManifest()).rejects.toThrow("malformed");
    // failed fetch must not be cached
    resetManifestCache();
  });

  it("rejects HTTP failures and clears the cache for retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchAudioEngineManifest()).rejects.toThrow("HTTP 404");
  });
});

describe("ABI contract", () => {
  it("EXPECTED_WASM_ABI matches the Rust MQ_ABI_VERSION (3)", () => {
    // Bump both together: audio-engine/crates/{audio-wasm,codec-wasm}/src/lib.rs
    // v3: ring-buffer lane pointer semantics + expanded EngineStats layout
    // (rms/peak/gainReductionDb/truePeakDb/lufsShort after the DSP meters).
    expect(EXPECTED_WASM_ABI).toBe(3);
  });
});
