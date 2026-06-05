# Deployment

This guide covers deploying the platform to a real Kubernetes cluster.

## Prerequisites

| Tool       | Version   |
| ---------- | --------- |
| kubectl    | 1.28+     |
| kustomize  | 5.x       |
| helm       | 3.15+     |
| A cluster  | EKS / GKE / AKS / kind / k3s |

For the ServiceMonitor / Prometheus Operator CRDs, install
[`kube-prometheus-stack`](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack).

For Ingress, install [`ingress-nginx`](https://kubernetes.github.io/ingress-nginx/).

## Option A - Helm

### Install (bundled Postgres + Redis)

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm dependency update helm/app
helm install dp ./helm/app \
  --create-namespace --namespace deployment-platform \
  -f helm/app/values-prod.yaml
```

### Install (with external databases)

```bash
helm install dp ./helm/app \
  --create-namespace --namespace deployment-platform \
  --set postgresql.enabled=false \
  --set redis.enabled=false \
  --set config.postgres.host=my-rds.example.com \
  --set config.redis.host=my-elasticache.example.com
```

### Upgrade

```bash
helm upgrade dp ./helm/app -n deployment-platform -f helm/app/values-prod.yaml
```

### Uninstall

```bash
helm uninstall dp -n deployment-platform
```

## Option B - Kustomize

```bash
# Edit the image reference in k8s/overlays/prod/kustomization.yaml first.
kustomize build k8s/overlays/prod | kubectl apply -f -
```

CI does the same in `.github/workflows/cd.yml`:

```bash
kustomize build k8s/overlays/staging \
  | sed "s|ghcr.io/CHANGE-ME/deployment-platform-app|${{ env.IMAGE_NAME }}|g" \
  | kubectl apply -f -
```

## Pre-flight checks

```bash
# All resources in the namespace
kubectl -n deployment-platform get all,cm,secret,sa,role,rolebinding,hpa,pdb,netpol,svcmonitor,ingress

# Wait for rollout
kubectl -n deployment-platform rollout status deploy/app

# Check probes
kubectl -n deployment-platform get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}'

# HPA
kubectl -n deployment-platform get hpa

# Tail logs
kubectl -n deployment-platform logs -l app.kubernetes.io/name=deployment-platform-app -f
```

## Rollback

With Helm:

```bash
helm history dp -n deployment-platform
helm rollback dp 1 -n deployment-platform
```

With Kustomize:

```bash
kubectl -n deployment-platform rollout undo deploy/app
```

## CI/CD configuration

| Secret                       | Purpose                                  |
| ---------------------------- | ---------------------------------------- |
| `KUBECONFIG_STAGING`         | base64-encoded kubeconfig for staging    |
| `KUBECONFIG_PRODUCTION`      | base64-encoded kubeconfig for production |

Generate a base64 kubeconfig:

```bash
base64 -w0 ~/.kube/config | xclip -selection clipboard
```

The workflow only runs the production deploy on `v*` tags so production
changes are explicit and reviewable.
