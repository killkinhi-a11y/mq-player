#!/bin/bash
# Reliable keep-alive for MQ Player
LOG="/tmp/mq-keepalive-prod.log"
while true; do
  if ! ss -tlnp 2>/dev/null | grep -q ':3000 '; then
    echo "[$(date)] Port 3000 free, starting server..." >> $LOG
    cd /home/z/my-project/.next/standalone
    node server.js >> $LOG 2>&1 &
    SERVER_PID=$!
    echo "[$(date)] Started PID=$SERVER_PID" >> $LOG
    # Wait for server to die
    wait $SERVER_PID 2>/dev/null
    echo "[$(date)] Server died, restarting in 3s..." >> $LOG
    sleep 3
  fi
  sleep 5
done
