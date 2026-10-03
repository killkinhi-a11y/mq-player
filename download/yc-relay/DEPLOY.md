# MQ Yandex Relay — Yandex Cloud Function (ru-central1)

Внутренний релей MQ для tokenless импорта публичных плейлистов Яндекс.Музыки.

**Ноль Yandex credentials**: функция делает один анонимный GET к официальному
публичному API `api.music.yandex.net` (Authorization/Cookie никогда не
устанавливаются — по построению кода).

**Только внутренний MQ-протокол**: HMAC-подпись (`X-MQ-Timestamp` /
`X-MQ-Signature`, derived key `HMAC(JWT_SECRET, "mq-yandex-adapter-v1")`),
replay-окно ±5 минут, приём ТОЛЬКО структурированных параметров
`{"owner","kind"}` / `{"uuid"}` — произвольные URL не принимаются, открытым
прокси функция быть не может.

## Деплой (yc CLI)

```bash
# 0) folder должен быть в ru-central1
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

# 4) разрешить вызов только по ключу ( НЕ allow-unauthenticated —
#    релей должен быть доступен только MQ-бэкенду через подпись;
#    тем не менее HMAC уже отклоняет посторонних, публичный вызов
#    вернёт 401 unauthorized)
yc serverless function allow-unauthenticated-invoke --name mq-yandex-relay
# (или restricted: ключ сервисного аккаунта добавляется заголовком
#  Authorization при вызове — см. шаг 5 в Vercel)

# 5) получить URL
yc serverless function get --name mq-yandex-relay --format json | grep http_url
```

Затем задать в Vercel (MQ):

```
YANDEX_ADAPTER_URL = https://functions.yandexcloud.net/<folder_id>/<function_id>
```

(через `vercel env add YANDEX_ADAPTER_URL production` + redeploy).

## Смоук-проверка после деплоя

```bash
cd <repo>
python3 - <<'PY'
import json, time, hmac, hashlib, os, urllib.request
SECRET = os.environ["JWT_SECRET"]  # тот же, что в MQ и в функции
URL = "https://functions.yandexcloud.net/<folder_id>/<function_id>"
body = json.dumps({"owner": "music.partners", "kind": "1293"})
ts = int(time.time() * 1000)
dk = hmac.new(SECRET.encode(), b"mq-yandex-adapter-v1", hashlib.sha256).digest()
sig = hmac.new(dk, f"{ts}:{body}".encode(), hashlib.sha256).hexdigest()
req = urllib.request.Request(URL, data=body.encode(), headers={
    "Content-Type": "application/json",
    "X-MQ-Timestamp": str(ts), "X-MQ-Signature": sig})
with urllib.request.urlopen(req, timeout=30) as r:
    out = json.loads(r.read())
pl = out.get("playlist", {})
print("ok:", out.get("ok"), "| upstream:", out.get("upstreamStatus"),
      "| title:", pl.get("title"), "| trackCount:", pl.get("trackCount"))
assert out.get("ok") is True and pl.get("trackCount", 0) > 0
print("RELAY SMOKE: PASS")
PY
```

Ожидаемо: `ok: True | upstream: 200 | title: Лучшие новые песни 2015 года | trackCount: 52`.

## Что релей возвращает при ошибках

| HTTP | error            | Когда |
|------|------------------|-------|
| 401  | unauthorized     | нет/неверная подпись или просрочен timestamp |
| 400  | bad_request      | тело не `{owner,kind}`/`{uuid}` |
| 404  | not_found        | плейлист не существует / не публичный |
| 502  | geo_fenced       | egress функции перестал считаться RU (fence расширили) |
| 502  | upstream_error   | прочие ошибки api.music.yandex.net |

## Стоимость

Бесплатная квота YC Functions (миллионы вызовов/мес + GB×часы) с запасом
покрывает импорт плейлистов. Исходящий трафик к api.music.yandex.net —
внутри сети Яндекса, копейки.
