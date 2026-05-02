#!/bin/bash
cd /home/z/my-project
while true; do
  echo "$(date) Starting MQ Player..."
  NODE_ENV=production HOSTNAME=:: NODE_OPTIONS="--max-old-space-size=384" PORT=3000 \
    node .next/standalone/server.js 2>&1
  echo "$(date) Server exited, restarting in 3s..."
  sleep 3
done
