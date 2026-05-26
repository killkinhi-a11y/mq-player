#!/bin/bash
# MQ Player server keepalive & restart script
PROJECT_DIR="/home/z/my-project"
LOG="$PROJECT_DIR/server.log"
PORT=3000
STANDALONE_SERVER="$PROJECT_DIR/.next/standalone/server.js"

force_restart() {
  echo "[restart] Killing old processes..."
  pkill -9 -f "next-server" 2>/dev/null
  pkill -9 -f "node.*server.js" 2>/dev/null
  pkill -9 -f "node.*standalone" 2>/dev/null
  sleep 2

  # Ensure uploads directory exists
  mkdir -p "$PROJECT_DIR/uploads" 2>/dev/null
  mkdir -p "$PROJECT_DIR/public/uploads" 2>/dev/null

  # Copy static assets so standalone server can serve them
  if [ -d "$PROJECT_DIR/.next/static" ]; then
    cp -r "$PROJECT_DIR/.next/static" "$PROJECT_DIR/.next/standalone/.next/static" 2>/dev/null
  fi
  if [ -d "$PROJECT_DIR/public" ]; then
    cp -r "$PROJECT_DIR/public" "$PROJECT_DIR/.next/standalone/public" 2>/dev/null
  fi

  # Create symlink for uploads dir inside standalone
  if [ ! -L "$PROJECT_DIR/.next/standalone/uploads" ]; then
    ln -sf "$PROJECT_DIR/uploads" "$PROJECT_DIR/.next/standalone/uploads" 2>/dev/null
  fi

  echo "[restart] Starting standalone server (port $PORT)..."
  ( cd "$PROJECT_DIR/.next/standalone" && PORT=$PORT nohup node server.js </dev/null > "$LOG" 2>&1 & )
  sleep 5

  # Check /play (main app route) instead of / (which redirects)
  local_code=$(curl -s --connect-timeout 5 -o /dev/null -w '%{http_code}' http://localhost:$PORT/play 2>/dev/null)
  if echo "$local_code" | grep -qE "^(200|307)$"; then
    echo "[restart] Server is up (port $PORT, code $local_code)"
  else
    echo "[restart] WARNING: server not responding after start (code $local_code)"
  fi
}

# If called with --force, always restart
if [ "${1}" = "--force" ]; then
  force_restart
  exit $?
fi

# Otherwise, only restart if server is down (check /play for reliable 200)
if ! curl -s --connect-timeout 3 -o /dev/null -w '%{http_code}' http://localhost:$PORT/play 2>/dev/null | grep -qE "^200$"; then
  force_restart
fi
