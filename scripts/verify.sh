#!/usr/bin/env bash
# Verify gate: DEV_FLOW.md Gates 1, 3, 4 (+ Gate 2 via the test runner / image
# smoke). Plain bash (macOS bash 3.2 compatible). Runs per deployable.
#
#   scripts/verify.sh <category | category/app | all> [--image]
#
# Backend integration tests need Postgres (the test runner creates and drops
# its own database, runs migrations and boots the app, MEDUSA_SKILL §10):
#   DB_HOST DB_PORT DB_USERNAME DB_PASSWORD   (defaults: localhost 5432 postgres "")
#
# --image   also build each deployable's image with $CONTAINER_CLI (default:
#           docker, else podman). If VERIFY_DATABASE_URL is set (reachable from
#           the container), the backend image is started in server mode and
#           GET /health must return 200 (fresh-or-upgrade DB, safe migrate).
#           Optional: VERIFY_DOCKER_NETWORK (e.g. "host" on Linux CI).
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"
[ -n "$TARGET" ] || { echo "usage: scripts/verify.sh <category|category/app|all> [--image]"; exit 2; }
IMAGE=0; [ "${2:-}" = "--image" ] && IMAGE=1

if [ -z "${CONTAINER_CLI:-}" ]; then
  if command -v docker >/dev/null 2>&1; then CONTAINER_CLI=docker; else CONTAINER_CLI=podman; fi
fi

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

step() { echo; echo "---- [$1] $2"; }

DEPLOYABLES=$(list_deployables)
[ -n "$DEPLOYABLES" ] || { echo "no deployables with package.json for '$TARGET'"; exit 1; }

# Clients must build without a backend; the starter aborts without a key.
: "${NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:=pk_verify_placeholder}"
export NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

for D in $DEPLOYABLES; do
  NAME=$(echo "$D" | tr '/' '-')
  step "$D" "install (frozen lockfile)"
  (cd "$D" && pnpm install --frozen-lockfile)

  step "$D" "build"
  (cd "$D" && pnpm build)

  step "$D" "typecheck"
  (cd "$D" && pnpm typecheck)

  case "$D" in
    */backend)
      step "$D" "tests: unit, modules, http (real Postgres)"
      (cd "$D" && pnpm test:unit && pnpm test:integration:modules && pnpm test:integration:http)
      ;;
  esac

  if [ "$IMAGE" = 1 ]; then
    step "$D" "image build ($CONTAINER_CLI)"
    case "$D" in
      */backend) $CONTAINER_CLI build -t "$NAME:verify" "$D" ;;
      # Clients: the key is a build-time ARG (BUILD_PLAN §4.2); the starter's
      # check-env-variables.js aborts the build without it.
      *) $CONTAINER_CLI build -t "$NAME:verify" \
           --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY="$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" "$D" ;;
    esac

    case "$D" in
      */backend)
        if [ -n "${VERIFY_DATABASE_URL:-}" ]; then
          step "$D" "image smoke: server mode, migrate (safe flags), /health"
          NET_ARGS=""; PORT_ARGS="-p 19000:9000"; URL="http://localhost:19000/health"
          if [ -n "${VERIFY_DOCKER_NETWORK:-}" ]; then
            NET_ARGS="--network $VERIFY_DOCKER_NETWORK"
            [ "$VERIFY_DOCKER_NETWORK" = host ] && PORT_ARGS="" && URL="http://localhost:9000/health"
          fi
          CID=$($CONTAINER_CLI run -d $NET_ARGS $PORT_ARGS \
            -e DATABASE_URL="$VERIFY_DATABASE_URL" -e DATABASE_SSL="${VERIFY_DATABASE_SSL:-false}" \
            -e JWT_SECRET=verify -e COOKIE_SECRET=verify \
            -e STORE_CORS=http://localhost -e ADMIN_CORS=http://localhost -e AUTH_CORS=http://localhost \
            -e MEDUSA_WORKER_MODE=server "$NAME:verify")
          CODE=000
          for _ in $(seq 1 60); do
            sleep 3
            CODE=$(curl -s -o /dev/null -w '%{http_code}' "$URL" || true)
            [ "$CODE" = 200 ] && break
            [ "$($CONTAINER_CLI inspect -f '{{.State.Running}}' "$CID")" = true ] || break
          done
          $CONTAINER_CLI logs "$CID" 2>&1 | grep -E "entrypoint|timed out|error" | tail -5 || true
          $CONTAINER_CLI rm -f "$CID" >/dev/null
          [ "$CODE" = 200 ] || { echo "image smoke FAILED: /health=$CODE"; exit 1; }
          echo "image smoke ok: /health=200"
        else
          echo "(skip image smoke: set VERIFY_DATABASE_URL)"
        fi
        ;;
    esac
  fi
done

echo; echo "verify: PASS ($TARGET)"
