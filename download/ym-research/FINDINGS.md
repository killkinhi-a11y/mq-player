# Research: tokenless источник публичного плейлиста Яндекс Музыки для сервера

Дата: 2026-10-03 · Цель: `POST /api/yandex/public-playlist {url}` → `{title, owner, tracks[{artist,title}]}` без единого Yandex-credential.

## ВЕРДИКТ

**Tokenless источник существует: официальный публичный API**
`GET https://api.music.yandex.net/users/{owner}/playlists/{kind}`
(+ новый `GET /playlist/{uuid}`), доступен любому серверу с RU/CIS egress.
Нулевое количество credentials. Ограничение ровно одно — гео egress.

Доказано живыми запросами с публичных мониторинг-нод (check-host.net, голый GET,
без заголовков авторизации) — см. таблицу ниже.

## Живое доказательство (2026-10-03, request_id 4eaece87k628 / 4eaecf79k89d / 4eaed07bka60)

Цель: `https://api.music.yandex.net/users/music.partners/playlists/1293`

| Нода | Гео / ASN | Плейлист 1293 | /genres (контроль) | playlist/{dummy-uuid} |
|---|---|---|---|---|
| ru1.node.check-host.net | Москва, RU / AS14576 | **200 OK** | 200 | 404 |
| ru2.node.check-host.net | Москва, RU / AS210644 | **200 OK** | 200 | 404 |
| ru3.node.check-host.net | СПб, RU / AS210644 | **200 OK** | 200 | 404 |
| kz1.node.check-host.net | Караганда, KZ | **200 OK** | 200 | 404 |
| md1.node.check-host.net | Кишинёв, MD | **200 OK** | 200 | 404 |
| at1 / au1 / bg1 / br1 | AT/AU/BG/BR | 451 | 200 | 451 |

Выводы: fence — страновой (GeoIP), датацентровые RU/KZ/MD IP проходят;
404 на фиктивный uuid из RU = маршрут прошёл geo-проверку;
200 без каких-либо credentials = публичный плейлист читается анонимно.

## Формат доказательства (8 пунктов)

1. **URL/endpoint**: `https://api.music.yandex.net/users/{owner}/playlists/{kind}`
   (классический; владелец может быть логином или uid) и
   `https://api.music.yandex.net/playlist/{uuid}` (новый; UUID в поле `playlistUuid` ответа).
   Batch: `POST /users/{u}/playlists` `{"kinds":[...]}`; `GET /playlists?playlistIds=`.
2. **Пример запроса**: `curl -A 'Mozilla/5.0' https://api.music.yandex.net/users/music.partners/playlists/1293`
3. **Пример ответа** (shape по коду официального iframe-плеера v1.86.0 и MarshalX/yandex-music-api):
   `{uid, kind, playlistUuid, title, owner:{uid,login,name}, visibility:"public", trackCount, tracks:[{track:{id,title,artists:[{name}],albums:[{title}]}}]}`.
   Полный живой body даст YC smoke-test (из текущего egress тело недоступно из-за 451 — по построению).
4. **Регион egress**: RU/CIS обязателен (доказано: 451 из HK/US/EU/AU/BR; 200 из RU/KZ/MD).
   Vercel (iad1) — 451, перепроверено.
5. **Credentials**: НЕТ. Кодовая проверка MarshalX (`request_base.py`):
   `if self.client and self.client.token: set_authorization(...)` — заголовок Authorization
   добавляется только при токене; README: «Работа без авторизации ограничена… только
   первые 30 секунд аудиофайла» — т.е. анонимный режим официально существует,
   ограничение касается аудио, не метаданных.
6. **Production**: да. Это основной эндпоинт веб-плеера, мобильного API и официального
   анонимного embed-виджета (`music.yandex.ru/iframe/...` → config.js →
   `prefixUrl: https://api.music.yandex.{tld}`).
