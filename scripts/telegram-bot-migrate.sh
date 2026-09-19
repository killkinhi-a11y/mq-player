#!/usr/bin/env bash
# TELEGRAM BOT MIGRATION (different bot: mqplay_bot → mq_auth_bot)
# EXECUTES ONLY WITH --confirm. All secrets via argv only — never printed,
# never written to git/worklog/logs.
#
# Usage:
#   ./telegram-bot-migrate.sh --confirm <vercel_token> <project_id_or_name> \
#        <new_bot_token> <new_bot_name>
#
# Guarded flow:
#   0. resolve Vercel project (id or name → id)
#   1. verify the new bot identity via getMe; username MUST match new_bot_name
#   2. upsert TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_NAME (production+preview,
#      encrypted) via scripts/vercel-env-set.py (argv-only, proven pattern)
#   3. apply: empty commit + push → Vercel auto-deploy → poll version.json
#   4. POST /api/telegram/setup-webhook (runtime token = NEW bot)
#      → registers webhook + bot commands + menu button on the new bot
#   5. verify: webhook info (url set, no errors), bot username, providers name
#   6. honest report: PROVEN vs owner-device-pending (real OTP login)
#
# Old bot cleanup (owner action, after the new flow is confirmed working):
#   the old mqplay_bot webhook still points at production — remove it via
#   @BotFather (or revoke the old token). The old token value is NOT stored
#   anywhere by this migration (env-overwritten in place).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SITE="https://mq1.vercel.app"
WEBHOOK_PATH="/api/telegram/webhook"

[ "${1:-}" = "--confirm" ] || { echo "dry-run only: pass --confirm to migrate"; exit 0; }
[ $# -eq 5 ] || { echo "usage: $0 --confirm <vercel_token> <project_id_or_name> <new_bot_token> <new_bot_name>"; exit 1; }
VERCEL_TOKEN="$2"; PROJECT="$3"; NEW_TOKEN="$4"; NEW_NAME="$5"

# ── 0. resolve project id ────────────────────────────────────────────────────
if [[ "$PROJECT" == prj_* ]]; then
  PROJECT_ID="$PROJECT"
else
  PROJECT_ID=$(curl -s -m 30 -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v9/projects?limit=100" | python3 -c "
import json,sys
for p in json.load(sys.stdin).get('projects', []):
    if p.get('name') == '$PROJECT':
        print(p['id']); break
")
  [ -n "$PROJECT_ID" ] || { echo "FATAL: project '$PROJECT' not found on Vercel"; exit 1; }
fi
echo "project: $PROJECT_ID"

# ── 1. verify the new bot (getMe) — token never printed ─────────────────────
GETME=$(curl -s -m 15 "https://api.telegram.org/bot${NEW_TOKEN}/getMe")
BOT_OK=$(printf '%s' "$GETME" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok'))")
BOT_USERNAME=$(printf '%s' "$GETME" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['username'])")
BOT_ID=$(printf '%s' "$GETME" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['id'])")
[ "$BOT_OK" = "True" ] || { echo "FATAL: getMe failed for the new token"; exit 1; }
[ "$BOT_USERNAME" = "$NEW_NAME" ] || { echo "FATAL: getMe username '$BOT_USERNAME' != expected '$NEW_NAME' (TELEGRAM_BOT_NAME would lie to users)"; exit 1; }
echo "new bot verified: @$BOT_USERNAME (id $BOT_ID)"

# ── 2. upsert env vars (encrypted, production+preview) ──────────────────────
python3 "$HERE/vercel-env-set.py" "$VERCEL_TOKEN" "$PROJECT_ID" "TELEGRAM_BOT_TOKEN" "$NEW_TOKEN"
python3 "$HERE/vercel-env-set.py" "$VERCEL_TOKEN" "$PROJECT_ID" "TELEGRAM_BOT_NAME" "$NEW_NAME"

# ── 3. apply via controlled deploy (empty commit + push, poll version.json) ─
cd "$HERE/.."
BEFORE=$(git rev-parse HEAD)
git commit --allow-empty --quiet -m "chore: apply telegram bot migration env (@$NEW_NAME)"
git push origin main --quiet
AFTER=$(git rev-parse HEAD)
echo "deploying $AFTER ..."
LIVE=""
for i in $(seq 1 40); do
  LIVE=$(curl -s -m 10 "$SITE/version.json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('commit','')[:8])" 2>/dev/null || true)
  [ "$LIVE" = "${AFTER:0:8}" ] && break
  sleep 10
done
[ "$LIVE" = "${AFTER:0:8}" ] || { echo "FATAL: deploy did not go live (last: $LIVE)"; exit 1; }
echo "deploy live: $LIVE"

# ── 4. register webhook + commands on the NEW bot (runtime token) ────────────
SETUP=$(curl -s -m 30 -X POST "$SITE/api/telegram/setup-webhook" \
  -H "Content-Type: application/json" \
  -d "{\"webhookUrl\":\"${SITE}${WEBHOOK_PATH}\"}")
echo "setup-webhook:"
printf '%s' "$SETUP" | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('  ok:', d.get('ok'))
print('  bot:', (d.get('botInfo') or {}).get('username'))
wi = d.get('webhookInfo') or {}
print('  webhook url:', wi.get('url'))
print('  pending updates:', wi.get('pending_update_count'))
print('  last error:', wi.get('last_error_message') or 'none')
"
SETUP_OK=$(printf '%s' "$SETUP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('ok') and (d.get('botInfo') or {}).get('username') == '$NEW_NAME' and (d.get('webhookInfo') or {}).get('url'))")
[ "$SETUP_OK" = "True" ] || { echo "FATAL: webhook setup failed or bot mismatch"; exit 1; }

# ── 5. final verification: providers serves the new bot name ────────────────
sleep 3
PROV=$(curl -s -m 15 "$SITE/api/auth/providers")
echo "providers.telegramBotName: $(printf '%s' "$PROV" | python3 -c "import json,sys; print(json.load(sys.stdin).get('telegramBotName'))")"
echo ""
echo "MIGRATION APPLIED. Owner device test now (real OTP): open @$NEW_NAME in"
echo "Telegram → send any message → receive OTP → enter on $SITE → verify"
echo "Home/session/reload/logout/login-again."
