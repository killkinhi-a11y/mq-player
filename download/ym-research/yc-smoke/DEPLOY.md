# YC Smoke Test — tokenless публичный плейлист Яндекс Музыки из ru-central1

## Что это

Минимальная Yandex Cloud Function для НЕЗАВИСИМОЙ проверки гипотезы до каких-либо
изменений в MQ:

- **Ноль credentials**: ни OAuth, ни токена, ни cookies. Код физически не умеет
  отправлять заголовок Authorization.
- **Один GET** к официальному публичному API:
  `https://api.music.yandex.net/users/music.partners/playlists/1293`
- **Самоотчёт egress**: функция узнаёт свой внешний IP + GeoIP и включает его в ответ,
  чтобы было видно, что запрос реально ушёл из инфраструктуры YC (RU).
- Зависимостей нет — только stdlib. Один файл `index.py`.

Поддерживает обе формы ссылок: `/users/{owner}/playlists/{kind}` и новую
`/playlists/{uuid}`.

## Деплой (yc CLI, ~5 команд)

```bash
# 0).folder должен быть в ru-central1 (default для YC)
yc config list

# 1) создать функцию
yc serverless function create --name ym-smoke

# 2) упаковать
cd yc-smoke
zip ../ym-smoke.zip index.py

# 3) задеплоить версию
yc serverless function version create \
  --function-name ym-smoke \
  --runtime python312 \
  --entrypoint index.handler \
  --memory 128m \
  --execution-timeout 30s \
  --source-path ../ym-smoke.zip

# 4) разрешить анонимный HTTP-вызов
yc serverless function allow-unauthenticated-invoke --name ym-smoke

# 5) вызвать (id функции: yc serverless function get --name ym-smoke --format json)
curl -s "https://functions.yandexcloud.net/<folder_id>/<function_id>" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://music.yandex.ru/users/music.partners/playlists/1293"}'
```

Ссылку для вызова также видно в консоли: страница функции → «Обзор» → «Ссылка»
(после включения публичного доступа).

## Критерий PASS (все пункты одновременно)

```json
{
  "credentials_sent": "NONE",
  "egress":        { "egress_country": "Russia", "egress_org": "...Yandex..." },
  "http_code":     200,
  "playlist":      { "title": "...", "owner_name": "...", "track_count": ">0" },
  "verdict":       "PASS: tokenless public playlist fetched with real data"
}
```

HTTP 200 на `/genres` или `/account/status` успехом НЕ считается — функция
специально ходит только на playlist-эндпоинт.

## Ожидаемый результат по итогам research

Уже доказано независимо (публичные мониторинг-ноды check-host.net, без credentials):

| нода | гео | playlist 1293 | /genres | dummy uuid |
|---|---|---|---|---|
| ru1 (Москва, AS14576) | RU | **200** | 200 | 404 |
| ru2 (Москва, AS210644) | RU | **200** | 200 | 404 |
| ru3 (СПб, AS210644) | RU | **200** | 200 | 404 |
| kz1 (Караганда) | KZ | **200** | 200 | 404 |
| md1 (Кишинёв) | MD | **200** | 200 | 404 |
| at1/au1/bg1/br1 | прочие | 451 | 200 | 451 |

RU/CIS **датацентровые** IP проходят fence. Egress YC Functions — это RU IP
Яндекса, поэтому PASS ожидается. Smoke-test закрывает вопрос формально.

## Стоимость

YC Functions: бесплатная квота покрывает такой smoke-test и лёгкий production-трафик
(вызовы + GB×часы; требуется активированный платный аккаунт). При недоступности YC —
та же логика на любом дешёвом RU VPS (~150–300 ₽/мес) или RU serverless-платформе;
все они проходят fence (см. таблицу — блокировка страновая, не по ASN датацентров).
