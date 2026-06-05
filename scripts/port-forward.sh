#!/usr/bin/env bash
set -euo pipefail

# Port-forward common services for local access.
# Usage: ./scripts/port-forward.sh [app|postgres|redis|all]

TARGET="${1:-all}"
NS="${NS:-deployment-platform}"

pf() {
  local svc=$1 port=$1_port target=$1_target
  echo "Forwarding $svc -> localhost:$port"
  kubectl -n "$NS" port-forward "svc/$svc" "$port:$target" &
}

case "$TARGET" in
  app)
    pf app; pf app 3000 3000 2>/dev/null || true
    ;;
  postgres) pf postgres 5432 5432 ;;
  redis)    pf redis 6379 6379 ;;
  all)
    pf app 3000 3000
    pf postgres 5432 5432
    pf redis 6379 6379
    ;;
  *) echo "usage: $0 [app|postgres|redis|all]"; exit 1 ;;
esac

trap "pkill -P $$" EXIT
wait
