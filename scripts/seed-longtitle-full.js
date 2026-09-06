// Seeds long-title stress data across store slices: likes, history, contacts, chat messages with track shares.
// Run AFTER demo login (app live), then reload-free navigation via UI.

(() => {
  const KEY = "mq-store-v8";
  const raw = localStorage.getItem(KEY);
  if (!raw) return "NO STORE";
  const parsed = JSON.parse(raw);
  const s = parsed.state;

  const mk = (id, title, artist, i) => ({
    id, title, artist,
    album: "Long Title Stress",
    duration: 40,
    cover: "/icon-512.png",
    genre: "ambient",
    audioUrl: `/demo/song${(i % 4) + 1}.mp3`,
    source: "demo",
    scTrackId: 0,
  });

  const tracks = [
    mk("lt-50",  "Осень на Тверской: записи живых концертов в старом клубе (2024)", "Краткий артист", 1),
    mk("lt-100", "Долгое название трека, которое проверяет ровно сто символов текста в строке списка треков и не должно ломать вёрстку", "Нормальный артист", 2),
    mk("lt-147", "Тестовое название трека длиной ровно сто сорок семь символов включая пробелы и знаки препинания, чтобы проверить предельный случай однострочного усечения в списке треков, а также поведение кнопок действий рядом с текстом!", "Артист со средним именем", 3),
    mk("lt-300", "Максимально длинное название трека на триста символов. ".repeat(6).slice(0, 300), "Очень длинное имя исполнителя, которое тоже должно усекаться, а не растягивать строку и не наезжать на кнопки", 4),
    mk("lt-nospace", "БЕЗПРОБЕЛЕЙДОЛГОЕНАЗВАНИЕТРЕКАКОТОРОЕНЕПЕРЕНОСИТСЯИДОВНОДОКОНЦАСТРОКИ" + "X".repeat(120), "norebreak-artist-with-a-very-long-unbroken-name-aaaaaaaaaaaaaaaaaaaaaaaa", 1),
    mk("lt-rtl", "מוזיקה טובה של הערב بالعربية مع نص طويل جدا يجب أن لا يكسر التصميم", "אמן עם שם ארוך מאוד بالعربية الفنان الطويل", 2),
    mk("lt-emoji", "🎉🎵 Трек с эмодзи 🚀💜🔥 и ещё много 🎧🎧🎧🎵🎶 в названии и в тексте строки 🌟✨🎆🎇🏅🎭" + "😀".repeat(20), "🎧 DJ Emoji 🎉🎵🔥✨", 3),
    mk("lt-unicode", "Юникод: 中文测试标题很长 —— 日本語のタイトルも長い —— 한국어 제목도 —— ελληνικά —— Türkiye — Café naïve résumé", "Мультиязычный исполнитель 中文日本語한국어ΕλληνικάTürkçe", 4),
    mk("lt-artist", "Ещё одно длинное название трека для проверки комбинации с длинным артистом", "Артист с экстремально длинным именем исполнителя, содержащим много слов, пробелов и знаков препинания, которое должно корректно усекаться", 1),
  ];

  // Favorites
  s.likedTrackIds = tracks.map(t => t.id);
  s.likedTracksData = tracks;

  // History
  const now = Date.now();
  s.history = tracks.map((t, i) => ({ track: t, playedAt: now - i * 60000, playCount: i + 1 }));

  // Contacts + messages with track shares
  s.contacts = [{ id: "c1", name: "Тестовый Друг", username: "testfriend", avatar: "", online: true, lastSeen: "" }];
  s.selectedContactId = "c1";
  const share = (t) => JSON.stringify({
    type: "track_share",
    track: { id: t.id, title: t.title, artist: t.artist, cover: t.cover, streamUrl: t.audioUrl, duration: t.duration, source: "demo" },
  });
  s.messages = [
    { id: "m1", content: share(tracks[3]), senderId: "c1", receiverId: "me", encrypted: false, createdAt: new Date(now - 500000).toISOString(), senderName: "Тестовый Друг", messageType: "text" },
    { id: "m2", content: "Слушай, вот ещё этот трек — длинное название, проверим как выглядит", senderId: "me", receiverId: "c1", encrypted: false, createdAt: new Date(now - 400000).toISOString() },
    { id: "m3", content: share(tracks[4]), senderId: "me", receiverId: "c1", encrypted: false, createdAt: new Date(now - 300000).toISOString() },
    { id: "m4", content: share(tracks[5]), senderId: "c1", receiverId: "me", encrypted: false, createdAt: new Date(now - 200000).toISOString() },
    { id: "m5", content: share(tracks[6]), senderId: "c1", receiverId: "me", encrypted: false, createdAt: new Date(now - 100000).toISOString() },
  ];

  localStorage.setItem(KEY, JSON.stringify(parsed));
  return "SEEDED: likes=" + s.likedTrackIds.length + " history=" + s.history.length + " msgs=" + s.messages.length;
})()
