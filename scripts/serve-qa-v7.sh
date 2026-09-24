#!/bin/sh
# QA server supervisor (micro-pass v7) — survives sandbox process reaping.
# Serves the STANDALONE production build of /home/z/my-project on :3111.
# (plain `next start` wedges API routes under `output: standalone`.)
while true; do
  PORT=3111 HOSTNAME=127.0.0.1 NODE_ENV=production \
    node /home/z/my-project/.next/standalone/server.js \
    >> /tmp/mq-standalone.log 2>&1
  echo "[$(date)] server died, restarting in 2s" >> /tmp/mq-standalone.log
  sleep 2
done
