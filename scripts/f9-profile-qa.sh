#!/bin/bash
# F9 Profile contract QA — REAL end-to-end on local dev server (same code as
# production deploy). Local Turso SQLite, real HTTP, real session cookies,
# no mocks. Verifies the exact backend surface the Android profile screen
# uses (all endpoints already serve the web ProfileView):
#   GET  /api/user/profile
#   POST /api/user/avatar
#   GET  /api/auth/username-check
#   POST /api/auth/update-username
#   GET  /api/auth/me (account state)
#   GET  /api/playlists?myOnly=true
BASE="http://localhost:3210"
JAR="/tmp/f9-qa.txt"
rm -f "$JAR"
PASS=0; FAIL=0
TS=$(date +%s)

check() {
  local name="$1"; local expected="$2"; local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    PASS=$((PASS+1)); echo "PASS: $name"
  else
    FAIL=$((FAIL+1)); echo "FAIL: $name — expected [$expected], got: $(echo "$actual" | head -c 300)"
  fi
}

j() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null; }

echo "════ 1. Register QA user (devCode flow) ════"
RES=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"username\":\"f9qa_a_$TS\",\"email\":\"f9qa.a.$TS@example.com\",\"password\":\"secret123\"}")
CODE=$(echo "$RES" | grep -o '"devCode":"[0-9]*"' | grep -o '[0-9]*')
check "register devCode present" "devCode" "$RES"

RES=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/confirm" -H "Content-Type: application/json" \
  -d "{\"email\":\"f9qa.a.$TS@example.com\",\"code\":\"$CODE\"}")
check "confirm ok" "Почта успешно подтверждена" "$RES"

echo "════ 2. GET /api/user/profile (authed) ════"
RES=$(curl -s -b "$JAR" "$BASE/api/user/profile")
check "profile username" "f9qa_a_$TS" "$RES"
check "profile has createdAt" "createdAt" "$RES"
check "profile has email" "f9qa.a.$TS@example.com" "$RES"
check "profile has role" "role" "$RES"
USER_ID=$(echo "$RES" | j id)
echo "user id: $USER_ID"

echo "════ 3. Unauthenticated profile is rejected ════"
RES=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/user/profile")
check "profile 401 when logged out" "401" "$RES"

echo "════ 4. GET /api/auth/me (account state) ════"
RES=$(curl -s -b "$JAR" "$BASE/api/auth/me")
check "me authenticated" "true" "$RES"
check "me confirmed" "confirmed" "$RES"

echo "════ 5. Username check: available / taken / invalid ════"
RES=$(curl -s -b "$JAR" "$BASE/api/auth/username-check?username=f9qa_new_$TS&excludeId=$USER_ID")
check "new name available" '"available":true' "$RES"
RES=$(curl -s -b "$JAR" "$BASE/api/auth/username-check?username=f9qa_a_$TS&excludeId=$USER_ID")
check "own name available (excludeId)" '"available":true' "$RES"
RES=$(curl -s -b "$JAR" "$BASE/api/auth/username-check?username=admin")
check "reserved name rejected" '"available":false' "$RES"
RES=$(curl -s -b "$JAR" "$BASE/api/auth/username-check?username=x")
check "too short rejected" '"available":false' "$RES"
RES=$(curl -s -G -b "$JAR" --data-urlencode "username=имя" "$BASE/api/auth/username-check")
check "non-latin rejected" '"available":false' "$RES"

echo "════ 6. POST /api/auth/update-username ════"
RES=$(curl -s -b "$JAR" -X POST "$BASE/api/auth/update-username" -H "Content-Type: application/json" \
  -d "{\"username\":\"f9qa_ren_$TS\"}")
check "rename ok" "Имя обновлено" "$RES"
RES=$(curl -s -b "$JAR" "$BASE/api/user/profile")
check "profile shows new username" "f9qa_ren_$TS" "$RES"
JAR2="/tmp/f9-qa-b.txt"; rm -f "$JAR2"
RES2=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"username\":\"f9qa_b_$TS\",\"email\":\"f9qa.b.$TS@example.com\",\"password\":\"secret123\"}")
CODE_B=$(echo "$RES2" | grep -o '"devCode":"[0-9]*"' | grep -o '[0-9]*')
check "register B devCode present" "devCode" "$RES2"
RES=$(curl -s -c "$JAR2" -X POST "$BASE/api/auth/confirm" -H "Content-Type: application/json" \
  -d "{\"email\":\"f9qa.b.$TS@example.com\",\"code\":\"$CODE_B\"}")
check "user B confirmed" "Почта" "$RES"
check "rename to taken name → 409" "409" "$(curl -s -b "$JAR2" -o /tmp/ren.json -w '%{http_code}' -X POST "$BASE/api/auth/update-username" -H 'Content-Type: application/json' -d "{\"username\":\"f9qa_ren_$TS\"}") $(cat /tmp/ren.json)"

echo "════ 7. POST /api/user/avatar ════"
# 1×1 red pixel JPEG data URL (tiny, valid)
AVATAR="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDA1NDQ0Hyc5PTgyPDUzNDP/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmgA//9k="
RES=$(curl -s -b "$JAR" -X POST "$BASE/api/user/avatar" -H "Content-Type: application/json" \
  -d "{\"avatar\":\"$AVATAR\"}")
check "avatar updated" "Аватарка обновлена" "$RES"
RES=$(curl -s -b "$JAR" "$BASE/api/user/profile")
check "profile has avatar data url" "data:image/jpeg" "$RES"
RES=$(curl -s -b "$JAR" -X POST "$BASE/api/user/avatar" -H "Content-Type: application/json" \
  -d '{"avatar":"https://example.com/not-a-data-url.png"}')
check "non-data-url avatar rejected" "Некорректный формат" "$RES"

echo "════ 8. Playlists (myOnly) ════"
RES=$(curl -s -b "$JAR" "$BASE/api/playlists?myOnly=true&limit=100")
check "playlists response ok" "playlists" "$RES"

echo "════ 9. Shared track (F11 resolver, public) ════"
RES=$(curl -s "$BASE/api/tracks/share?scTrackId=417474360")
check "shared track has title" '"title"' "$RES"
check "shared track has artist" '"artist"' "$RES"
check "shared track has scTrackId" '"scTrackId":417474360' "$RES"
check "shared track has streamUrl" '"streamUrl"' "$RES"
RES=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/tracks/share")
check "share without id → 400" "400" "$RES"

echo ""
echo "════ RESULT: $PASS passed, $FAIL failed ════"
[ "$FAIL" -eq 0 ] && echo "F9 LIVE CONTRACT: ALL GREEN" || exit 1
