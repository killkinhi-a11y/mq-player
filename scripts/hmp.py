#!/usr/bin/env python3
"""Minimal QEMU HMP monitor client over unix socket.
Usage: hmp.py <socket-path> <command...>
Sends one command, prints the response. Tolerates slow TCG monitor.
"""
import socket
import sys
import time


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    sock_path = sys.argv[1]
    cmd = " ".join(sys.argv[2:])
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(10)
    try:
        s.connect(sock_path)
    except Exception as e:
        print(f"CONNECT_FAIL {e}")
        return 1
    # drain banner
    time.sleep(0.4)
    try:
        s.recv(65536)
    except Exception:
        pass
    s.sendall((cmd + "\n").encode())
    time.sleep(0.8)
    out = b""
    try:
        while True:
            d = s.recv(65536)
            if not d:
                break
            out += d
            if len(out) > 60000:
                break
    except socket.timeout:
        pass
    s.close()
    print(out.decode(errors="replace").strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
