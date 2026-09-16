#!/usr/bin/env bash
# Fasti performance audit — bundle size, lazy loading, dependency check
# Exit 0 = PASS, exit 1 = FAIL

set -uo pipefail
PROJECT_ROOT="${PROJECT_ROOT:-/home/z/my-project}"
cd "$PROJECT_ROOT"

FAIL=0

if [ ! -d dist ]; then
  echo "  SKIP — dist/ does not exist; run npm run build first"
  exit 1
fi

echo "  [Total dist size]"
total=$(du -sh dist/ | cut -f1)
total_kb=$(du -sk dist/ | cut -f1)
if [ "$total_kb" -lt 10240 ]; then
  echo "    PASS — dist/ is $total (<10MB)"
else
  echo "    WARN — dist/ is $total (>10MB, may impact first-load)"
fi

echo "  [Main bundle size]"
main_bundle=$(ls -S dist/assets/index-*.js 2>/dev/null | head -1)
if [ -z "$main_bundle" ]; then
  echo "    FAIL — no dist/assets/index-*.js bundle found"
  FAIL=1
else
  main_kb=$(du -k "$main_bundle" | cut -f1)
  if [ "$main_kb" -lt 500 ]; then
    echo "    PASS — main bundle $(basename "$main_bundle") is ${main_kb}KB (<500KB)"
  else
    echo "    WARN — main bundle $(basename "$main_bundle") is ${main_kb}KB (>500KB)"
  fi
fi

echo "  [Lazy loading intact]"
for chunk in FastingPage NutritionPage ProgressPage charts; do
  if ls dist/assets/${chunk}-*.js > /dev/null 2>&1; then
    size=$(du -k dist/assets/${chunk}-*.js 2>/dev/null | head -1 | cut -f1)
    echo "    PASS — lazy chunk ${chunk}: ${size}KB"
  else
    echo "    FAIL — lazy chunk ${chunk} NOT FOUND (route not code-split)"
    FAIL=1
  fi
done

echo "  [Supabase SDK NOT in main bundle (only in lazy chunk)]"
# Identify the TRUE main entry bundle from dist/index.html's <script type=module src>
# HTML uses: <script type="module" crossorigin src="/assets/index-XXXX.js"></script>
main_bundle=$(grep -oE 'src="/?assets/index-[^"]+\.js"' dist/index.html 2>/dev/null | head -1 | sed 's/^src="\/\/\?//;s/"$//')
if [ -z "$main_bundle" ]; then
  echo "    SKIP — could not find main bundle path in dist/index.html"
  main_bundle="assets/index-wrBMwPoO.js"  # fallback
fi
main_path="dist/$main_bundle"
echo "    INFO — main entry bundle: $main_bundle"
if [ ! -f "$main_path" ]; then
  echo "    FAIL — main bundle $main_path does not exist"
  FAIL=1
else
  sdk_in_main=$(grep -oE 'supabase-js|SupabaseClient|@supabase/supabase|RealtimeClient|PostgrestClient' "$main_path" 2>/dev/null | wc -l)
  if [ "$sdk_in_main" -eq 0 ]; then
    echo "    PASS — 0 SDK code symbols in main bundle; SDK is lazy-loaded"
    # report which chunk actually has the SDK
    sdk_chunk=""
    for f in dist/assets/*.js; do
      c=$(grep -oE 'supabase-js|SupabaseClient|@supabase/supabase|RealtimeClient' "$f" 2>/dev/null | wc -l)
      if [ "$c" -gt 0 ]; then
        sdk_chunk="$sdk_chunk $(basename "$f")($c refs)"
      fi
    done
    if [ -n "$sdk_chunk" ]; then
      echo "    INFO — Supabase SDK lives in lazy chunk(s):$sdk_chunk"
    fi
  else
    echo "    FAIL — $sdk_in_main SDK symbol(s) in main bundle; SDK should be lazy-loaded"
    FAIL=1
  fi
fi

echo "  [No z-ai-web-dev-sdk in any bundle]"
sdk_refs=0
for f in dist/assets/*.js; do
  c=$(grep -oE 'z-ai-web-dev-sdk' "$f" 2>/dev/null | wc -l)
  sdk_refs=$((sdk_refs + c))
done
if [ "$sdk_refs" -eq 0 ]; then
  echo "    PASS — 0 z-ai-web-dev-sdk references (SDK was removed in v5.2.1)"
else
  echo "    FAIL — $sdk_refs z-ai-web-dev-sdk reference(s) — should be 0"
  FAIL=1
fi

echo "  [recharts only in lazy chunks]"
recharts_in_main=$(grep -oE 'recharts' dist/assets/index-*.js 2>/dev/null | wc -l)
recharts_in_charts=$(grep -oE 'recharts' dist/assets/charts-*.js 2>/dev/null | wc -l)
if [ "$recharts_in_main" -eq 0 ]; then
  echo "    PASS — 0 recharts in main bundle (lazy-loaded)"
  echo "    INFO — recharts refs in charts-*.js: $recharts_in_charts"
else
  echo "    WARN — recharts found in main bundle ($recharts_in_main refs)"
fi

echo "  [AI endpoint URL exposure (api.z.ai is fine, key is NOT)]"
api_url_refs=$(grep -oE 'api\.z\.ai' dist/assets/*.js 2>/dev/null | wc -l)
echo "    INFO — api.z.ai URL refs in bundle: $api_url_refs (acceptable; the key must never appear)"
api_key_refs=$(grep -oE 'Bearer\s+[A-Za-z0-9._-]{20,}' dist/assets/*.js 2>/dev/null | wc -l)
if [ "$api_key_refs" -eq 0 ]; then
  echo "    PASS — no hardcoded Bearer tokens in bundle"
else
  echo "    FAIL — $api_key_refs hardcoded Bearer token(s) in bundle"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "  → Performance: PASS"
else
  echo "  → Performance: FAIL"
fi
exit $FAIL
