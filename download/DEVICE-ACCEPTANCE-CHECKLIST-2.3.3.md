# MQ Player 2.3.3-RC — ПРОТОКОЛ DEVICE-ACCEPTANCE (для владельца телефона)

**Подготовка (5 мин):**
1. `Настройки → Приложения → MQ Player → Удалить` (обязательно для ≤2.3.1 — сменился сертификат).
2. Скачать APK: github.com/killkinhi-a11y/mq-player/releases → `android-v2.3.3-rc` → `mq-player-v2.3.3-rc.apk`
   (SHA-256: `09afedbeae20dce91ecece1ed6aeba43c36b54607d57b75a62396dcf86310d71`).
3. Установить, разрешить уведомления при первом запуске.

**Если хотите зафиксировать первый сбой точно — подключите `adb logcat` (необязательно):**
`adb logcat -s MqAuth MqBoot MqCrash` — приложение пишет каждый шаг Google-флоу
(`step=credential_manager status=…`), demo-входа и крэши.

---

## TEST 1 — GOOGLE (главный)
| Шаг | Ожидание |
|---|---|
| Fresh launch → «Google» | Системный account picker (или one-tap, если уже разрешали) |
| Выбрать аккаунт | Нет ошибки, переход на Home/Profile |
| Profile | Ваш email/имя Google |
| Kill app → relaunch | Сессия восстановлена, LoginScreen НЕ показан |
| Logout → Google снова | Флоу повторяется целиком |

Формат отчёта при сбое: `Google → PASS → FAIL at <picker|token|backend|session|restore>`.

## TEST 2 — DEMO
Fresh launch → «Демо-режим» → Home открывается, **нет крэша** (это была бага 2.3.1).
Пройти Home/Profile/Library/Search/Chats/Full Player. Нет пустых экранов, нет тестового каталога в обычных вкладках.

## TEST 3 — MEDIASESSION
Запустить трек → выключить экран → проверить lock screen: обложка, название, исполнитель, play/pause, next, prev, seek, прогресс. Bluetooth-гарнитура (если есть): play/pause/next. Тап по уведомлению → возврат в приложение, состояние синхронно.

## TEST 4 — LIBRARY
Liked/Disliked/Subscriptions/Playlists/History: открытие, обложки, счётчики, empty states, refresh, создать плейлист, переименовать, удалить. Одной рукой удобно?

## TEST 5 — SETTINGS
Account/Profile/Sound/Speed/EQ/Appearance/Session/Logout/App info: скролл, переключатели, слайдеры, back-навигация.

## TEST 6 — FULL PLAYER
Обложка/название/прогресс/controls/queue/lyrics/More-лист: скорость, sleep timer, EQ, share, dislike. Portrait/landscape, свайпы, back, переход mini↔full.

## TEST 7 — CONTEXT MENU
Долгое нажатие на треке: Home, Search, Library, History, Favorites, Artist, Queue, Full Player. Открытие/скролл/back/swipe-dismiss/scrim, каждое действие реально работает.

## TEST 8 — VISUAL
Нет квадратных ripple; launcher/splash/login = белый «mq» на тёмном; иконка уведомления = «mq»; нормальные отступы/типографика/размеры нажатий.

## TEST 9 — TABS
Home/Search/Library/Chats/Profile: открытие, скролл, взаимодействие, back, refresh, empty/error states.

---

**Отчёт:** таблица `Feature | PASS/FAIL/BLOCKED | комментарий`.
Все PASS → я повышаю RC до stable (скрипт готов, проверен): сайт автоматически
начнёт отдавать 2.3.3 через `releases/latest` — без правки сайта.
Любой FAIL → точный первый сломавшийся шаг + что на экране.
