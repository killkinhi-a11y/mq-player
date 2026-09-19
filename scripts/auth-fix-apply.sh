#!/usr/bin/env bash
# AUTH FIX APPLY — one-shot: Google secret + Telegram bot migration.
# Usage:
#   auth-fix-apply.sh --confirm <vercel_token> <google_secret> <tg_bot_token> <tg_bot_name>
# All secrets via argv ONLY — never printed, never written to files/git.
#
# Steps:
#   0. validate vercel token (whoami) + resolve project id
#   1. upsert GOOGLE_CLIENT_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_NAME
#      (encrypted, production+preview) via scripts/vercel-env-set.py
#   2. apply: empty commit + push -> auto-deploy -> poll version.json
#   3. POST /api/telegram/setup-webhook (registers webhook+commands via NEW token)
#   4. verify: providers bot name, diagnose token prefix flip,
#      Google fake-code probe flip (invalid_client -> invalid_grant class)
#   5. smoke sweep + APK integrity
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SITE="https://mq1.vercel.app"
PROJECT_ID="prj_5BaGhJQWIgpOI6rot5nyOHsrl8uH"

[ "${1:-}" = "--confirm" ] || { echo "dry-run only: pass --confirm to apply"; exit 0; }
[ $# -eq 5 ] || { echo "usage: $0 --confirm <vercel_token> <google_secret> <tg_bot_token> <tg_bot_name>"; exit 1; }
VTOKEN="$2"; GSECRET="$3"; TGTOKEN="$4"; TGNAME="$5"

echo "── 0. token + project"
WHO=$(curl -s -m 15 -H "Authorization: Bearer $VTOKEN" https://api.vercel.com/v2/user)
WHO_OK=$(printf '%s' "$WHO" | python3 -c "import json,sys; d=json.load(sys.stdin); print(bool(d.get('user',{}).get('username')))" 2>/dev/null || echo False)
[ "$WHO_OK" = "True" ] || { echo "FATAL: vercel token invalid"; exit 1; }
echo "vercel token OK (user $(printf '%s' "$WHO" | python3 -c "import json,sys; print(json.load(sys.stdin)['user']['username'])"))"

echo "── 1. env upserts (encrypted, production+preview)"
python3 "$HERE/vercel-env-set.py" "$VTOKEN" "$PROJECT_ID" "GOOGLE_CLIENT_SECRET" "$GSECRET"
python3 "$HERE/vercel-env-set.py" "$VTOKEN" "$PROJECT_ID" "TELEGRAM_BOT_TOKEN" "$TGTOKEN"
python3 "$HERE/vercel-env-set.py" "$VTOKEN" "$PROJECT_ID" "TELEGRAM_BOT_NAME" "$TGNAME"

echo "── 2. apply via deploy (empty commit)"
cd "$HERE/.."
git commit --allow-empty --quiet -m "chore: apply auth env — google secret + telegram bot @$TGNAME"
git push origin main --quiet
AFTER=$(git rev-parse HEAD)
echo "deploying ${AFTER:0:8} ..."
LIVE=""
for i in $(seq 1 48); do
  LIVE=$(curl -s -m 10 "$SITE/version.json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('commit','')[:8])" 2>/dev/null || true)
  [ "$LIVE" = "${AFTER:0:8}" ] && break
  sleep 10
done
[ "$LIVE" = "${AFTER:0:8}" ] || { echo "FATAL: deploy did not go live (last: $LIVE)"; exit 1; }
echo "deploy live: $LIVE"

echo "── 3. webhook on the new bot"
SETUP=$(curl -s -m 30 -X POST "$SITE/api/telegram/setup-webhook" -H "Content-Type: application/json" \
  -d "{\"webhookUrl\":\"${SITE}/api/telegram/webhook\"}")
printf '%s' "$SETUP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('  ok:', d.get('ok'), '| bot:', (d.get('botInfo') or {}).get('username'), '| url:', (d.get('webhookInfo') or {}).get('url'))
"
SETUP_OK=$(printf '%s' "$SETUP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('ok') and (d.get('botInfo') or {}).get('username')=='$TGNAME' and bool((d.get('webhookInfo') or {}).get('url')))")
[ "$SETUP_OK" = "True" ] || { echo "FATAL: webhook setup failed / bot mismatch"; exit 1; }

echo "── 4. verification probes"
sleep 3
NAME=$(curl -s -m 15 "$SITE/api/auth/telegram-bot-name" | python3 -c "import json,sys; print(json.load(sys.stdin).get('botName'))")
echo "telegram-bot-name: $NAME"
[ "$NAME" = "$TGNAME" ] || { echo "FATAL: bot name not flipped"; exit 1; }
PROBE=$("$HERE/google-secret-probe.sh" "$SITE")
echo "$PROBE" | tail -1
echo "$PROBE" | grep -q "CREDENTIALS_VALID" || { echo "FATAL: google secret still invalid on production"; exit 1; }

echo "── 5. smoke"
for p in / /play /api/app-version /api/auth/providers /.well-known/assetlinks.json; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$SITE$p")
  [ "$code" = "200" ] || [ "$code" = "307" ] || { echo "FATAL: $p -> $code"; exit 1; }
  echo "  $p -> $code"
done
echo "APPLIED OK — owner device test: Google login + @$TGNAME OTP flow."
