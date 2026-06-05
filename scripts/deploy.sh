#!/usr/bin/env bash
set -euo pipefail

# Deploy the platform with kustomize.
#
# Usage: ./scripts/deploy.sh <environment>
#   environment: dev | staging | prod

ENV="${1:-dev}"
KUBECONFIG_FILE="${KUBECONFIG:-$HOME/.kube/config}"

if ! command -v kubectl &> /dev/null; then
  echo "kubectl is required" >&2; exit 1
fi
if ! command -v kustomize &> /dev/null; then
  echo "kustomize is required" >&2; exit 1
fi

case "$ENV" in
  dev)     NS="deployment-platform-dev";     OVERLAY="k8s/overlays/dev"     ;;
  staging) NS="deployment-platform-staging"; OVERLAY="k8s/overlays/staging" ;;
  prod)    NS="deployment-platform";         OVERLAY="k8s/overlays/prod"    ;;
  *) echo "unknown environment: $ENV" >&2; exit 1 ;;
esac

echo "Deploying $ENV -> $NS (overlay: $OVERLAY)"
kustomize build "$OVERLAY" | kubectl apply -f -

echo "Waiting for rollout..."
kubectl -n "$NS" rollout status deploy/app --timeout=300s
