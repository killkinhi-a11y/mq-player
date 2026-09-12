#!/bin/bash
# v70 Auth QA — API-level verification of all real auth flows
# Requires: dev server running with scripts/auth-qa-env.sh env (port 3000)

BASE="http://localhost:3000"
JAR="/tmp/mq-qa-cookies.txt"
JAR2="/tmp/mq-qa-cookies2.txt"
rm -f "$JAR" "$JAR2"
PASS=0; FAIL=0

check() {
  local name="$1"; local expected="$2"; local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    PASS=$((PASS+1)); echo "PASS: $name"
  else
    FAIL=$((FAIL+1)); echo "FAIL: $name — expected [$expected], got: $(echo "$actual" | head -c 200)"
  fi
}

echo "════════ 1. EMAIL: REGISTER (dev code returned, no Brevo) ════════"
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d '{"username":"qa_email_user","email":"qa.email@example.com","password":"secret123"}')
check "register 201" "201" "$(echo "$RES" | tail -1)"
DEVCODE=$(echo "$RES" | head -1 | grep -o '"devCode":"[0-9]*"' | grep -o '[0-9]*')
echo "  devCode: $DEVCODE"

echo "════════ 2. EMAIL: LOGIN before confirm → 403 ════════"
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"qa.email@example.com","password":"secret123"}')
check "unconfirmed login 403" "403" "$(echo "$RES" | tail -1)"

echo "════════ 3. EMAIL: CONFIRM with dev code → auto-login + cookie ════════"
RES=$(curl -s -w "\n%{http_code}" -c "$JAR" -X POST "$BASE/api/auth/verify-code" -H "Content-Type: application/json" \
  -d "{\"email\":\"qa.email@example.com\",\"code\":\"$DEVCODE\"}")
check "verify-code 200" "200" "$(echo "$RES" | tail -1)"
check "verify-code sets session cookie" "session" "$(grep session "$JAR" | head -1)"

echo "════════ 4. /api/auth/me with session → authenticated ════════"
RES=$(curl -s -b "$JAR" "$BASE/api/auth/me")
check "me authenticated" '"authenticated":true' "$RES"
check "me username" 'qa_email_user' "$RES"

echo "════════ 5. LOGOUT → cookie cleared ════════"
RES=$(curl -s -w "\n%{http_code}" -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/logout")
check "logout 200" "200" "$(echo "$RES" | tail -1)"
RES=$(curl -s -b "$JAR" "$BASE/api/auth/me" -o /dev/null -w "%{http_code}")
check "me after logout 401" "401" "$RES"

echo "════════ 6. EMAIL: LOGIN with confirmed account ════════"
RES=$(curl -s -w "\n%{http_code}" -c "$JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"qa.email@example.com","password":"secret123"}')
check "confirmed login 200" "200" "$(echo "$RES" | tail -1)"

echo "════════ 7. Duplicate registration → 409 ════════"
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d '{"username":"other_user","email":"qa.email@example.com","password":"secret123"}')
check "duplicate email 409" "409" "$(echo "$RES" | tail -1)"
RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d '{"username":"qa_email_user","email":"other@example.com","password":"secret123"}')
check "duplicate username 409" "409" "$RES"

echo "════════ 8. PASSWORD RESET: send-code (generic anti-enumeration) ════════"
RES=$(curl -s -X POST "$BASE/api/auth/send-code" -H "Content-Type: application/json" -d '{"email":"qa.email@example.com"}')
check "send-code generic message" "Если аккаунт с такой почтой существует" "$RES"
RESETCODE=$(echo "$RES" | grep -o '"devCode":"[0-9]*"' | grep -o '[0-9]*')
echo "  reset devCode: $RESETCODE"
RES=$(curl -s -X POST "$BASE/api/auth/send-code" -H "Content-Type: application/json" -d '{"email":"nonexistent99@example.com"}')
check "send-code unknown email also 200" "Если аккаунт" "$RES"
if echo "$RES" | grep -q '"devCode"'; then FAIL=$((FAIL+1)); echo "FAIL: devCode leaked for unknown email"; else PASS=$((PASS+1)); echo "PASS: no devCode for unknown email"; fi

echo "════════ 9. PASSWORD RESET: wrong code → 400 ════════"
RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/reset-password" -H "Content-Type: application/json" \
  -d '{"email":"qa.email@example.com","code":"000000","newPassword":"newpass456"}')
