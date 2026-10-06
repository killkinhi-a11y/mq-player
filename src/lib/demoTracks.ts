import type { Track } from "./musicApi";

// Free CC0/Creative Commons audio samples for demo mode
// Audio files are bundled in public/demo/ for reliable playback.
// SoundHelix songs are free for any use (https://www.soundhelix.com)
//
// These local files bypass all CORS and proxy issues — they're served
// directly by Next.js static file server, just like images and icons.
//
// DESIGN COMPLETION: demo covers are quiet generated artwork (dark
// graphite + one muted genre hue + a vinyl motif), NOT the brand logo —
// the red icon read as a broken-image placeholder in visual audits.

/* Muted genre hues — desaturated, dark-friendly, no red. */
const DEMO_HUES: Record<string, [string, string]> = {
  ambient: ["#232a45", "#12151f"],    // deep indigo
  electronic: ["#1f3a3d", "#101718"], // cold teal
  jazz: ["#3a2f24", "#1a1512"],       // warm bronze
  rock: ["#2e2f36", "#14151a"],       // graphite
};
const DEFAULT_HUE: [string, string] = ["#282c38", "#13151b"];

function demoCover(title: string, genre: string): string {
  const [hi, lo] = DEMO_HUES[genre] ?? DEFAULT_HUE;
  const initials = title
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/>` +
    `</linearGradient></defs>` +
    `<rect width="512" height="512" fill="url(#g)"/>` +
    `<circle cx="384" cy="128" r="220" fill="#ffffff" opacity="0.04"/>` +
    `<circle cx="256" cy="256" r="88" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="3"/>` +
    `<circle cx="256" cy="256" r="14" fill="#ffffff" fill-opacity="0.2"/>` +
    `<text x="256" y="446" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#ffffff" fill-opacity="0.55" letter-spacing="6">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const DEMO_SOURCES = [
  { id: "demo-1", title: "Ambient Dreams",     genre: "ambient",    duration: 40, file: "/demo/song1.mp3" },
  { id: "demo-2", title: "Electronic Pulse",   genre: "electronic", duration: 40, file: "/demo/song2.mp3" },
  { id: "demo-3", title: "Jazz Evening",       genre: "jazz",       duration: 40, file: "/demo/song3.mp3" },
  { id: "demo-4", title: "Rock Energy",        genre: "rock",       duration: 40, file: "/demo/song4.mp3" },
];

export const DEMO_TRACKS: Track[] = DEMO_SOURCES.map((s) => ({
  id: s.id,
  title: s.title,
  artist: "MQ Demo",
  album: "Demo Collection",
  cover: demoCover(s.title, s.genre),
  duration: s.duration,
  genre: s.genre,
  scTrackId: 0,
  source: "demo" as const,
  // Use local file directly — no proxy needed, no CORS issues
  // Local files from public/ are served by Next.js with proper headers
  audioUrl: s.file,
}));
