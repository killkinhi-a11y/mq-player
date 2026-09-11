#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Sets GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET on the Vercel project (mq1)
# and redeploys production so the auth code picks them up.
#
# Usage (from repo root):
#   ./scripts/vercel-env-google.sh <VERCEL_TOKEN>     # token from dashboard
#   ./scripts/vercel-env-google.sh                    # if `vercel login` done
#
# Credentials are read from .env.local (gitignored). The secret is never
# echoed. After the script, /api/auth/providers → {"google":true} on
# https://mq1.vercel.app.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found — put GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET there first."
  exit 1
fi

CLIENT_ID=$(grep -E '^GOOGLE_CLIENT_ID=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d ' ')
CLIENT_SECRET=$(grep -E '^GOOGLE_CLIENT_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d ' ')

if [[ -z "$CLIENT_ID" || -z "$CLIENT_SECRET" ]]; then
  echo "ERROR: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing or empty in $ENV_FILE"
  exit 1
fi

TOKEN_ARGS=()
if [[ -n "${1:-}" ]]; then
  TOKEN_ARGS=(--token "$1")
fi

echo "→ Removing old GOOGLE_* env vars (ignore 'not found' errors)…"
for envname in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  for target in production preview development; do
    vercel env rm "$envname" "$target" --yes "${TOKEN_ARGS[@]}" 2>/dev/null || true
  done
done

echo "→ Adding GOOGLE_CLIENT_ID (production + preview)…"
printf '%s' "$CLIENT_ID" | vercel env add GOOGLE_CLIENT_ID production "${TOKEN_ARGS[@]}"
printf '%s' "$CLIENT_ID" | vercel env add GOOGLE_CLIENT_ID preview "${TOKEN_ARGS[@]}"

echo "→ Adding GOOGLE_CLIENT_SECRET (production + preview)…"
printf '%s' "$CLIENT_SECRET" | vercel env add GOOGLE_CLIENT_SECRET production "${TOKEN_ARGS[@]}"
printf '%s' "$CLIENT_SECRET" | vercel env add GOOGLE_CLIENT_SECRET preview "${TOKEN_ARGS[@]}"

echo "→ Redeploying production (env changes only apply to new deployments)…"
vercel deploy --prod --name mq1 "${TOKEN_ARGS[@]}"

echo ""
echo "✓ Done. Verify: curl -s https://mq1.vercel.app/api/auth/providers"
echo "  Expect: {\"google\":true,…}"