check "wrong reset code 400" "400" "$RES"

echo "════════ 10. PASSWORD RESET: real code + new password → 200 ════════"
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/reset-password" -H "Content-Type: application/json" \
  -d "{\"email\":\"qa.email@example.com\",\"code\":\"$RESETCODE\",\"newPassword\":\"newpass456\"}")
check "reset-password 200" "200" "$(echo "$RES" | tail -1)"

echo "════════ 11. Old password rejected, new password works ════════"
RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"qa.email@example.com","password":"secret123"}')
check "old password 401" "401" "$RES"
RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"qa.email@example.com","password":"newpass456"}')
check "new password 200" "200" "$RES"

echo "════════ 12. Reset code is single-use ════════"
RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/reset-password" -H "Content-Type: application/json" \
  -d "{\"email\":\"qa.email@example.com\",\"code\":\"$RESETCODE\",\"newPassword\":\"another789\"}")
check "reused code 400" "400" "$RES"

echo "════════ 13. TELEGRAM WIDGET: invalid hash rejected ════════"
RES=$(curl -s -o /dev/null -w "%{redirect_url}" "$BASE/api/auth/telegram-widget/callback?id=555001&auth_date=$(date +%s)&hash=deadbeefdeadbeef")
check "invalid hash → authError" "authError=telegram_hash_invalid" "$RES"

