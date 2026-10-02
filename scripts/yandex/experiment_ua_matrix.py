"""Test which User-Agents get SSR'd playlist content on music.yandex.ru."""

import re
import requests

URL = "https://music.yandex.ru/users/music.partners/playlists/1293"

UAS = {
    "telegrambot": "TelegramBot",
    "yandexbot": "YandexBot/3.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    "googlebot": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "browser-ru": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
}

for label, ua in UAS.items():
    h = {"User-Agent": ua, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ru-RU,ru;q=0.9"}
    try:
        r = requests.get(URL, headers=h, timeout=30)
        html = r.text
        markers = {
            "trackCount": html.count("trackCount"),
            "trackIds": html.count("trackIds"),
            '"tracks"': html.count('"tracks"'),
            "artists": html.count("artists"),
            "length_": len(html),
        }
        # a known-ish marker: any durationMs or storageDir (cover) fields
        markers["durationMs"] = html.count("durationMs")
        markers["storageDir"] = html.count("storageDir")
        print(f"[{label}] status={r.status_code} " + " ".join(f"{k}={v}" for k, v in markers.items()))
    except Exception as e:
        print(f"[{label}] ERR {type(e).__name__}: {e}")
