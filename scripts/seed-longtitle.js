// Seeds a long-title stress-test playlist into mq-store-v8 (localStorage),
// then the caller reloads to land directly on the open playlist view.
(() => {
  const KEY = "mq-store-v8";
  const raw = localStorage.getItem(KEY);
  if (!raw) return "NO STORE — open app first";
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

  const T = (n) => "Т".repeat ? "Тестовый трек с очень длинным названием для регрессии №" + n + " " + "а".repeat(Math.max(0, 0)) : "";

  // 9 stress tracks: 50 / 100 / 147 / 300 chars / no-space / RTL / emoji / unicode / long artist + long title
  const tracks = [
    mk("lt-50",  "Осень на Тверской: записи живых концертов в старом клубе (2024)", "Краткий артист", 1),
    mk("lt-100", "Долгое название трека, которое проверяет ровно сто символов текста в строке списка треков плейлиста и не должно ломать вёрстку", "Нормальный артист", 2),
    mk("lt-147", "Т" + "е".repeat(0) + "стовое название трека длиной ровно сто сорок семь символов включая пробелы и знаки препинания, чтобы проверить предельный случай однострочного усечения в списке треков, а также поведение кнопок действий рядом с текстом" + "!", "Артист со средним именем", 3),
    mk("lt-300", "Максимально длинное название трека на триста символов. ".repeat(6).slice(0, 300), "Очень длинное имя исполнителя, которое тоже должно усекаться, а не растягивать строку и не наезжать на кнопки", 4),
    mk("lt-nospace", "БЕЗПРОБЕЛЕЙДОЛГОЕНАЗВАНИЕТРЕКАКОТОРОЕНЕПЕРЕНОСИТСЯИДОВНОДОКОНЦАСТРОКИ" + "X".repeat(120), "norebreak-artist-with-a-very-long-unbroken-name-aaaaaaaaaaaaaaaaaaaaaaaa", 1),
    mk("lt-rtl", "מוזיקה טובה של הערב بالعربية مع نص طويل جدا يجب أن لا يكسر التصميم", "אמן עם שם ארוך מאוד بالعربية الفنان الطويل", 2),
    mk("lt-emoji", "🎉🎵 Трек с эмодзи 🚀💜🔥 и ещё много 🎧🎧🎧🎵🎶 в названии и в тексте строки 🌟✨🎆🎇🏅🎭" + "😀".repeat(20), "🎧 DJ Emoji 🎉🎵🔥✨", 3),
    mk("lt-unicode", "Юникод: 中文测试标题很长 —— 日本語のタイトルも長い —— 한국어 제목도 —— ελληνικά —— Türkiye — Café naïve résumé", "Мультиязычный исполнитель 中文日本語한국어ΕλληνικάTürkçe", 4),
    mk("lt-artist", "Ещё одно длинное название трека для проверки комбинации с длинным артистом", "Артист с экстремально длинным именем исполнителя, содержащим много слов, пробелов и знаков препинания, которое должно корректно усекаться", 1),
  ];

  const pl = {
    id: "pl-longtest",
    name: "Плейлист с максимально длинным названием, которое проверяет поведение заголовка в открытом плейлисте на всех разрешениях экрана — " + "П".repeat(80),
    description: "Описание плейлиста длиной около трёхсот символов. Оно проверяет, как ведёт себя блок описания при очень длинном тексте: должен ли он усекаться, сворачиваться или переноситься по строкам без наезда на другие элементы интерфейса и без горизонтального скролла. ".repeat(2).slice(0, 300),
    cover: "",
    tracks,
    createdAt: Date.now(),
  };

  s.playlists = [pl];
  s.selectedPlaylistId = "pl-longtest";
  s.currentView = "playlists";
  s.onboardingComplete = true;
  localStorage.setItem(KEY, JSON.stringify(parsed));
  return "SEEDED: " + tracks.length + " tracks, name.len=" + pl.name.length + ", desc.len=" + pl.description.length;
})()
