#!/bin/sh
# QA dev server supervisor — survives sandbox process reaping between tool calls.
# Serves the DEV build of /home/z/my-project on :3000 (HMR for iteration).
cd /home/z/my-project
while true; do
  MQ_DISABLE_CF_DEV=1 \
  node /home/z/my-project/node_modules/next/dist/bin/next dev -p 3000 \
    >> /home/z/my-project/server.log 2>&1
  echo "[$(date)] dev server died, restarting in 2s" >> /home/z/my-project/server.log
  sleep 2
done
