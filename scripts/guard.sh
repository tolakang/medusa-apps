#!/usr/bin/env bash
# Guardrails: DEV_FLOW.md Gate 5. Plain bash (macOS bash 3.2 compatible).
#
#   scripts/guard.sh [all | <category> | <category>/<app>]      (default: all)
#
# Env:
#   GUARD_BASE_REF   git ref that "new lines" are compared to (default: origin/main)
#   PLAN_REVISION_APPROVED  "true" lets a branch change BUILD_PLAN.md and its
#                    lock (CI sets it from the owner's `plan-revision` PR label)
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

# 1b. The plan and its lock don't change on a branch without the owner's
#     approval (REVIEW_FIXES T1). A matching checksum alone isn't enough: a
#     branch could change both. CI sets PLAN_REVISION_APPROVED from the
#     `plan-revision` label, which only the owner adds (docs/PLAN_LOCK.md).
PLAN_FILES="BUILD_PLAN.md .build-plan.sha256 .claude/hooks/protect-build-plan.sh .claude/settings.json scripts/test-plan-lock.sh"
if git rev-parse --verify --quiet "$BASE_REF^{commit}" >/dev/null; then
  CHANGED=$(git diff --name-only "$BASE_REF...HEAD" -- $PLAN_FILES 2>/dev/null || true)
  if [ -z "$CHANGED" ]; then
    pass "plan and lock files unchanged vs $BASE_REF"
  elif [ "${PLAN_REVISION_APPROVED:-}" = true ]; then
    pass "plan or lock files changed with the owner's approval: $(echo $CHANGED)"
  else
    fail "plan or lock files changed without the owner's 'plan-revision' label: $(echo $CHANGED)"
  fi
elif [ -n "${CI:-}" ]; then
  fail "plan check needs $BASE_REF (fetch-depth: 0)"
fi

# 2. No env files committed (only .env.example).
# Any number of dots: .env.production.local too (REVIEW_FIXES T6).
ENVFILES=$(git ls-files | grep -E '(^|/)\.env(\.[A-Za-z0-9_-]+)*$' | grep -v '\.env\.example$' || true)
[ -z "$ENVFILES" ] && pass "no .env files tracked" || fail "tracked env files: $ENVFILES"

# 3. No leftover merge conflict markers in tracked files (owner, 2026-09-29,
#    after PR #41 briefly pushed TASKS.md with markers). Git writes
#    "<<<<<<< <ref>", "=======", ">>>>>>> <ref>" (and "||||||| <ref>" with
#    diff3); the "=======" line alone is not checked because Markdown can use it.
MARKERS=$(git grep -nE '^(<<<<<<<|>>>>>>>|\|\|\|\|\|\|\|)( |$)' -- . 2>/dev/null || true)
[ -z "$MARKERS" ] && pass "no merge conflict markers" || fail "merge conflict markers:
$MARKERS"

# 3a. The plan lock still works: locked by default, unlocked only by the
#     owner's .claude/plan-unlocked switch (owner, 2026-11-06).
if LOCK_OUT=$(bash scripts/test-plan-lock.sh 2>&1); then
  pass "plan lock ($(printf '%s\n' "$LOCK_OUT" | tail -n 1 | sed 's/^-* *//'))"
else
  fail "plan lock test failed:
$(printf '%s\n' "$LOCK_OUT" | grep -E '^FAIL')"
fi

DEPLOYABLES=$(list_deployables)
[ -n "$DEPLOYABLES" ] || { echo "no deployables with package.json for '$TARGET'"; exit $FAILED; }

