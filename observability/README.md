# Observability

Self-contained Prometheus + Grafana + node-exporter stack for local development
and a reusable configuration pack for Kubernetes.

## Files

```
observability/
├── docker-compose.observability.yml    # Local stack (used with the main compose)
├── prometheus/
│   ├── prometheus.yml                   # Scrape configuration
│   └── rules/
│       └── app-alerts.yaml              # Alerting rules
└── grafana/
    ├── provisioning/
    │   ├── datasources/datasource.yaml
    │   └── dashboards/dashboards.yaml
    └── dashboards/
        ├── app-dashboard.json          # App-level metrics
        └── k8s-dashboard.json          # Kubernetes-level metrics
```

## Run locally

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

- Prometheus: <http://localhost:9090>
- Grafana:    <http://localhost:3001> (admin / admin)

## Kubernetes

The Helm chart installs a `ServiceMonitor` (when `serviceMonitor.enabled=true`)
which is auto-discovered by the `kube-prometheus-stack` operator.
