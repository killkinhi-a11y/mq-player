export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  cover: string;
  genre: string;
  audioUrl: string;
  previewUrl?: string;
  source: "soundcloud" | "local";
  scTrackId?: number;
  scStreamPolicy?: string;
  scIsFull?: boolean;

}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  cover: string;
  tracks: Track[];
  genre: string;
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  encrypted: boolean;
  createdAt: string;
  senderName?: string;
  messageType?: string;
  replyToId?: string | null;
  edited?: boolean;
  editedAt?: string | null;
  voiceUrl?: string | null;
  voiceDuration?: number;
}

export interface Contact {
  id: string;
  name: string;
  username: string;
  avatar: string;
  online: boolean;
  lastSeen: string;
}

export const genresList = ["Pop", "Rock", "Electronic", "Hip-Hop", "Jazz", "Classical", "R&B", "Indie"];

export const genreMapReverse: Record<string, string> = {
  "Pop": "Поп",
  "Rock": "Рок",
  "Electronic": "Электроника",
  "Hip-Hop": "Хип-хоп",
  "Jazz": "Джаз",
  "Classical": "Классика",
  "R&B": "R&B",
  "Indie": "Инди",
  "Rap": "Хип-хоп",
  "Dance": "Электроника",
  "Alternative": "Рок",
  "Soul & Funk": "R&B",
  "Metal": "Рок",
  "House": "Электроника",
  "Techno": "Электроника",
  "Drum and Bass": "Электроника",
  "Ambient": "Электроника",
  "Lo-fi": "Инди",
  "Trap": "Хип-хоп",
  "R&B Soul": "R&B",
  "Pop R&B": "R&B",
};

export function normalizeDuration(d: number): number {
  // SoundCloud returns duration in milliseconds; detect and convert to seconds
  // If value looks like milliseconds (> 100000 ≈ 28h if seconds), divide by 1000
  if (!d || !isFinite(d) || d <= 0) return 0;
  if (d > 100000) return d / 1000;
  return d;
}

export function formatDuration(seconds: number): string {
  const s = normalizeDuration(seconds);
  if (s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}:${rm.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export async function searchTracks(query: string, source: "soundcloud" | "all" = "all"): Promise<Track[]> {
  try {
    const params = new URLSearchParams({ q: query });
    if (source !== "all") params.set("source", source);
    const res = await fetch(`/api/music/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tracks || [];
  } catch {
    return [];
  }
}

export async function getTrendingTracks(): Promise<Track[]> {
  try {
    const res = await fetch("/api/music/trending");
    if (!res.ok) return [];
    const data = await res.json();
    return data.tracks || [];
  } catch {
    return [];
  }
}

export async function getRecommendations(genre?: string): Promise<Track[]> {
  try {
    const params = genre ? `?genre=${encodeURIComponent(genre)}` : "?genre=random";
    const res = await fetch(`/api/music/recommendations${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tracks || [];
  } catch {
    return [];
  }
}

export async function getTracksByGenre(genre: string): Promise<Track[]> {
  try {
    const res = await fetch(
      `/api/music/genre?genre=${encodeURIComponent(genre)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.tracks || [];
  } catch {
    return [];
  }
}

export function mapGenreToRu(genre: string): string {
  return genreMapReverse[genre] || genre;
}