for D in $DEPLOYABLES; do
  echo "== $D"
  SRC="$D/src"

  # 4. Exact @medusajs pins, all on one version except @medusajs/ui
  #    (CLAUDE.md; REVIEW_FIXES T4: ">=2.22.6" or "2.x" used to pass).
  BAD=$(grep -nE '"@medusajs/[^"]+": *"' "$D/package.json" \
        | grep -vE '"@medusajs/[^"]+": *"[0-9]+\.[0-9]+\.[0-9]+"' || true)
  [ -z "$BAD" ] && pass "exact @medusajs pins" || fail "non-exact @medusajs versions: $BAD"
  VERSIONS=$(grep -oE '"@medusajs/[^"]+": *"[0-9]+\.[0-9]+\.[0-9]+"' "$D/package.json" \
             | grep -v '"@medusajs/ui"' | sed -E 's/.*"([0-9.]+)"$/\1/' | sort -u)
  [ "$(printf '%s\n' "$VERSIONS" | grep -c .)" -le 1 ] && pass "one @medusajs version${VERSIONS:+ ($VERSIONS)}" \
    || fail "@medusajs packages on different versions: $(echo $VERSIONS)"

  # 5. packageManager pinned.
  grep -qE '"packageManager": *"pnpm@[0-9]+\.[0-9]+\.[0-9]+"' "$D/package.json" \
    && pass "packageManager pinned" || fail "packageManager must be pnpm@<exact>"

  # 6. No pnpm patches.
  BAD=$(grep -n "patchedDependencies" "$D/package.json" "$D/pnpm-workspace.yaml" 2>/dev/null || true)
  [ -z "$BAD" ] && pass "no pnpm patches" || fail "pnpm patches: $BAD"

  # 7. No dist/ imports from @medusajs.
  BAD=$(grep -rnE "from ['\"]@medusajs/[^'\"]+/dist" "$SRC" 2>/dev/null || true)
  [ -z "$BAD" ] && pass "no @medusajs dist imports" || fail "dist imports: $BAD"

  case "$D" in
    */backend)
      # 8. zod only via @medusajs/framework/zod (MEDUSA_SKILL §7).
      #    Also `zod/v4` and require("zod") (REVIEW_FIXES T7).
      BAD=$(grep -rnE "from ['\"]zod(/[^'\"]*)?['\"]|require\(['\"]zod(/[^'\"]*)?['\"]\)" "$SRC" 2>/dev/null || true)
      [ -z "$BAD" ] && pass "zod via @medusajs/framework/zod" || fail "bare zod imports: $BAD"

      # 9. Workflow constructor functions are not async (MEDUSA_SKILL §6).
      BAD=$(grep -rn -A2 "createWorkflow(" "$SRC" 2>/dev/null | grep -E "async +(function|\()" || true)
      [ -z "$BAD" ] && pass "no async workflow constructors" || fail "async createWorkflow: $BAD"

      # 10. Entrypoint migrates in safe, non-interactive mode (MEDUSA_SKILL §11).
      #     The db:migrate command itself, not a comment (REVIEW_FIXES T7).
      grep -vE '^[[:space:]]*#' "$D/docker-entrypoint.sh" \
        | grep -E 'db:migrate' | grep -q -- "--execute-safe-links --execute-safe-search" \
        && pass "entrypoint uses safe migrate flags" || fail "entrypoint missing safe migrate flags"

      # 11. Nothing in migration-scripts is a demo seed (auto-runs in production).
      if [ -d "$SRC/migration-scripts" ]; then
        BAD=$(grep -rlniE "seed|demo" "$SRC/migration-scripts" 2>/dev/null || true)
        [ -z "$BAD" ] && pass "no seeds in migration-scripts" || fail "review migration-scripts (auto-run in prod): $BAD"
      else
        pass "no migration-scripts folder"
      fi
      ;;
  esac

  # 12. No NEW type suppressions (DEV_FLOW §6). Starter code keeps its own:
  #     <deployable>/.guard-baseline holds the repo commit that imported the
  #     starter; lines are "new" relative to it (else relative to BASE_REF).
  #     A copied app (e.g. pos/storefront, TASKS P2-09) names its source too:
  #     "<commit> <source app>"; then a suppression is new unless the source
  #     app had the same line at that commit.
  REF="$BASE_REF"; FROM=""
  [ -f "$D/.guard-baseline" ] && read -r REF FROM < "$D/.guard-baseline"
  # No "\b": macOS git's ERE has no word boundary (TASKS F-057), so the
  # boundary is spelled out and grep and git grep match the same lines.
  SUPPRESS="@ts-ignore|@ts-nocheck|@ts-expect-error|as any([^A-Za-z0-9_]|\$)"
  if ! git rev-parse --verify --quiet "$REF^{commit}" >/dev/null; then
    # In CI a missing ref is a setup error, not a reason to pass (T5).
    if [ -n "${CI:-}" ]; then
      fail "new-suppression check: ref '$REF' not found (fetch-depth: 0?)"
    else
      echo "  skip: new-suppression check (ref '$REF' not found; set GUARD_BASE_REF)"
    fi
  elif [ -n "$FROM" ]; then
    trim() { sed -E 's/^[^:]*:[0-9]+://; s/^[[:space:]]+//; s/[[:space:]]+$//' | sort; }
    BAD=$(comm -23 <(grep -rnE "$SUPPRESS" "$SRC" 2>/dev/null | trim) \
                   <(git grep -nE "$SUPPRESS" "$REF" -- "$FROM/src" 2>/dev/null | sed -E 's/^[^:]*://' | trim) || true)
    [ -z "$BAD" ] && pass "no new type suppressions vs $FROM at $REF" || fail "new type suppressions: $BAD"
  else
    BAD=$(git diff -U0 "$REF" -- "$SRC" 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+' \
          | grep -E "$SUPPRESS" || true)
    [ -z "$BAD" ] && pass "no new type suppressions vs $REF" || fail "new type suppressions: $BAD"
  fi
done

# 13. Every deployable with app code is built and tested in CI: the matrix
#     in ci.yml is written by hand (REVIEW_FIXES T8).
if [ "$TARGET" = all ]; then
  echo "== ci"
  MISSING=""
  for D in $DEPLOYABLES; do
    grep -qE "^[[:space:]]*- $D[[:space:]]*$" .github/workflows/ci.yml || MISSING="$MISSING $D"
  done
  [ -z "$MISSING" ] && pass "every deployable is in the CI matrix" || fail "not in the CI matrix (.github/workflows/ci.yml):$MISSING"
fi

echo
[ "$FAILED" = 0 ] && echo "guard: PASS" || echo "guard: FAIL"
exit $FAILED
