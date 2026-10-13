# MQ UI V4.2 — FINAL REPORT (CSP FIX, AUTH STABILITY & FINAL VISUAL POLISH)

> **Production URL: https://mq1.vercel.app**
> **Production deployment: `mq-build-4dbccee4`** (commit `4dbccee4` на `main`, GitHub→Vercel auto-deploy, live 2026-10-13 01:23 UTC)
> Base: UI V4.1 (`mq-build-7e44ecd3`/`7f8ac460`). Никакого редизайна — security-хотфикс + точечный polish.

---

## 1. Состояние до начала (PHASE 0 — базлайн)

- Локальный `main` отставал от `origin/main` (V4.1 был **выполнен** предыдущей сессией и задеплоен: production = `7f8ac460`, 1358/1358 тестов, 20/20 smoke — несмотря на то, что summaries этого не фиксировали). Fast-forward выполнен; конфликты untracked upload/ файлов разрешены бэкапом (байт-идентичны, потерь нет).
- **CSP до фикса** (живой prod-ответ): `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, **без `frame-src`** → `default-src 'self'` блокировал iframe-ы виджетов; `challenges.cloudflare.com`/`telegram.org` отсутствовали в `script-src`.
- Пакет-менеджер npm, тесты vitest (80 файлов), Vercel-деплой через GitHub-интеграцию (без локального Vercel-токена — preview-URL через GitHub Deployments API).
- Baseline-гейты: **1383/1383** тестов (включая 25 новых CSP), tsc **src/ = 0** (32 вне-src pre-existing: desktop/tauri 29, scripts 1, skills 2), build PASS.

## 2. PHASE 1 — CSP: причина → фикс → верификация

### 2.1 Причина (4 живых нарушения, снятых на production до фикса)
Метод: headless Chromium + listener `securitypolicyviolation` на живой странице входа (`providers.telegramWidget=true`):

| # | violatedDirective | blockedURI | Следствие |
|---|---|---|---|
| 1 | `script-src-elem` | `telegram.org/js/telegram-widget.js` | виджет не исполнялся: тег в DOM, 0 iframe, `TelegramLoginWidget` undefined |
| 2 | `script-src-elem` | `challenges.cloudflare.com/turnstile/v0/api.js` | CobaltTurnstile не мог загрузиться → нет cobalt JWT → SNIP-bypass сломан |
| 3 | `frame-src` | `https://challenges.cloudflare.com` | iframe Turnstile блокирован (fallback на `default-src 'self'`) |
| 4 | `frame-src` | `https://oauth.telegram.org` | iframe кнопки Telegram-логина блокирован |

Отдельно проверено: это **не CORS/cookies/callback** (нарушения CSP с точными директивами; скрипт запрашивался ровно один раз и блокировался) и **не множественные CSP** (единственный источник — `next.config.ts headers()`; grep по `vercel.json`, `middleware.*`, `_headers`, API-роутам). Google-логин не страдал (серверный redirect — навигация не под CSP).
Evidence: `download/ui-v4.2/csp-evidence/CSP-EVIDENCE.md`.

### 2.2 Фикс (`next.config.ts`, каждое решение задокументировано инлайн)
```
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com https://telegram.org
frame-src  'self' https://challenges.cloudflare.com https://oauth.telegram.org   (новая директива)
```
- `'unsafe-eval'` **удалён** → `'wasm-unsafe-eval'`: единственная eval-подобная потребность — `WebAssembly.compile` WASM-движка (`WasmAudioBackend.ts:494`); `eval()`/`new Function` в src/ отсутствуют (grep). Ключевое слово узкое: WASM-only.
- Происхождения добавлены строго по inventory: **ровно 4 внешних скрипта** в приложении (telegram-widget.js ×2 места, telegram-web-app.js, turnstile api.js — grep `createElement("script")`).
- `frame-src 'self'` сохраняет прежнюю возможность same-origin embed (раньше governed `default-src 'self'`).
- `script-src 'unsafe-inline'` **оставлен + задокументирован**: Next.js App Router стримит RSC через inline-скрипты; nonce-CSP требует middleware + динамический рендеринг всех страниц — архитектурное изменение вне security-хотфикса (правило: не рефакторить без необходимости).
- Все защиты сохранены: `frame-ancestors 'none'`, `base-uri`, `form-action`, X-Frame-Options DENY, nosniff, HSTS.

