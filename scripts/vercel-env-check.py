#!/usr/bin/env python3
"""Check Vercel env vars for the mq1 project against user-provided Google
credentials. NEVER prints secret values — only existence, target, and a
match boolean. Usage:
  vercel-env-check.py <token> <project_id> <client_id> <client_secret>
"""
import json
import sys
import urllib.request

token, project_id, client_id, client_secret = sys.argv[1:5]

req = urllib.request.Request(
    f"https://api.vercel.com/v9/projects/{project_id}/env",
    headers={"Authorization": f"Bearer {token}"},
)
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.load(r)

envs = data.get("envs", [])
google = [e for e in envs if "GOOGLE" in e.get("key", "").upper()]

if not google:
    print("NO GOOGLE_* ENV VARS FOUND")
    sys.exit(0)

for e in google:
    key = e["key"]
    value = e.get("value") or ""
    # value may be None if Vercel masks it (sensitive) — try decrypted fetch
    if value == "" or value is None:
        try:
            req2 = urllib.request.Request(
                f"https://api.vercel.com/v9/projects/{project_id}/env/{e['id']}",
                headers={"Authorization": f"Bearer {token}"},
            )
            with urllib.request.urlopen(req2, timeout=30) as r2:
                value = (json.load(r2).get("value")) or ""
        except Exception:
            pass
    if key == "GOOGLE_CLIENT_ID":
        expected = client_id
    elif key == "GOOGLE_CLIENT_SECRET":
        expected = client_secret
    else:
        print(f"{key}: present (not compared), target={e.get('target')}")
        continue
    match = "MATCH" if value == expected else ("MISSING_VALUE" if not value else "MISMATCH")
    masked = (value[:6] + "…" + str(len(value)) + "ch") if value else "(unreadable)"
    print(f"{key}: target={e.get('target')} value={masked} -> {match}")
