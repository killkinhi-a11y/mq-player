#!/bin/bash
# Local standalone QA server for the design-completion AFTER capture.
cd /home/z/my-project
PORT=3112
# kill anything on the port (ss-based; pkill misses "next-server (v16)")
PIDS=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | sort -u)
if [ -n "$PIDS" ]; then kill $PIDS 2>/dev/null; sleep 2; fi
nohup npx next start -p $PORT > /tmp/qa-3112.log 2>&1 &
for i in $(seq 1 40); do
  sleep 1
  if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/play | grep -q 200; then
    echo "QA server up on :$PORT"; exit 0
  fi
done
echo "QA server FAILED to start"; tail -20 /tmp/qa-3112.log; exit 1