### 2.3 Живая верификация auth-цепочки
- **Local (:3112)**: 0 violations; telegram-widget.js + turnstile api.js загружаются; `window.turnstile` = object; оба iframe разрешены; `WebAssembly.compile` OK; реальное воспроизведение SoundCloud.
- **Preview (adeaa399)**: 0 violations; **настоящий виджет отрендерен** с конфигом AuthView (data-telegram-login=mq_auth_bot, data-auth-url→callback): iframe `oauth.telegram.org/embed/mq_auth_bot` **238×40**.
- **Production (4dbccee4)**: приложение **само** инжектирует и рендерит виджет (без ручной инъекции): скрипт с корректным `data-auth-url=https://mq1.vercel.app/api/auth/telegram-widget/callback`, iframe 238×40 — **живая кнопка «Log in with Telegram»**, которой физически не существовало ни на одном деплое до фикса. 0 CSP violations, 0 page errors.
- Turnstile на production: скрипт грузится, виджет инициализируется и обменивается с Cloudflare, но Cloudflare возвращает **Error 110200 (Invalid domain)** — sitekey `0x4AAAAAAAhUvTuTxLs2HYH4` не привязан к домену `mq1.vercel.app` в Cloudflare-дашборде. Это конфигурация владельца sitekey, **вне кода** (честная граница: до фикса виджет не мог даже загрузиться; теперь работает и сообщает реальную причину). См. §E-1.

### 2.4 Регрессионные тесты
`src/__tests__/config/csp.test.ts` — **25 token-точных** ассертов: необходимые происхождения в нужных директивах; отсутствие standalone `'unsafe-eval'` (точный токен — `'wasm-unsafe-eval'` не маскирует); нет `*`/scheme-wildcard в script/frame; third-party origins только в нужных директивах (oauth.telegram.org — только frame-src); все защиты на месте; заголовки на catch-all роуте; X-Frame-Options DENY. + Обновлён design-contract пин Continue-CTA (`final-correction-pass.test.ts`) под новый hero-модификатор.

## 3. PHASE 2 — Visual polish

### 3.1 Circular artwork — найдены и исправлены 2 реальных pre-existing бага
1. **Ambient-тень артист-аватара никогда не рендерилась** (SpotifyArtistView:336): шаблон `` `${r},${g},${b}33` `` → невалидная CSS-строка → computed `box-shadow: ""`. Исправлено на `rgba(r, g, b, 0.33)`. Живая проверка: computed `rgba(65, 59, 58, 0.33) 0px 18px 48px 0px` ✓.
2. **`.mq-art { border-radius: var(--mq-r-art) /*10px*/ }` перекрывал Tailwind `rounded-full`** (same specificity, позже в source order): hero-аватар артиста, related-чипы и 2 аватара в поиске рендерились ПРЯМОУГОЛЬНЫМИ со времён V4.1 (VLM-подтверждено на V4.1-скриншоте). Поиск-hero был круглым только потому, что использует INLINE `borderRadius`. Исправлено по тому же паттерну (inline `borderRadius: "50%"`): SpotifyArtistView hero-аватар + related-чипы (×4 verified 50%), SearchView artist-rows (w-11) + artists-tiles (w-14).
3. Search-hero артиста: добавлен доминантный ambient (established artist-hero паттерн: `extractColors` по уже показанной обложке — 0 новых сетевых запросов, кэш, fallback).

VLM-вердикты: artist ambient на search-hero **4/10 → 8/10** («мягкий цветной ореол, эффект парения»); идеальный круг на artist-page **9/10**.

