#!/bin/sh
# DEV server supervisor — survives sandbox process reaping between tool calls.
# Serves the DEV build of /home/z/my-project/mq-player on :3000 (HMR for iteration).
# Uses the parent workspace node_modules (mq-player/node_modules is an empty mount).
cd /home/z/my-project/mq-player
while true; do
  node /home/z/my-project/node_modules/next/dist/bin/next dev -p 3000 \
    >> /tmp/mq-dev.log 2>&1
  echo "[$(date)] dev server died, restarting in 2s" >> /tmp/mq-dev.log
  sleep 2
done
