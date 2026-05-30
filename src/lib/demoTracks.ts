import type { Track } from "./musicApi";

// Free CC0/Creative Commons audio samples for demo mode
// Audio files are bundled in public/demo/ for reliable playback.
// SoundHelix songs are free for any use (https://www.soundhelix.com)
//
// These local files bypass all CORS and proxy issues — they're served
// directly by Next.js static file server, just like images and icons.

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
  cover: `/icon-512.png`,
  duration: s.duration,
  genre: s.genre,
  scTrackId: 0,
  source: "demo" as const,
  // Use local file directly — no proxy needed, no CORS issues
  // Local files from public/ are served by Next.js with proper headers
  audioUrl: s.file,
}));