### 3.2 CTA
`mq-platinum-btn--hero` (materials-v25.css): усиленный platinum edge 24%→42% + глубокая посадка; specificity 0,2,0 — не трогает остальные 15+ call-sites. Применён к 4 hero-CTA: search Top Result, artist hero, album hero, Continue-карточка. VLM: контур «чётко отделяет кнопку» (6/10 → 7/10 на search-hero сglass-заливкой; **9/10** на альбоме); focus-visible/hover/active-состояния унаследованы от базового класса, touch-targets не изменены (h-11/h-12 + mq-hit44 где было).

### 3.3 Поиск — обязательные регрессии (preview + production, реальный каталог)
- `random access memories` → **АЛЬБОМ**-hero «Random Access Memories» ✓ (43-подписочный тёзка-артист не крадёт hero — tiebreak V4.1 жив)
- `daft punk` → **АРТИСТ**-hero «Daft Punk» ✓ (круглый artwork 168px + ambient)
- Дедуп превью: hero-трек не повторяется в 4 превью-строках ✓ (локально: Get Lucky отсутствует в превью)
- Общая лестница ranking не менялась (без special-casing запросов)

### 3.4 Continue Listening
Реальный прогресс (production: 0:26/4:08 на каталог-треке через навигацию), честный Resume, канонический дедуп «Недавно» (текущий Get Lucky исключён) — поведение V4.1 сохранено, регрессий нет.

### 3.5 Responsive + a11y
`overflowX=false` на **360/390/430/768/1440** (home + search, local и preview-споты). Клавиатурная навигация/aria hero не менялись (role=button, tabIndex, Enter/Space — код сохранён). Hero-CTA: focus-visible ring из базового platinum-класса.

## 4. PHASE 3 — Performance
Повторный ввод того же запроса → **0 новых /api/music/search** (клиентский кэш, счёт по performance entries). Воспроизведение непрерывно через навигацию (search→home, прогресс 0:07→0:16 local; production smoke тоже). Hero/ambient — чистая деривация уже загруженной обложки (`extractColors`, internal cache) — 0 новых сетевых запросов.

## 5. PHASE 4 — Автоматизация (10 чеков)

| # | Проверка | Результат |
|---|---|---|
| 1 | Unit/integration (vitest, полный набор) | **1383/1383** (80 файлов; +25 новых CSP) |
| 2 | Интеграционные по изменённым модулям | CSP-suite (config↔headers), design-contract (MainView pin) — зелёные |
| 3 | TypeScript | **src/ = 0**; вне-src 32 pre-existing (baseline: desktop/tauri, scripts, skills) |
| 4 | ESLint | 0 новых ошибок в изменённых файлах (baseline preserved) |
| 5 | Production build | PASS (Compiled successfully, 24–44s) |
| 6 | Локальный browser smoke (standalone :3112) | 0 CSP violations; виджеты грузятся; WASM OK; playback OK |
| 7 | Auth E2E (в пределах реальных credentials) | Telegram-виджет рендерится на production (реальный флоу, без инъекций); Turnstile загружается+инициализируется (110200 = sitekey-домен, см. §E-1); email-код флоу не тестировался (нет test-аккаунта) — честно NOT VERIFIED |
| 8 | CSP/security headers live | prod+preview: новая CSP ✓, X-Frame-Options DENY ✓, nosniff ✓, HSTS ✓ |
| 9 | Поиск + Continue регрессии | Оба обязательных запроса зелёные (preview + prod); дедуп превью/«Недавно» ✓; прогресс ✓ |
| 10 | Responsive QA | 360/390/430/768/1440 — overflowX=false (home+search) |

