import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module mocks: network sources are simulated, never real ──
vi.mock("@/lib/streamResolver", () => ({
  resolveSoundCloudStream: vi.fn(),
  shouldProxyUrl: (url: string) =>
    url.startsWith("/api/") ? url : `/api/music/soundcloud/proxy?url=${encodeURIComponent(url)}`,
}));
vi.mock("@/lib/audius", () => ({
  getAudiusStream: vi.fn(),
}));
vi.mock("@/components/mq/SearchView", () => ({
  getLocalBlobUrl: vi.fn(),
}));

import { resolveSoundCloudStream } from "@/lib/streamResolver";
import { getAudiusStream } from "@/lib/audius";
import { getLocalBlobUrl } from "@/components/mq/SearchView";
import {
  getDownloadProvider,
  soundcloudDownloadProvider,
  localDownloadProvider,
  demoDownloadProvider,
} from "@/lib/download/providers";
import { getDownloadFormats, downloadTrack } from "@/lib/download/downloadService";
import { downloadErrorMessage } from "@/lib/download/types";
import { parseMp3Header, parseFlacHeader, sniffAudioKind } from "@/lib/download/audioHeaders";
import type { Track } from "@/lib/musicApi";

const mockedResolveSc = vi.mocked(resolveSoundCloudStream);
const mockedAudius = vi.mocked(getAudiusStream);
const mockedLocalUrl = vi.mocked(getLocalBlobUrl);

function scTrack(over: Partial<Track> = {}): Track {
  return {
    id: "sc_1", title: "T", artist: "A", album: "", duration: 180, cover: "",
    genre: "", audioUrl: "", source: "soundcloud", scTrackId: 111, ...over,
  } as Track;
}

/** MP3 frame: ID3v2 (size 0) + MPEG1 Layer III 128kbps 44100Hz. */
const MP3_BYTES = new Uint8Array([
  0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // "ID3" + hdr + size 0
  0xff, 0xfb, 0x90, 0x00, // sync + 128kbps + 44100
]);

/** FLAC: "fLaC" + STREAMINFO (34B) with sample rate 44100. */
const FLAC_BYTES = (() => {
  const b = new Uint8Array(42);
  b.set([0x66, 0x4c, 0x61, 0x43], 0);   // fLaC
  b[4] = 0x00;                           // STREAMINFO, not-last
  b[5] = 0; b[6] = 0; b[7] = 34;         // block length
  b[18] = 0x0a; b[19] = 0xc4; b[20] = 0x40; // sample rate bits → 44100
  return b;
})();

function mockProbeFetch(bytes: Uint8Array, totalSize: number) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const range = String((init?.headers as Record<string, string>)?.Range ?? "");
    const start = range.includes("bytes=0-") ? 0 : 0;
    const slice = bytes.slice(start);
    return {
      ok: true,
      status: 206,
      headers: new Headers({
        "content-range": `bytes 0-${slice.length - 1}/${totalSize}`,
        "content-type": "audio/mpeg",
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(slice);
          controller.close();
        },
      }),
    };
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  mockedResolveSc.mockReset();
  mockedAudius.mockReset();
  mockedLocalUrl.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

// ─── Honest audio headers ───────────────────────────────────────────────────

describe("Download — audio header parsing (real values only)", () => {
  it("parses MP3 frame header: bitrate + sample rate", () => {
    const info = parseMp3Header(MP3_BYTES)!;
    expect(info).not.toBeNull();
    expect(info.kind).toBe("mp3");
    expect(info.bitrateKbps).toBe(128);
    expect(info.sampleRateHz).toBe(44100);
  });

  it("parses FLAC STREAMINFO: sample rate", () => {
    const info = parseFlacHeader(FLAC_BYTES)!;
    expect(info).not.toBeNull();
    expect(info.kind).toBe("flac");
    expect(info.sampleRateHz).toBe(44100);
  });

  it("sniffs the actual container, not the label", () => {
    expect(sniffAudioKind(MP3_BYTES)).toBe("mp3");
    expect(sniffAudioKind(FLAC_BYTES)).toBe("flac");
    expect(sniffAudioKind(new Uint8Array([1, 2, 3]))).toBe("other");
  });
});

// ─── SoundCloud provider ────────────────────────────────────────────────────

