#!/usr/bin/env bash
# Medusa update: BUILD_PLAN.md §8. Plain bash (macOS bash 3.2 compatible).
#
#   scripts/update-medusa.sh <category | category/app | all> [version] [--pnpm-latest]
#
# Per deployable (that has a package.json):
#   1. target version = [version] or `npm view @medusajs/medusa version`
#   2. every @medusajs/* dependency on the release line -> exact target version;
#      @medusajs/ui (own version line, MEDUSA_SKILL §1) -> the version
#      @medusajs/dashboard@<target> depends on (decision on F-006), falling
#      back to the medusajs/dtc-starter backend pin (plan §3.2)
#   3. pnpm install -> new pnpm-lock.yaml
# Then runs scripts/verify.sh for the target and prints the files to commit.
# It never commits and never touches BUILD_PLAN.md.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"
[ -n "$TARGET" ] || { echo "usage: scripts/update-medusa.sh <category|category/app|all> [version] [--pnpm-latest]"; exit 2; }
VERSION=""; PNPM_LATEST=0
for arg in "${@:2}"; do
  case "$arg" in
    --pnpm-latest) PNPM_LATEST=1 ;;
    *) VERSION="$arg" ;;
  esac
done
[ -n "$VERSION" ] || VERSION=$(npm view @medusajs/medusa version)
echo "Target Medusa version: $VERSION"
npm view "@medusajs/medusa@$VERSION" version >/dev/null || { echo "version $VERSION not on npm"; exit 1; }

# @medusajs/ui for this release: the version @medusajs/dashboard@$VERSION
# depends on, so the lockfile holds one copy (F-006, decided 2026-09-25).
# Fallback: the dtc-starter backend pin (plan §3.2).
DASH_UI=$(npm view "@medusajs/dashboard@$VERSION" dependencies --json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)["@medusajs/ui"]||"")}catch{console.log("")}})')
STARTER_PKG=$(curl -fsSL https://raw.githubusercontent.com/medusajs/dtc-starter/HEAD/apps/backend/package.json || true)
STARTER_MEDUSA=$(printf '%s' "$STARTER_PKG" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).dependencies["@medusajs/medusa"]||"")}catch{console.log("")}})')
STARTER_UI=""
if [ "$STARTER_MEDUSA" = "$VERSION" ]; then
  STARTER_UI=$(printf '%s' "$STARTER_PKG" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).dependencies["@medusajs/ui"]||"")}catch{console.log("")}})')
fi
UI_VERSION="$DASH_UI"
if [ -n "$UI_VERSION" ]; then
  echo "@medusajs/ui (@medusajs/dashboard@$VERSION dependency): $UI_VERSION"
  [ -n "$STARTER_UI" ] && [ "$STARTER_UI" != "$UI_VERSION" ] \
    && echo "NOTE: dtc-starter pins @medusajs/ui $STARTER_UI; we follow the dashboard (F-006)."
else
  UI_VERSION="$STARTER_UI"
  if [ -n "$UI_VERSION" ]; then
    echo "WARN: no @medusajs/ui dependency read from @medusajs/dashboard@$VERSION."
    echo "      Falling back to the dtc-starter pin: $UI_VERSION"
  else
    echo "WARN: could not read @medusajs/ui from @medusajs/dashboard@$VERSION,"
    echo "      and dtc-starter HEAD is on @medusajs/medusa '$STARTER_MEDUSA', not $VERSION."
    echo "      @medusajs/ui is left unchanged. Pick it by hand for $VERSION."
  fi
fi

PNPM_VERSION=""
[ "$PNPM_LATEST" = 1 ] && PNPM_VERSION=$(npm view pnpm version) && echo "pnpm -> $PNPM_VERSION"

CHANGED=""
for dir in */backend */storefront */*-portal */pos-app; do
  [ -f "$dir/package.json" ] || continue
  case "$TARGET" in
    all) ;;
    */*) [ "$dir" = "$TARGET" ] || continue ;;
    *) case "$dir" in "$TARGET"/*) ;; *) continue ;; esac ;;
  esac
  echo; echo "---- $dir"
  VERSION="$VERSION" UI_VERSION="$UI_VERSION" PNPM_VERSION="$PNPM_VERSION" node -e '
    const fs = require("fs"); const p = process.argv[1];
    const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
    const { VERSION, UI_VERSION, PNPM_VERSION } = process.env;
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      const deps = pkg[field] || {};
      for (const name of Object.keys(deps)) {
        if (!name.startsWith("@medusajs/")) continue;
        const next = name === "@medusajs/ui" ? (UI_VERSION || deps[name]) : VERSION;
        if (deps[name] !== next) { console.log(`  ${name}: ${deps[name]} -> ${next}`); deps[name] = next; }
      }
    }
    if (PNPM_VERSION) pkg.packageManager = `pnpm@${PNPM_VERSION}`;
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
  ' "$dir/package.json"
  (cd "$dir" && pnpm install --no-frozen-lockfile)
  CHANGED="$CHANGED $dir/package.json $dir/pnpm-lock.yaml"
done

[ -n "$CHANGED" ] || { echo "no deployables matched '$TARGET'"; exit 1; }

echo; echo "==== verify"
scripts/verify.sh "$TARGET"

echo
echo "update: PASS. Review the diff, read the release notes for every skipped version"
echo "(run any codemod they list), then commit on a branch:"
echo "  git add$CHANGED"
echo "  git commit -m \"chore(deps): update Medusa to $VERSION ($TARGET)\""
