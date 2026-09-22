/**
 * QR contract tests — REAL scannability, not decoration.
 *
 * Layer 1 (always runs): structural guarantees — the vendored Nayuki encoder
 *   produces a matrix with the three finder patterns, timing patterns, a
 *   valid size, and succeeds for every canonical MQ share URL shape.
 * Layer 2 (always runs, offline): decode round-trip through jsQR — the same
 *   decoder used by real phone camera pipelines — over a canvas-free RGBA
 *   raster built from our matrix, exactly like src/lib/qr.ts renders it
 *   (quiet zone 4 modules, #000 on #fff, crispEdges-equivalent full pixels).
 *
 * If any of these fail, the share QR is broken and must not ship.
 */
import { describe, expect, it } from "vitest";
import { buildQrMatrix, QR_QUIET_ZONE, qrSvgString } from "@/lib/qr";
import { shareTrackUrl, sharePlaylistUrl, shareArtistUrl } from "@/lib/share";
// Real decoder (jsQR dist bundle, Apache-2.0 — see scripts/qr-verify/README.md)
// imported via relative path so it works without touching app dependencies.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsQR = require("../../../scripts/qr-verify/jsQR.js") as
  (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

function matrixToRgba(matrix: ReturnType<typeof buildQrMatrix>, scale = 8): { data: Uint8ClampedArray; size: number } {
  const total = matrix.size + QR_QUIET_ZONE * 2;
  const size = total * scale;
  const px = new Uint8ClampedArray(size * size * 4);
  // white background
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255;
  }
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const py = (y + QR_QUIET_ZONE) * scale + dy;
          const pxx = (x + QR_QUIET_ZONE) * scale + dx;
          const o = (py * size + pxx) * 4;
          px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = 255;
        }
      }
    }
  }
  return { data: px, size };
}

const finderPatternAt = (m: ReturnType<typeof buildQrMatrix>, ox: number, oy: number): boolean => {
  // 7×7 finder: dark ring (rows/cols 0 and 6), white ring (1,5), dark 3×3 core (2..4)
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const isOuter = x === 0 || x === 6 || y === 0 || y === 6;
      const isMiddle = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      const expectDark = isOuter || isMiddle;
      if (m.get(ox + x, oy + y) !== expectDark) return false;
    }
  }
  return true;
};

const timingPattern = (m: ReturnType<typeof buildQrMatrix>): boolean => {
  for (let i = 8; i < m.size - 8; i++) {
    const expectDark = i % 2 === 0;
    if (m.get(i, 6) !== expectDark) return false;
    if (m.get(6, i) !== expectDark) return false;
  }
  return true;
};

describe("QR structure (vendored Nayuki encoder)", () => {
  it("finder patterns exist in all three corners", () => {
    const m = buildQrMatrix("https://mq1.vercel.app/track/12345");
    expect(finderPatternAt(m, 0, 0)).toBe(true);
    expect(finderPatternAt(m, m.size - 7, 0)).toBe(true);
    expect(finderPatternAt(m, 0, m.size - 7)).toBe(true);
  });

  it("timing patterns alternate from (8,6)/(6,8)", () => {
    const m = buildQrMatrix("https://mq1.vercel.app/track/12345");
    expect(timingPattern(m)).toBe(true);
  });

  it("size matches version formula", () => {
    const m = buildQrMatrix("https://mq1.vercel.app/play?pl=abcdef-1234");
    expect(m.size).toBe(m.version * 4 + 17);
    expect(m.version).toBeGreaterThanOrEqual(1);
  });

  it("rejects empty payloads", () => {
    expect(() => buildQrMatrix("")).toThrow();
  });
});

describe("QR decode round-trip (real jsQR decoder)", () => {
  const canonicalUrls: Array<[string, string]> = [
    ["track", shareTrackUrl({ id: 42, scTrackId: "sc-918273645" })],
    ["track (no soundcloud id)", shareTrackUrl({ id: 42 })],
    ["playlist", sharePlaylistUrl("662f1a2b3c4d5e6f7a8b9c0d")],
    ["artist", shareArtistUrl("Молчат Дома")], // cyrillic → URL-encoded, still one string
    ["artist (ascii)", shareArtistUrl("Daft Punk")],
  ];

  for (const [name, url] of canonicalUrls) {
    it(`decodes ${name}: ${url.slice(0, 60)}…`, () => {
      const matrix = buildQrMatrix(url, "medium");
      const raster = matrixToRgba(matrix);
      const decoded = jsQR(raster.data, raster.size, raster.size);
      expect(decoded).not.toBeNull();
      expect(decoded!.data).toBe(url);
    });
  }

  it("decodes at ECL high (longest realistic URL)", () => {
    const url = "https://mq1.vercel.app/play?pl=662f1a2b3c4d5e6f7a8b9c0d-very-long-playlist-identifier";
    const matrix = buildQrMatrix(url, "high");
    const raster = matrixToRgba(matrix);
    const decoded = jsQR(raster.data, raster.size, raster.size);
    expect(decoded).not.toBeNull();
    expect(decoded!.data).toBe(url);
  });

  it("survives a small scratch at ECL high (4×4 modules whited out)", () => {
    const url = shareTrackUrl({ id: "sc-918273645" });
    const matrix = buildQrMatrix(url, "high");
    const raster = matrixToRgba(matrix);
    // Corrupt a 4×4-module block in the pure data region (upper-middle area,
    // clear of finder + alignment patterns). A sticker/scratch on the code.
    const blockModules = 4;
    const ox = 9;
    const oy = 9;
    for (let y = 0; y < blockModules; y++) {
      for (let x = 0; x < blockModules; x++) {
        for (let dy = 0; dy < 8; dy++) {
          for (let dx = 0; dx < 8; dx++) {
            const py = (oy + y + QR_QUIET_ZONE) * 8 + dy;
            const pxx = (ox + x + QR_QUIET_ZONE) * 8 + dx;
            const o = (py * raster.size + pxx) * 4;
            raster.data[o] = 255; raster.data[o + 1] = 255; raster.data[o + 2] = 255;
          }
        }
      }
    }
    const decoded = jsQR(raster.data, raster.size, raster.size);
    expect(decoded).not.toBeNull();
    expect(decoded!.data).toBe(url);
  });

  it("SVG output is a crisp, quiet-zoned, high-contrast document", () => {
    const svg = qrSvgString("https://mq1.vercel.app/track/x");
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // module coordinates are shifted by the quiet zone (no module at 0,0)
    expect(svg).not.toMatch(/d="M0 0h/);
  });
});
