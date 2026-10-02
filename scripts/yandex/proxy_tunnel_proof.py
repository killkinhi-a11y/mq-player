#!/usr/bin/env python3
"""
Live CONNECT-tunnel proof for the YANDEX_PROXY_URL egress proxy support.

Spins up a minimal raw-socket HTTP proxy (CONNECT only), points the adapter's
YANDEX_PROXY_URL at it and runs the REAL tokenless action_public_playlist.
From this sandbox (HK egress) Yandex answers 451, which is EXPECTED — the
point of the proof is:

  1. requests really TRAVERSES the proxy (the tunnel observes
     CONNECT api.music.yandex.net:443 and relays the TLS bytes);
  2. the response round-trips back through the tunnel and the adapter maps
     it to the honest yandex_geo_blocked code (mapping intact end-to-end);
  3. with the env var UNSET the tunnel observes ZERO connections (the
     default path stays direct — zero behavior change without the var).

Usage:
    JWT_SECRET=t python3 scripts/yandex/proxy_tunnel_proof.py
Exit code 0 = proof holds.
"""

import importlib.util
import os
import socket
import threading
from pathlib import Path

ADAPTER_PATH = Path(__file__).resolve().parents[2] / "api" / "yandex_adapter.py"
PROXY_HOST, PROXY_PORT = "127.0.0.1", 8899
TUNNEL_LOG: list[str] = []
LOG_LOCK = threading.Lock()

spec = importlib.util.spec_from_file_location("yandex_adapter", ADAPTER_PATH)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


def _relay(src: socket.socket, dst: socket.socket) -> None:
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        try:
            src.close()
        except OSError:
            pass
        try:
            dst.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def _handle(conn: socket.socket) -> None:
    try:
        conn.settimeout(30)
        request_line = conn.recv(4096).decode("latin-1", "replace")
        first = request_line.split("\r\n", 1)[0]
        method, target, _proto = (first.split(" ", 2) + ["", "", ""])[:3]
        if method.upper() != "CONNECT":
            conn.sendall(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n")
            return
        host, _, port = target.partition(":")
        with LOG_LOCK:
            TUNNEL_LOG.append(f"{host}:{port or '443'}")
        upstream = socket.create_connection((host, int(port or 443)), timeout=20)
        upstream.settimeout(60)
        conn.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        t1 = threading.Thread(target=_relay, args=(conn, upstream), daemon=True)
        t2 = threading.Thread(target=_relay, args=(upstream, conn), daemon=True)
        t1.start()
        t2.start()
        t1.join()
        t2.join()
    except Exception as exc:  # noqa: BLE001 — proof harness, log and move on
        with LOG_LOCK:
            TUNNEL_LOG.append(f"tunnel-error: {type(exc).__name__}")
    finally:
        try:
            conn.close()
        except OSError:
            pass


def start_proxy() -> socket.socket:
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((PROXY_HOST, PROXY_PORT))
    srv.listen(8)

    def accept_loop() -> None:
        while True:
            conn, _ = srv.accept()
            threading.Thread(target=_handle, args=(conn,), daemon=True).start()

    threading.Thread(target=accept_loop, daemon=True).start()
    return srv


def main() -> int:
    os.environ["JWT_SECRET"] = os.environ.get("JWT_SECRET") or "tunnel-proof-secret"
    os.environ.pop("YANDEX_PROXY_URL", None)  # deterministic start

    srv = start_proxy()
    failures: list[str] = []

    # ── Case 1: proxy configured → the call MUST traverse the tunnel ──────────
    os.environ["YANDEX_PROXY_URL"] = f"http://{PROXY_HOST}:{PROXY_PORT}"
    result = "no-error"
    try:
        adapter.action_public_playlist({"user_id": "music.partners", "kind": "1293"})
    except adapter.AdapterError as exc:
        result = f"{exc.code} ({exc.status})"
    except Exception as exc:  # noqa: BLE001
        result = f"unexpected {type(exc).__name__}"

    with LOG_LOCK:
        saw_connect = "api.music.yandex.net:443" in TUNNEL_LOG
    print(f"  case1 through-proxy call -> {result}")
    print(f"  case1 tunnel CONNECT log  -> {TUNNEL_LOG}")
    if not saw_connect:
        failures.append("tunnel never saw CONNECT api.music.yandex.net:443")
    if result != "yandex_geo_blocked (503)":
        failures.append(f"through-tunnel result changed: {result} (expected yandex_geo_blocked 503 from this egress)")

    # ── Case 2: env unset → tunnel MUST see zero new connections ──────────────
    os.environ.pop("YANDEX_PROXY_URL", None)
    with LOG_LOCK:
        before = len(TUNNEL_LOG)
    result2 = "no-error"
    try:
        adapter.action_public_playlist({"user_id": "music.partners", "kind": "1293"})
    except adapter.AdapterError as exc:
        result2 = f"{exc.code} ({exc.status})"
    import time

    time.sleep(0.5)
    with LOG_LOCK:
        direct_extra = len(TUNNEL_LOG) - before
    print(f"  case2 direct call -> {result2}, tunnel extra connections = {direct_extra}")
    if direct_extra != 0:
        failures.append("default path unexpectedly touched the proxy")
    if result2 != result:
        failures.append(f"direct vs proxied outcome diverged: {result2} vs {result}")

    srv.close()
    if failures:
        print("PROOF FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PROOF HOLDS: proxy traversal + honest geo mapping + zero default-path change")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
