#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
E2E mock relay — serves the REAL yc-relay handler (download/yc-relay/index.py)
over plain HTTP, with exactly ONE patch: the Yandex upstream call replays the
LIVE body captured from a genuine RU egress (bodies/smoke_ru_body.json —
the real 200 OK of api.music.yandex.net, 151 KB, 52 tracks).

This lets the full MQ stack (their production routes + HMAC client) be
exercised against the EXACT relay artifact destined for Yandex Cloud
ru-central1, without needing RU egress on every run.

Usage: JWT_SECRET=<same as MQ server> python3 scripts/e2e_mock_relay.py [port]
Logs every request (signature values truncated) so the harness can assert
zero Authorization/Cookie headers and structured-params-only bodies.
"""
import importlib.util
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

RELAY_PATH = "/home/z/my-project/download/yc-relay/index.py"
BODY_PATH = "/home/z/my-project/download/ym-research/bodies/smoke_ru_body.json"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787

spec = importlib.util.spec_from_file_location("yc_relay", RELAY_PATH)
relay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)

LIVE = json.load(open(BODY_PATH, encoding="utf-8"))
LIVE_RAW = json.dumps(LIVE, ensure_ascii=False)
EMPTY_PAGE = json.dumps({"result": {"tracks": [], "pager": {"total": 65, "page": 1, "perPage": 100}}})


def replay_upstream(url, timeout=20):
    """Replay the captured RU-egress 200 OK instead of hitting Yandex."""
    if "page=" in url:
        print(f"[mock-upstream] GET {url} -> 200 (empty page)")
        return 200, EMPTY_PAGE
    print(f"[mock-upstream] GET {url} -> 200 (captured RU body, {len(LIVE_RAW)} bytes)")
    return 200, LIVE_RAW


relay._upstream_get = replay_upstream


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        out = relay.handler({"httpMethod": "GET", "headers": dict(self.headers), "body": ""}, None)
        payload = out["body"].encode("utf-8")
        self.send_response(out["statusCode"])
        for k, v in (out.get("headers") or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8", "replace") if length else ""

        safe_headers = {
            k: (v[:8] + "…" if k.lower() == "x-mq-signature" else v)
            for k, v in self.headers.items()
        }
        print(f"[relay] POST {self.path} headers={safe_headers} body={raw}", flush=True)
        for h in ("Authorization", "Cookie"):
            if h.lower() in {k.lower() for k in self.headers}:
                print(f"[relay][SECURITY-VIOLATION] credential header present: {h}", flush=True)
        # a URL must NEVER appear inside the action body
        if "://" in raw.replace("https://api.music.yandex.net", ""):
            print(f"[relay][SECURITY-VIOLATION] url-like data in body: {raw[:120]}", flush=True)

        out = relay.handler(
            {"httpMethod": "POST", "headers": dict(self.headers), "body": raw}, None
        )
        payload = out["body"].encode("utf-8")
        self.send_response(out["statusCode"])
        for k, v in (out.get("headers") or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[mock-relay] REAL yc-relay handler on http://127.0.0.1:{PORT} "
          f"(Yandex upstream replayed from the captured RU body)", flush=True)
    server.serve_forever()
