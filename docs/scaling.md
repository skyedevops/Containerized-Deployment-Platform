# Scaling & capacity

## HorizontalPodAutoscaler

```yaml
spec:
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
    - type: Resource
      resource:
        name: memory
        target: { type: Utilization, averageUtilization: 80 }
  behavior:
    scaleDown: { stabilizationWindowSeconds: 300, ... }
    scaleUp:   { stabilizationWindowSeconds: 30,  ... }
```

The HPA is **enabled by default** in `values.yaml` and disabled in
`values-dev.yaml`. Both CPU *and* memory are tracked, so a memory leak that
doubles the RSS will trigger scale-out before the OOMKiller is involved.

## PodDisruptionBudget

```yaml
spec:
  minAvailable: 1   # at least one replica must be running during voluntary disruptions
```

This guarantees no zero-capacity windows during `kubectl drain` and cluster
upgrades.

## Topology spread

By default the chart configures a `topologySpreadConstraints` entry that
prefers scheduling replicas onto **different nodes**, providing failure-domain
isolation in a multi-node cluster.

## Generating load (smoke test)

In one terminal:

```bash
kubectl -n deployment-platform port-forward svc/dp-deployment-platform 8080:80
```

In another:

```bash
hey -z 60s -c 50 http://localhost:8080/api/v1/todos
# or:
ab -n 100000 -c 50 http://localhost:8080/api/v1/todos
```

Watch the HPA react:

```bash
kubectl -n deployment-platform get hpa -w
```

## Capacity planning cheat-sheet

For a Node.js Express service of this shape (Express + pg + ioredis):

| Replicas | CPU/mem per pod | Cluster footprint (steady) |
| -------- | --------------- | -------------------------- |
| 2        | 100m / 128Mi req, 500m / 512Mi limit | ~1 vCPU, ~1 GiB |
| 10       | same as above                         | ~5 vCPU, ~5 GiB |

Treat `500m / 512Mi` as a soft ceiling; the HPA will add pods before this is
hit in normal operation.
