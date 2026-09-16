## MQ Player 2.3.3 — Release Candidate (продуктовый проход)

**Статус:** кандидат. Ждёт подтверждения на реальном Android-устройстве. Продакшн-канал сайта остаётся на 2.3.1 до acceptance.

### Что вошло

**Canonical-иконка (web ↔ Android — один бренд)**
- Launcher (adaptive + monochrome/themed), splash и иконка media-нотификации теперь генерируются из **единого web-мастера** — favicon (`resources/icon.png`, чёрная плитка + белый wordmark «mq») воспроизведён скриптом `scripts/make-mq-icon.py`. Старая расходившаяся с web красная «M+волна» удалена.
- Notification small icon — alpha-only глиф «mq» (соответствует Android-требованиям монотонных иконок).

**Системная media-нотификация**
- `DefaultMediaNotificationProvider` теперь несёт бренд «mq» и именованный канал «Воспроизведение» вместо генерической иконки media3.
- MediaSession-слой уже даёт: artwork (абсолютные URL), play/pause/next/previous/seek, прогресс, lock screen, Bluetooth/headset, background, кастомные кнопки (Лайк, Дальше по Волне), playback resumption.

**Touch-фидбек**
- Убраны квадратные desktop-подобные прямоугольники при нажатии: все icon-кнопки (плеер, строки треков, home, профиль) получили круглый обрезанный ripple — естественное Android-нажатие.

**App Links**
- `assetlinks.json` дополнен отпечатками релизных сертификатов (2.3.2-rc и 2.3.3) — авто-верификация deep links `https://mq1.vercel.app/track|play` сохраняется при ротациях подписи.

**Исправление краха «Демо» (унаследовано из 2.3.2)**
- Кириллическое значение HTTP-заголовка больше не убивает процесс; паритет с web сохранён; 157/157 тестов.

### ⚠️ Смена подписи (опять)

Keystore 2.3.2-rc был утерян вместе с окружением сборки (пароли сознательно не записывались) → **новый сертификат**. Новый keystore и его пароль теперь хранятся в durable-лаборатории — ротаций больше не будет.

- При обновлении с любой версии ≤2.3.2-rc: **удалите старое приложение, затем установите этот APK**.
- Новый SHA-256: `d3d7ed0b3960fbe968d39799a2869ca4ec0a8079ce5adcfd3cddeb841610bcaa`

### 🔑 КРИТИЧНО для Google-логина (действие владельца в Google Cloud Console)

Credential Manager выдаёт токен только если пакет + SHA-1 подписи приложения зарегистрированы в OAuth-клиенте того же Google Cloud проекта, что и WEB_CLIENT_ID (`577360231136-2mb4v7pkbvdceqjg926961c4dagn2d8e.apps.googleusercontent.com`).

Для этой сборки добавьте в Google Cloud Console (APIs & Services → Credentials → OAuth client ID типа Android):
- Package name: `com.mq1.player`
- SHA-1: `70:3F:B1:FD:5E:C1:61:05:E3:1E:F8:04:D9:0E:8B:AC:AE:5E:FC:E7`

Без этого нажатие «Продолжить с Google» завершится ошибкой Credential Manager на устройстве — код это не исправляет, это регистрация приложения в Google.

### Параметры сборки

| Параметр | Значение |
|---|---|
| versionName | 2.3.3 |
| versionCode | 9 |
| SHA-256 APK | `09afedbeae20dce91ecece1ed6aeba43c36b54607d57b75a62396dcf86310d71` |
| Тесты | 157/157 |
| apksigner / zipalign / R8 | OK / OK / OK (googleid keep-правила живы) |

### Чек-лист проверки на устройстве

1. Установить (после удаления старой версии).
2. Launcher: иконка = чёрная плитка с белым «mq» (как favicon сайта); themed icons (Android 13+) тоже «mq».
3. Воспроизвести трек → шторка/lock screen: иконка «mq», artwork, play/pause/next/prev, seek, прогресс; Bluetooth-гарнитура; экран выключен — играет.
4. Тап «Демо» → приложение живо, Home открывается.
5. «Продолжить с Google» → выбор аккаунта → вход → Home/Profile; перезапуск — сессия сохранена.
6. Нажатия: круглые мягкие ripple вместо квадратных подсветок (плеер, строки, home, профиль).