describe("Download — SoundCloud provider (no fake FLAC, ever)", () => {
  it("MP3 available for unencrypted progressive, with REAL probed metadata", async () => {
    mockedResolveSc.mockResolvedValue({
      url: "https://cf-media.sndcdn.com/track.mp3?sig=1",
      isPreview: false, duration: 180, fullDuration: 180,
      isHls: false, isEncrypted: false, protocol: "progressive",
    } as never);
    vi.stubGlobal("fetch", mockProbeFetch(MP3_BYTES, 2_880_000));

    const formats = await soundcloudDownloadProvider.getFormats(scTrack());
    expect(formats).toHaveLength(2);
    const mp3 = formats[0];
    expect(mp3.format).toBe("mp3");
    expect(mp3.available).toBe(true);
    expect(mp3.bitrateKbps).toBe(128);          // real, parsed from the file
    expect(mp3.sampleRateHz).toBe(44100);
    expect(mp3.sizeBytes).toBe(2_880_000);      // real, from Content-Range
    // FLAC honestly unavailable — SoundCloud has no lossless.
    const flac = formats[1];
    expect(flac.format).toBe("flac");
    expect(flac.available).toBe(false);
    expect(flac.reason).toBe("unsupported_format");
  });

  it("DRM-encrypted track → source_restricted, no formats offered", async () => {
    mockedResolveSc.mockResolvedValue({
      url: "https://x/playlist.m3u8", isPreview: false, duration: 180, fullDuration: 180,
      isHls: true, isEncrypted: true, protocol: "ctr-encrypted-hls",
    } as never);
    const track = scTrack();
    expect(await soundcloudDownloadProvider.canDownload(track)).toBe(false);
    const formats = await soundcloudDownloadProvider.getFormats(track);
    expect(formats[0].available).toBe(false);
    expect(formats[0].reason).toBe("source_restricted");
    const res = await soundcloudDownloadProvider.download(track, "mp3");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("source_restricted");
  });

  it("plain HLS (no DRM) → unsupported_format (no re-encode, no demux)", async () => {
    mockedResolveSc.mockResolvedValue({
      url: "https://x/playlist.m3u8", isPreview: false, duration: 180, fullDuration: 180,
      isHls: true, isEncrypted: false, protocol: "hls",
    } as never);
    const formats = await soundcloudDownloadProvider.getFormats(scTrack());
    expect(formats[0].available).toBe(false);
    expect(formats[0].reason).toBe("unsupported_format");
  });

  it("snippet-only (preview) → not_available", async () => {
    mockedResolveSc.mockResolvedValue({
      url: "https://x/preview.mp3", isPreview: true, duration: 30, fullDuration: 180,
      isHls: false, isEncrypted: false, protocol: "progressive",
    } as never);
    const formats = await soundcloudDownloadProvider.getFormats(scTrack());
    expect(formats[0].available).toBe(false);
    expect(formats[0].reason).toBe("not_available");
  });

  it("provider failure (resolve throws/null) → normalized, no exception", async () => {
    mockedResolveSc.mockResolvedValue(null as never);
    const track = scTrack();
    const formats = await soundcloudDownloadProvider.getFormats(track);
    expect(formats[0].available).toBe(false);
    expect(formats[0].reason).toBe("not_available");
  });
});

// ─── Local provider (the ONLY lossless-capable source) ─────────────────────

describe("Download — local provider", () => {
  it("user's FLAC upload → FLAC available as the ORIGINAL file; MP3 honestly unavailable (no conversion)", async () => {
    mockedLocalUrl.mockReturnValue("blob:https://mq/local-1");
    vi.stubGlobal("fetch", mockProbeFetch(FLAC_BYTES, 38_000_000));

    const track = { id: "local_1", source: "local", title: "L", artist: "A", album: "", duration: 180, cover: "", genre: "", audioUrl: "blob:x" } as Track;
    const formats = await localDownloadProvider.getFormats(track);
    const flac = formats.find((f) => f.format === "flac")!;
    expect(flac.available).toBe(true);
    expect(flac.sampleRateHz).toBe(44100);
    const mp3 = formats.find((f) => f.format === "mp3")!;
    expect(mp3.available).toBe(false); // НЕ делаем псевдо-конвертацию FLAC→MP3
    expect(mp3.reason).toBe("unsupported_format");

    const res = await localDownloadProvider.download(track, "mp3");
    expect(res.ok).toBe(false); // refuses to convert
  });

  it("blob expired after reload → not_available with an honest note", async () => {
    mockedLocalUrl.mockReturnValue(null);
    const track = { id: "local_2", source: "local", title: "L", artist: "A", album: "", duration: 10, cover: "", genre: "", audioUrl: "" } as Track;
    expect(await localDownloadProvider.canDownload(track)).toBe(false);
    const formats = await localDownloadProvider.getFormats(track);
    expect(formats[0].available).toBe(false);
    expect(formats[0].note).toContain("сессии");
  });
});

// ─── Demo + selection + service façade ──────────────────────────────────────

describe("Download — demo provider + service façade", () => {
  it("demo MP3: available with real header info", async () => {
    vi.stubGlobal("fetch", mockProbeFetch(MP3_BYTES, 2_880_000));
    const track = { id: "demo-1", source: "demo", title: "D", artist: "A", album: "", duration: 180, cover: "", genre: "", audioUrl: "/demo/song1.mp3" } as Track;
    const formats = await demoDownloadProvider.getFormats(track);
    expect(formats[0].available).toBe(true);
    expect(formats[0].bitrateKbps).toBe(128);
  });

  it("provider selection maps source → provider; unknown source → no provider", () => {
    expect(getDownloadProvider(scTrack())?.id).toBe("soundcloud");
    expect(getDownloadProvider({ id: "x", source: "jamendo" } as Track)).toBeNull();
  });

  it("unknown source → getDownloadFormats still returns an honest pair", async () => {
    const formats = await getDownloadFormats({ id: "x", source: "jamendo" } as Track);
    expect(formats).toHaveLength(2);
    expect(formats.every((f) => !f.available)).toBe(true);
  });

  it("downloadTrack never throws — failures come back normalized", async () => {
    mockedResolveSc.mockRejectedValue(new Error("boom") as never);
    const res = await downloadTrack(scTrack(), "mp3");
    expect(res.ok).toBe(false);
    expect(["network_error", "not_available"]).toContain(res.error);
  });

  it("error mapping → human RU messages (no raw exceptions in UI)", () => {
    expect(downloadErrorMessage("not_available")).toContain("недоступно");
    expect(downloadErrorMessage("source_restricted")).toContain("ограничивает");
    expect(downloadErrorMessage("network_error")).toContain("сети");
    expect(downloadErrorMessage("unsupported_format")).toContain("формат");
  });
});
