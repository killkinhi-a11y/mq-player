#!/usr/bin/env python3
"""Update a SPECIFIC env var entry by its id (handles duplicate keys with
different targets). Value via argv, never printed.
Usage: vercel-env-set-by-id.py <token> <project_id> <env_id> <value>
"""
import json
import sys
import urllib.request
import urllib.error

token, project_id, env_id, value = sys.argv[1:5]


def api(path, method="GET", body=None):
    req = urllib.request.Request(
        f"https://api.vercel.com{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


# Read current entry to preserve its target list
cur = api(f"/v1/projects/{project_id}/env/{env_id}")
target = cur.get("target") or ["production"]
out = api(
    f"/v9/projects/{project_id}/env/{env_id}",
    "PATCH",
    {"value": value, "target": target},
)
print(f"UPDATED id={env_id} key={cur.get('key')} target={out.get('target', target)}")
print("OK: stored encrypted server-side; value not printed")
