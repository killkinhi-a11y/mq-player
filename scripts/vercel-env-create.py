#!/usr/bin/env python3
"""vercel-env-create.py — create a new env var on project mq1 (all targets).
Usage: vercel-env-create.py <token> <key> <value> [targets=production,preview]
"""
import json
import sys
import urllib.request

TOKEN, KEY, VALUE = sys.argv[1], sys.argv[2], sys.argv[3]
TARGETS = sys.argv[4].split(",") if len(sys.argv) > 4 else ["production", "preview"]
PROJECT = "prj_5BaGhJQWIgpOI6rot5nyOHsrl8uH"  # mq1


def api(path, method="GET", body=None):
    req = urllib.request.Request(
        f"https://api.vercel.com{path}",
        method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


out = api(
    f"/v1/projects/{PROJECT}/env",
    "POST",
    {"key": KEY, "value": VALUE, "target": TARGETS, "type": "plain"},
)
print(json.dumps({"created": out.get("key"), "id": out.get("id"), "target": out.get("target")}, ensure_ascii=False))
