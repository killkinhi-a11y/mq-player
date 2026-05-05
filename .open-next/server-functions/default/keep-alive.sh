#!/bin/sh
while true; do
  cd /home/z/my-project/mq-player
  NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 node .next/standalone/server.js 2>&1
  echo "Server died, restarting in 2s..."
  sleep 2
done
