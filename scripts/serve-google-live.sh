#!/bin/sh
# Google OAuth live-test server — v70 code + REAL Google credentials from .env.local
# Fresh auth-qa.db → initTursoSchema() bootstraps the v70 schema (incl. AuthIdentity).
cd /home/z/my-project/mq-player
export TURSO_DATABASE_URL="file:/home/z/my-project/db/auth-qa.db"
export JWT_SECRET="qa-jwt-secret-for-local-testing-only-32ch"
export NODE_ENV="development"
export NODE_OPTIONS="--max-old-space-size=1536"
export NEXT_TELEMETRY_DISABLED=1
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET come from .env.local (gitignored)
while true; do
  node /home/z/my-project/node_modules/next/dist/bin/next dev -p 3000 \
    >> /tmp/mq-dev.log 2>&1
  echo "[$(date)] google-test dev server died, restarting in 2s" >> /tmp/mq-dev.log
  sleep 2
done
