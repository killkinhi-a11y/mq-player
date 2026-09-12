#!/bin/sh
# Auth QA server supervisor — survives sandbox process reaping between tool calls.
# Serves the DEV build of /home/z/my-project/mq-player on :3000 with the v70
# auth QA environment (local SQLite + test Telegram bot token).
# Auto-restarts the server if it dies. Log: /tmp/mq-dev.log
cd /home/z/my-project/mq-player
. /home/z/my-project/scripts/auth-qa-env.sh
export NODE_OPTIONS="--max-old-space-size=1536"
export NEXT_TELEMETRY_DISABLED=1
while true; do
  node /home/z/my-project/node_modules/next/dist/bin/next dev -p 3000 \
    >> /tmp/mq-dev.log 2>&1
  echo "[$(date)] auth-qa dev server died, restarting in 2s" >> /tmp/mq-dev.log
  sleep 2
done
