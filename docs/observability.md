# Observability

## Metrics

The application exposes Prometheus metrics at `GET /metrics` using
[`prom-client`](https://github.com/siimon/prom-client).

| Metric                                  | Type      | Labels                  |
| --------------------------------------- | --------- | ----------------------- |
| `http_requests_total`                   | counter   | method, route, status_code |
| `http_request_duration_seconds`         | histogram | method, route, status_code |
| `db_connections_active`                 | gauge     | db                      |
| `cache_hits_total`                      | counter   | cache                   |
| `cache_misses_total`                    | counter   | cache                   |
| `nodejs_*`                              | various   | (default Node metrics)  |

The Helm chart installs a `ServiceMonitor` so the Prometheus Operator
auto-discovers the application's pods.

## Alerts

See [`observability/prometheus/rules/app-alerts.yaml`](../observability/prometheus/rules/app-alerts.yaml):

- **HighErrorRate**   - 5xx ratio > 5% over 5 minutes
- **HighLatency**     - p95 latency > 500ms over 10 minutes
- **PodCrashLooping** - container restart rate > 0 over 15 minutes
- **AppDown**         - target is not scraped for 2 minutes

## Dashboards

Two Grafana dashboards ship with the platform:

- **Deployment Platform - Application**: request rate, p95 latency, 5xx
  ratio, DB connections, cache hit rate.
- **Deployment Platform - Kubernetes**: pod count, CPU, RSS memory, restart
  counts.

Both dashboards are provisioned automatically when running the local
`docker-compose.observability.yml` stack.

## Logs

Application logs are JSON (via `pino`) to stdout/stderr. In Kubernetes, just
`kubectl logs`:

```bash
kubectl -n deployment-platform logs -l app.kubernetes.io/name=deployment-platform-app -f
```

In production, ship to Loki / Elasticsearch / Cloud Logging with a
Fluent Bit / Vector DaemonSet.
