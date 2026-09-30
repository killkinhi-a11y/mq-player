#!/usr/bin/env python3
"""V10.4.1 — local standalone server lifecycle helper.

The sandbox reaps background processes BETWEEN tool calls, so the QA
server must be started and stopped INSIDE the same script run that
drives the browser. This module provides start_server()/stop_server()
for that pattern (mirrors the proven serve-qa-v8.sh supervisor but
in-process).
"""
import os
import signal
import subprocess
import time
import urllib.request

ROOT = "/home/z/my-project"
PORT = 3112
BASE = f"http://127.0.0.1:{PORT}"
SERVER = f"{ROOT}/.next/standalone/server.js"


def _kill_stale():
    """Kill any orphaned next-server children from earlier runs."""
    subprocess.run(
        "pkill -f 'standalone/server.js' 2>/dev/null; pkill -f 'next-server' 2>/dev/null; true",
        shell=True,
    )
    time.sleep(0.5)


def start_server(port=PORT):
    """Start the standalone server; returns (proc, base_url). Raises on timeout."""
    _kill_stale()
    env = dict(os.environ)
    env.update({"PORT": str(port), "HOSTNAME": "127.0.0.1", "NODE_ENV": "production"})
    log = open("/tmp/mq-standalone.log", "ab")
    proc = subprocess.Popen(
        ["node", SERVER],
        cwd=f"{ROOT}/.next/standalone",
        env=env,
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
    base = f"http://127.0.0.1:{port}"
    deadline = time.time() + 40
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base}/version.json", timeout=2) as r:
                if r.status == 200:
                    return proc, base
        except Exception:
            time.sleep(0.5)
    stop_server(proc)
    raise RuntimeError(f"server on :{port} did not become ready; see /tmp/mq-standalone.log")


def stop_server(proc=None):
    if proc is not None:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception:
            try:
                proc.terminate()
            except Exception:
                pass
    subprocess.run("pkill -f 'standalone/server.js' 2>/dev/null; true", shell=True)


if __name__ == "__main__":
    # smoke test: start, print version.json, stop
    p, base = start_server()
    try:
        with urllib.request.urlopen(f"{base}/version.json", timeout=5) as r:
            print(r.read().decode())
    finally:
        stop_server(p)
    print("SERVER LIFECYCLE OK")
