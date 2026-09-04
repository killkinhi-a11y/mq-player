"use client";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

export interface DominantColors {
  primary: string;   // e.g. "#e03131"
  secondary: string; // e.g. "#1a1a2e"
  muted: string;     // e.g. "#2d2d3d"
  vibrant: string;   // e.g. "#ff6b6b"
  dark: string;      // e.g. "#0a0a0a"
  rgb: { r: number; g: number; b: number }; // primary as RGB
}

const DEFAULT_COLORS: DominantColors = {
  primary: "#e03131",
  secondary: "#1a1a2e",
  muted: "#2d2d3d",
  vibrant: "#ff6b6b",
  dark: "#0a0a0a",
  rgb: { r: 224, g: 49, b: 49 },
};

// ── Per-track colour cache (avoids re-extraction) ──
const colorCache = new Map<string, DominantColors>();

// ── Colour distance in RGB space ──
function colorDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// ── Simple k-means clustering (k = 3, max 8 iterations) on sampled pixels ──
function kMeans(pixels: [number, number, number][], k = 3): [number, number, number][] {
  if (pixels.length === 0) return [[128, 128, 128]];
  if (pixels.length <= k) return pixels.slice();

  // Initialise centroids from evenly-spaced samples
  const centroids: [number, number, number][] = [];
  const step = Math.floor(pixels.length / k);
  for (let i = 0; i < k; i++) {
    centroids.push([...pixels[i * step]]);
  }

  for (let iter = 0; iter < 8; iter++) {
    const clusters: [number, number, number][][] = Array.from({ length: k }, () => []);
    for (const px of pixels) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = colorDist(px, centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      clusters[best].push(px);
    }
    let changed = false;
    for (let c = 0; c < k; c++) {
      const cluster = clusters[c];
      if (cluster.length === 0) continue;
      const avg: [number, number, number] = [0, 0, 0];
      for (const px of cluster) { avg[0] += px[0]; avg[1] += px[1]; avg[2] += px[2]; }
      avg[0] = Math.round(avg[0] / cluster.length);
      avg[1] = Math.round(avg[1] / cluster.length);
      avg[2] = Math.round(avg[2] / cluster.length);
      if (avg[0] !== centroids[c][0] || avg[1] !== centroids[c][1] || avg[2] !== centroids[c][2]) {
        changed = true;
      }
      centroids[c] = avg;
    }
    if (!changed) break;
  }

  return centroids;
}

// ── Luminance helper ──
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ── Sort centroids into named palette slots ──
function assignPalette(centroids: [number, number, number][]): DominantColors {
  if (centroids.length === 0) return DEFAULT_COLORS;

  const withSat = centroids.map((c) => {
    const max = Math.max(c[0], c[1], c[2]);
    const min = Math.min(c[0], c[1], c[2]);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = luminance(c[0], c[1], c[2]);
    return { c, sat, lum };
  });

  // Primary: most saturated that isn't too dark or too bright
  const sortedBySat = [...withSat].sort((a, b) => {
    const aScore = a.sat - (a.lum < 30 ? 0.5 : 0) - (a.lum > 230 ? 0.5 : 0);
    const bScore = b.sat - (b.lum < 30 ? 0.5 : 0) - (b.lum > 230 ? 0.5 : 0);
    return bScore - aScore;
  });
  const primary = sortedBySat[0]?.c || centroids[0];

  // Vibrant: bright + saturated (lighter version of primary)
  const vibrant: [number, number, number] = [
    Math.min(255, primary[0] + 40),
    Math.min(255, primary[1] + 40),
    Math.min(255, primary[2] + 40),
  ];

  // Secondary: darkest centroid
  const sortedByLum = [...withSat].sort((a, b) => a.lum - b.lum);
  const secondary: [number, number, number] = sortedByLum[0]
    ? [
        Math.round(sortedByLum[0].c[0] * 0.4),
        Math.round(sortedByLum[0].c[1] * 0.4),
        Math.round(sortedByLum[0].c[2] * 0.4),
      ]
    : [26, 26, 46];

  // Muted: average of all centroids, desaturated
  const avgR = centroids.reduce((s, c) => s + c[0], 0) / centroids.length;
  const avgG = centroids.reduce((s, c) => s + c[1], 0) / centroids.length;
  const avgB = centroids.reduce((s, c) => s + c[2], 0) / centroids.length;
  const muted: [number, number, number] = [
    Math.round(avgR * 0.35 + 20),
    Math.round(avgG * 0.35 + 20),
    Math.round(avgB * 0.35 + 20),
  ];

  // Dark: very dark version of primary
  const dark: [number, number, number] = [
    Math.round(primary[0] * 0.08),
    Math.round(primary[1] * 0.08),
    Math.round(primary[2] * 0.08),
  ];

  const toHex = (c: [number, number, number]) =>
    `#${c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;

  return {
    primary: toHex(primary),
    secondary: toHex(secondary),
    muted: toHex(muted),
    vibrant: toHex(vibrant),
    dark: toHex(dark),
    rgb: { r: primary[0], g: primary[1], b: primary[2] },
  };
}

// ── Extract dominant colours from an image URL ──
// Exported for the Artist page hero (gradient derived from the artwork).
export function extractColors(imageUrl: string): Promise<DominantColors> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    const SIZE = 50;

    const timer = setTimeout(() => {
      resolve(DEFAULT_COLORS);
    }, 3000);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) { resolve(DEFAULT_COLORS); return; }

        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

        // Sample every 4th pixel, skip transparent / near-white / near-black
        const pixels: [number, number, number][] = [];
        for (let i = 0; i < data.length; i += 16) { // 4 channels × 4 stride
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue; // skip transparent
          const lum = luminance(r, g, b);
          if (lum < 15 || lum > 245) continue; // skip near-black / near-white
          pixels.push([r, g, b]);
        }

        if (pixels.length < 10) { resolve(DEFAULT_COLORS); return; }

        const centroids = kMeans(pixels, 3);
        resolve(assignPalette(centroids));
      } catch {
        resolve(DEFAULT_COLORS);
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      resolve(DEFAULT_COLORS);
    };

    img.src = imageUrl;
  });
}

// ── React hook ──
export function useDominantColor(): DominantColors {
  const currentTrack = useAppStore((s) => s.currentTrack);
  const [colors, setColors] = useState<DominantColors>(DEFAULT_COLORS);
  const trackIdRef = useRef<string | null>(null);
  const extractingRef = useRef(false);

  const coverUrl = currentTrack?.cover;
  const trackId = currentTrack?.id ?? null;

  useEffect(() => {
    if (!coverUrl || !trackId) {
      // No track playing — use defaults
      setColors(DEFAULT_COLORS);
      trackIdRef.current = null;
      return;
    }

    // Same track — no re-extraction needed
    if (trackId === trackIdRef.current) return;

    // Check cache first
    const cached = colorCache.get(trackId);
    if (cached) {
      setColors(cached);
      trackIdRef.current = trackId;
      return;
    }

    // Avoid parallel extractions
    if (extractingRef.current) return;

    extractingRef.current = true;
    trackIdRef.current = trackId;

    extractColors(coverUrl).then((extracted) => {
      colorCache.set(trackId, extracted);
      setColors(extracted);
      extractingRef.current = false;
    });
  }, [coverUrl, trackId]);

  return colors;
}
