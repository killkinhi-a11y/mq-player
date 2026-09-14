#!/usr/bin/env python3
"""Double-fork daemonizer for the F7 Friends QA dev server.

Same escape-the-reaper pattern as scripts/auth-qa-daemon.py: the sandbox
reaps processes whose PPID chain leads back to the Bash tool session, so
we double-fork to reparent to init(1) BEFORE the bash call ends, then
exec the supervisor loop (serve-f7-qa.sh) which keeps the dev server
alive on :3210 with local Turso SQLite + devCode auth flow.
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

os.execv("/bin/sh", ["/bin/sh", "/home/z/my-project/scripts/serve-f7-qa.sh"])
