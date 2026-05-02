#!/bin/bash
cd /home/z/my-project/.next/standalone
while true; do
  PORT=3001 NODE_OPTIONS="--max-old-space-size=4096" node server.js -H 0.0.0.0 >> /tmp/mq-run.log 2>&1
  sleep 2
done
