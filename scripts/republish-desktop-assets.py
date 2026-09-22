#!/usr/bin/env python3
"""Replace desktop-v1.0.0 release assets with the FINAL build
(re-run of publish after the settings-toggle rebuild): delete old assets,
upload new ones, SHA round-trip verify, keep make_latest=android."""
import json
import subprocess
import urllib.request
import urllib.parse
import hashlib

REPO = "killkinhi-a11y/mq-player"
TAG = "desktop-v1.0.0"
ASSETS = [
    ("download/desktop/MQ Player_1.0.0_x64-setup.exe", "MQ.Player_1.0.0_x64-setup.exe"),
    ("download/desktop/MQ Player.exe", "MQ.Player.exe"),
    ("download/desktop/SHA256SUMS.txt", "SHA256SUMS.txt"),
]

def gh_token():
    url = subprocess.check_output(["git", "remote", "get-url", "origin"], text=True).strip()
    return url.split("//", 1)[1].split("@", 1)[0].split(":", 1)[1]

def api(method, path, token, data=None, ctype="application/json", raw=None):
    url = path if path.startswith("http") else f"https://api.github.com/repos/{REPO}/{path}"
    req = urllib.request.Request(
        url, method=method,
        headers={"Authorization": f"token {token}", "Accept": "application/vnd.github+json",
                 "Content-Type": ctype, "User-Agent": "mq-desktop-publish"},
        data=json.dumps(data).encode() if data is not None else raw,
    )
    with urllib.request.urlopen(req) as r:
        body = r.read()
        return r.status, (json.loads(body) if body and ctype == "application/json" else body)

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()

token = gh_token()
st, rel = api("GET", f"releases/tags/{TAG}", token)
assert st == 200, rel
for a in rel["assets"]:
    st, _ = api("DELETE", f"releases/assets/{a['id']}", token)
    print(f"deleted old asset {a['name']}: {st}")
upload_url = rel["upload_url"]
for path, name in ASSETS:
    st = api("POST", upload_url.replace("{?name,label}", "") + f"?name={urllib.parse.quote(name)}",
             token, ctype="application/octet-stream", raw=open(path, "rb").read())[0]
    dl = f"https://github.com/{REPO}/releases/download/{TAG}/{urllib.parse.quote(name)}"
    with urllib.request.urlopen(urllib.request.Request(dl, headers={"User-Agent": "x"})) as r:
        remote = hashlib.sha256(r.read()).hexdigest()
    ok = remote == sha256(path)
    print(f"uploaded {name}: {st} sha {'✓' if ok else '✗ MISMATCH'}")
    assert ok
st, latest = api("GET", "releases/latest", token)
print(f"releases/latest still = {latest['tag_name']}")
assert str(latest["tag_name"]).startswith("android-")
print("DONE")
