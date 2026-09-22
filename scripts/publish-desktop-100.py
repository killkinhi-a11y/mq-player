#!/usr/bin/env python3
"""Publish the MQ Player DESKTOP release to GitHub Releases.

Pattern: same REST flow as scripts/publish-235-stable.py (token parsed from
the origin remote URL; SHA round-trip verify), with make_latest=FALSE so
`releases/latest` keeps pointing at the ANDROID stable release — the
permanent APK URL releases/latest/download/MQPlayer.apk is regression-test
enforced and must never move.

Usage: python3 scripts/publish-desktop-100.py
"""
import json
import os
import subprocess
import sys
import hashlib
import urllib.request

REPO = "killkinhi-a11y/mq-player"
TAG = "desktop-v1.0.0"
NAME = "MQ Player for Windows 1.0.0"
ASSETS = [
    ("download/desktop/MQ Player_1.0.0_x64-setup.exe", "MQ.Player_1.0.0_x64-setup.exe"),
    ("download/desktop/MQ Player.exe", "MQ.Player.exe"),
    ("download/desktop/SHA256SUMS.txt", "SHA256SUMS.txt"),
]

NOTES = """# MQ Player для Windows — первый выпуск

Полноценное настольное приложение MQ Player для Windows (не вкладка браузера и не PWA): собственное окно, панель задач, системный трей и Windows-медиа-управление.

## Что внутри
- Полный MQ Player: главная, поиск, библиотека, плейлисты, артисты, чаты, друзья, профиль, настройки, эквалайзер, тексты песен
- Плавающий мини-плеер и полноэкранный плеер с «живым» названием трека
- Фон подстраивается под обложку текущего трека
- QR-коды для быстрого обмена треками (проверены реальным сканером)
- Windows-медиа-кнопки и системная панель громкости управляют воспроизведением
- Музыка играет, когда окно закрыто (приложение сворачивается в трей)
- Вход: Google (через браузер), Telegram-бот и Email — как на сайте
- Автообновление: приложение предложит обновиться само

## Установка
1. Скачайте `MQ.Player_1.0.0_x64-setup.exe`
2. Запустите — установщик сам поставит всё необходимое (включая WebView2, если его нет)
3. Ярлыки появятся в меню «Пуск» и на рабочем столе (по выбору)

Системные требования: Windows 10/11 x64.

SHA-256: см. `SHA256SUMS.txt` в ассетах релиза.
"""


def gh_token() -> str:
    url = subprocess.check_output(["git", "remote", "get-url", "origin"], text=True).strip()
    # https://<user>:<token>@github.com/...
    creds = url.split("//", 1)[1].split("@", 1)[0]
    return creds.split(":", 1)[1]


def api(method: str, path: str, token: str, data=None, ctype="application/json"):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/{path}",
        method=method,
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": ctype,
            "User-Agent": "mq-desktop-publish",
        },
        data=json.dumps(data).encode() if data is not None else None,
    )
    with urllib.request.urlopen(req) as r:
        body = r.read()
        return r.status, json.loads(body) if body else {}


def upload_asset(token: str, upload_url: str, path: str, name: str):
    with open(path, "rb") as f:
        data = f.read()
    url = upload_url.replace("{?name,label}", "") + f"?name={urllib.parse.quote(name)}"
    req = urllib.request.Request(
        url,
        method="POST",
        headers={
            "Authorization": f"token {token}",
            "Content-Type": "application/octet-stream",
            "User-Agent": "mq-desktop-publish",
        },
        data=data,
    )
    with urllib.request.urlopen(req) as r:
        return r.status


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    import urllib.parse  # noqa: F401 (used in upload_asset)

    token = gh_token()
    print(f"[publish-desktop] repo={REPO} tag={TAG}")

    # 1. Create the release (make_latest=false — android keeps /releases/latest)
    status, rel = api("POST", "releases", token, {
        "tag_name": TAG,
        "name": NAME,
        "body": NOTES,
        "draft": False,
        "prerelease": False,
        "make_latest": "false",
    })
    if status == 422:
        # already exists → fetch it
        status, rel = api("GET", f"releases/tags/{TAG}", token)
    if status not in (200, 201):
        print("FATAL: release create failed", status, rel)
        sys.exit(1)
    rel_id = rel["id"]
    upload_url = rel["upload_url"]
    print(f"[publish-desktop] release id={rel_id}")

    # 2. Upload assets with SHA round-trip verification
    for path, name in ASSETS:
        local_sha = sha256(path)
        st = upload_asset(token, upload_url, path, name)
        if st not in (200, 201):
            print(f"FATAL: asset upload failed {name}: {st}")
            sys.exit(1)
        # round-trip: download and verify digest
        dl = f"https://github.com/{REPO}/releases/download/{TAG}/{urllib.parse.quote(name)}"
        req = urllib.request.Request(dl, headers={"User-Agent": "mq-desktop-publish"})
        with urllib.request.urlopen(req) as r:
            remote_sha = hashlib.sha256(r.read()).hexdigest()
        ok = "✓" if remote_sha == local_sha else "✗ MISMATCH"
        print(f"[publish-desktop] {name}: upload {st} sha {ok}")
        if remote_sha != local_sha:
            sys.exit(1)

    # 3. Verify release page + that releases/latest still = android
    status, latest = api("GET", "releases/latest", token)
    print(f"[publish-desktop] releases/latest = {latest.get('tag_name')} (must stay android-*)")
    assert str(latest.get("tag_name", "")).startswith("android-"), "LATEST BROKEN!"

    print("[publish-desktop] DONE")


if __name__ == "__main__":
    main()
