#!/usr/bin/env bash
# Poll production version.json until it serves the given commit (deploy READY)
# or timeout. Usage: wait-deploy.sh <short-sha> [timeout_seconds]
set -euo pipefail
SHA="${1:?sha required}"; TIMEOUT="${2:-420}"
SITE="https://mq1.vercel.app"
ELAPSED=0; STEP=10
while (( ELAPSED < TIMEOUT )); do
  LIVE=$(curl -s -m 10 "$SITE/version.json" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('commit','')[:8])" 2>/dev/null || true)
  if [ "$LIVE" = "$SHA" ]; then
    echo "DEPLOY LIVE: $LIVE after ${ELAPSED}s"
    curl -s -m 10 "$SITE/version.json"
    exit 0
  fi
  sleep $STEP; ELAPSED=$((ELAPSED+STEP))
done
echo "TIMEOUT: still serving '${LIVE:-?}' after ${ELAPSED}s (wanted $SHA)"
exit 1
