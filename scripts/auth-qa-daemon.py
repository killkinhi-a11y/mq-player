#!/usr/bin/env python3
"""Double-fork daemonizer for the AUTH QA dev server (v70).

Same escape-the-reaper pattern as scripts/daemon-dev.py: the sandbox reaps
processes whose PPID chain leads back to the Bash tool session, so we
double-fork to reparent to init(1) BEFORE the bash call ends, then exec
the supervisor loop (serve-auth-qa.sh) which keeps the dev server alive
with the auth QA env (local SQLite + test Telegram bot token).
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

os.execv("/bin/sh", ["/bin/sh", "/home/z/my-project/mq-player/scripts/serve-auth-qa.sh"])
