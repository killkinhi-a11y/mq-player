#!/usr/bin/env python3
"""Publish android-v2.3.5 as STABLE GitHub Release (NOT a pre-release).
Usage: publish-235-stable.py <apk_path> <sha256>
Reuses the verified signing identity + human-readable release notes.
Idempotence: refuses if the tag already exists with an asset."""
import json
import re
import subprocess
import sys
import urllib.request
import urllib.error

apk_path, sha256 = sys.argv[1], sys.argv[2]

remote = subprocess.run(['git', 'remote', 'get-url', 'origin'],
                        capture_output=True, text=True, cwd='/home/z/my-project').stdout.strip()
m = re.search(r'https://[^:]+:([^@]+)@github\.com', remote)
assert m, 'no token in remote'
TOKEN = m.group(1)
OWNER_REPO = 'killkinhi-a11y/mq-player'

commit = subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True,
                        text=True, cwd='/home/z/my-project').stdout.strip()

TAG = 'android-v2.3.5'
VERSION = '2.3.5'


def api(path, method='GET', body=None, raw=None, ctype='application/json', host='https://api.github.com'):
    req = urllib.request.Request(
        f'{host}{path}',
        data=(json.dumps(body).encode() if body is not None else raw),
        method=method,
        headers={
            'Authorization': f'Bearer {TOKEN}',
            'Accept': 'application/vnd.github+json',
            'Content-Type': ctype,
            'X-GitHub-Api-Version': '2022-11-28',
        },
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status, json.loads(r.read() or b'{}') if ctype == 'application/json' else r.read()


# 1. pre-check: tag must be free (or release without asset = resumable)
try:
    st, rel = api(f'/repos/{OWNER_REPO}/releases/tags/{TAG}')
except urllib.error.HTTPError as e:
    if e.code == 404:
        st, rel = 404, None
    else:
        raise
if st == 200:
    rid = rel['id']
    if any(a['name'] == 'MQPlayer.apk' for a in rel.get('assets', [])):
        print('FATAL: release already exists WITH asset — nothing to do (or wrong tag)')
        sys.exit(1)
    print(f'pre-check: release exists (id={rid}) without asset — resuming')
else:
    print('pre-check: tag free — creating STABLE release')
    notes = (
        f'MQ Player {VERSION} для Android.\n\n'
        '**Что нового**\n\n'
        '- **Библиотека** — один поиск вместо двух, честная история «Сегодня» и «Ранее», '
        'добавление треков в плейлисты сразу пачкой.\n'
        '- **Плеер** — обложка подстраивается под размер экрана, кнопки понятнее, '
        'при ошибке появился повтор.\n'
        '- **Меню трека** — длинные названия плейлистов помещаются, «Назад» больше '
        'не закрывает меню целиком.\n'
        '- **Настройки** — переключатели нажимаются по всей строке, выбор темы не «прыгает».\n'
        '- **Поиск** — крупная кнопка очистки, клавиатура не перекрывает результаты.\n'
        '- **Анимации** — плавные переходы между экранами, меню и плеером; индикаторы '
        'табов скользят, обложка возвращается пружиной после свайпа.\n'
        '- **Мелочи** — время трека всегда видно в списках, аккуратные иконки и отступы.\n\n'
        '---\n\n'
        f'Версия: {VERSION} (сборка 12)\n'
        f'SHA-256: `{sha256}`\n'
        'Подпись приложения не менялась — обновление ставится поверх предыдущих версий.'
    )
    st, rel = api(f'/repos/{OWNER_REPO}/releases', 'POST', {
        'tag_name': TAG,
        'target_commitish': commit,
        'name': f'MQ Player {VERSION}',
        'body': notes,
        'prerelease': False,
        'make_latest': 'true',
    })
    assert st == 201, f'release create failed: {st} {rel}'
    rid = rel['id']
    print(f'STABLE release created: id={rid} (prerelease=False, latest=true)')

# 2. upload the verified APK asset
data = open(apk_path, 'rb').read()
st, _ = api(f'/repos/{OWNER_REPO}/releases/{rid}/assets?name=MQPlayer.apk',
            'POST', raw=data, ctype='application/octet-stream',
            host='https://uploads.github.com')
assert st == 201, f'asset upload failed: {st}'
print('asset MQPlayer.apk uploaded')

# 3. round-trip verify: tag, not-prerelease, asset digest matches local sha
st, rel = api(f'/repos/{OWNER_REPO}/releases/tags/{TAG}')
assets = rel.get('assets', [])
apk = next((a for a in assets if a['name'] == 'MQPlayer.apk'), None)
assert apk, 'asset missing after upload'
assert rel['prerelease'] is False, 'NOT stable — prerelease flag is True!'
remote_digest = (apk.get('digest') or '').replace('sha256:', '')
assert remote_digest == sha256, f'digest mismatch: {remote_digest} != {sha256}'
print(f'VERIFIED: {TAG} STABLE, asset MQPlayer.apk {apk["size"]} B, digest == local sha256')

# 4. confirm releases/latest now points at 2.3.5
st, latest = api(f'/repos/{OWNER_REPO}/releases/latest')
assert latest['tag_name'] == TAG, f'latest is {latest["tag_name"]}, expected {TAG}'
print(f'LATEST: releases/latest -> {latest["tag_name"]} ({latest["name"]})')
