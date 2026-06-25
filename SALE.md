# MQ Player — Музыкальный плеер + Мессенджер

## 🎵 Что это

MQ Player — это полноценный музыкальный плеер с встроенным зашифрованным мессенджером. Spotify + Telegram в одном приложении. Работает на Web, Android, Windows, macOS и Linux.

## ✨ Ключевые фичи

### Музыка
- 🔍 Поиск музыки (SoundCloud API, миллионы треков)
- 🎵 Воспроизведение с кроссфейдом, gapless, ReplayGain
- 🎛️ 10-полосный эквалайзер с 12 пресетами
- 📊 3 режима визуализации (волна, полосы, круг)
- 🎙️ Spatial Audio с авто-детекцией настроения
- ⏱️ Sleep timer с умными циклами сна
- 🔄 A-B повтор для заучивания
- ⚡ Speed control 0.5x–2x
- 📝 Синхронизированные тексты песен с переводом
- 🎨 25+ тем оформления (Dark, Neon, Japan, iPod 2001, Swag, и др.)

### Плейлисты
- 📋 Создание, редактирование, импорт (VK, Spotify, ссылки)
- 🤖 AI генерация описаний и обложек
- 🎯 Smart плейлисты по правилам
- 📊 Рекомендации на основе вкуса
- 🔀 Перетаскивание треков (mouse + touch)
- 📤 Экспорт/поделиться ссылкой

### Мессенджер
- 💬 Личные сообщения и групповые чаты
- 🎙️ Голосовые сообщения с waveform + speed control
- 📌 Закрепление сообщений
- 😀 Реакции (emoji) на сообщения
- 🎵 Поделиться треком в чат
- 📱 Stories (текст, фото, трек, видео)
- 🔒 TLS шифрование
- 🟢 Online статусы, typing indicator
- 🎨 Кастомные темы для каждого чата (8 пресетов)
- 🔍 Поиск по сообщениям с подсветкой

### Социальное
- 👥 Друзья, заявки, профили
- 🏆 Система достижений (10 бейджей)
- 📊 Тепловая карта прослушиваний (7 дней × 24 часа)
- 🎵 Taste Profile (жанры, артисты, настроение)
- 📈 Статистика прослушиваний (7-day chart, top artists)
- 🎧 Слушать вместе (синхронное прослушивание)

### UX/UI
- ⌨️ Command Palette (Cmd+K)
- 🎨 Glassmorphism дизайн
- ✨ Микро-анимации (spring, stagger, hover effects)
- 📱 PWA + Android APK + Windows EXE
- ⌨️ Горячие клавиши (Space, ←→, ↑↓, N, P, M, L, F, B)
- ♿ Accessibility: ARIA labels, keyboard nav, focus rings, reduce-motion
- 🌍 Полностью на русском языке

## 🛠 Технологии

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Framer Motion
- **Backend:** Next.js API Routes, Turso (libSQL), Prisma ORM
- **Audio:** Web Audio API, AnalyserNode, BiquadFilter (EQ), ConvolverNode (Reverb)
- **Real-time:** SSE (Server-Sent Events), BroadcastChannel
- **Auth:** Telegram Bot, Email, Demo mode
- **Mobile:** Capacitor (Android), Electron (Desktop), PWA
- **AI:** Z-AI SDK (рекомендации, перевод текстов, генерация описаний)
- **Deploy:** Vercel (web), GitHub Actions (APK), Cloudflare Workers

## 📊 Метрики

- **Lines of code:** ~50,000+ TypeScript/TSX
- **API routes:** 60+
- **Components:** 60+
- **Themes:** 25+
- **Tests:** Vitest

## 💰 Модели монетизации

1. **Freemium** — 149₽/мес (premium фичи)
2. **One-time** — 399₽ навсегда
3. **B2B White Label** — 50K-500K₽ за лицензию
4. **Telegram Mini App** — 99⭐/мес
5. **Маркетплейс плейлистов** — 15% комиссия
6. **Audio Ads** — 30-50₽ за 1000 прослушиваний
7. **API** — 0.5₽ за запрос

## 🎯 Для кого

- Музыкальные энтузиасты, которым нужен кастомный плеер
- Те, кто хочет альтернативу Spotify/Яндекс Музыки
- Сообщества, которым нужна музыка + общение
- Лейблы/подкастеры (white-label)
- Разработчики (open-source контрибьютеры)

## 🔗 Ссылки

- **Live:** https://mq1.vercel.app
- **GitHub:** https://github.com/killkinhi-a11y/mq-player
- **Android APK:** https://github.com/killkinhi-a11y/mq-player/releases/latest/download/mq-player.apk
- **Windows:** https://github.com/killkinhi-a11y/mq-player/releases/download/v1.0.1/MQ-Player-Setup.zip
