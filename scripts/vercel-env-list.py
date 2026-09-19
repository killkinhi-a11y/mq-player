#!/usr/bin/env python3
"""List ALL env vars of the project: key, id, target(s), type. NO VALUES.
Usage: vercel-env-list.py <token> <project_id>
"""
import json
import sys
import urllib.request

token, project_id = sys.argv[1:3]
req = urllib.request.Request(
    f"https://api.vercel.com/v9/projects/{project_id}/env?limit=100",
    headers={"Authorization": f"Bearer {token}"},
)
with urllib.request.urlopen(req, timeout=30) as r:
    envs = json.load(r).get("envs", [])

by_key = {}
for e in envs:
    by_key.setdefault(e["key"], []).append(e)

for key in sorted(by_key):
    for e in by_key[key]:
        print(f"{key:32} id={e['id']:24} target={','.join(e.get('target') or []) or '-':30} type={e.get('type')}")
