#!/bin/sh
# F7 QA server supervisor — survives sandbox process reaping between tool calls.
# Serves next dev on :3210 with local Turso SQLite (f7-qa.db) + devCode flow.
# VERCEL=1 skips the OpenNext workerd dev hook (workerd crashes in this sandbox).
# Log: /tmp/f7-dev.log
cd /home/z/my-project
. /home/z/my-project/scripts/auth-qa-env.sh
export TURSO_DATABASE_URL="file:/home/z/my-project/db/f7-qa.db"
export VERCEL=1
export NODE_OPTIONS="--max-old-space-size=1536"
export NEXT_TELEMETRY_DISABLED=1
while true; do
  node /home/z/my-project/node_modules/next/dist/bin/next dev -p 3210 \
    >> /tmp/f7-dev.log 2>&1
  echo "[$(date)] f7-qa dev server died, restarting in 2s" >> /tmp/f7-dev.log
  sleep 2
done