echo "════════ 14. TELEGRAM WIDGET: valid hash, NEW user → register step ════════"
NOW=$(date +%s)
CHECK="auth_date=$NOW
id=555001"
SECRET=$(printf '123456:TEST-BOT-TOKEN-abcdef' | openssl dgst -sha256 -binary)
WIDGET_HASH=$(printf 'auth_date=%s\nid=%s' "$NOW" "555001" | openssl dgst -sha256 -hmac "$(printf 'x' >/dev/null; echo)" 2>/dev/null | true)
# Build hash properly with node (hmac with sha256(bot_token) as key)
WIDGET_HASH=$(node -e "
const {createHash,createHmac}=require('crypto');
const cs='auth_date=$NOW\nid=555001';
const sk=createHash('sha256').update('123456:TEST-BOT-TOKEN-abcdef').digest();
console.log(createHmac('sha256',sk).update(cs).digest('hex'));
")
RES=$(curl -s -o /dev/null -w "%{redirect_url}" "$BASE/api/auth/telegram-widget/callback?id=555001&auth_date=$NOW&hash=$WIDGET_HASH")
check "new TG user → widget-register step" "authStep=telegram-widget-register" "$RES"
TOKEN=$(echo "$RES" | grep -o 'token=[^&]*' | cut -d= -f2-)
echo "  pending token: ${TOKEN:0:40}..."

echo "════════ 15. TELEGRAM WIDGET: register with pending token → account created ════════"
RES=$(curl -s -w "\n%{http_code}" -c "$JAR2" -X POST "$BASE/api/auth/telegram-widget/register" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"username\":\"qa_tg_widget\"}")
check "widget register 200" "200" "$(echo "$RES" | tail -1)"
check "widget register isNewUser" '"isNewUser":true' "$(echo "$RES" | head -1)"
RES=$(curl -s -b "$JAR2" "$BASE/api/auth/me")
check "widget user authenticated" '"username":"qa_tg_widget"' "$RES"

echo "════════ 16. TELEGRAM WIDGET: SAME user logs in again (identity remembered) ════════"
rm -f "$JAR2"
NOW2=$(date +%s)
WIDGET_HASH2=$(node -e "
const {createHash,createHmac}=require('crypto');
const cs='auth_date=$NOW2\nfirst_name=QA\nid=555001';
const sk=createHash('sha256').update('123456:TEST-BOT-TOKEN-abcdef').digest();
console.log(createHmac('sha256',sk).update(cs).digest('hex'));
")
RES=$(curl -s -o /dev/null -w "%{redirect_url}" -c "$JAR2" "$BASE/api/auth/telegram-widget/callback?id=555001&auth_date=$NOW2&first_name=QA&hash=$WIDGET_HASH2")
check "returning TG user → auth=success" "auth=success&provider=telegram" "$RES"
RES=$(curl -s -b "$JAR2" "$BASE/api/auth/me")
check "returning TG user session" '"username":"qa_tg_widget"' "$RES"

echo "════════ 17. ACCOUNT LINKING: widget TG + existing email account ════════"
# Wait out the per-IP register rate limit (3/min, consumed by sections 1+7)
echo "  waiting 62s for register rate-limit window to clear..."
sleep 62
# Register an email account first
RES=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d '{"username":"qa_link_target","email":"qa.link@example.com","password":"linkpass123"}')
LINKCODE=$(echo "$RES" | grep -o '"devCode":"[0-9]*"' | grep -o '[0-9]*')
curl -s -o /dev/null -X POST "$BASE/api/auth/verify-code" -H "Content-Type: application/json" \
  -d "{\"email\":\"qa.link@example.com\",\"code\":\"$LINKCODE\"}"
# New Telegram identity
NOW3=$(date +%s)
WIDGET_HASH3=$(node -e "
const {createHash,createHmac}=require('crypto');
const cs='auth_date=$NOW3\nid=777002\nusername=qa_linker';
const sk=createHash('sha256').update('123456:TEST-BOT-TOKEN-abcdef').digest();
console.log(createHmac('sha256',sk).update(cs).digest('hex'));
")
RES=$(curl -s -o /dev/null -w "%{redirect_url}" "$BASE/api/auth/telegram-widget/callback?id=777002&auth_date=$NOW3&username=qa_linker&hash=$WIDGET_HASH3")
TOKEN3=$(echo "$RES" | grep -o 'token=[^&]*' | cut -d= -f2-)
# Try to register with the EXISTING username → needsPassword
RES=$(curl -s -X POST "$BASE/api/auth/telegram-widget/register" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN3\",\"username\":\"qa_link_target\"}")
check "linking asks for password" '"needsPassword":true' "$RES"
check "masked email shown" 'maskedEmail' "$RES"
# Wrong password → 401
RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/telegram-widget/register" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN3\",\"username\":\"qa_link_target\",\"password\":\"WRONG\"}")
check "wrong link password 401" "401" "$RES"
# Correct password → linked + logged in
RES=$(curl -s -w "\n%{http_code}" -c "$JAR2" -X POST "$BASE/api/auth/telegram-widget/register" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN3\",\"username\":\"qa_link_target\",\"password\":\"linkpass123\"}")
check "link success" '"linked":true' "$(echo "$RES" | head -1)"
RES=$(curl -s -b "$JAR2" "$BASE/api/auth/me")
check "linked user is the EMAIL account" '"email":"qa.link@example.com"' "$RES"
# The same Telegram id now logs into that account directly
NOW4=$(date +%s)
WIDGET_HASH4=$(node -e "
const {createHash,createHmac}=require('crypto');
const cs='auth_date=$NOW4\nid=777002';
const sk=createHash('sha256').update('123456:TEST-BOT-TOKEN-abcdef').digest();
console.log(createHmac('sha256',sk).update(cs).digest('hex'));
")
RES=$(curl -s -o /dev/null -w "%{redirect_url}" "$BASE/api/auth/telegram-widget/callback?id=777002&auth_date=$NOW4&hash=$WIDGET_HASH4")
check "linked TG id logs into email account" "auth=success" "$RES"

echo "════════ 18. GOOGLE: not configured → honest error (no mock) ════════"
RES=$(curl -s -o /dev/null -w "%{redirect_url}" "$BASE/api/auth/google")
check "google start without credentials → honest error" "authError=google_not_configured" "$RES"

echo "════════ 19. GOOGLE: callback with forged state → CSRF rejected ════════"
RES=$(curl -s -o /dev/null -w "%{redirect_url}" "$BASE/api/auth/google/callback?state=forged123&code=xyz")
check "forged state rejected" "authError=invalid_state" "$RES"

echo "════════ 20. LOGIN brute-force: per-email limit ════════"
for i in 1 2 3 4 5 6; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
    -d '{"email":"qa.email@example.com","password":"wrong$i"}')
  echo "  attempt $i → $CODE"
done
check "6th wrong attempt blocked" "429" "$CODE"

echo "════════ 21. Pending token can't be reused after registration ════════"
RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/telegram-widget/register" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN3\",\"username\":\"another_tg_user\"}")
check "stale token rejected (TG already linked)" "409" "$RES"

echo ""
echo "════════════════════ SUMMARY: $PASS passed, $FAIL failed ════════════════════"
[ $FAIL -eq 0 ] && echo "ALL API QA TESTS PASSED" || echo "SOME TESTS FAILED"
