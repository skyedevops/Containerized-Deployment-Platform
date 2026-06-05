#!/usr/bin/env bash
set -euo pipefail

# Convenience wrapper for helm install/upgrade.
#
# Usage: ./scripts/helm-deploy.sh <release> <environment>
#   environment: dev | staging | prod

RELEASE="${1:-dp}"
ENV="${2:-dev}"

case "$ENV" in
  dev)     VALUES="values-dev.yaml" ;;
  staging) VALUES="values-staging.yaml" ;;
  prod)    VALUES="values-prod.yaml" ;;
  *) echo "unknown environment: $ENV" >&2; exit 1 ;;
esac

NS="${RELEASE}-${ENV}"
[ "$ENV" = "prod" ] && NS="deployment-platform"

helm upgrade --install "$RELEASE" ./helm/app \
  --namespace "$NS" --create-namespace \
  -f "./helm/app/${VALUES}"

kubectl -n "$NS" rollout status deploy/app --timeout=300s || true
