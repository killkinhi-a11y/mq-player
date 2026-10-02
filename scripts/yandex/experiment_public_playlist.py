"""ЭТАП 4 — API experiment: public Yandex playlist WITHOUT a token.

Tests both test playlists from the task:
  A. https://music.yandex.ru/users/music.partners/playlists/1293
  B. https://music.yandex.ru/users/rsljst/playlists/1100

Variants per playlist:
  1. Default User-Agent (Yandex-Music-API), tokenless Client()
  2. TelegramBot User-Agent (module constant patched), tokenless Client()

Prints a FACTUAL result table: playlist title, owner, track_count, tracks len,
first 3 track names. No assumptions.
"""

import sys

import yandex_music
import yandex_music.utils.request_base as request_base
from yandex_music import Client

CASES = [
    ("music.partners", 1293),
    ("rsljst", 1100),
]


def try_fetch(user_id: str, kind: int, ua: str):
    client = Client()  # NO token
    try:
        pl = client.users_playlists(kind, user_id=user_id)
    except Exception as exc:  # noqa: BLE001 — experiment must show raw failures
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    if pl is None:
        return {"ok": False, "error": "returned None"}
    tracks = list(pl.tracks or [])
    pager = getattr(pl, "pager", None)
    return {
        "ok": True,
        "title": pl.title,
        "owner": getattr(getattr(pl, "owner", None), "login", None),
        "track_count": pl.track_count,
        "tracks_len": len(tracks),
        "pager_total": getattr(pager, "total", None),
        "first3": [f"{', '.join(a.name or '' for a in (t.track.artists or []) if t.track)} — {t.track.title}" for t in tracks[:3] if getattr(t, "track", None)],
    }


def main() -> int:
    print(f"yandex_music version: {yandex_music.__version__}")
    for user_id, kind in CASES:
        for label, ua in (("default-ua", request_base.USER_AGENT), ("telegrambot-ua", "TelegramBot")):
            request_base.USER_AGENT = ua  # patch — _prepare_kwargs reads the global at call time
            res = try_fetch(user_id, kind, ua)
            status = "OK " if res.pop("ok") else "FAIL"
            print(f"\n=== [{label}] {user_id}/{kind} -> {status} ===")
            for k, v in res.items():
                print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
