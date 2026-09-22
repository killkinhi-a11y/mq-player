#!/bin/bash
# qa.sh — one-call QA helper: ensures dev server is up, then runs an
# agent-browser action. The sandbox reaps background processes between
# tool calls, so each invocation re-starts the server when needed.
# Usage: qa.sh <browser-args...>   e.g. qa.sh open http://localhost:3000/play
cd /home/z/my-project

check() { curl -s --connect-timeout 2 -o /dev/null -w '%{http_code}' http://localhost:3000/play 2>/dev/null; }

if [ "$(check)" != "200" ] && [ "$(check)" != "307" ]; then
  pkill -f "serve-dev-w13" 2>/dev/null
  pkill -f "next dev" 2>/dev/null
  sleep 1
  nohup sh scripts/serve-dev-w13.sh > /dev/null 2>&1 &
  # Wait up to 60s for boot+compile
  for i in $(seq 1 30); do
    code=$(check)
    if [ "$code" = "200" ] || [ "$code" = "307" ]; then break; fi
    sleep 2
  done
fi

exec agent-browser "$@"
