#!/usr/bin/env python3
"""Publish android-vX.Y.Z-rc pre-release with MQPlayer.apk asset.
Usage: publish-rc.py <version> <apk_path> <sha256>
GitHub token from the origin remote URL (after first colon)."""
import json
import re
import subprocess
import sys
import urllib.request

version, apk_path, sha256 = sys.argv[1], sys.argv[2], sys.argv[3]

remote = subprocess.run(['git', 'remote', 'get-url', 'origin'],
                        capture_output=True, text=True, cwd='/home/z/my-project').stdout.strip()
m = re.search(r'https://[^:]+:([^@]+)@github\.com', remote)
assert m, 'no token in remote'
TOKEN = m.group(1)
OWNER_REPO = 'killkinhi-a11y/mq-player'

# current commit
commit = subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True,
                        text=True, cwd='/home/z/my-project').stdout.strip()


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
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, json.loads(r.read() or b'{}') if ctype == 'application/json' else r.read()


# 1. pre-check: release must not exist yet (404 = tag free = good)
import urllib.error
try:
    st, rel = api(f'/repos/{OWNER_REPO}/releases/tags/android-v{version}-rc')
except urllib.error.HTTPError as e:
    if e.code == 404:
        st, rel = 404, None
    else:
        raise
if st == 200:
    # idempotent resume: release without asset can continue
    rid = rel['id']
    if any(a['name'] == 'MQPlayer.apk' for a in rel.get('assets', [])):
        print(f'FATAL: android-v{version}-rc already exists WITH asset')
        sys.exit(1)
    print(f'pre-check: release exists (id={rid}) without asset — resuming')
else:
    print('pre-check: tag free')

    # 2. create release (prerelease)
    notes = (
        f'MQ Player {version} — глубокий мобильный UX-пасс (аудит против web-mobile).\n\n'
        'Ключевые изменения: Library (один поиск/сортировка, честная группировка '
        '«Сегодня»/«Ранее», batch «В плейлист»), FullPlayer (адаптивная обложка, '
        'раздельные иконки, retry), Settings (строчный toggle + анимация, сетка тем), '
        'ContextMenu (Back в плейлистах), ChatDetail на MQ-языке, real insets на '
        'всех экранах, EQ-индикатор играющего трека, иконки empty-states.\n\n'
        f'SHA-256: `{sha256}`\n\n'
        'Device QA — pending (тест с телефона). Сайт продолжает раздавать 2.3.4.'
    )
    st, rel = api(f'/repos/{OWNER_REPO}/releases', 'POST', {
        'tag_name': f'android-v{version}-rc',
        'target_commitish': commit,
        'name': f'MQ Player {version}-rc',
        'body': notes,
        'prerelease': True,
    })
    assert st == 201, f'release create failed: {st} {rel}'
    rid = rel['id']
    print(f'release created: id={rid}')

# 3. upload asset named MQPlayer.apk (uploads.github.com host!)
data = open(apk_path, 'rb').read()
st, _ = api(f'/repos/{OWNER_REPO}/releases/{rid}/assets?name=MQPlayer.apk',
            'POST', raw=data, ctype='application/octet-stream',
            host='https://uploads.github.com')
assert st == 201, f'asset upload failed: {st}'
print('asset MQPlayer.apk uploaded')

# 4. round-trip verify
st, rel = api(f'/repos/{OWNER_REPO}/releases/tags/android-v{version}-rc')
assets = rel.get('assets', [])
assert any(a['name'] == 'MQPlayer.apk' for a in assets), 'asset missing'
assert rel['prerelease'] is True, 'not prerelease'
print(f'VERIFIED: android-v{version}-rc prerelease, asset MQPlayer.apk '
      f'({[a["size"] for a in assets if a["name"]=="MQPlayer.apk"][0]} B), tag at {commit[:8]}')
