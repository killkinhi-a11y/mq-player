#!/bin/bash
while true; do
  cd /home/z/my-project/.next/standalone
  PORT=3001 NODE_OPTIONS="--max-old-space-size=4096" node server.js -H 0.0.0.0 > /tmp/mq-api.log 2>&1
  sleep 2
done
