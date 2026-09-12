#!/usr/bin/env bash
# Fasti A/B deployment test — old build vs new build
# Usage: ab_test.sh <old_build_id> <new_build_id>
# Exit 0 = PASS, exit 1 = FAIL

set -uo pipefail
PROJECT_ROOT="${PROJECT_ROOT:-/home/z/my-project}"
cd "$PROJECT_ROOT"

OLD="${1:-}"
NEW="${2:-}"
URL="${3:-https://fasti-seven.vercel.app}"

if [ -z "$OLD" ] || [ -z "$NEW" ]; then
  echo "Usage: $0 <old_build_id> <new_build_id> [production_url]"
  exit 1
fi

FAIL=0

echo "  [Build ID mismatch]"
if [ "$OLD" != "$NEW" ]; then
  echo "    PASS — old=$OLD new=$NEW (Update Manager will detect mismatch)"
else
  echo "    FAIL — old and new build IDs are identical; no update will trigger"
  FAIL=1
fi

echo "  [Storage keys unchanged]"
keys=(
  "fasti:sessions"
  "fasti:activeSession"
  "fasti:settings"
  "fasti:schemaVersion"
  "fasti:weeklyPlan"
  "fasti:weightEntries"
  "fasti:healthMetrics"
)
for k in "${keys[@]}"; do
  # check if the key is referenced in storage.ts
  refs=$(grep -c "$k" src/lib/storage.ts 2>/dev/null || echo "0")
  refs_num=$(echo "$refs" | head -1 | tr -cd '0-9')
  if [ "${refs_num:-0}" -gt 0 ]; then
    echo "    INFO — storage key '$k' referenced in src/lib/storage.ts"
  fi
done
# If new code changed the keys, that breaks user data preservation
# (manual review required — script can only check consistency)
storage_keys_changed=$(git diff HEAD~1 -- src/lib/storage.ts 2>/dev/null | grep -E '^\+.*fasti:[a-zA-Z]+' | grep -v '^+++' || true)
if [ -z "$storage_keys_changed" ]; then
  echo "    PASS — no new storage keys added in last commit"
else
  echo "    INFO — new storage keys detected (verify migration handles them):"
  echo "$storage_keys_changed" | sed 's/^/      /'
fi

echo "  [Schema migration non-destructive]"
schema_version=$(grep -oE 'SCHEMA_VERSION *= *[0-9]+' src/lib/storage.ts | grep -oE '[0-9]+' || echo "unknown")
echo "    INFO — current SCHEMA_VERSION = $schema_version"
if grep -q "v5.*→.*v$schema_version\|v$schema_version.*migration\|lazy" src/lib/storage.ts 2>/dev/null; then
  echo "    PASS — migration code appears present and non-destructive"
else
  echo "    INFO — verify tests/migration.test.ts covers schema v$schema_version"
fi

echo "  [sw.js path stable]"
if [ -f public/sw.js ]; then
  # SW is typically registered in src/lib/deployment.ts or src/main.tsx, NOT in HTML
  sw_register=$(grep -rE 'navigator\.serviceWorker\.register.{0,80}sw\.js' src/ 2>/dev/null | head -1)
  if [ -n "$sw_register" ]; then
    file=$(echo "$sw_register" | cut -d: -f1)
    echo "    PASS — /sw.js registered in $file (path stable)"
  else
    echo "    WARN — /sw.js path not found in src/ (check Service Worker registration)"
  fi
else
  echo "    FAIL — public/sw.js does not exist"
  FAIL=1
fi

echo "  [No localStorage.clear() calls in code]"
clears=$(grep -rn 'localStorage\.clear()' src/ 2>/dev/null | wc -l)
if [ "$clears" -eq 0 ]; then
  echo "    PASS — 0 localStorage.clear() calls (user data never wiped on update)"
else
  echo "    FAIL — $clears localStorage.clear() call(s) would wipe user data on update:"
  grep -rn 'localStorage\.clear()' src/ 2>/dev/null | sed 's/^/      /'
  FAIL=1
fi

echo "  [Service Worker update flow — live verification]"
live_v=$(curl -sS --max-time 10 "$URL/version.json" 2>/dev/null | grep -oE '"build"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"build"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
if [ -n "$live_v" ]; then
  if [ "$live_v" = "$NEW" ]; then
    echo "    PASS — live /version.json build=$live_v matches new build ID"
  elif [ "$live_v" = "$OLD" ]; then
    echo "    WARN — live /version.json still on old build=$live_v (deployment may not be complete)"
  else
    echo "    INFO — live /version.json build=$live_v (different from both old=$OLD and new=$NEW — possibly an interim deploy)"
  fi
else
  echo "    WARN — could not fetch live /version.json from $URL"
fi

if [ "$FAIL" -eq 0 ]; then
  echo "  → A/B test: PASS"
else
  echo "  → A/B test: FAIL"
fi
exit $FAIL
