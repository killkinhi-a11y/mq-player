#!/bin/bash
# V3 QA — PART 3: search via refs + play + wave states + rapid switching (§31-33)
set -u
cd /home/z/my-project/.next/standalone
node server.js > /tmp/mq-standalone.log 2>&1 &
SERVER_PID=$!
cd /home/z/my-project
OUT=download/qa-v3
AB="agent-browser --session v3qa"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:3000/ 2>/dev/null)
  if [ "$code" != "000" ] && [ -n "$code" ]; then break; fi
  sleep 1
done

$AB set viewport 1440 900 > /dev/null 2>&1
$AB open http://127.0.0.1:3000/ > /dev/null 2>&1
sleep 2
$AB find text "Демо-режим" click > /dev/null 2>&1
sleep 3

echo "=== SEARCH VIEW ==="
$AB find text "Поиск" click 2>&1 | tail -1
sleep 1
$AB snapshot -i -c 2>&1 | head -12

echo "=== TYPE QUERY (first textbox) ==="
FIRSTREF=$($AB snapshot -i --json 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
# find the first textbox ref
def walk(o):
    if isinstance(o, dict):
        if o.get('role')=='textbox': return o.get('ref') or o.get('selector')
        for v in o.values():
            r=walk(v)
            if r: return r
    if isinstance(o, list):
        for v in o:
            r=walk(v)
            if r: return r
    return None
print(walk(d) or '')
")
echo "textbox ref: $FIRSTREF"
if [ -n "$FIRSTREF" ]; then
  $AB fill "$FIRSTREF" "the weeknd" 2>&1 | tail -1
fi
sleep 4
$AB screenshot $OUT/10-desktop-search-results.png 2>&1 | tail -1
$AB eval "document.querySelectorAll('[data-mq-search-track], [data-mq-track], .mq-row').length" 2>/dev/null

echo "=== SEARCH SNAPSHOT (first 20) ==="
$AB snapshot -i -c 2>&1 | head -20

kill $SERVER_PID 2>/dev/null
echo "QA-PART-3 DONE"
