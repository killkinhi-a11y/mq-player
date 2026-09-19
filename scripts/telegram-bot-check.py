#!/usr/bin/env python3
"""Check the NEW Telegram bot identity + webhook status.
Token via argv ONLY — never echoed, never written to files.
Usage: telegram-bot-check.py <TOKEN>
"""
import json
import sys
import urllib.request

token = sys.argv[1]
base = f"https://api.telegram.org/bot{token}"


def call(method):
    with urllib.request.urlopen(f"{base}/{method}", timeout=15) as r:
        return json.load(r)


print("=== getMe ===")
d = call("getMe")
if not d.get("ok"):
    print("API_ERROR:", d.get("description"))
    sys.exit(1)
r = d["result"]
print("id:          ", r["id"])
print("username:    ", "@" + str(r.get("username")))
print("first_name:  ", r.get("first_name"))

print("=== getWebhookInfo ===")
d = call("getWebhookInfo")
if not d.get("ok"):
    print("API_ERROR:", d.get("description"))
    sys.exit(1)
r = d["result"]
print("url:            ", r.get("url") or "(none — polling or unset)")
print("has_custom_cert:", r.get("has_custom_certificate"))
print("pending_updates:", r.get("pending_update_count"))
print("last_error:     ", r.get("last_error_message") or "(none)")
if r.get("ip_address"):
    print("ip_address:     ", r["ip_address"])
