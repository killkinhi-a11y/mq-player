#!/usr/bin/env bash
# Diagnostic probe: does Google accept OUR server credentials?
# NEVER sends or logs any secret — only a FAKE auth code.
#
# Logic:
#   1. GET /api/auth/google         -> 307 accounts.google.com + state cookie
#   2. GET /api/auth/google/callback?state=<valid>&code=<FAKE>
#      - authError=google_not_configured  -> Google answered invalid_client
#        => stored CLIENT SECRET is INVALID (this is the P0 root cause)
#      - authError=google_exchange_failed -> Google answered invalid_grant
#        => credentials VALID, code merely fake/used (secret is CORRECT)
#      - authError=invalid_state          -> probe bug, not a signal
set -euo pipefail

BASE="${1:-https://mq1.vercel.app}"
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

# Step 1: start flow, capture state cookie
START_URL=$(curl -sS -c "$JAR" -o /dev/null -w '%{redirect_url}' "$BASE/api/auth/google")
STATE=$(printf '%s' "$START_URL" | grep -oP 'state=\K[^&"]+')
if [[ -z "$STATE" ]]; then
  echo "PROBE_ERROR: no state in redirect: $START_URL"
  exit 2
fi
echo "step1: flow start OK (state len=${#STATE})"

# Step 2: callback with FAKE code (URL-safe, clearly synthetic)
FINAL=$(curl -sS -b "$JAR" -o /dev/null -w '%{redirect_url}' \
  "$BASE/api/auth/google/callback?state=${STATE}&code=FAKE_PROBE_4-0AxDiagnosticTokenX99")
echo "step2: callback redirect: $FINAL"

case "$FINAL" in
  *authError=google_not_configured*)
    echo "VERDICT: INVALID_CLIENT — stored GOOGLE_CLIENT_SECRET is WRONG/ROTATED";;
  *authError=google_exchange_failed*)
    echo "VERDICT: CREDENTIALS_VALID — exchange reached Google with good client auth (invalid_grant on fake code = expected)";;
  *authError=invalid_state*)
    echo "VERDICT: PROBE_BUG — state mismatch (retry)";;
  *authError=*google*)
    echo "VERDICT: OTHER_GOOGLE_ERROR — see redirect";;
  *)
    echo "VERDICT: UNEXPECTED — no authError in redirect";;
esac
