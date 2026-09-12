#!/usr/bin/env bash
# Fasti Production Guardian — orchestrator
# Usage:
#   guardian.sh pre-deploy    # code gate + tests + build
#   guardian.sh security      # security audit only
#   guardian.sh performance   # performance audit only
#   guardian.sh deploy <url>  # production endpoint verification
#   guardian.sh ab <old_id> <new_id>  # A/B test
#   guardian.sh report        # full report (runs all gates)
#   guardian.sh all           # full run (alias for report)

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-/home/z/my-project}"
cd "$PROJECT_ROOT"

PASS=0
FAIL=0
REPORT_FILE=$(mktemp)
trap 'rm -f "$REPORT_FILE"' EXIT

add() {
  local status="$1"
  local label="$2"
  local detail="${3:-}"
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS + 1))
    printf "  [%s] %s%s\n" "PASS" "$label" "${detail:+ — $detail}"
    echo "PASS — $label${detail:+ — $detail}" >> "$REPORT_FILE"
  else
    FAIL=$((FAIL + 1))
    printf "  [%s] %s%s\n" "FAIL" "$label" "${detail:+ — $detail}"
    echo "FAIL — $label${detail:+ — $detail}" >> "$REPORT_FILE"
  fi
}

check_pre_deploy() {
  echo "=== Pre-deploy code gate ==="

  if npx tsc --noEmit > /tmp/tsc.log 2>&1; then
    add PASS "TypeScript clean"
  else
    add FAIL "TypeScript clean" "see /tmp/tsc.log"
    tail -5 /tmp/tsc.log
  fi

  if npm test > /tmp/vitest.log 2>&1; then
    local count
    count=$(grep -oE 'Tests +[0-9]+ passed \([0-9]+\)' /tmp/vitest.log | grep -oE '[0-9]+ passed' | head -1)
    add PASS "Unit tests" "$count"
  else
    add FAIL "Unit tests" "see /tmp/vitest.log"
    tail -20 /tmp/vitest.log
  fi

  # Migration safety check
  local schema_version
  schema_version=$(grep -oE 'SCHEMA_VERSION *= *[0-9]+' src/lib/storage.ts | grep -oE '[0-9]+' || echo "unknown")
  if grep -q "schema.*$schema_version" tests/migration.test.ts 2>/dev/null; then
    add PASS "Migration safety" "schema v$schema_version has tests"
  else
    add FAIL "Migration safety" "schema v$schema_version has no test in tests/migration.test.ts"
  fi

  # Build
  if npm run build > /tmp/build.log 2>&1; then
    if [ -f dist/version.json ] && [ -f dist/sw.js ] && [ -f dist/index.html ]; then
      local ver
      ver=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' dist/version.json | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
      add PASS "Build success" "version $ver, dist has version.json + sw.js + index.html"
    else
      add FAIL "Build success" "build ran but dist missing files"
    fi
  else
    add FAIL "Build success" "see /tmp/build.log"
    tail -20 /tmp/build.log
  fi
}

check_security() {
  echo "=== Security audit ==="
  bash "$SCRIPT_DIR/security_scan.sh"
  # inherit results via re-reading exit code
  if [ $? -eq 0 ]; then
    add PASS "Security scan" "0 leaks"
  else
    add FAIL "Security scan" "see output above"
  fi
}

check_performance() {
  echo "=== Performance audit ==="
  bash "$SCRIPT_DIR/performance_audit.sh"
  if [ $? -eq 0 ]; then
    add PASS "Performance audit"
  else
    add FAIL "Performance audit" "see output above"
  fi
}

check_deploy() {
  local url="${1:-https://fasti-seven.vercel.app}"
  echo "=== Production deployment verification ($url) ==="
  bash "$SCRIPT_DIR/deploy_verify.sh" "$url"
  if [ $? -eq 0 ]; then
    add PASS "Production verify" "$url"
  else
    add FAIL "Production verify" "$url"
  fi
}

check_ab() {
  local old="${1:-}"
  local new="${2:-}"
  if [ -z "$old" ] || [ -z "$new" ]; then
    echo "Usage: guardian.sh ab <old_build_id> <new_build_id>"
    return 1
  fi
  echo "=== A/B deployment test ==="
  bash "$SCRIPT_DIR/ab_test.sh" "$old" "$new"
  if [ $? -eq 0 ]; then
    add PASS "A/B test" "old=$old new=$new"
  else
    add FAIL "A/B test" "old=$old new=$new"
  fi
}

print_report() {
  echo ""
  echo "=== Fasti Production Guardian Report ==="
  cat "$REPORT_FILE"
  echo "======================================="
  if [ "$FAIL" -eq 0 ]; then
    echo "ALL GATES PASSED — production ready"
    return 0
  else
    echo "FAILED: $FAIL gate(s) failed — fix before deploying"
    return 1
  fi
}

case "${1:-report}" in
  pre-deploy)
    check_pre_deploy
    print_report
    ;;
  security)
    check_security
    print_report
    ;;
  performance)
    check_performance
    print_report
    ;;
  deploy)
    check_deploy "${2:-}"
    print_report
    ;;
  ab)
    check_ab "${2:-}" "${3:-}"
    print_report
    ;;
  report|all)
    check_pre_deploy
    check_security
    check_performance
    check_deploy "https://fasti-seven.vercel.app"
    print_report
    ;;
  *)
    echo "Usage: $0 {pre-deploy|security|performance|deploy|ab|report|all}"
    exit 1
    ;;
esac
