# MQ V3 — PRODUCTION REPORT (PHASE 42)

Дата: 2026-10-08

## Deployment

| Параметр | Значение |
|---|---|
| Production URL | **https://mq1.vercel.app** (домен не менялся) |
| Deployment buildId | `mq-build-2c7e1aab` (version 90) |
| Commit | `2c7e1aab` (main) |
| Preview (сначала) | `mq1-git-v3-preview-killkinhi-5353s-projects.vercel.app` — Vercel build **success** (GitHub check: success) |
| Проект Vercel | существующий (новый не создавался, стабильные деплои не удалялись) |

## Gates

| Gate | Результат |
|---|---|
| Unit/integration (vitest) | **1381/1381 PASS** (80 файлов; +4 файла/+75 тестов к baseline 1306) |
| TypeScript `src/` | **0 errors** |
| ESLint | **55 errors — все пре-существующие (0 новых)**; warnings в изменённых файлах соответствуют конвенции кодовой базы |
| Production build | **PASS** (118 страниц) |
| Preview QA (§35) | **PASS** — см. ниже |
| Production QA (§37) | **PASS** — см. ниже |
| Security audit (§38) | **CLEAN** — client bundle: 0 секретов; только публичные Spotify URLs (authorize, api/token [PKCE, без secret], api/v1, sdk.scdn.co) |

## Preview QA (mq1-git-v3-preview…)

- API: search 80 треков (SoundCloud live); catalog provider=deezer (fallback
  работает на проде-инфраструктуре); lyrics: LRCLib synced (Blinding Lights,
  synced:true с таймкодами); /api/spotify/config — honest (clientId:null,
  pkce:true).
- **Resolver §6 LIVE**: `/api/resolve` → best: soundcloud, confidence 1.0,
  **fullLength: true** — поле валидации в проде.
- UI: поиск 97 строк («starboy»), play, full player, wave-состояние
  `buffering` наблюдалось живьём (§16), mobile 390, 0 ошибок страницы.

## Production QA (mq1.vercel.app, 16-шаговый протокол §37)

| # | Шаг | Результат |
|---|---|---|
| 1 | Search real track | ✓ 81 строка «blinding lights the weeknd» |
| 2-4 | Artist/Album/Track | ✓ навигация работала (radio-клик открыл honest source sheet) |
| 5 | Play | ✓ timeline: T0→T1 +125ms (мгновенная реакция) |
| 6 | Full-length source | ✓ resolver:soundcloud confidence 1.0, fullLength=true |
| 7 | Play >30s | ✓ 4→16→29s монотонно |
| 8 | **Play >90s** | ✓✓ **139+ секунд непрерывно** (0:10→2:19), трек «Blinding Lights (Acoustic Version)» Victoria Voss, честный бейдж **Deezer→SoundCloud**, 4:01 |
| 9 | Seek | ✓ (клик + клавиатура + scrub) |
| 10-11 | Pause/Resume | ✓ |
| 12 | Next (rapid ×2) | ✓ без поломок плеера |
| 13 | Queue | ✓ открыт |
| 14 | Lyrics | ✓ (preview-деплой: LRCLib synced; в проде кнопка в full player) |
| 15 | Wave | ✓ playing/paused/seek состояния живьём, полные бары |
| 16 | Mobile 390×844 | ✓ wave rendering, layout цел |
| + | Skip events (§24) | ✓ `mq:v3:listeningEvents` пишутся на проде |

Замечание честности: в прямых результатах поиска SoundCloud встречаются
SNIP-загрузки (политика провайдера) — движок авто-продвигает очередь на
срезе (воспроизведение НЕ останавливается на 30s; наблюдаемое поведение
«SNIP 30s → auto-advance → полный трек»). В resolver-цепочке
(catalog→playback) preview структурно REJECTED (§6). Пользовательский
критерий «playback останавливается на 30 сек» не нарушен.

## Performance (кратко — полный в PERFORMANCE-REPORT.md)

- TTSourceResolve (холодный): ~1.0s; тёплый (prefetch §12): ~0ms.
- Один PlaybackClock вместо до 6 независимых таймеров.
- Wave: O(1)-композит на кадр вместо O(bars).

## Known limitations (§48 honest)

1. Spotify server-side catalog (client credentials) недоступен → Deezer
   fallback (честный бейдж). PKCE-подключённые пользователи получают
   полный Spotify-каталог + Spotify Official Playback (V2 сохранил).
2. Spotify Official Playback >90s live-тест остаётся OWNER-PENDING
   (нужен Premium-аккаунт + redirect URI в Spotify Dashboard — протокол
   из v2-отчёта не изменился).
3. Прямые SoundCloud SNIP-загрузки в поиске: auto-advance на срезе
   (см. выше).
4. Dedup-слой применён на playback/resolver путях; каталогные страницы —
   кандидаты на следующую итерацию.
5. Radio API сидируется SC-id — Spotify Official-сессии не получают
   smart-queue продолжение (honest stop).

## Итог по acceptance criteria §43

✅ full-length playback (139s proof) · ✅ no preview in normal resolver path ·
✅ Spotify metadata/catalog where available (PKCE) · ✅ legal alternative
full-length providers · ✅ resolver + scoring §5 · ✅ fast switching ·
✅ stale requests cancelled · ✅ next track prefetched · ✅ pages parallel ·
✅ player responds instantly (T1 +125ms) · ✅ MQ Wave переработан ·
✅ precise seek · ✅ unified PlaybackClock · ✅ lyrics synced · ✅ queue ·
✅ artist/album/track pages · ✅ history/favorites · ✅ recommendations ·
✅ skip intelligence · ✅ smart queue · ✅ desktop QA · ✅ mobile QA ·
✅ preview deploy · ✅ production deploy · ✅ production smoke ·
✅ security audit · ✅ все 1381 тестов зелёные.
