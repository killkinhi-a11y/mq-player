#!/usr/bin/env python3
"""Two-step env var update: find env ID by key, then PATCH the value.
Value passed via argv, never written to files or printed.
Usage: vercel-env-set.py <token> <project_id> <key> <value>
"""
import json
import sys
import urllib.request
import urllib.error

token, project_id, key, value = sys.argv[1:5]


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


# Step 1: find the env var entry (id, target, type)
envs = api(f"/v9/projects/{project_id}/env?limit=100").get("envs", [])
entry = next((e for e in envs if e.get("key") == key), None)

if entry is None:
    # Step 2a: create
    out = api(
        f"/v10/projects/{project_id}/env",
        "POST",
        {"key": key, "value": value, "target": ["production", "preview"], "type": "encrypted"},
    )
    print(f"CREATED {key} (id={out.get('id')})")
else:
    env_id = entry["id"]
    # Step 2b: update (keep existing targets; v9 PATCH env/{id})
    out = api(
        f"/v9/projects/{project_id}/env/{env_id}",
        "PATCH",
        {"value": value, "target": entry.get("target") or ["production", "preview"]},
    )
    print(f"UPDATED {key} (id={env_id}, target={out.get('target', entry.get('target'))})")
print("OK: stored encrypted server-side; value not printed")
