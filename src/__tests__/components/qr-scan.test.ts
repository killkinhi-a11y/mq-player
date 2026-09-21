/**
 * REAL QR scanability proof (§25.6, §25.11).
 *
 * A URL string assert is NOT enough — this test rasterizes the ACTUAL
 * qrcode.react output (same component, same ECC level, same quiet zone,
 * same colors as the live ShareSheet) into pixels and decodes it with
 * jsQR — an independent decoder, i.e. a camera-equivalent read.
 *
 * Also proves the center artwork overlay (42px on a 200px code ≈ 21%
 * linear) does not break scanning thanks to ECC level H.
 *
 * The final end-to-end check (screenshot of the live rendered sheet
 * decoded through pngjs+jsQR) runs in the browser QA phase.
 */
import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import jsQR from "jsqr";

const URL = "https://mq1.vercel.app/track/417474360";
const ARTIST_URL = "https://mq1.vercel.app/play?artist=Steve%20Miller%20Band";
const PLAYLIST_URL = "https://mq1.vercel.app/play?pl=pl_1758xxx";

function renderQrMatrix(url: string): { size: number; dark: boolean[][] } {
  const html = renderToStaticMarkup(
    React.createElement(QRCodeSVG, {
      value: url,
      size: 200,
      level: "H",
      marginSize: 4,
      bgColor: "#ffffff",
      fgColor: "#0d0d0f",
    })
  );
  const viewBox = html.match(/viewBox="0 0 (\d+) (\d+)"/);
  expect(viewBox).toBeTruthy();
  const size = Number(viewBox![1]);
  const dark: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  // Only the FOREGROUND path carries the modules (the first path is the
  // white background rect — must not be rasterized as dark).
  const fg = html.match(/fill="#0d0d0f" d="([^"]*)"/);
  expect(fg).toBeTruthy();
  // qrcode.react path = per-row runs: M{x}[sep]{y}[sep]h{w}v{h}H{x}z
  // (separators vary: space, comma, comma+space)
  const re = /M(-?[\d.]+)[,\s]+(-?[\d.]+)\s*h(-?[\d.]+)v(-?[\d.]+)/g;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(fg![1])) !== null) {
    const x = Math.round(Number(m[1]));
    const y = Math.round(Number(m[2]));
    const w = Math.round(Number(m[3]));
    const h = Math.round(Number(m[4]));
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (y + dy < size && x + dx < size) {
          dark[y + dy][x + dx] = true;
          count++;
        }
      }
    }
  }
  expect(count).toBeGreaterThan(size * size * 0.25); // real QR density
  return { size, dark };
}

function decodeMatrix(dark: boolean[][], size: number, scale = 8): string | null {
  const px = size * scale;
  const data = new Uint8ClampedArray(px * px * 4);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const on = dark[Math.floor(y / scale)][Math.floor(x / scale)];
      const i = (y * px + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = on ? 0x0d : 0xff;
      data[i + 3] = 255;
    }
  }
  const res = jsQR(data, px, px);
  return res ? res.data : null;
}

describe("ShareSheet QR — real decode (camera-equivalent)", () => {
  it("track URL scans and round-trips", () => {
    const { size, dark } = renderQrMatrix(URL);
    expect(decodeMatrix(dark, size)).toBe(URL);
  });

  it("artist URL scans and round-trips", () => {
    const { size, dark } = renderQrMatrix(ARTIST_URL);
    expect(decodeMatrix(dark, size)).toBe(ARTIST_URL);
  });

  it("playlist URL scans and round-trips", () => {
    const { size, dark } = renderQrMatrix(PLAYLIST_URL);
    expect(decodeMatrix(dark, size)).toBe(PLAYLIST_URL);
  });

  it("quiet zone: outer 4-module margin is fully light (spec §25.2)", () => {
    const { size, dark } = renderQrMatrix(URL);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const inMargin = x < 4 || y < 4 || x >= size - 4 || y >= size - 4;
        if (inMargin) expect(dark[y][x]).toBe(false);
      }
    }
  });

  it("survives the center artwork overlay (42px on 200px ≈ 21% linear) — ECC H", () => {
    const { size, dark } = renderQrMatrix(URL);
    // Blank the center block the same way the 42/200 overlay covers it
    const coverModules = Math.ceil(size * 0.21);
    const c0 = Math.floor((size - coverModules) / 2);
    const occluded = dark.map((row) => row.slice());
    for (let y = c0; y < c0 + coverModules; y++) {
      for (let x = c0; x < c0 + coverModules; x++) {
        occluded[y][x] = false; // artwork chip = solid white background
      }
    }
    expect(decodeMatrix(occluded, size)).toBe(URL);
  });
});
