#!/bin/sh
# AUTH QA dev server supervisor — local ONLY, test env, port 3000.
# Same code tree as production (5bad44a0); env is LOCAL TEST VALUES.
# DB: throwaway SQLite via the SAME Turso adapter code path prod uses.
cd /home/z/my-project
while true; do
  MQ_DISABLE_CF_DEV=1 \
  TURSO_DATABASE_URL="file:/home/z/my-project/scripts/qa-auth/local-qa.db" \
  TURSO_AUTH_TOKEN="" \
  JWT_SECRET="local-qa-only-secret-32chars-minimum-0001" \
  TELEGRAM_BOT_TOKEN="1234567890:LOCAL-QA-TEST-TOKEN-NOT-REAL" \
  TELEGRAM_BOT_NAME="mq_local_qa_bot" \
  GOOGLE_CLIENT_ID="dummy-local-qa.apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="dummy-local-qa-secret" \
  NODE_OPTIONS="--max-old-space-size=512" \
  node /home/z/my-project/node_modules/next/dist/bin/next dev -p 3000 \
    >> /home/z/my-project/scripts/qa-auth/dev-server.log 2>&1
  echo "[$(date)] dev server died, restarting in 2s" >> /home/z/my-project/scripts/qa-auth/dev-server.log
  sleep 2
done
