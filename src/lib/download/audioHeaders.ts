/**
 * Honest audio-header parsing — real bitrate/sample-rate/size discovery.
 *
 * Reads only the first bytes of the ACTUAL file (via a 64 KB Range request
 * where supported, else the full body used for the download anyway).
 * No values are invented: unknown ⇒ omitted.
 */

export interface AudioHeaderInfo {
  kind: "mp3" | "flac";
  bitrateKbps?: number;
  sampleRateHz?: number;
}

/** Parse an MPEG audio frame header for Layer III MP3 (CBR-aware). */
export function parseMp3Header(bytes: Uint8Array): AudioHeaderInfo | null {
  // Skip ID3v2 if present: "ID3" + version(2) + flags(1) + synchsafe size(4)
  let offset = 0;
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    offset = 10 + size;
  }
  // Find frame sync 0xFF Ex within the first 64 KB (need bytes i..i+2).
  const limit = Math.min(bytes.length - 2, offset + 65536);
  for (let i = offset; i < limit; i++) {
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (bytes[i + 1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layerBits = (bytes[i + 1] >> 1) & 0x03; // 1=Layer III
    if (layerBits !== 0b01) continue;
    const bitrateIndex = (bytes[i + 2] >> 4) & 0x0f;
    const srIndex = (bytes[i + 2] >> 2) & 0x03;
    if (bitrateIndex === 0 || bitrateIndex === 15 || srIndex === 3) continue;

    const v1 = versionBits === 3;
    const bitrates = v1
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
    const sampleRates = v1
      ? [44100, 48000, 32000, 0]
      : versionBits === 2
        ? [22050, 24000, 16000, 0]
        : [11025, 12000, 8000, 0];

    const bitrate = bitrates[bitrateIndex];
    const sampleRate = sampleRates[srIndex];
    if (!bitrate || !sampleRate) continue;
    return { kind: "mp3", bitrateKbps: bitrate, sampleRateHz: sampleRate };
  }
  return null;
}

/** Parse a FLAC STREAMINFO block for sample rate (+ bit depth). */
export function parseFlacHeader(bytes: Uint8Array): AudioHeaderInfo | null {
  // "fLaC" + metadata block header (1 byte type — 0 = STREAMINFO — + 24-bit length)
  if (bytes.length < 42) return null;
  if (
    bytes[0] !== 0x66 || bytes[1] !== 0x4c || bytes[2] !== 0x61 || bytes[3] !== 0x43
  ) {
    return null;
  }
  const blockType = bytes[4] & 0x7f;
  if (blockType !== 0) return null; // STREAMINFO must be first
  // STREAMINFO (34 bytes) starts at offset 8. Sample rate = 20 bits at byte 18.
  // Layout: min/max blocksize (8B), min/max framesize (6B) → offset 8+14=... 
  // bytes 8..9 min block, 10..11 max block, 12..14 min frame, 15..17 max frame,
  // 18..: [20 bits sample rate][3 bits channels-1][5 bits bps-1][36 bits samples]
  const b = bytes;
  const sampleRate =
    (b[18] << 12) | (b[19] << 4) | (b[20] >> 4);
  if (sampleRate <= 0 || sampleRate > 768000) return null;
  return { kind: "flac", sampleRateHz: sampleRate };
}

/** Sniff what a byte stream actually is (magic bytes first, honest). */
export function sniffAudioKind(bytes: Uint8Array): "mp3" | "flac" | "other" {
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return "flac";
  }
  // ID3-wrapped or bare MP3
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "mp3";
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  return "other";
}

/** Probe a URL's headers + leading bytes: size (Content-Range/Length),
 *  content type, and parsed audio header — one 64 KB ranged request. */
export async function probeAudioUrl(
  url: string,
): Promise<{ sizeBytes?: number; contentType?: string; header?: AudioHeaderInfo } | null> {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-65535" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok && res.status !== 206) return null;
    const out: { sizeBytes?: number; contentType?: string; header?: AudioHeaderInfo } = {};
    const cr = res.headers.get("content-range");
    if (cr) {
      const m = cr.match(/\/(\d+)\s*$/);
      if (m) out.sizeBytes = parseInt(m[1], 10);
    } else {
      const cl = res.headers.get("content-length");
      if (cl) out.sizeBytes = parseInt(cl, 10);
    }
    out.contentType = res.headers.get("content-type") || undefined;

    // Read the leading bytes for header parsing, then cancel the body.
    const reader = res.body?.getReader();
    if (reader) {
      const { value } = await reader.read();
      if (value) {
        const kind = sniffAudioKind(value);
        if (kind === "mp3") out.header = parseMp3Header(value) ?? undefined;
        else if (kind === "flac") out.header = parseFlacHeader(value) ?? undefined;
      }
      try { await reader.cancel(); } catch { /* body already done */ }
    }
    return out;
  } catch {
    return null;
  }
}
