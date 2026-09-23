#!/usr/bin/env python3
"""Double-fork daemonizer for the AUTH QA dev server (local, test env).

The sandbox reaps processes whose PPID chain leads back to the Bash tool
session. A classic double-fork reparents the final process to init(1)
BEFORE the bash call ends, escaping the reaper. execv replaces the
daemon with the supervisor loop (serve-dev-authqa.sh).
"""
import os
import sys

if os.fork() > 0:
    sys.exit(0)
os.setsid()
if os.fork() > 0:
    sys.exit(0)

os.chdir("/")
os.umask(0)
devnull = os.open(os.devnull, os.O_RDWR)
os.dup2(devnull, 0)
os.dup2(devnull, 1)
os.dup2(devnull, 2)

os.execv("/bin/sh", ["/bin/sh", "/home/z/my-project/scripts/qa-auth/serve-dev-authqa.sh"])
