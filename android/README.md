# MQ Player — Android

Нативный Android-клиент MQ Player (Kotlin + Jetpack Compose + Media3).
Не WebView-обёртка: настоящий нативный UI, фоновое воспроизведение,
MediaSession, интеграция с тем же бэкендом, что и веб-версия
(https://mq1.vercel.app).

## Стек

| Слой | Технологии |
|------|-----------|
| UI | Jetpack Compose, Material 3, Navigation Compose |
| Состояние | ViewModel + StateFlow (lean VM per screen) |
| Данные | Retrofit + OkHttp + kotlinx-serialization, DataStore |
| Аудио | Media3 / ExoPlayer + MediaLibraryService (MediaSession) |
| Изображения | Coil (memory + disk кэш) |
| Безопасность | httpOnly cookie-сессия, зашифрованная AndroidKeyStore (AES-256-GCM) |
| DI | ручной ServiceLocator (граф маленький и статичный) |

Требования: JDK 17+, Android SDK 35. Сборка проверена на Gradle 8.14.3,
AGP 8.7.3, Kotlin 2.0.21.

## Сборка

```bash
cd android
./gradlew assembleDebug          # → app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest      # unit + Robolectric long-title UI регрессия
./gradlew assembleRelease        # см. подпись ниже
```

`local.properties` с `sdk.dir=/path/to/android-sdk` не коммитится
(см. `.gitignore`).

### Локальный бэкенд

По умолчанию приложение ходит в production `https://mq1.vercel.app`.
Для разработки против локального `next dev`:

```bash
./gradlew -PmqApiBase=http://10.0.2.2:3000 assembleDebug
```

### Подпись релиза (секреты НЕ в git)

1. Создайте свой keystore:
   ```bash
   keytool -genkeypair -v -keystore ~/mq-release.jks -keyalg RSA \
     -keysize 2048 -validity 10000 -alias mq
   ```
2. Создайте `android/keystore.properties` (gitignored):
   ```properties
   storeFile=/absolute/path/to/mq-release.jks
   storePassword=***
   keyAlias=mq
   keyPassword=***
   ```
3. `./gradlew assembleRelease` → подписанный APK.
   Без этого файла собирается **unsigned** release APK.

Релизный APK из этого репозитория подписан self-signed ключом,
сгенерированным локально вне git (для sideload-установки достаточно;
для Google Play используйте собственный ключ).

## Архитектура

```
UI (Compose screens)
   ↓
ViewModel / StateFlow
   ↓
Repository (Auth / Music / Wave / Playlist / Social / Chat)
   ↓
Retrofit API  ←→  MQ backend (та же REST поверхность, что и веб)
   ↕
LocalStore (DataStore: тема, вкусы, избранное, история)

PlaybackController (app-процесс, MediaController)
   ↓  binder
MqPlaybackService (foreground, MediaLibraryService)
   → ExoPlayer + MediaSession + notification + audio focus
```

### Переиспользование бэкенда (без второй логики на сервере)

- **Auth**: тот же Telegram-код флоу — `POST /api/auth/telegram-verify`
  выдаёт httpOnly cookie `session`; нативный `SecureCookieJar` хранит её
  в зашифрованном виде (AndroidKeyStore AES-256-GCM). Логаут —
  `POST /api/auth/logout` + очистка.
- **Поиск/артисты/стримы**: `/api/music/search`, `/api/music/artist-tracks`,
  `/api/music/soundcloud/stream?trackId=` (JSON с `url` + `fallbackStreams`).
- **Wave**: `/api/music/recommendations?wave=1&likedScIds=&historyScIds=`
  — те же параметры, что веб-клиент; честные `_reason` показываются чипами.
- **Плейлисты/друзья/чаты/AI**: `/api/playlists`, `/api/friends`,
  `/api/messages`, `/api/ai/chat`.
- **Избранное/история**: локально на устройстве — parity с веб-версией
  (там они тоже в localStorage, не серверные).

### Почему Media3, а не общий Rust-core (решение P20.4)

Веб-движок — Rust→WASM в AudioWorklet — существует из-за ограничений
браузера: браузер не даёт ни gapless-контроля, ни PCM-точности, ни
Range-докачки на уровне платформы. На Android эти проблемы уже решены
платформой: Media3/ExoPlayer даёт стриминг с Range, HLS-фолбэки,
audio offload (gapless при поддержке кодека), MediaSession, notification,
audio focus, Bluetooth/headset, lock screen — всё из коробки и
стандартно. Перенос Rust-core потребовал бы JNI + NDK-тулчейн и всё
равно не покрывает MediaSession/notification. Решение: Media3 —
правильный аудио-слой для Android; WASM-движок остаётся веб-бэкендом.
Плейлист предрезолвится заранее (TTL-кэш стримов), поэтому переходы
треков и Волна не ждут сеть.

### Фоновое воспроизведение

- `MqPlaybackService` — foreground-сервис `mediaPlayback`
- Notification: artwork, трек, исполнитель, play/pause, next/previous,
  плюс кастомные кнопки **Нравится** и **Дальше по Волне**
- Audio focus: пауза при звонке, ducking, авто-resume
- BECOMING_NOISY: пауза при отключении наушников
- Восстановление сети: при IO-ошибке ждём connectivity и продолжаем
  с той же позиции (до 3 попыток)
- Экран/сворачивание: воспроизведение продолжает жить в сервисе

### Long-title безопасность (P20.6)

`TrackRow` (и все строки экранов) построены на инвариантах: фиксированные
размеры artwork/кнопок, `weight(1f) + maxLines=1 + Ellipsis` для текста,
RTL-safe. Автоматическая регрессия — `TrackRowLongTitleTest`
(Robolectric + Compose): матрица 50/100/147/300 симв., no-space, RTL,
emoji, unicode, long-artist; проверяется точная ширина, константная
высота, наличие и границы кнопок. Запуск: `./gradlew testDebugUnitTest`.

## Структура

```
android/
  app/src/main/kotlin/com/mq1/player/
    MainActivity.kt, MqApp.kt
    di/ServiceLocator.kt
    data/api/        — Retrofit интерфейс + DTO (контракты бэкенда)
    data/            — SecureCookieJar, LocalStore
    data/repo/       — Auth/Music/Wave/Playlist/Social/Chat
    player/          — MqPlaybackService, PlaybackController,
                       MqStreamDataSource (ленивый резолвер стримов)
    ui/theme/        — MQ палитры (light/dark/system, 7 тем)
    ui/nav/          — навигация + mini-player + bottom bar
    ui/components/   — TrackRow (long-title-safe), Artwork, states
    ui/screens/      — Login, Onboarding, Home, Search, Artist,
                       Playlist, Wave, Library, Chats, ChatDetail,
                       Friends, Settings, FullPlayer
    ui/vm/           — ViewModels
  app/src/test/      — long-title регрессия (Robolectric) + модели
```

## Статус QA

- Gradle debug + release сборки: ✓ (сборка проверена реально)
- Unit/UI тесты: 6/6 ✓ (включая long-title матрицу на Robolectric)
- Подпись: apksigner verify — v2 ✓
- Установка/запуск на физическом устройстве: требует реального
  телефона/эмулятора — чек-лист в P20.15 раздела задач; эмулятор
  в CI-песочнице недоступен (нет KVM). Установите
  `app-release.apk` (sideload) и пройдите: login → Home → Search →
  Play → Full Player → фон → экран блокировки → notification → seek →
  Wave → Playlist → Chats → Friends → Settings → Theme → Onboarding.
