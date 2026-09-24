#!/bin/sh
# wholesale / backend entrypoint
#   start (default) -> migrations (server/shared only) then `medusa start`
#   medusa <args>   -> run a Medusa CLI command, e.g.
#                      docker-entrypoint.sh medusa user -e admin@example.com -p secret
set -e
MEDUSA="/app/node_modules/.bin/medusa"

if [ "${1:-start}" = "start" ]; then
  if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ "${MEDUSA_WORKER_MODE:-shared}" != "worker" ]; then
    echo "[entrypoint] Running database migrations..."
    "$MEDUSA" db:migrate
  fi
  echo "[entrypoint] Starting Medusa (worker mode: ${MEDUSA_WORKER_MODE:-shared})"
  exec "$MEDUSA" start
fi

if [ "$1" = "medusa" ]; then
  shift
  exec "$MEDUSA" "$@"
fi

exec "$@"
