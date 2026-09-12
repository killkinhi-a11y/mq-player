#!/bin/sh
# QA server supervisor — survives sandbox process reaping between tool calls.
# Serves the production build of /home/z/my-project/mq-player on :3000.
cd /home/z/my-project/mq-player
while true; do
  NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 \
    node /home/z/my-project/node_modules/next/dist/bin/next start -p 3000 \
    >> /tmp/mq-server.log 2>&1
  echo "[$(date)] server died, restarting in 2s" >> /tmp/mq-server.log
  sleep 2
done
