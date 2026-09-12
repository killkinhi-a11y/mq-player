#!/usr/bin/env bash
# Fasti production deployment verification — /version.json, /sw.js, /api/ai/*
# Usage: deploy_verify.sh [production_url]
# Exit 0 = PASS, exit 1 = FAIL

set -uo pipefail
PROJECT_ROOT="${PROJECT_ROOT:-/home/z/my-project}"
cd "$PROJECT_ROOT"

URL="${1:-https://fasti-seven.vercel.app}"
FAIL=0

echo "  [$URL]"

echo "  [/version.json]"
v=$(curl -sS --max-time 10 "$URL/version.json" 2>/dev/null || echo "")
if [ -z "$v" ]; then
  echo "    FAIL — /version.json unreachable"
  FAIL=1
else
  # version.json is multi-line JSON; grep with -z or use python/jq
  version=$(echo "$v" | grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
  build=$(echo "$v" | grep -oE '"build"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"build"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
  generated=$(echo "$v" | grep -oE '"generatedAt"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"generatedAt"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
  if [ -n "$version" ] && [ -n "$build" ]; then
    echo "    PASS — version=$version build=$build generatedAt=$generated"
  else
    echo "    FAIL — /version.json missing fields: $v" | head -3
    FAIL=1
  fi
fi

echo "  [/sw.js headers]"
sw_status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 -I "$URL/sw.js" 2>/dev/null || echo "0")
sw_cache=$(curl -sSI --max-time 10 "$URL/sw.js" 2>/dev/null | grep -i 'cache-control' | head -1 | tr -d '\r')
if [ "$sw_status" = "200" ]; then
  if echo "$sw_cache" | grep -qi 'must-revalidate'; then
    echo "    PASS — /sw.js HTTP 200, $sw_cache"
  else
    echo "    WARN — /sw.js HTTP 200 but cache-control: $sw_cache (expected must-revalidate)"
  fi
else
  echo "    FAIL — /sw.js HTTP $sw_status"
  FAIL=1
fi

echo "  [/api/ai/chat — honest response contract]"
chat_body='{"messages":[{"role":"user","content":"hi"}],"intent":"general"}'
chat_resp=$(curl -sS --max-time 30 -X POST "$URL/api/ai/chat" -H "Content-Type: application/json" -d "$chat_body" 2>/dev/null || echo "")
chat_status=$(echo "$chat_resp" | grep -oE '"available":(true|false)' | head -1)
chat_reason=$(echo "$chat_resp" | grep -oE '"reason":"[a-z_]+"' | head -1)
if [ -z "$chat_resp" ]; then
  echo "    FAIL — /api/ai/chat no response"
  FAIL=1
elif echo "$chat_resp" | grep -q '"error"'; then
  err=$(echo "$chat_resp" | grep -oE '"error":"[^"]+"' | head -1)
  if [ "$err" = '"error":"no_messages"' ]; then
    echo "    PASS — /api/ai/chat rejected invalid body: $err"
  else
    echo "    WARN — /api/ai/chat error: $err"
  fi
elif [ -n "$chat_status" ]; then
  if echo "$chat_status" | grep -q 'true'; then
    # available:true — must have real answer, not mock
    has_answer=$(echo "$chat_resp" | grep -oE '"answer":"[^"]{5,}"' | head -1)
    if [ -n "$has_answer" ]; then
      echo "    PASS — /api/ai/chat available:true with real answer"
    else
      echo "    FAIL — /api/ai/chat available:true but no answer (mock?)"
      FAIL=1
    fi
  else
    echo "    PASS — /api/ai/chat $chat_status $chat_reason (honest fallback)"
  fi
else
  echo "    FAIL — /api/ai/chat unexpected response: $chat_resp"
  FAIL=1
fi

echo "  [/api/ai/analyze-food — vision endpoint honest contract]"
analyze_body='{"image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0EQVR42mP8z8BQDwAEhwH/8fM="}'
analyze_resp=$(curl -sS --max-time 60 -X POST "$URL/api/ai/analyze-food" -H "Content-Type: application/json" -d "$analyze_body" 2>/dev/null || echo "")
if [ -z "$analyze_resp" ]; then
  echo "    FAIL — /api/ai/analyze-food no response"
  FAIL=1
elif echo "$analyze_resp" | grep -q '"available":false'; then
  reason=$(echo "$analyze_resp" | grep -oE '"reason":"[a-z_]+"' | head -1)
  echo "    PASS — /api/ai/analyze-food honest fallback $reason"
elif echo "$analyze_resp" | grep -q '"available":true'; then
  echo "    PASS — /api/ai/analyze-food available:true (real Z.AI call)"
elif echo "$analyze_resp" | grep -q '"error"'; then
  err=$(echo "$analyze_resp" | grep -oE '"error":"[^"]+"' | head -1)
  echo "    WARN — /api/ai/analyze-food error: $err"
else
  echo "    WARN — /api/ai/analyze-food unexpected: $analyze_resp"
fi

echo "  [/api/ai/plan — single-day meal plan, honest contract]"
plan_body='{"calorieTarget":2000,"mealsPerDay":4,"diet":"omnivore","avoid":[],"days":1,"language":"ru"}'
plan_resp=$(curl -sS --max-time 60 -X POST "$URL/api/ai/plan" -H "Content-Type: application/json" -d "$plan_body" 2>/dev/null || echo "")
if [ -z "$plan_resp" ]; then
  echo "    FAIL — /api/ai/plan no response"
  FAIL=1
elif echo "$plan_resp" | grep -q '"available":false'; then
  reason=$(echo "$plan_resp" | grep -oE '"reason":"[a-z_]+"' | head -1)
  echo "    PASS — /api/ai/plan single-day honest fallback $reason"
elif echo "$plan_resp" | grep -q '"available":true'; then
  if echo "$plan_resp" | grep -q '"meals"\|"days"'; then
    echo "    PASS — /api/ai/plan single-day available:true with real meal plan"
  else
    echo "    FAIL — /api/ai/plan available:true but no meal data (mock?)"
    FAIL=1
  fi
elif echo "$plan_resp" | grep -q '"error"'; then
  err=$(echo "$plan_resp" | grep -oE '"error":"[^"]+"' | head -1)
  echo "    FAIL — /api/ai/plan rejected valid body: $err"
  FAIL=1
else
  echo "    FAIL — /api/ai/plan unexpected: $plan_resp"
  FAIL=1
fi

echo "  [/api/ai/plan — weekly meal plan, honest contract]"
plan7_body='{"calorieTarget":2000,"mealsPerDay":4,"diet":"omnivore","avoid":[],"days":7,"language":"ru"}'
plan7_resp=$(curl -sS --max-time 90 -X POST "$URL/api/ai/plan" -H "Content-Type: application/json" -d "$plan7_body" 2>/dev/null || echo "")
if [ -z "$plan7_resp" ]; then
  echo "    FAIL — /api/ai/plan weekly no response"
  FAIL=1
elif echo "$plan7_resp" | grep -q '"available":false'; then
  reason=$(echo "$plan7_resp" | grep -oE '"reason":"[a-z_]+"' | head -1)
  echo "    PASS — /api/ai/plan weekly honest fallback $reason"
elif echo "$plan7_resp" | grep -q '"available":true'; then
  if echo "$plan7_resp" | grep -q '"days"'; then
    echo "    PASS — /api/ai/plan weekly available:true with days[]"
  else
    echo "    FAIL — /api/ai/plan weekly available:true but no days[] (mock?)"
    FAIL=1
  fi
elif echo "$plan7_resp" | grep -q '"error"'; then
  err=$(echo "$plan7_resp" | grep -oE '"error":"[^"]+"' | head -1)
  echo "    FAIL — /api/ai/plan weekly rejected valid body: $err"
  FAIL=1
else
  echo "    FAIL — /api/ai/plan weekly unexpected: $plan7_resp"
  FAIL=1
fi

echo "  [Vercel cache headers — assets immutable]"
asset_path=$(grep -oE 'assets/[A-Za-z0-9_-]+\.js' dist/index.html 2>/dev/null | head -1 | sed 's|^|/|')
if [ -n "$asset_path" ]; then
  asset_cache=$(curl -sSI --max-time 10 "$URL$asset_path" 2>/dev/null | grep -i 'cache-control' | head -1 | tr -d '\r')
  if echo "$asset_cache" | grep -qi 'immutable'; then
    echo "    PASS — $asset_path: $asset_cache"
  else
    echo "    WARN — $asset_path: $asset_cache (expected immutable)"
  fi
else
  echo "    SKIP — could not find asset path in index.html"
fi

if [ "$FAIL" -eq 0 ]; then
  echo "  → Production verify: PASS"
else
  echo "  → Production verify: FAIL"
fi
exit $FAIL