7. **GitHub/source**: MarshalX/yandex-music-api (Python; tokenless поддержан явно),
   официальный бандл iframe-плеера (yastatic-net.ru, v1.86.0). Анти-примеры:
   MarshalX/yandex2spotify (нужен токен), oklookat/goym (нужен токен),
   miroslav-kungurov/yandex-music-to-spotify (Selenium + `return Mu`, без Yandex-токена,
   но зависит от мёртвого в новом плеере глобала и требует RU-браузер).
8. **Стабильность**: `/users/{u}/playlists/{k}` — ядро веб/мобайл-клиента годами;
   `playlist/{uuid}` — актуальная форма нового плеера (в бандле v1.86.0 оба).
   Риск: дальнейшее расширение fence (сейчас — страновой список контентных роутов).

## Проверенные и мёртвые поверхности (пробы из не-RU egress — везде отрицательные)

| Поверхность | Результат |
|---|---|
| Страница плейлиста (Next.js SSR/RSC) | 200, но `preloadedPlaylist:"$undefined"` — данных нет |
| handlers/*.jsx (playlist, playlist-list, playlists, feed, oembed) | 200-шелл SPA (catch-all), не JSON — мертвы |
| Новые URL-формы /playlists/1293, /playlist/..., /p/..., /pl/... | 404 |
| oEmbed (/oembed, /api/oembed, /embed/oembed, /services/oembed, .com) | 404 или SPA-шелл |
| iframe /iframe/playlist/{owner}/{kind} | 200, но HTML-шелл плеера; данные тянет клиентом через тот же api.music.yandex |
| CDN (yastatic-net.ru) | только статика (JS/CSS), данных нет |
| robots.txt / sitemap.xml | шелл / нет данных |
| music.yandex.ru/api/v1|v2/playlist/... | SPA-шелл |
| `GET /playlists/{uuid}` на API | 404 (маршрута нет; geo-проверка на несуществующих роутах не срабатывает — fence per-route) |
| Wayback CDX | недоступен из песочницы (network) — не критично |

## Плейс egress: почему это НЕ обход блокировки

451 «Unavailable For Legal Reasons» — страновой GeoIP-фильтр на контентных роутах
API. Обходных поверхностей без RU egress не существует (проверено всё выше).
Легитимное решение — сервер в RU/CIS, что подтверждено работающими анонимными
клиентами (embed-виджет) и живыми 200 из RU/KZ/MD датацентров.

## Следующий шаг (без изменений MQ)

Готов артефакт `yc-smoke/` (index.py + DEPLOY.md): минимальная YC Cloud Function
ru-central1, stdlib-only, ноль credentials, один GET + самоотчёт egress IP.
Критерий PASS: 200 + title + owner + trackCount>0 + tracks[] + egress=Russia.
После PASS — ретрансляция через существующий `YANDEX_ADAPTER_URL`
(принимает только owner+kind / uuid, не /proxy?url=... — SSRF-модель MQ сохраняется).

## Артефакты

- scripts/ym_surfaces_probe.py — пробы всех поверхностей (+ bodies/)
- scripts/ym_checkhost_ru_test.py — живой RU/CIS тест (+ checkhost_ru_test.json)
- download/ym-research/surfaces_probe.json — полный отчёт проб
- download/ym-research/checkhost_ru_test.json — сырые результаты нод
- download/ym-research/yc-smoke/ — smoke-test для YC (index.py, DEPLOY.md)
- download/ym-research/bundles/ — config.js и бандл iframe-плеера v1.86.0
- download/ym-research/repos/ — исходники MarshalX (доказательство tokenless)

---

# ДОПОЛНЕНИЕ: формальный smoke-test PASS + production-интеграция (2026-10-03)

## 1. Формальный smoke-test — PASS (tokenless, полный живой body)

YC-деплой из исследовательской сессии невозможен (нет `yc` CLI / YC credentials —
требуется аккаунт владельца), поэтому по fallback-правилу доказательство получено
с другого RU egress; артефакт yc-smoke обновлён (обёртка `result`) и готов к
официальному подтверждению в облаке.

| Критерий | Результат |
|---|---|
| egress | 62.182.159.194:3128, Санкт-Петербург, RU (TLS end-to-end до api.music.yandex.net) |
| HTTP | **200**, 151 357 байт |
| JSON | да, `{invocationInfo, result}` (hostname: music-web-default-production-music-99.klg.yp-c.yandex.net) |
| title | «Лучшие новые песни 2015 года» |
| owner | music.partners / Музыкальная редакция (uid 139954184) |
| trackCount / tracks[] | 52 / 52 |
| credentials | **НЕТ** (клиент физически не устанавливает Authorization/Cookie) |
| негативный контроль | локальный не-RU egress → 451 (fence жив) |
| независимое подтверждение | свежий check-host: ru1/ru2/ru3/kz1/md1 → 200; at/au/bg/br → 451; dummy-uuid из RU → 404 |

Артефакты: `smoke_ru_egress.json`, `bodies/smoke_ru_body.json` (полный живой
ответ), `scripts/ym_smoke_ru_egress.py`, `local_e2e_report.json`.

## 2. Интеграция MQ — сделано ПОВЕРХ существующего стека main (887ae440)

Существующий стек (адаптер-протокол, public_playlist, YANDEX_PROXY_URL,
matcher, UI) не тронут. Добавлено:

- **UUID-ссылки нового плеера** (`/playlist/{uuid}`, `/playlists/{uuid}`):
  парсер `public-url.ts` (owner+kind ЛИБО uuid — по требованию контракта),
  роут `/api/yandex/public-playlist`, клиент `adapterPublicPlaylistByUuid`,
  адаптер `api/yandex_adapter.py` (нативный `client.playlist(uuid)`,
  взаимоисключающие параметры). Числовой id в uuid-слоте по-прежнему
  отклоняется (их тест-кейс сохранён).
- **YC-релей ru-central1** (`download/yc-relay/index.py` + DEPLOY.md):
  точная реализация протокола адаптера на stdlib — те же HMAC-заголовки
  (секунды, `"{ts}.{body}"`, derived `mq-yandex-adapter-v1`), те же коды
  ошибок, тот же data-контракт `public_playlist`; только {user_id,kind}/
  {playlist_uuid} (никаких URL), tokenless GET + пагинация; probe и
  public_playlist; OAuth-действия честно отклоняются. Нативный RU egress —
  включается одним env `YANDEX_ADAPTER_URL` (альтернатива YANDEX_PROXY_URL,
  без сторонних прокси).

## 3. Регрессия (всё зелёное)

- vitest **806/806** (797 + 9 UUID-кейсов), tsc 18 pre-existing (0 новых),
  eslint 0 errors, build Compiled successfully;
- адаптер self-tests **82/82** (76 + 6 UUID), relay-тесты (HMAC/replay/действия/
  параметры/data-контракт на живом RU body) — все PASS;
- их `public_import_e2e.mjs` (prod-mode + fake adapter + реальный SoundCloud):
  **ALL CHECKS PASS** (23 проверки, включая zero-auth и V10.4.1);
- relay E2E: прод-стек ↔ РЕАЛЬНЫЙ код yc-relay (replay живого RU body):
  owner+kind 200/52 трека, UUID 200/52, match 5/6 реальных SoundCloud,
  0 security-нарушений, релей получил только структурированные параметры;
- прод `mq-build-887ae440`: battery **15/15**; 400 на чужие URL (SSRF),
  честная 503 `yandex_geo_blocked` на валидные classic+UUID ссылки (до
  включения RU-релея), адаптер-probe 200.

## 4. Включение полного пути на проде (2 операторских шага)

1. Деплой релея: `download/yc-relay/DEPLOY.md` (5 команд yc, JWT_SECRET как у MQ);
2. `vercel env add YANDEX_ADAPTER_URL` = URL функции → redeploy.

Код MQ больше не требует изменений: public-флоу уже маршрутизируется через
YANDEX_ADAPTER_URL при его наличии. Никаких OAuth/токенов нигде в цепочке.
