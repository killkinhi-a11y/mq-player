#!/bin/bash
cd /home/z/my-project

# Kill any existing server on port 3000
fuser -k 3000/tcp 2>/dev/null
sleep 1

# Ensure static files are in standalone
if [ ! -d ".next/standalone/.next/static" ] || [ "$(ls .next/standalone/.next/static/chunks/ 2>/dev/null | wc -l)" -lt 10 ]; then
  echo "Copying static files..."
  mkdir -p .next/standalone/.next
  cp -r .next/static .next/standalone/.next/static
  cp -r public .next/standalone/public 2>/dev/null
fi

# Clear fetch cache to avoid stale responses
rm -rf .next/standalone/.next/cache/fetch-cache 2>/dev/null

echo "Starting MQ Player..."
exec NODE_ENV=production HOSTNAME=:: NODE_OPTIONS="--max-old-space-size=384" PORT=3000 \
  node .next/standalone/server.js
