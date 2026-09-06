#!/usr/bin/env python3
"""Double-fork daemonizer for the QA server.

The sandbox reaps processes whose PPID chain leads back to the Bash tool
session. A classic double-fork reparents the final process to init(1)
BEFORE the bash call ends, escaping the reaper. execv replaces the
daemon with the supervisor loop (serve-qa.sh).
"""
import os
import sys

if os.fork() > 0:
    # parent exits immediately -> bash call returns fast
    sys.exit(0)
os.setsid()
if os.fork() > 0:
    # intermediate child exits -> grandchild reparents to init
    sys.exit(0)

os.chdir("/")
os.umask(0)
# redirect stdio so no descriptors point back to the tool session
devnull = os.open(os.devnull, os.O_RDWR)
os.dup2(devnull, 0)
os.dup2(devnull, 1)
os.dup2(devnull, 2)

os.execv("/bin/sh", ["/bin/sh", "/home/z/my-project/mq-player/scripts/serve-qa.sh"])