## 6. PHASE 5 — Deploy
- `adeaa399` (CSP + polish) → branch `ui-v42` → preview `mq1-afvbfn5lf` — QA зелёный → найден radius-баг →
- `4dbccee4` (circle fixes) → preview `mq1-1axbicyed` — круг+ambient+related-чипы verified →
- **`main` 7f8ac460..4dbccee4 → production `mq-build-4dbccee4`** (версия подтверждена `/version.json`; никакого параллельного деплоя, авто-деплой GitHub→Vercel; не force-push; secrets/.env не в diff; `public/version.json` build-артефакт откачен до commit'а по конвенции v10.2).
- Post-deploy prod-проверка: CSP header, виджет 238×40, 0 violations, 0 page errors, обязательные запросы, artist-circle, Continue 0:26/4:08, continuity.

## 7. A–F

**A. IMPLEMENTED** — CSP-хотфикс (unsafe-eval→wasm-unsafe-eval, script-src allowlist по inventory, frame-src) с evidence; 2 pre-existing бага circular artwork (invalid rgba shadow; mq-art radius override) + search-hero artist ambient; hero-CTA модификатор ×4; CSP regression suite (25); design-contract update; full deploy preview→prod.

**B. TESTED** (evidence в `download/ui-v4.2/`) — 1383/1383; tsc src/=0; build; local smoke; preview QA ×2 (widget iframe live, круги 50%, обязательные запросы, 0 violations); production QA (виджет отрендерен приложением, продолжение воспроизведения 0:26/4:08, 0 page errors, overflowX=0 на 5 ширинах локально).

**C. NOT VERIFIED** — Полный happy-path вход через Telegram-виджет (клик по живой кнопке → callback → сессия): требует реального Telegram-аккаунта; проверено до момента рендера живой кнопки + серверный callback-роут не менялся. Email-код флоу (нет тестового аккаунта/почты). Turnstile **успешное** решение капчи на prod-домене (sitekey домен не привязан — см. D/E). Catalog-Spotify как активный провайдер (extended-quota ограничение, известно с free-mode).

**D. BLOCKED** — Turnstile 110200 на mq1.vercel.app: sitekey привязан не к этому домену; **нужно в Cloudflare Turnstile-дашборде добавить `mq1.vercel.app` в allowed domains sitekey** `0x4AAAAAAAhUvTuTxLs2HYH4` — действие владельца аккаунта Cloudflare, из кода недоступно. До этого cobalt SNIP-bypass получает капчу, которую браузер честно не может решить на этом домене.

**E. Остаточные проблемы / рекомендации**
1. **Cloudflare sitekey domain-binding** (см. D) — единственный оставшийся шаг для полного Turnstile-флоу.
2. `script-src 'unsafe-inline'` — Next.js RSC inline-bootstrap; устранение = nonce-CSP через middleware + динамический рендеринг всех страниц (архитектурный проект, отдельным раундом).
3. `/tg` внутри Telegram Web K (iframe) блокируется `frame-ancestors 'none'` + X-Frame-Options DENY (pre-existing, осознанно не тронуто в security-хотфиксе: защита от clickjacking; мобильные Telegram-клиенты используют WebView, не iframe — не затронуто).
4. Ambient-glow яркость следует яркости обложки (доминантный цвет): на очень тёмных обложках (Daft Punk) ореол мягкий — честное поведение паттерна; при желании — min-luminance clamp отдельным решением.
5. Вне-src tsc (desktop/skills/scripts) — техдолг с V4.

**F. Артефакты**
- Отчёты: этот файл; `csp-evidence/CSP-EVIDENCE.md` (живые нарушения до фикса).
- Скриншоты: `qa-local/` (6), `qa-preview/` (8, включая PROD-widget 238×40, круг-фикс, album-hero, continue-card).
- Коммиты `main`: `adeaa399` (CSP+polish) → `4dbccee4` (radius). Ветка: `ui-v42`.
- Тесты: `src/__tests__/config/csp.test.ts` (25); обновлён `final-correction-pass.test.ts`.
- Production: **https://mq1.vercel.app**, deployment **`mq-build-4dbccee4`**, commit `4dbccee4`.
