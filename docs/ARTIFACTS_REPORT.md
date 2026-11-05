# Отчёт об артефактах репозитория (Task F)

> Только анализ. **Ничего не удалено и не перемещено.** Все хэши посчитаны `sha256sum` по файлам
> `main` @ 7d4e2d2 и сравнены с `digest` ассетов GitHub Releases (REST API `/releases`), дата проверки — этап IV.

## 1. Сводка

- `download/` в git: **1594 файла, 619 MB** (pack-файл репозитория — 609 MiB; история содержит и прежние версии бинарей, напр. второй blob `MQ Player_1.0.0_x64-setup.exe` 10 965 565 байт).
- Бинарники (`.apk/.aab/.exe/.sig`): 12 файлов, **76.7 MB**. **Все 11 бинарей побайтно совпадают с ассетами релизов** → в git они дубли.
- QA/референс-скриншоты: ~45 каталогов, ≈540 MB (крупнейшие: qa-red-focus 53.5, qa-v2 46.5, qa-design-completion 45.2, qa-final-pass 42.3, ui-v4.1 39.1, ref-analysis 36.1 MB).
- `download/screens/` (212 файлов, 20 MB) — **оставить**: `download/screens/parity/` используется Android `ParityHarness` (sysprop `mq.parityDir`, PR #4).

## 2. Бинарники в репо ↔ релизы

| Файл в репо | Размер | sha256 (первые 16) | Совпадает с ассетом релиза |
|---|---:|---|---|
| download/MQPlayer-v2.2.0.apk | 4 086 072 | 21b2096a35266f8d | android-v2.2.0 / MQPlayer.apk ✅ |
| download/MQPlayer-v2.3.0.apk | 4 151 612 | da2c6362611c940f | android-v2.3.0 / MQPlayer.apk ✅ |
| download/MQPlayer.apk | 4 151 612 | da2c6362611c940f | android-v2.3.0 / MQPlayer.apk ✅ (**устарел**: latest = 2.3.5) |
| download/android/MQPlayer.apk | 4 167 996 | 6ff2d10b5c904f74 | android-v2.3.1 / MQPlayer.apk ✅ (устарел) |
| download/mq-player-v2.3.2-rc.apk | 4 167 992 | 206bc9790efe038f | android-v2.3.2-rc ✅ |
| download/mq-player-v2.3.3-rc.apk | 4 239 743 | 09afedbeae20dce9 | android-v2.3.3-rc и android-v2.3.3 / MQPlayer.apk ✅ |
| download/mq-player-v2.3.4-rc.apk | 4 239 743 | 885c1bac1e4cbb1c | android-v2.3.4-rc и android-v2.3.4 / MQPlayer.apk ✅ |
| download/mq-player-v2.2.0-release.aab | 7 956 482 | b0860c7b05589540 | android-v2.2.0 ✅ |
| download/mq-player-v2.3.0-release.aab | 8 161 336 | a31e85583c7faaaa | android-v2.3.0 ✅ |
| download/desktop/MQ Player.exe | 20 372 992 | 38e2a794c6b1a0b3 | desktop-v1.0.0 / MQ.Player.exe ✅ (+ SHA256SUMS.txt релиза) |
| download/desktop/MQ Player_1.0.0_x64-setup.exe | 10 963 262 | a36849ea7629824d | desktop-v1.0.0 / MQ.Player_1.0.0_x64-setup.exe ✅ |
| download/desktop/MQ Player_1.0.0_x64-setup.exe.sig | 440 | 4903954e5d1301f7 | ассета нет; **содержимое = `signature` в `desktop/updates/latest.json`** |

Релизы: 49 (1 draft `v1.0.1` с Electron-сборками 122–329 MB; 4 pre-release RC). Latest = `android-v2.3.5` (только `MQPlayer.apk`, 4 256 127 байт, его копии в репо нет).

## 3. Что реально зависит от файлов

| Потребитель | Ссылка | Статус |
|---|---|---|
| Web `src/lib/androidRelease.ts`, Android `AppRelease.kt`, `android/README.md` | `releases/latest/download/MQPlayer.apk` | ✅ 206 (работает) |
| Desktop updater (`tauri.conf.json` → `raw.githubusercontent.com/.../main/desktop/updates/latest.json`) | `releases/download/desktop-v1.0.0/MQ.Player_1.0.0_x64-setup.exe` | ✅ работает; **`desktop/updates/latest.json` нельзя трогать** — это живой endpoint обновлений, привязан к ветке `main` |
| `README.md` (бейдж + ссылка), `SALE.md` | `releases/latest/download/mq-player.apk` | ❌ **404** (с 2.x ассет называется `MQPlayer.apk`) — баг документации, исправить отдельно |
| `.github/workflows/build-android.yml` | загружает `mq-player.apk` | расходится с именем, которое ждёт приложение (см. docs/CI.md) |
| `scripts/promote-23{3,4}-stable.sh` | `LOCAL_APK=/home/z/my-project/download/...-rc.apk` | одноразовые скрипты с абсолютным путём чужой машины |
| `scripts/publish-desktop-100.py`, `republish-desktop-assets.py` | `download/desktop/*` | одноразовые скрипты публикации desktop-v1.0.0 |
| ~20 `scripts/*.py` QA/ref-скриптов | `/download/qa-*`, `/download/ref-analysis`, `/download/ym-research` | пишут/читают скриншоты, рантайм приложения от них не зависит |
| Android `ParityHarness` | `download/screens/parity/` | **нужен тестам** — оставить |

Код приложения (`src/`, `android/app/src/main`, `desktop/src*`) **не читает** ничего из `download/` во время работы.

## 4. Точный список кандидатов (только после подтверждения владельца)

**Группа A — дубли релизных ассетов (безопасно убрать из дерева, 76.7 MB):**
1. `download/MQPlayer-v2.2.0.apk`
2. `download/MQPlayer-v2.3.0.apk`
3. `download/MQPlayer.apk`
4. `download/android/MQPlayer.apk`
5. `download/mq-player-v2.3.2-rc.apk`
6. `download/mq-player-v2.3.3-rc.apk`
7. `download/mq-player-v2.3.4-rc.apk`
8. `download/mq-player-v2.2.0-release.aab`
9. `download/mq-player-v2.3.0-release.aab`
10. `download/desktop/MQ Player.exe`
11. `download/desktop/MQ Player_1.0.0_x64-setup.exe`
12. `download/desktop/MQ Player_1.0.0_x64-setup.exe.sig` — *перед удалением* загрузить как ассет в `desktop-v1.0.0` (подпись уже продублирована в `latest.json`).

Перед удалением скрипты `promote-23*.sh`, `publish-desktop-100.py`, `republish-desktop-assets.py` пометить как архивные (они ссылаются на эти пути).

**Группа B — исторические QA-скриншоты (≈540 MB):** все каталоги `download/qa*`, `download/ui-v4*`, `download/ref-analysis`, `download/v3-research`, `download/ym-research`, `download/playlist-*`, `download/fp-v8-qa`, `download/v9-qa`, `download/free-mode` и пр. — **кроме `download/screens/`**. Вариант: перенести в отдельный репозиторий `mq-player-qa-archive` или в release-ассет `qa-archive-YYYY-MM.zip`.

**Не кандидаты:** `download/screens/**`, `desktop/updates/latest.json`, `public/audio-engine/**` (версионированные WASM-сборки, обслуживаются приложением).

Важно: удаление из дерева **не уменьшит размер клона** — блобы останутся в истории. Сжатие истории (`git filter-repo`) — переписывание истории и force-push, **только по отдельному решению владельца**; без него ограничиваемся удалением из HEAD + `.gitignore`.

## 5. Предложение: QA-артефакты → CI

1. `.gitignore`: `download/**/*.apk`, `*.aab`, `*.exe`, `download/qa-*/`, с исключением `!download/screens/`.
2. Parity-скриншоты: тесты пишут в `build/parity/` (через уже добавленный `-Dmq.parityDir`), CI-джоба `android` в `ci.yml` загружает их `actions/upload-artifact` (retention 14 дней); эталоны остаются в `download/screens/parity/`, сравнение — в тесте. Это также убирает проблему «тесты перезаписывают tracked PNG» (docs/CI.md).
3. Web visual QA: Playwright-скриншоты → `upload-artifact` в PR, без коммита.
4. Релизные бинарники — только в GitHub Releases + `SHA256SUMS.txt` (уже практикуется, кроме `.sig`).
5. Pre-commit/CI-проверка `check-repo-structure.mjs` (PR #4): запрет новых файлов > 2 MB вне allowlist.

## 6. Найденные дефекты (не исправлены, требуют решения)

- README/SALE: ссылка `releases/latest/download/mq-player.apk` → 404. Исправление: `MQPlayer.apk` (как в `src/lib/androidRelease.ts`, который уже покрыт регрессионным тестом `android-apk-url-regression.test.ts`).
- `download/MQPlayer.apk` и `download/android/MQPlayer.apk` выглядят как «текущая» версия, но это 2.3.0 и 2.3.1 при latest 2.3.5.
- Ассет `.sig` для desktop-установщика отсутствует в релизе.
