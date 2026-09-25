#!/usr/bin/env bash
# Guardrails: DEV_FLOW.md Gate 5. Plain bash (macOS bash 3.2 compatible).
#
#   scripts/guard.sh [all | <category> | <category>/<app>]      (default: all)
#
# Env:
#   GUARD_BASE_REF   git ref that "new lines" are compared to (default: origin/main)
#
# Exit 0 = all checks pass, 1 = at least one violation.
set -u
cd "$(dirname "$0")/.." || exit 2

TARGET="${1:-all}"
BASE_REF="${GUARD_BASE_REF:-origin/main}"
FAILED=0

fail() { echo "  FAIL: $*"; FAILED=1; }
pass() { echo "  ok:   $*"; }

# Deployables that already contain app code (a package.json).
list_deployables() {
  for dir in */backend */storefront */*-portal */pos-app; do
    [ -f "$dir/package.json" ] || continue
    case "$TARGET" in
      all) echo "$dir" ;;
      */*) [ "$dir" = "$TARGET" ] && echo "$dir" ;;
      *) case "$dir" in "$TARGET"/*) echo "$dir" ;; esac ;;
    esac
  done
}

echo "== repo"
# 1. BUILD_PLAN.md is frozen (CLAUDE.md). Checksum works on every branch.
if shasum -a 256 -c .build-plan.sha256 >/dev/null 2>&1; then
  pass "BUILD_PLAN.md matches .build-plan.sha256"
else
  fail "BUILD_PLAN.md changed (frozen; log deviations in TASKS.md instead)"
fi

# 2. No env files committed (only .env.example).
ENVFILES=$(git ls-files | grep -E '(^|/)\.env(\.[A-Za-z0-9_-]+)?$' | grep -v '\.env\.example$' || true)
[ -z "$ENVFILES" ] && pass "no .env files tracked" || fail "tracked env files: $ENVFILES"

DEPLOYABLES=$(list_deployables)
[ -n "$DEPLOYABLES" ] || { echo "no deployables with package.json for '$TARGET'"; exit $FAILED; }

for D in $DEPLOYABLES; do
  echo "== $D"
  SRC="$D/src"

  # 3. Exact @medusajs pins (no ^ ~ latest *).
  BAD=$(grep -nE '"@medusajs/[^"]+": *"([\^~]|latest|\*)' "$D/package.json" || true)
  [ -z "$BAD" ] && pass "exact @medusajs pins" || fail "non-exact @medusajs versions: $BAD"

  # 4. packageManager pinned.
  grep -qE '"packageManager": *"pnpm@[0-9]+\.[0-9]+\.[0-9]+"' "$D/package.json" \
    && pass "packageManager pinned" || fail "packageManager must be pnpm@<exact>"

  # 5. No pnpm patches.
  BAD=$(grep -n "patchedDependencies" "$D/package.json" "$D/pnpm-workspace.yaml" 2>/dev/null || true)
  [ -z "$BAD" ] && pass "no pnpm patches" || fail "pnpm patches: $BAD"

  # 6. No dist/ imports from @medusajs.
  BAD=$(grep -rnE "from ['\"]@medusajs/[^'\"]+/dist" "$SRC" 2>/dev/null || true)
  [ -z "$BAD" ] && pass "no @medusajs dist imports" || fail "dist imports: $BAD"

  case "$D" in
    */backend)
      # 7. zod only via @medusajs/framework/zod (MEDUSA_SKILL §7).
      BAD=$(grep -rnE "from ['\"]zod['\"]" "$SRC" 2>/dev/null || true)
      [ -z "$BAD" ] && pass "zod via @medusajs/framework/zod" || fail "bare zod imports: $BAD"

      # 8. Workflow constructor functions are not async (MEDUSA_SKILL §6).
      BAD=$(grep -rn -A2 "createWorkflow(" "$SRC" 2>/dev/null | grep -E "async +(function|\()" || true)
      [ -z "$BAD" ] && pass "no async workflow constructors" || fail "async createWorkflow: $BAD"

      # 9. Entrypoint migrates in safe, non-interactive mode (MEDUSA_SKILL §11).
      grep -q -- "--execute-safe-links --execute-safe-search" "$D/docker-entrypoint.sh" \
        && pass "entrypoint uses safe migrate flags" || fail "entrypoint missing safe migrate flags"

      # 10. Nothing in migration-scripts is a demo seed (auto-runs in production).
      if [ -d "$SRC/migration-scripts" ]; then
        BAD=$(grep -rlniE "seed|demo" "$SRC/migration-scripts" 2>/dev/null || true)
        [ -z "$BAD" ] && pass "no seeds in migration-scripts" || fail "review migration-scripts (auto-run in prod): $BAD"
      else
        pass "no migration-scripts folder"
      fi
      ;;
  esac

  # 11. No NEW type suppressions (DEV_FLOW §6). Starter code keeps its own:
  #     <deployable>/.guard-baseline holds the repo commit that imported the
  #     starter; lines are "new" relative to it (else relative to BASE_REF).
  REF="$BASE_REF"
  [ -f "$D/.guard-baseline" ] && REF=$(tr -d '[:space:]' < "$D/.guard-baseline")
  if git rev-parse --verify --quiet "$REF^{commit}" >/dev/null; then
    BAD=$(git diff -U0 "$REF" -- "$SRC" 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+' \
          | grep -E "@ts-ignore|@ts-nocheck|as any\b" || true)
    [ -z "$BAD" ] && pass "no new type suppressions vs $REF" || fail "new type suppressions: $BAD"
  else
    echo "  skip: new-suppression check (ref '$REF' not found; set GUARD_BASE_REF)"
  fi
done

echo
[ "$FAILED" = 0 ] && echo "guard: PASS" || echo "guard: FAIL"
exit $FAILED
