#!/bin/bash
# F7 Friends contract QA — REAL end-to-end on local dev server (same code as
# production deploy mq-build-7b213038). Local Turso SQLite, real HTTP, real
# auth cookies, no mocks. Requires dev server on :3000 with auth-qa-env.sh.
BASE="http://localhost:3210"
JAR="/tmp/f7-qa-a.txt"
JAR2="/tmp/f7-qa-b.txt"
rm -f "$JAR" "$JAR2"
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

echo "════ 0. Register two QA users (devCode flow) ════"
RES=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"username\":\"f7qa_a_$TS\",\"email\":\"f7qa.a.$TS@example.com\",\"password\":\"secret123\"}")
CODE_A=$(echo "$RES" | grep -o '"devCode":"[0-9]*"' | grep -o '[0-9]*')
check "register A 201 devCode present" "devCode" "$RES"
RES=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"username\":\"f7qa_b_$TS\",\"email\":\"f7qa.b.$TS@example.com\",\"password\":\"secret123\"}")
CODE_B=$(echo "$RES" | grep -o '"devCode":"[0-9]*"' | grep -o '[0-9]*')
check "register B 201 devCode present" "devCode" "$RES"

RES=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/verify-code" -H "Content-Type: application/json" \
  -d "{\"email\":\"f7qa.a.$TS@example.com\",\"code\":\"$CODE_A\"}")
check "confirm A → session cookie" "session" "$(grep session "$JAR" | head -1)"
curl -s -c "$JAR2" -X POST "$BASE/api/auth/verify-code" -H "Content-Type: application/json" \
  -d "{\"email\":\"f7qa.b.$TS@example.com\",\"code\":\"$CODE_B\"}" > /dev/null
check "confirm B → session cookie" "session" "$(grep session "$JAR2" | head -1)"

ME=$(curl -s -b "$JAR" "$BASE/api/auth/me")
ID_A=$(echo "$ME" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)
ME_B=$(curl -s -b "$JAR2" "$BASE/api/auth/me")
ID_B=$(echo "$ME_B" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)
echo "  ID_A=$ID_A ID_B=$ID_B"

echo "════ 1. GET /api/friends — empty state (additive shape) ════"
RES=$(curl -s -b "$JAR" "$BASE/api/friends")
check "empty friends []" '"friends":\[\]' "$RES"
check "empty pendingRequests []" '"pendingRequests":\[\]' "$RES"
check "NEW: outgoingRequests field present" '"outgoingRequests":\[\]' "$RES"

echo "════ 2. POST /api/friends A→B → 201 ════"
RES=$(curl -s -w "\n%{http_code}" -b "$JAR" -X POST "$BASE/api/friends" -H "Content-Type: application/json" \
  -d "{\"addresseeId\":\"$ID_B\"}")
check "send request 201" "201" "$(echo "$RES" | tail -1)"

echo "════ 3. GET /api/friends A → outgoingRequests=[B] ════"
RES=$(curl -s -b "$JAR" "$BASE/api/friends")
check "A sees outgoing to B" "f7qa_b_$TS" "$RES"
check "outgoing has requestId" '"requestId":"[a-z]' "$RES"
REQ_ID=$(echo "$RES" | grep -o '"requestId":"[^"]*"' | head -1 | cut -d'"' -f4)
check "outgoing has avatar field" '"avatar"' "$RES"
echo "  REQ_ID=$REQ_ID"

echo "════ 4. GET /api/friends B → pendingRequests=[A] (with avatar) ════"
RES=$(curl -s -b "$JAR2" "$BASE/api/friends")
check "B sees incoming from A" "f7qa_a_$TS" "$RES"
check "incoming id = A user id" "\"id\":\"$ID_A\"" "$RES"

echo "════ 5. GET /api/users/[id] — profile from A's view (outgoing) ════"
RES=$(curl -s -w "\n%{http_code}" -b "$JAR" "$BASE/api/users/$ID_B")
check "profile 200" "200" "$(echo "$RES" | tail -1)"
check "profile username" "f7qa_b_$TS" "$RES"
check "friendship outgoing" '"status":"outgoing"' "$RES"
check "friendship requestId matches" "\"requestId\":\"$REQ_ID\"" "$RES"
RES=$(curl -s -b "$JAR2" "$BASE/api/users/$ID_A")
check "B sees incoming status" '"status":"incoming"' "$RES"
RES=$(curl -s -b "$JAR" "$BASE/api/users/$ID_A")
check "self profile status" '"status":"self"' "$RES"

echo "════ 6. PUT /api/friends/{requestId} accept (by B) ════"
RES=$(curl -s -w "\n%{http_code}" -b "$JAR2" -X PUT "$BASE/api/friends/$REQ_ID" -H "Content-Type: application/json" \
  -d '{"action":"accept"}')
check "accept 200" "200" "$(echo "$RES" | tail -1)"
check "accept message" "Заявка принята" "$RES"

