#!/bin/bash
# MQ Player - complete startup script
# Starts Next.js API server + Express static proxy

cd /home/z/my-project/.next/standalone

# Start Next.js on port 3001
PORT=3001 NODE_OPTIONS="--max-old-space-size=4096" node server.js -H 0.0.0.0 &
NX_PID=$!
echo "Next.js PID: $NX_PID on port 3001"

# Wait for Next.js
for i in $(seq 1 30); do
  if ss -tlnp | grep -q ":3001 "; then
    echo "Next.js ready"
    break
  fi
  sleep 1
done

# Start Express on port 3000
PORT=3000 node /home/z/my-project/.next/standalone/static-server.js &
EX_PID=$!
echo "Express PID: $EX_PID on port 3000"

# Wait
wait $NX_PID $EX_PID
echo "Servers stopped, restarting..."
sleep 2
exec "$0"
