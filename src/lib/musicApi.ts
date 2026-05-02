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

export const mockContacts: Contact[] = [
  { id: "c1", name: "Александр Петров", username: "alex_s", avatar: "https://ui-avatars.com/api/?name=АП&background=e03131&color=fff&size=128", online: true, lastSeen: "Сейчас" },
  { id: "c2", name: "Мария Иванова", username: "masha_m", avatar: "https://ui-avatars.com/api/?name=МИ&background=0ea5e9&color=fff&size=128", online: true, lastSeen: "Сейчас" },
  { id: "c3", name: "Дмитрий Козлов", username: "dima_d", avatar: "https://ui-avatars.com/api/?name=ДК&background=f43f5e&color=fff&size=128", online: false, lastSeen: "2 часа назад" },
  { id: "c4", name: "Елена Смирнова", username: "elena_k", avatar: "https://ui-avatars.com/api/?name=ЕС&background=f97316&color=fff&size=128", online: false, lastSeen: "Вчера" },
  { id: "c5", name: "Максим Волков", username: "max_v", avatar: "https://ui-avatars.com/api/?name=МВ&background=34d399&color=fff&size=128", online: true, lastSeen: "Сейчас" },
  { id: "c6", name: "Анна Новикова", username: "anya_novik", avatar: "https://ui-avatars.com/api/?name=АН&background=a78bfa&color=fff&size=128", online: false, lastSeen: "30 мин назад" },
  { id: "c7", name: "Артём Морозов", username: "art_moroz", avatar: "https://ui-avatars.com/api/?name=АМ&background=ff2a6d&color=fff&size=128", online: true, lastSeen: "Сейчас" },
  { id: "c8", name: "Ольга Лебедева", username: "olga_leb", avatar: "https://ui-avatars.com/api/?name=ОЛ&background=e040fb&color=fff&size=128", online: false, lastSeen: "3 часа назад" },
  { id: "c9", name: "Кирилл Фёдоров", username: "kirill_f", avatar: "https://ui-avatars.com/api/?name=КФ&background=0ea5e9&color=fff&size=128", online: true, lastSeen: "Сейчас" },
  { id: "c10", name: "Виктория Соколова", username: "vika_sok", avatar: "https://ui-avatars.com/api/?name=ВС&background=f43f5e&color=fff&size=128", online: false, lastSeen: "Вчера" },
  { id: "c11", name: "Никита Михайлов", username: "nikita_m", avatar: "https://ui-avatars.com/api/?name=НМ&background=f97316&color=fff&size=128", online: true, lastSeen: "Сейчас" },
  { id: "c12", name: "Полина Зайцева", username: "polya_z", avatar: "https://ui-avatars.com/api/?name=ПЗ&background=34d399&color=fff&size=128", online: false, lastSeen: "5 мин назад" },
  { id: "c13", name: "Даниил Рыжов", username: "dan_rzh", avatar: "https://ui-avatars.com/api/?name=ДР&background=a78bfa&color=fff&size=128", online: false, lastSeen: "1 час назад" },
  { id: "c14", name: "Софья Белова", username: "sonya_b", avatar: "https://ui-avatars.com/api/?name=СБ&background=e03131&color=fff&size=128", online: true, lastSeen: "Сейчас" },
  { id: "c15", name: "Иван Григорьев", username: "ivan_grig", avatar: "https://ui-avatars.com/api/?name=ИГ&background=ff2a6d&color=fff&size=128", online: false, lastSeen: "2 дня назад" },
  { id: "c16", name: "Екатерина Виноградова", username: "katya_vin", avatar: "https://ui-avatars.com/api/?name=ЕВ&background=e040fb&color=fff&size=128", online: true, lastSeen: "Сейчас" },
  { id: "c17", name: "Георгий Попов", username: "gor_popov", avatar: "https://ui-avatars.com/api/?name=ГП&background=0ea5e9&color=fff&size=128", online: false, lastSeen: "4 часа назад" },
  { id: "c18", name: "Алиса Кузнецова", username: "lisa_kuz", avatar: "https://ui-avatars.com/api/?name=АК&background=f43f5e&color=fff&size=128", online: true, lastSeen: "Сейчас" },
  { id: "c19", name: "Тимур Назаров", username: "tim_nazar", avatar: "https://ui-avatars.com/api/?name=ТН&background=f97316&color=fff&size=128", online: false, lastSeen: "Вчера" },
  { id: "c20", name: "Вероника Орлова", username: "vera_orl", avatar: "https://ui-avatars.com/api/?name=ВО&background=34d399&color=fff&size=128", online: true, lastSeen: "Сейчас" },
  { id: "c21", name: "Роман Андреев", username: "roma_andr", avatar: "https://ui-avatars.com/api/?name=РА&background=a78bfa&color=fff&size=128", online: false, lastSeen: "6 часов назад" },
  { id: "c22", name: "Наталья Макарова", username: "nata_mak", avatar: "https://ui-avatars.com/api/?name=НМ&background=e03131&color=fff&size=128", online: true, lastSeen: "Сейчас" },
  { id: "c23", name: "Алексей Никитин", username: "lex_nikit", avatar: "https://ui-avatars.com/api/?name=АН&background=ff2a6d&color=fff&size=128", online: false, lastSeen: "Вчера" },
  { id: "c24", name: "Юлия Степанова", username: "yulia_step", avatar: "https://ui-avatars.com/api/?name=ЮС&background=e040fb&color=fff&size=128", online: true, lastSeen: "Сейчас" },
];

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function searchTracks(query: string): Promise<Track[]> {
  try {
    const res = await fetch(
      `/api/music/search?q=${encodeURIComponent(query)}`
    );
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
