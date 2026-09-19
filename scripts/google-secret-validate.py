#!/usr/bin/env python3
"""Validate a Google OAuth client_id + client_secret pair DIRECTLY against
Google's token endpoint — no real user code, no secrets printed.
Usage: google-secret-validate.py <client_id> <client_secret> <redirect_uri>
Logic: POST grant_type=authorization_code with a FAKE code.
  - invalid_client => credentials REJECTED (secret wrong for this client)
  - invalid_grant  => credentials ACCEPTED (code merely fake — secret GOOD)
"""
import json
import sys
import urllib.request
import urllib.parse

client_id, client_secret, redirect_uri = sys.argv[1:4]

body = urllib.parse.urlencode({
    "grant_type": "authorization_code",
    "code": "FAKE_VALIDATION_PROBE_4-0AxDiagnosticX99",
    "client_id": client_id,
    "client_secret": client_secret,
    "redirect_uri": redirect_uri,
}).encode()

req = urllib.request.Request(
    "https://oauth2.googleapis.com/token",
    data=body,
    method="POST",
    headers={"Content-Type": "application/x-www-form-urlencoded"},
)

try:
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
        print("UNEXPECTED 200:", json.dumps(data)[:200])
        sys.exit(1)
except urllib.error.HTTPError as e:
    err = json.loads(e.read().decode())
    code = err.get("error", "?")
    desc = err.get("error_description", "")[:120]
    print(f"HTTP {e.code} error={code}")
    if desc:
        print(f"desc: {desc}")
    if code == "invalid_client":
        print("VERDICT: SECRET_INVALID — pair rejected by Google")
        sys.exit(2)
    elif code == "invalid_grant":
        print("VERDICT: SECRET_VALID — client auth accepted (code fake as designed)")
        sys.exit(0)
    else:
        print("VERDICT: AMBIGUOUS — see error above")
        sys.exit(3)
