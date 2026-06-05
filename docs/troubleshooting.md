# Troubleshooting

## App won't start: `Error: connect ECONNREFUSED 127.0.0.1:5432`

The app boots before Postgres is reachable. The readiness probe will keep
the pod un-ready until Postgres accepts connections; **this is normal**.

If it stays un-ready for more than 60s:

```bash
kubectl -n deployment-platform logs -l app.kubernetes.io/name=postgres
kubectl -n deployment-platform get pods
```

## Pods are `CrashLoopBackOff`

```bash
kubectl -n deployment-platform describe pod <pod>
kubectl -n deployment-platform logs <pod> --previous
```

Common causes:

- The image reference in the Deployment does not exist (CI did not push yet).
- The Secret value is invalid (check `kubectl get secret ... -o yaml`).
- The ConfigMap has a typo'd env var.

## HPA shows `unknown` / `cpu: <unknown>`

The metrics-server is not running in the cluster. Install it:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

## NetworkPolicy blocks legitimate traffic

The bundled policies assume:

- Ingress from the `ingress-nginx` namespace on TCP 443
- Egress to DNS (UDP/53) and the Kubernetes API (TCP/443)

If you are using a different ingress controller, edit
`k8s/base/networkpolicy.yaml` or
`helm/app/templates/networkpolicy.yaml` and update
`ingressNamespaceSelector.matchLabels`.

## `helm template` complains about missing chart dependencies

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm dependency update helm/app
```

## ServiceMonitor has no data in Prometheus

Confirm the `ServiceMonitor` has the right `release` label that matches your
Prometheus Operator `prometheusSelector`:

```bash
kubectl -n deployment-platform get servicemonitor app -o yaml
```

The default label is `release: prometheus`. Override with
`--set serviceMonitor.releaseLabel=...`.

## Image pull errors

```bash
kubectl -n deployment-platform get pods -o json | jq '.items[].status.containerStatuses[]?.state'
```

If you see `ErrImagePull`, the image is either:

- not pushed yet (CI failed),
- in a private registry the cluster cannot authenticate to.

For private registries, create an `imagePullSecret` and reference it via
`image.pullSecrets` in `values.yaml` or `imagePullSecrets` in the Kustomize
overlay.
