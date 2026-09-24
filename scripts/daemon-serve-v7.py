#!/usr/bin/env python3
"""Double-fork daemonizer for the v7 QA server (standalone build, :3111)."""
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

os.execv("/bin/sh", ["/bin/sh", "/home/z/my-project/scripts/serve-qa-v7.sh"])
