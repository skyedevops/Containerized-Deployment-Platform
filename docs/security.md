# Security

## Defense in depth

| Layer        | Control                                                     |
| ------------ | ------------------------------------------------------------ |
| Image        | Multi-stage build, distroless-style base, `tini` PID 1       |
| Image        | Non-root user (uid 1000), no `setuid` binaries              |
| Container    | `readOnlyRootFilesystem: true`, writable `/tmp` via `emptyDir` |
| Container    | `allowPrivilegeEscalation: false`, all caps dropped          |
| Pod          | `runAsNonRoot: true`, `seccompProfile: RuntimeDefault`       |
| Pod          | `podSecurityStandards: restricted` namespace labels          |
| Network      | NetworkPolicy default-deny egress + explicit allow-lists   |
| Network      | NetworkPolicy ingress restricted to ingress-nginx + pods   |
| Identity     | Dedicated ServiceAccount, `automountServiceAccountToken: false` |
| RBAC         | Minimal Role (read ConfigMaps only)                        |
| Secrets      | Kubernetes `Secret` objects, env-var injection (no file mounts) |
| Supply chain | Trivy image + filesystem scan, SBOM, provenance attestations |
| TLS          | Ingress with `secretName: app-tls` (cert-manager compatible) |

## Pod Security Standards

The namespace is labelled `restricted`:

```yaml
pod-security.kubernetes.io/enforce: restricted
pod-security.kubernetes.io/audit: restricted
pod-security.kubernetes.io/warn: restricted
```

Any pod that tries to run as root, mount host paths, or escalate privileges
will be rejected by the admission controller.

## NetworkPolicy

Three policies are emitted:

- `app`     - allow ingress from `ingress-nginx` namespace and in-namespace pods;
              allow egress to DNS, postgres, redis, and the Kubernetes API.
- `postgres`- allow ingress only from app pods on 5432; allow DNS.
- `redis`   - allow ingress only from app pods on 6379; allow DNS.

Any other pod-to-pod traffic is dropped by the CNI.

## Secret management

This repository ships a `Secret` object in `k8s/base/secret.yaml` with a
placeholder password for demo purposes. In production you should:

1. Disable the in-tree Secret in `values.yaml`:
   ```yaml
   postgresql:
     enabled: false
     existingSecret: my-managed-secret
   ```
2. Inject secrets from **external** sources (External Secrets Operator, AWS
   Secrets Manager, GCP Secret Manager, Vault, etc.).
3. Enable **encryption at rest** for etcd:
   ```bash
   --encryption-provider-config=/etc/kubernetes/enc.yaml
   ```
4. Rotate credentials regularly and have a `Secret` rotation runbook.

## Image supply chain

- Images are built with `docker/build-push-action` and pushed to GHCR.
- `provenance: true` and `sbom: true` produce SLSA-style attestations.
- Trivy scans the built image and the repo on every PR, weekly, and on
  `main`. SARIF is uploaded to the GitHub Security tab.
