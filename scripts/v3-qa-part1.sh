#!/bin/bash
# V3 QA — PHASE 31-33. Server + browser QA in ONE invocation
# (the sandbox reaps background processes between tool calls).
set -u
cd /home/z/my-project/.next/standalone
node server.js > /tmp/mq-standalone.log 2>&1 &
SERVER_PID=$!
cd /home/z/my-project
OUT=download/qa-v3
mkdir -p "$OUT"

# Wait for readiness
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:3000/ 2>/dev/null)
  if [ "$code" != "000" ] && [ -n "$code" ]; then echo "SERVER UP ($code) after ${i}s"; break; fi
  sleep 1
done

AB="agent-browser --session v3qa"
$AB set viewport 1440 900 > /dev/null 2>&1

echo "=== 00 DESKTOP HOME ==="
$AB open http://127.0.0.1:3000/ > /dev/null 2>&1
$AB wait --load networkidle > /dev/null 2>&1 || true
sleep 2
$AB screenshot $OUT/00-desktop-home.png 2>&1 | tail -1

echo "=== 01 ENTER DEMO/APP ==="
# The root redirects to auth — enter demo mode (existing QA path)
$AB eval "document.querySelector('button')?.textContent" 2>/dev/null | head -2
$AB snapshot -i -c 2>&1 | head -25

echo "=== SERVER LOG TAIL ==="
tail -3 /tmp/mq-standalone.log
kill $SERVER_PID 2>/dev/null
echo "QA-PART-1 DONE"
