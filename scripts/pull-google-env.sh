#!/bin/bash
# Rebuild minimal .env.local (Google OAuth only) from Vercel project env.
# Values are fetched via API and written directly to the file — never echoed.
# Usage: bash scripts/pull-google-env.sh <VERCEL_TOKEN>
set -euo pipefail
TOKEN="${1:?Usage: pull-google-env.sh <VERCEL_TOKEN>}"
ENV_FILE="$(dirname "$0")/../.env.local"
PROJECT="prj_5BaGhJQWIgpOI6rot5nyOHsrl8uH"

fetch() { # $1 = env var id
  curl -s --max-time 30 -H "Authorization: Bearer $TOKEN" \
    "https://api.vercel.com/v9/projects/$PROJECT/env/$1?decrypt=true" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('value',''))"
}

CID_ID=$(curl -s --max-time 30 -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v9/projects/$PROJECT/env" \
  | python3 -c "
import json,sys
for e in json.load(sys.stdin).get('envs',[]):
    if e['key']=='GOOGLE_CLIENT_ID': print(e['id']); break")
CS_ID=$(curl -s --max-time 30 -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v9/projects/$PROJECT/env" \
  | python3 -c "
import json,sys
for e in json.load(sys.stdin).get('envs',[]):
    if e['key']=='GOOGLE_CLIENT_SECRET': print(e['id']); break")

[ -n "$CID_ID" ] || { echo "ERROR: GOOGLE_CLIENT_ID not found in Vercel"; exit 1; }
[ -n "$CS_ID" ] || { echo "ERROR: GOOGLE_CLIENT_SECRET not found in Vercel"; exit 1; }

{
  echo "# Local dev Google OAuth — pulled from Vercel project env (never commit)"
  echo "GOOGLE_CLIENT_ID=\"$(fetch "$CID_ID")\""
  echo "GOOGLE_CLIENT_SECRET=\"$(fetch "$CS_ID")\""
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "OK: $ENV_FILE rebuilt (values hidden). Verify:"
echo "  grep -c GOOGLE_ $ENV_FILE   # expect 2"
