# Containerized Deployment Platform

A production-grade reference platform that demonstrates how to **build**, **ship**,
and **run** containerized applications with **Docker** and **Kubernetes**.

It contains a real, working Node.js/Express sample service, multi-stage
container images, a docker-compose stack, raw Kubernetes manifests with full
resilience and security primitives, a parameterized Helm chart, Kustomize
overlays for dev/staging/prod, CI/CD pipelines, and an observability stack.

```
+----------------------+        +-----------------------+
|  Developer / CI CD   | -----> |  Container image      |
+----------------------+        |  (GHCR / Docker Hub)  |
                                +-----------+-----------+
                                            |
                                            v
                              +-------------+--------------+
                              |  Kubernetes Cluster        |
                              |  - Deployment + HPA + PDB  |
                              |  - Service + Ingress       |
                              |  - NetworkPolicy + RBAC    |
                              |  - ServiceMonitor          |
                              |  - PostgreSQL + Redis      |
                              +-------------+--------------+
                                            |
                                            v
                              +-------------+--------------+
                              |  Prometheus / Grafana     |
                              |  (Metrics + Alerts)       |
                              +----------------------------+
```

## Repository layout

```
.
├── app/                     # Sample Node.js/Express service
│   ├── src/                 # Application code
│   ├── tests/               # Node test runner specs
│   ├── Dockerfile           # Multi-stage production build
│   └── package.json
├── docker-compose.yml       # Local app + Postgres + Redis stack
├── docker-compose.observability.yml  # Optional Prometheus/Grafana
├── k8s/                     # Raw Kubernetes manifests + Kustomize overlays
│   ├── base/                # Reusable base resources
│   └── overlays/            # dev / staging / prod variants
├── helm/app/                # Production-grade Helm chart
├── observability/           # Prometheus + Grafana configs
├── scripts/                 # Helper shell scripts
├── docs/                    # Architecture, deployment, ops guides
└── .github/workflows/       # CI, CD, security, release pipelines
```

## Quick start

### Run the application locally with Docker

```bash
make up          # docker compose up -d --build
make logs        # tail logs
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
curl http://localhost:3000/metrics
```

Stop the stack:

```bash
make down
```

Add the observability stack on top:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3001 (admin / admin)
```

### Run the application in Kubernetes with Helm

```bash
helm dependency update helm/app
helm install dp ./helm/app -f helm/app/values-dev.yaml --create-namespace -n dp-dev
kubectl -n dp-dev port-forward svc/dp-deployment-platform 8080:80
curl http://localhost:8080/healthz
```

Or with raw manifests + Kustomize:

```bash
kustomize build k8s/overlays/dev | kubectl apply -f -
```

### Run the application in Kubernetes with Kustomize (prod overlay)

```bash
# Edit k8s/overlays/prod/kustomization.yaml to point at your image registry
kustomize build k8s/overlays/prod | kubectl apply -f -
kubectl -n deployment-platform get all,hpa,pdb,networkpolicy,servicemonitor
```

## Features

| Concern                | Implementation                                                                   |
| ---------------------- | -------------------------------------------------------------------------------- |
| Containerization       | Multi-stage Dockerfile, distroless-style hardened image, non-root user, tini PID 1 |
| Local orchestration    | Docker Compose v2, healthchecks, named volumes, resource limits                  |
| Workload orchestration | Kubernetes Deployment (RollingUpdate, maxSurge=1, maxUnavailable=0)              |
| Scalability            | HorizontalPodAutoscaler (CPU + memory, scale-up/down behavior policies)         |
| Resilience             | PodDisruptionBudget, startup/liveness/readiness probes, topology spread         |
| Security               | PodSecurityStandards `restricted`, RBAC, ServiceAccount, NetworkPolicy           |
| Configuration          | ConfigMap (non-secret) + Secret (creds) with envFrom wiring                     |
| Networking             | ClusterIP Service, Ingress with TLS, NetworkPolicy default-deny egress           |
| Observability          | Prometheus metrics endpoint, Grafana dashboards, alerting rules                 |
| Service discovery      | DNS-based service names (`postgres`, `redis`), headless-friendly selectors      |
| Packaging              | Kustomize (raw YAML) and Helm chart (templated, with subcharts)                 |
| CI/CD                  | GitHub Actions: lint/test, build/scan/push, deploy per environment              |
| Releases               | GitHub release workflow that publishes OCI image and Helm chart `.tgz`          |

## Make targets

```
make help         # Show available targets
make install      # npm ci
make lint         # eslint
make test         # node --test
make build        # docker build
make run          # docker run
make up           # compose up
make down         # compose down
make push         # build + push
make helm-lint    # helm lint
make helm-template# helm template
make kustomize    # kustomize build dev + prod
make clean        # remove local artifacts
```

## Documentation

- [docs/architecture.md](docs/architecture.md) - system design and component model
- [docs/local-dev.md](docs/local-dev.md) - working with the local stack
- [docs/deployment.md](docs/deployment.md) - deploying to a real cluster
- [docs/scaling.md](docs/scaling.md) - HPA behavior and capacity planning
- [docs/security.md](docs/security.md) - threat model, hardening, RBAC
- [docs/observability.md](docs/observability.md) - metrics, logs, alerts
- [docs/troubleshooting.md](docs/troubleshooting.md) - common issues

## CI/CD

| Workflow      | Trigger                  | What it does                                              |
| ------------- | ------------------------ | --------------------------------------------------------- |
| `ci.yml`      | PR / push to `main`      | Lint, test, build image (no push), helm lint+template, kustomize build |
| `cd.yml`      | push to `main` / `v*` tags | Build & push image, deploy to staging (main) or production (tag) |
| `security.yml`| PR / push / weekly cron  | Trivy image + filesystem scans, conftest CIS checks       |
| `release.yml` | `v*.*.*` tags            | Build & push image, package Helm chart, create GitHub release |

## License

MIT - see [LICENSE](LICENSE).
