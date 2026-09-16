#!/usr/bin/env bash
# Fasti security scan — bundle + git + env + live HTML
# Exit 0 = PASS, exit 1 = FAIL (leak found)

set -uo pipefail
# Note: we do NOT use set -e — grep returns 1 on no-match, which would kill the script.
PROJECT_ROOT="${PROJECT_ROOT:-/home/z/my-project}"
cd "$PROJECT_ROOT"

FAIL=0

echo "  [Bundle secret scan]"
if [ ! -d dist ]; then
  echo "    SKIP — dist/ does not exist; run npm run build first"
else
  leaks=0
  for f in dist/assets/*.js; do
    [ -f "$f" ] || continue
    matches=$(grep -oE 'z-ai-web-dev-sdk|internal-api\.z\.ai|/etc/\.z-ai-config|ZAI_API_KEY|X-Z-AI-From|vcp_[A-Za-z0-9]{10,}|eyJhbGc' "$f" 2>/dev/null | wc -l)
    if [ "$matches" -gt 0 ]; then
      echo "    LEAK in $f: $matches match(es)"
      grep -oE 'z-ai-web-dev-sdk|internal-api\.z\.ai|/etc/\.z-ai-config|ZAI_API_KEY|X-Z-AI-From|vcp_[A-Za-z0-9]{10,}|eyJhbGc' "$f" | head -3
      leaks=$((leaks + matches))
    fi
  done
  if [ "$leaks" -eq 0 ]; then
    echo "    PASS — 0 leaks across $(ls dist/assets/*.js 2>/dev/null | wc -l) bundle files"
  else
    echo "    FAIL — $leaks leak(s) total"
    FAIL=1
  fi
fi

echo "  [Git tracking scan]"
tracked_secrets=$(git ls-files 2>/dev/null | grep -E '\.(env|vercel_token|pem|key|p12)$' || true)
expected=".env.example"
unsafe=$(echo "$tracked_secrets" | grep -v "^$expected$" || true)
if [ -z "$unsafe" ]; then
  echo "    PASS — git tracks only .env.example"
else
  echo "    FAIL — git tracks secret files:"
  echo "$unsafe" | sed 's/^/      /'
  FAIL=1
fi

echo "  [.env.example placeholder check]"
if grep -E '^(ZAI_API_KEY|VERCEL_TOKEN|SUPABASE_*)=' .env.example 2>/dev/null | grep -v '=' | head; then
  echo "    PASS"
else
  if grep -E '^(ZAI_API_KEY|VERCEL_TOKEN)=.+' .env.example 2>/dev/null | grep -vE '^(ZAI_API_KEY|VERCEL_TOKEN)=(your_|YOUR_|sk-|<)' >/dev/null; then
    echo "    WARN — .env.example may contain a real key value"
    FAIL=1
  else
    echo "    PASS — .env.example uses placeholders"
  fi
fi

echo "  [AI client never imported from browser code]"
browser_imports_ai=$(grep -rE "from ['\"].*api/ai/_zai['\"]|from ['\"].*api/ai/(chat|plan|analyze-food)['\"]" src/ 2>/dev/null | wc -l)
if [ "$browser_imports_ai" -eq 0 ]; then
  echo "    PASS — 0 browser imports of api/ai/* (server-only)"
else
  echo "    FAIL — $browser_imports_ai browser file(s) import api/ai/*:"
  grep -rE "from ['\"].*api/ai/_zai['\"]|from ['\"].*api/ai/(chat|plan|analyze-food)['\"]" src/ 2>/dev/null
  FAIL=1
fi

echo "  [localStorage.clear() check]"
clears=$(grep -rn 'localStorage\.clear()' src/ 2>/dev/null | wc -l)
if [ "$clears" -eq 0 ]; then
  echo "    PASS — 0 localStorage.clear() calls in src/"
else
  echo "    WARN — $clears localStorage.clear() call(s) in src/ (would wipe user data):"
  grep -rn 'localStorage\.clear()' src/ 2>/dev/null
  FAIL=1
fi

echo "  [Live production HTML scan]"
prod_url="https://fasti-seven.vercel.app"
html=$(curl -sS --max-time 10 "$prod_url" 2>/dev/null || echo "")
if [ -z "$html" ]; then
  echo "    WARN — could not fetch $prod_url"
else
  live_leaks=$(echo "$html" | grep -oE 'vcp_[A-Za-z0-9]{10,}|eyJhbGc|ZAI_API_KEY|internal-api\.z\.ai' | wc -l)
  if [ "$live_leaks" -eq 0 ]; then
    echo "    PASS — live HTML at $prod_url has 0 leaks"
  else
    echo "    FAIL — live HTML has $live_leaks leak(s)"
    FAIL=1
  fi
fi

if [ "$FAIL" -eq 0 ]; then
  echo "  → Security: PASS"
else
  echo "  → Security: FAIL"
fi
exit $FAIL
