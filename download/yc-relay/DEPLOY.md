# MQ Yandex Relay — Yandex Cloud Function (ru-central1)

Внутренний RU-egress релей MQ для tokenless импорта публичных плейлистов
Яндекс.Музыки. Реализует **точный протокол адаптера MQ** (`api/yandex_adapter.py`
+ `src/lib/yandex/adapter.ts`): те же HMAC-заголовки, те же коды ошибок,
тот же data-контракт. stdlib-only — без зависимостей.

**Ноль Yandex credentials**: релей делает анонимные GET к официальному
публичному API `api.music.yandex.net` (Authorization/Cookie никогда не
устанавливаются — по построению кода). Egress YC ru-central1 — нативный RU,
никакой YANDEX_PROXY_URL не нужен.

**Только внутренний MQ-протокол**:
- `X-MQ-Timestamp` (unix **секунды**) + `X-MQ-Signature` =
  hex(HMAC-SHA256(derived, `"{ts}.{body}"`)), derived =
  HMAC-SHA256(JWT_SECRET, `"mq-yandex-adapter-v1"`) — идентично адаптеру;
- окно повторов ±300 c;
- поддерживаются только действия `probe` и `public_playlist`
  ({user_id, kind} ЛИБО {playlist_uuid}) — **никаких URL** (SSRF-безопасен
  по построению), OAuth-действия честно отклоняются `unsupported_action`.

Ответ `public_playlist` — тот же data-контракт, что у адаптера:
`{kind, uid, title, description, cover_url, owner_login, track_count,
tracks:[{position, track_id, album_id, title, artists[], album_title,
album_id_full, duration_ms, available}]}` (проверено replay-тестом на живом
RU body: см. `scripts/yc_relay_protocol_test.py`).

## Почему это готовое решение проблемы 451

Прод-адаптер MQ живёт на Vercel (iad1) — Яндекс отдаёт 451 на контентные
роуты оттуда. Существует два совместимых способа включить RU egress:
1. **YANDEX_PROXY_URL** (уже в проде): любой RU/CIS HTTP/SOCKS-прокси.
2. **YANDEX_ADAPTER_URL → этот релей**: указывает на YC-функцию ru-central1
   (нативный RU egress, бесплатная квота, без сторонних прокси).

Оба варианта не требуют изменений кода MQ. Релей — вариант без внешних
зависимостей и с оплатой только внутри Yandex Cloud.

## Деплой (yc CLI, ~5 команд)

```bash
# 0) folder должен быть в ru-central1 (default)
yc config list

# 1) создать функцию
yc serverless function create --name mq-yandex-relay

# 2) упаковать
cd download/yc-relay
zip ../../yc-relay.zip index.py

# 3) задеплоить версию (JWT_SECRET = тот же, что у MQ в Vercel!)
yc serverless function version create \
  --function-name mq-yandex-relay \
  --runtime python312 \
  --entrypoint index.handler \
  --memory 128m \
  --execution-timeout 30s \
  --environment JWT_SECRET="<JWT_SECRET from MQ Vercel env>" \
  --source-path ../../yc-relay.zip

# 4) разрешить аноимный HTTP-вызов (сама функция отклонит всех без HMAC)
yc serverless function allow-unauthenticated-invoke --name mq-yandex-relay

# 5) получить URL
yc serverless function get --name mq-yandex-relay --format json | grep http_url
```

Затем в Vercel (MQ): `vercel env add YANDEX_ADAPTER_URL production` =
`https://functions.yandexcloud.net/<folder_id>/<function_id>` → Redeploy.

## Смоук-проверка после деплоя

```bash
JWT_SECRET=<тот же> python3 - <<'PY'
import hashlib, hmac, json, os, time, urllib.request
URL = "https://functions.yandexcloud.net/<folder_id>/<function_id>"
body = json.dumps({"action": "public_playlist", "user_id": "music.partners", "kind": "1293"})
ts = str(int(time.time()))
dk = hmac.new(os.environ["JWT_SECRET"].encode(), b"mq-yandex-adapter-v1", hashlib.sha256).digest()
sig = hmac.new(dk, f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
req = urllib.request.Request(URL, data=body.encode(), headers={
    "Content-Type": "application/json",
    "X-MQ-Timestamp": ts, "X-MQ-Signature": sig})
with urllib.request.urlopen(req, timeout=30) as r:
    out = json.loads(r.read())
d = out.get("data") or {}
print("ok:", out.get("ok"), "| title:", d.get("title"), "| track_count:", d.get("track_count"))
assert out.get("ok") is True and (d.get("track_count") or 0) > 0
print("RELAY SMOKE: PASS")
PY
```

Ожидаемо: `ok: True | title: Лучшие новые песни 2015 года | track_count: 52`
(либо актуальный trackCount плейлиста).

## Ошибки релея

| HTTP | code               | Когда |
|------|--------------------|-------|
| 401  | unauthorized       | нет/неверная подпись, просрочен timestamp |
| 400  | bad_request        | неизвестное действие или кривые параметры |
| 400  | unsupported_action | OAuth-семейство действий (by design) |
| 404  | yandex_not_found   | плейлист не существует / приватный / пустой |
| 429  | yandex_rate_limited | Яндекс ограничил частоту |
| 503  | yandex_geo_blocked | egress перестал считаться RU (fence расширили) |
| 503  | yandex_unavailable | прочие сетевые проблемы |
| 504  | yandex_timeout     | Яндекс не ответил вовремя |

## Стоимость

Бесплатная квота YC Functions (вызовы + GB×часы) с запасом покрывает импорт
плейлистов; исходящий трафик к api.music.yandex.net — внутри сети Яндекса.
