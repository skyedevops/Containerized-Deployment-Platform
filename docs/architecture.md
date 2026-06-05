# Architecture

## Goals

1. Demonstrate a **complete, reproducible** container deployment pipeline.
2. Provide a **real** sample application (Express + PostgreSQL + Redis) instead of
   toy `nginx` examples.
3. Ship both **raw Kubernetes manifests** (for transparency) and a
   **parameterized Helm chart** (for production use).
4. Bake in **resilience, security and observability** by default so the platform
   is production-shaped from day one.

## Component model

```
                   ┌────────────────────────┐
                   │   ingress-nginx (TLS)  │
                   └──────────┬─────────────┘
                              │
                ┌─────────────▼──────────────┐
                │   Service: app (ClusterIP) │
                └─────────────┬──────────────┘
                              │
       ┌──────────────────────┼──────────────────────────┐
       │                      │                          │
┌──────▼───────┐      ┌───────▼────────┐         ┌───────▼────────┐
│  Pod: app    │      │  Pod: app      │  ...    │  Pod: app      │
│  Deployment  │      │                │         │                │
│  HPA 2-10    │      │                │         │                │
│  PDB min=1   │      │                │         │                │
└──────┬───────┘      └───────┬────────┘         └───────┬────────┘
       │                      │                          │
       │  NetworkPolicy       │                          │
       │  default-deny egress │                          │
       └──────────┬───────────┴────────────┬─────────────┘
                  │                        │
        ┌─────────▼──────────┐    ┌─────────▼──────────┐
        │  Service: postgres │    │  Service: redis    │
        └─────────┬──────────┘    └─────────┬──────────┘
                  │                        │
        ┌─────────▼──────────┐    ┌─────────▼──────────┐
        │  Pod: postgres     │    │  Pod: redis        │
        │  PVC 8Gi           │    │  PVC 2Gi           │
        └────────────────────┘    └────────────────────┘
```

## Layers

### 1. Container layer

The application container is built with a **multi-stage Dockerfile**:

- `deps` stage installs only production `node_modules` for the runtime image.
- `runtime` stage copies them into a slim `node:20-alpine` base, runs as a
  **non-root** user (`uid 1000`), drops all Linux capabilities, and uses
  `tini` as PID 1 for proper signal handling.
- A `HEALTHCHECK` polls `/healthz` so Docker Swarm / Compose can replace
  unhealthy instances.

### 2. Compose layer

`docker-compose.yml` runs the **full stack locally** with a single command:
app, PostgreSQL 16, Redis 7. Volumes are named, services have health checks,
and the app waits for its dependencies to be `healthy` before starting
(`depends_on: condition: service_healthy`).

### 3. Kubernetes base

`k8s/base/` contains the canonical resources:

- `Deployment` with a `RollingUpdate` strategy (`maxSurge=1`, `maxUnavailable=0`)
  so capacity is preserved during upgrades.
- **Probes**: a `startupProbe` (longer window) gates the `livenessProbe` so slow
  boots do not trigger pod restarts, and a `readinessProbe` removes unready
  pods from Service endpoints.
- **HPA** scales on CPU *and* memory, with a `scaleDown` stabilization window
  of 5 minutes to avoid flapping.
- **PDB** ensures at least one replica stays up during voluntary disruptions
  (node drains, cluster upgrades).
- **NetworkPolicy** denies all egress by default, then explicitly allows
  DNS, PostgreSQL, Redis, and the Kubernetes API.
- **ServiceAccount** is bound to a minimal `Role` that can only read
  ConfigMaps. `automountServiceAccountToken: false`.
- **ServiceMonitor** (Prometheus Operator CRD) scrapes `/metrics`.

### 4. Kustomize overlays

`k8s/overlays/{dev,staging,prod}` compose a Component that:

- dev: 1 replica, debug logs, no HPA, no Ingress, no ServiceMonitor.
- staging: 2 replicas, HPA 2-5, info logs, internal host.
- prod: 3 replicas, HPA 3-20, warn logs, real host, `minAvailable: 2`.

### 5. Helm chart

`helm/app/` is a single self-contained chart that:

- deploys the application Deployment/Service/Ingress/ConfigMap/Secret/HPA/PDB/NetworkPolicy/ServiceMonitor
- **conditionally bundles** Bitnami `postgresql` and `redis` subcharts so a
  brand-new cluster gets a working stack with one command
- exposes every knob via `values.yaml` and ships `values-dev.yaml` and
  `values-prod.yaml` for typical environments

### 6. CI/CD

GitHub Actions pipelines are intentionally small and reusable:

- `ci.yml` runs on every PR: lint + test + image build + helm lint/template +
  kustomize build for all three environments.
- `cd.yml` runs on `main` and on `v*` tags: builds the image, pushes to GHCR
  with provenance + SBOM, and applies the matching Kustomize overlay.
- `security.yml` scans the built image and the repository with Trivy (SARIF
  uploaded to the GitHub Security tab) and runs Conftest CIS checks.
- `release.yml` packages the Helm chart and creates a GitHub Release on tag.

## Why this shape?

| Decision                          | Why                                                       |
| --------------------------------- | --------------------------------------------------------- |
| Multi-stage Dockerfile            | Smaller images, no dev deps in production                |
| Non-root + read-only root FS      | Maps directly to `restricted` PodSecurityStandard        |
| `tini` as PID 1                   | Reaps zombies, forwards signals, clean shutdown          |
| `startupProbe` + `livenessProbe`  | Avoids killing pods that are still booting               |
| `maxUnavailable: 0`               | Zero-downtime rolling updates                            |
| HPA + PDB together                | Scale under load *and* survive node drains               |
| NetworkPolicy default-deny egress | Containment, lateral movement protection                 |
| ServiceMonitor                    | Native Prometheus Operator discovery                      |
| Kustomize + Helm                  | Different consumers: dev clarity vs prod templating      |
| Bitnami subcharts                 | No external DB needed for first install                   |