echo "════ 7. GET /api/friends both → friends with friendshipId ════"
RES=$(curl -s -b "$JAR" "$BASE/api/friends")
check "A friends list has B" "f7qa_b_$TS" "$RES"
FR_ID_A=$(echo "$RES" | grep -o '"friendshipId":"[a-zA-Z0-9]\{10,\}"' | head -1 | cut -d'"' -f4)
check "NEW: friendshipId on friend" '"friendshipId":"[a-z]' "$RES"
RES=$(curl -s -b "$JAR2" "$BASE/api/friends")
FR_ID_B=$(echo "$RES" | grep -o '"friendshipId":"[^"]*"' | head -1 | cut -d'"' -f4)
check "same friendshipId both sides" "$FR_ID_A" "$FR_ID_B"

echo "════ 8. GET /api/users/[id] after accept → friends status ════"
RES=$(curl -s -b "$JAR" "$BASE/api/users/$ID_B")
check "friendship friends" '"status":"friends"' "$RES"
check "friendshipId present" "\"friendshipId\":\"$FR_ID_A\"" "$RES"

echo "════ 9. users/search finds both by prefix ════"
RES=$(curl -s -b "$JAR" "$BASE/api/users/search?q=f7qa_b_$TS")
check "search finds B" "f7qa_b_$TS" "$RES"

echo "════ 10. messages + unread-count shapes ════"
RES=$(curl -s -w "\n%{http_code}" -b "$JAR" -X POST "$BASE/api/messages" -H "Content-Type: application/json" \
  -d "{\"receiverId\":\"$ID_B\",\"content\":\"f7-qa-hello\"}")
check "send message 201/200" "20" "$(echo "$RES" | tail -1 | grep -o '^2[0-9]*')"
RES=$(curl -s -b "$JAR2" "$BASE/api/messages/unread-count")
check "unread-count latestMessage from A" "f7-qa-hello" "$RES"
check "unread-count senderId" "\"senderId\":\"$ID_A\"" "$RES"
RES=$(curl -s -b "$JAR2" "$BASE/api/messages?receiverId=$ID_A")
check "B reads messages, contains text" "f7-qa-hello" "$RES"

echo "════ 11. users/status batch ════"
RES=$(curl -s -b "$JAR" "$BASE/api/users/status?ids=$ID_B")
check "status map has B" "\"$ID_B\"" "$RES"

echo "════ 12. DELETE /api/friends/{friendshipId} — remove friend ════"
RES=$(curl -s -w "\n%{http_code}" -b "$JAR" -X DELETE "$BASE/api/friends/$FR_ID_A")
check "remove friend 200" "200" "$(echo "$RES" | tail -1)"
RES=$(curl -s -b "$JAR" "$BASE/api/friends")
check "A friends empty again" '"friends":\[\]' "$RES"
RES=$(curl -s -b "$JAR" "$BASE/api/users/$ID_B")
check "friendship back to none" '"status":"none"' "$RES"

echo "════ 13. outgoing cancel flow (request again, then DELETE requestId) ════"
curl -s -b "$JAR" -X POST "$BASE/api/friends" -H "Content-Type: application/json" -d "{\"addresseeId\":\"$ID_B\"}" > /dev/null
RES=$(curl -s -b "$JAR" "$BASE/api/friends")
REQ2=$(echo "$RES" | grep -o '"requestId":"[^"]*"' | head -1 | cut -d'"' -f4)
RES=$(curl -s -w "\n%{http_code}" -b "$JAR" -X DELETE "$BASE/api/friends/$REQ2")
check "cancel outgoing 200" "200" "$(echo "$RES" | tail -1)"
RES=$(curl -s -b "$JAR" "$BASE/api/friends")
check "outgoing empty after cancel" '"outgoingRequests":\[\]' "$RES"
RES=$(curl -s -b "$JAR2" "$BASE/api/friends")
check "B incoming empty after cancel" '"pendingRequests":\[\]' "$RES"

echo "════ 14. error paths ════"
RES=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/friends/unknown-id" -b "$JAR" \
  -H "Content-Type: application/json" -d '{"action":"accept"}')
check "respond unknown request 404" "404" "$RES"
RES=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/friends" \
  -H "Content-Type: application/json" -d "{\"addresseeId\":\"$ID_A\"}")
check "self-friend 400" "400" "$RES"
RES=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/users/does-not-exist" -b "$JAR")
check "profile unknown user 404" "404" "$RES"
RES=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/friends")
check "friends unauthenticated 401" "401" "$RES"

echo "════ 15. Cleanup — delete QA accounts ════"
RES=$(curl -s -w "\n%{http_code}" -b "$JAR" -X POST "$BASE/api/user/delete-account" -H "Content-Type: application/json" -d '{"confirm":true}')
check "delete account A 200" "200" "$(echo "$RES" | tail -1)"
RES=$(curl -s -w "\n%{http_code}" -b "$JAR2" -X POST "$BASE/api/user/delete-account" -H "Content-Type: application/json" -d '{"confirm":true}')
check "delete account B 200" "200" "$(echo "$RES" | tail -1)"

echo ""
echo "════════ RESULT: PASS=$PASS FAIL=$FAIL ════════"
[ "$FAIL" -eq 0 ]
