#!/bin/bash
# MQ Player watchdog - keeps server alive
cd /home/z/my-project

while true; do
  if ! pgrep -f "next-server" > /dev/null 2>&1; then
    echo "$(date): Server not running, starting..." >> /tmp/mq-watchdog.log
    
    # Kill stale processes
    fuser -k 3000/tcp 2>/dev/null
    sleep 1
    
    # Ensure static files
    if [ ! -d ".next/standalone/.next/static" ] || [ "$(ls .next/standalone/.next/static/chunks/ 2>/dev/null | wc -l)" -lt 10 ]; then
      echo "$(date): Copying static files..." >> /tmp/mq-watchdog.log
      mkdir -p .next/standalone/.next
      cp -r .next/static .next/standalone/.next/static 2>/dev/null
      cp -r public .next/standalone/public 2>/dev/null
    fi
    
    rm -rf .next/standalone/.next/cache/fetch-cache 2>/dev/null
    
    # Start server
    HOSTNAME=:: NODE_ENV=production NODE_OPTIONS="--max-old-space-size=384" PORT=3000 \
      node .next/standalone/server.js >> /tmp/mq-server.log 2>&1 &
    
    echo "$(date): Started server PID $!" >> /tmp/mq-watchdog.log
  fi
  sleep 10
done
