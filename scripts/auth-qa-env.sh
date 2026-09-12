#!/bin/bash
# v70 auth QA environment — local SQLite (Turso file mode) + test bot token
export TURSO_DATABASE_URL="file:/home/z/my-project/db/auth-qa.db"
export JWT_SECRET="qa-jwt-secret-for-local-testing-only-32ch"
export TELEGRAM_BOT_TOKEN="123456:TEST-BOT-TOKEN-abcdef"
export TELEGRAM_BOT_NAME="mq_test_bot"
export NODE_ENV="development"
