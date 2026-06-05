# Design Decisions & Trade-offs

A reference companion to `docs/video-script.md` and `docs/architecture.md`.
Each entry records the decision, the alternatives considered, why this one
won, what it costs, and when to revisit.

The format is intentionally short. If you need to defend a choice in a
design review, copy the entry and add a paragraph of context.

---

## D-01: Node.js + Express for the sample application

**Decision.** Build the sample as a Node 20 / Express service with
PostgreSQL and Redis.

**Context.** The platform's job is to demonstrate *deployment shape*,
not to pick a runtime. The sample has to exercise the parts of the
deployment that actually break in production: connection pooling,
graceful shutdown, dependency-based readiness, and event-loop
back-pressure.

**Alternatives considered.**
- **Go (Gin).** Single static binary, smallest image, fastest cold
  start. No connection-pool story, no graceful-shutdown story.
- **Python (Flask + Gunicorn).** Familiar, but the dependency story
  is harder and the concurrency model is different.
- **Static binary CLI.** Smallest possible. Doesn't exercise any of
  the interesting failure modes.

**Why this one.** Node has the worst defaults for production *and* the
clearest path to fixing them. A teaching repo benefits from that.

**Cost.** The image is larger than a Go equivalent. Cold start is
slower. We have to be explicit about `tini` and `SIGTERM` handling.

**Revisit when.** If you fork the platform for a Go shop, swap the
sample for a Go service. The platform shape doesn't change.

---

## D-02: Multi-stage Dockerfile with a `deps` and `runtime` stage

**Decision.** Two stages: `deps` (install production `node_modules`),
`runtime` (copy them in, add tini, set up non-root user).

**Context.** The runtime image should not contain dev dependencies,
build tools, or source. Anything in the image is a potential
vulnerability.

**Alternatives considered.**
- **Single-stage with `npm ci --production` in the runtime stage.**
  Simpler, but the resulting image carries `npm` and the package
  cache. Larger attack surface.
- **BuildKit multi-stage with separate cache mounts.** Same outcome,
  more complex syntax. Useful at large scale, not needed here.

**Why this one.** The dependency stage can run as root (it has to
write to `/build`). The runtime stage does not. The boundary is
explicit.

**Cost.** Two stages means two `FROM` lines and slightly more
discipline. About 10 extra lines of Dockerfile.

**Revisit when.** Almost never. Multi-stage is the default for
production Dockerfiles.

---

## D-03: `tini` as PID 1

**Decision.** Run the container with `ENTRYPOINT ["/sbin/tini", "--"]`
followed by the Node command.

**Context.** Node does not reap zombie processes by default. Node's
default `SIGTERM` handling can be unreliable when the event loop is
busy. Both of these bite at 3am.

**Alternatives considered.**
- **Distroless images without a shell.** Smaller, but the runtime
  process becomes PID 1 with the same problems.
- **`--init` flag on `docker run`.** Works in Compose, doesn't help
  inside Kubernetes.

**Why this one.** Tini is a six-line addition that fixes both
problems for the rest of the platform's lifetime.

**Cost.** One extra package in the image, ~30KB.

**Revisit when.** When Node ships a real init mode. (They keep
talking about it.)

---

## D-04: Non-root user with uid 1000

**Decision.** Create `app:app` with uid 1000 / gid 1000. `USER app` in
the Dockerfile. `runAsUser: 1000` in the Pod security context.

**Context.** `restricted` PodSecurityStandard requires non-root. The
file ownership in the image and the runtime uid must match, otherwise
you get cryptic permission errors at runtime.

**Alternatives considered.**
- **Run as root, drop capabilities.** Cheaper, but `restricted`
  forbids it, and root-in-container is a known risk.
- **Use a high random uid (OpenShift pattern).** Maximum flexibility,
  but adds complexity when the app needs to read its own files.

**Why this one.** 1000 is the conventional first non-root uid on
Linux. Any developer with a Linux machine has a matching local user,
which makes debugging volumes and `exec`ing into containers less
surprising.

**Cost.** You have to remember to set the uid in both the Dockerfile
and the Pod spec. I do this in two places by design — defense in depth.

**Revisit when.** Almost never. UID 1000 is the boring safe choice.

---

## D-05: `maxSurge: 1`, `maxUnavailable: 0`

**Decision.** The Deployment's rolling update keeps full capacity.
Spin up one new pod before terminating the old.

**Context.** The cost of a 502 during a deploy is higher than the
cost of running one extra pod for 30 seconds. The user is more
likely to notice downtime than a transient CPU bump.

**Alternatives considered.**
- **`maxSurge: 25%`, `maxUnavailable: 25%`.** Faster deploys, but
  capacity drops to 75% during the window.
- **`maxUnavailable: 0`, `maxSurge: 0`.** Impossible — these are
  mutually exclusive.

**Why this one.** State of the art for a typical web service.
Aligns with the PDB guarantee.

**Cost.** Resource requests must allow 1 extra pod. We bake in
500m/512Mi of headroom per app, which is fine.

**Revisit when.** Your HPA max replicas is 100 and the surge pod
would exceed the cluster's capacity. At that scale, use a
percent-based surge.

---

## D-06: Three probes (`startup`, `liveness`, `readiness`)

**Decision.** Three distinct probes, each doing one thing.

**Context.** A single probe usually does one of two things wrong:
either it restarts pods that are still booting, or it lets broken
pods keep serving traffic.

**Alternatives considered.**
- **One probe with a long `initialDelaySeconds`.** "Just wait 60
  seconds." Doesn't help if some boots take 5 seconds and others
  take 90.
- **No liveness probe, only readiness.** Saves you from restart
  storms, but a truly broken pod will live forever.

**Why this one.**
- `startupProbe` runs first. As long as it fails, the kubelet
  ignores `livenessProbe`. Use a long failure threshold (we use 30 ×
  5s = 150s).
- `livenessProbe` then takes over. Three failed checks and the pod
  is restarted.
- `readinessProbe` is independent. It just decides whether the pod
  is in the Service endpoint.

**Cost.** Three probe blocks per Deployment. Worth it.

**Revisit when.** You move to async startup (e.g., lazy DB
connection). In that case, the startup probe should hit a real
"ready" endpoint, not just a port check.

---

## D-07: HPA on CPU *and* memory

**Decision.** Both metrics feed the HPA. The HPA scales to whichever
target is hit first.

**Context.** CPU saturation usually means traffic. Memory growth
usually means a leak. They have different causes and different
remediations.

**Alternatives considered.**
- **CPU only.** Standard, but misses slow leaks.
- **Custom Prometheus metric.** More flexible, but adds a metric-
  adapter dependency.
- **KEDA.** Powerful event-driven scaling. Overkill for a teaching
  repo.

**Why this one.** Memory-based HPA is the closest thing to a free
leak detector that Kubernetes ships out of the box.

**Cost.** The HPA has two metrics to evaluate per pod per sync
interval. Trivial.

**Revisit when.** Your service is memory-stable and you want
request-rate-based scaling. Add a third metric from Prometheus via
the metrics adapter.

---

## D-08: `PodDisruptionBudget` with `minAvailable: 1`

**Decision.** A PDB that guarantees at least one pod survives
voluntary disruptions.

**Context.** `kubectl drain`, cluster upgrades, and node autoscaler
scale-down events all want to evict pods. Without a PDB, they evict
in parallel and you can drop to zero.

**Alternatives considered.**
- **`minAvailable: 100%`.** Too strict — blocks legitimate rollouts.
- **`maxUnavailable`.** Equivalent, but harder to reason about when
  replica count changes.

**Why this one.** `minAvailable: 1` is the smallest safe setting for
a 2-replica service. Combined with `maxUnavailable: 0` on the
Deployment, the math always works out.

**Cost.** A drain that would normally take 30 seconds might take 60
because the scheduler has to find a node that fits the survivor.

**Revisit when.** Replica count goes above ~5. At that point use a
percent-based `minAvailable`.

---

## D-09: Default-deny egress `NetworkPolicy`

**Decision.** Every egress is denied by default. The policy
explicitly allows DNS, Postgres, Redis, and the Kubernetes API.

**Context.** The most common container CVE is a process making an
outbound call it shouldn't: `npm install` running post-build, an
SSRF, a misconfigured telemetry endpoint.

**Alternatives considered.**
- **Allow-all egress, lock down per-app.** Easier at first,
  impossible to maintain.
- **Namespace-level allow-list.** Coarse, but works. Less
  expressive than pod-level.

**Why this one.** The cost is process pain (you have to remember to
add a rule when adding a dependency). The benefit is structural
safety: the default is *inert*.

**Cost.** Every new dependency needs a NetworkPolicy rule. This is
the kind of thing that gets forgotten in a fast-moving codebase.

**Revisit when.** You have 50+ services and the policy maintenance
is the bottleneck. Move to Cilium L7 policies or a service mesh.

---

## D-10: `restricted` Pod Security Standard

**Decision.** The namespace is labelled `enforce: restricted`. Any
pod that violates the standard is rejected at admission.

**Context.** Restricted is the strictest of the three standards.
It forbids root, host namespaces, most capabilities, and privilege
escalation.

**Alternatives considered.**
- **`baseline`.** Allows root and a few other things. Looser, easier
  to adopt in an existing codebase.
- **`privileged`.** Default in older clusters. Equivalent to no
  policy.

**Why this one.** The platform is a *new* codebase, not an existing
one. The cost of `restricted` is near zero when you start with it.

**Cost.** You cannot run `kubectl debug` or use some sidecar
patterns without extra plumbing. Worth it.

**Revisit when.** You are retrofitting the platform into an existing
namespace. Start with `warn: restricted` and `enforce: baseline`,
fix what the warn logs surface, then move to `enforce: restricted`.

---

## D-11: Kustomize *and* Helm

**Decision.** Ship raw Kustomize overlays in `k8s/overlays/` *and* a
parameterized Helm chart in `helm/app/`.

**Context.** Two audiences. Humans reading the manifests want YAML
they can grep. Operators installing into their cluster want
templating, release history, and rollback.

**Alternatives considered.**
- **Kustomize only.** Simpler, but no templating. Brittle when
  every team has slightly different values.
- **Helm only.** Standard, but the chart's templates hide what's
  actually being deployed. Hard to onboard new operators.
- **Helm with Kustomize post-render (`kustomize` as a `post-renderer`).**
  Best of both worlds, but adds a build step most teams don't need.

**Why this one.** Kustomize is the spec. Helm is the interface. They
describe the same workload twice. The duplication is the cost of
serving two audiences.

**Cost.** When something changes, you change it in two places. The
CI workflow tests both, so the duplication is caught quickly.

**Revisit when.** You standardize on one tool across your
organization. Pick the one that matches your team's actual workflow.

---

## D-12: In-chart Postgres and Redis (instead of subcharts)

**Decision.** The Helm chart ships its own Postgres and Redis
StatefulSets. Bitnami subcharts are not used.

**Context.** I originally wired up bitnami/postgresql and
bitnami/redis as conditional subcharts. They're excellent, but Helm
v4's dependency resolution has a quirk that requires extracted
subchart directories, not `.tgz` files. CI broke. Contributors got
confused.

**Alternatives considered.**
- **Bitnami subcharts with a more elaborate build step.** Works,
  but adds a step the average user will skip and then hit later.
- **External managed services.** The right answer in production, but
  the chart can't reach into your cloud account.
- **Ship nothing — assume external services.** Cleaner, but a
  fresh cluster can't run the chart out of the box.

**Why this one.** The in-chart Postgres and Redis are simple, secure
(by the standards set in the rest of the platform), and self-
contained. They have no replication and no automated backup —
explicitly *not* for production.

**Cost.** The chart duplicates ~150 lines of YAML that already
exists in the bitnami chart. The duplication is bounded.

**Revisit when.** You deploy to a real cluster. Set
`postgresql.enabled: false`, `redis.enabled: false`, and point
`config.postgres.host` and `config.redis.host` at your managed
services.

---

## D-13: `ServiceMonitor` (not PodMonitor or a scrape job)

**Decision.** Expose metrics via a Prometheus Operator `ServiceMonitor`.

**Context.** Prometheus is the de facto standard in Kubernetes. The
Operator pattern (`ServiceMonitor`, `PodMonitor`, `PrometheusRule`)
is what `kube-prometheus-stack` consumes.

**Alternatives considered.**
- **Annotations-based discovery.** Used by vanilla Prometheus.
  Works, but loses the operator-style release labels.
- **PodMonitor.** Skips the Service indirection. Useful when
  multiple ports need different scraping.
- **OpenTelemetry Collector + Prometheus exporter.** More flexible,
  more pieces.

**Why this one.** ServiceMonitor is the lowest-friction way to get
scrapes running on a `kube-prometheus-stack` install. The chart's
default label `release: prometheus` matches the default operator
selector.

**Cost.** CRDs must be installed. Most managed Prometheus
distributions install them by default.

**Revisit when.** You don't have the Prometheus Operator. Fall back
to Pod annotations and a manual scrape config.

---

## D-14: Deploy to staging on `main`, to production on `v*` tags

**Decision.** The CD workflow deploys to staging on every push to
`main`. Production deploys only happen on a `v*.*.*` tag.

**Context.** Staging is for "did it build and does the rollout
work". Production is for "do we want to release this version".

**Alternatives considered.**
- **Auto-deploy to production on `main`.** Faster feedback, but no
  human in the loop before users see the change.
- **Auto-deploy on every PR merge.** Same problem, no staging.
- **Manual deploy button only.** Safe, but slow and easy to
  forget.

**Why this one.** Tags are a forcing function for humans. Cutting a
tag means "I am intentionally releasing this". It's five seconds of
work that prevents a thousand bad releases.

**Cost.** A release involves a `git tag` and a `git push --tags`.
That's it.

**Revisit when.** Your team adopts release branching and a release
manager role. The tag becomes the release-candidate tag.

---

## D-15: Structured JSON logs (pino)

**Decision.** All application logs are JSON, one object per line,
with consistent field names.

**Context.** Log aggregators (Loki, ELK, Cloud Logging) all parse
JSON natively. They cannot parse pretty-printed strings with any
reliability.

**Alternatives considered.**
- **`pino-pretty` in production.** Easier to read in a terminal.
  Breaks log aggregation.
- **Logfmt.** Lighter than JSON, less expressive. Fine for simple
  services, awkward for nested data.

**Why this one.** The application emits JSON. Pretty-printing is
the job of the log consumer (which can be done locally with
`pino-pretty` or `jq`).

**Cost.** Local debugging requires `jq` or a pretty-printer. CI
pipelines that grep logs need to be JSON-aware.

**Revisit when.** Never, for a new service. Adopt JSON logging as a
default, not an upgrade.

---

## D-16: `tini` + healthcheck in compose, probes in Kubernetes

**Decision.** Same application, two different liveness signals.

**Context.** Compose doesn't have probes. Docker's `HEALTHCHECK` is
the only way to mark a container as healthy. Kubernetes replaces
that with `livenessProbe` / `readinessProbe`.

**Why both.** They serve different orchestrators. The
`HEALTHCHECK` line in the Dockerfile costs nothing if Kubernetes
ignores it. Removing it would mean `docker run` has no way to know
the container is ready.

**Cost.** Two places to update if the health check path changes.
Defended by the fact that *both* should change in lockstep.

**Revisit when.** You stop running the image locally with plain
Docker. If everything goes through Compose or Kubernetes, the
`HEALTHCHECK` line is optional.

---

## D-17: No database migration tool in the platform

**Decision.** The app uses `CREATE TABLE IF NOT EXISTS` on startup.
No migration runner, no migration files in the repo.

**Context.** A real production pipeline needs a migration tool
(`prisma migrate`, `flyway`, `sqitch`, custom). It's a substantial
addition with its own trade-offs (online vs offline, backwards
compatibility, rollback strategy).

**Why not now.** A teaching repo that demonstrates deployment shape
should not also try to teach migration discipline. The two topics
each deserve their own repo.

**Cost.** First-time deploys work. Second-time deploys with schema
changes are the operator's problem.

**Revisit when.** You are about to ship to production. Pick a
migration tool, add a CI step that runs it against a disposable
database, and add a manual-approval gate for destructive
migrations.

---

## D-18: Trivy for vulnerability scanning

**Decision.** `security.yml` runs Trivy against the image and the
filesystem. SARIF output is uploaded to the GitHub Security tab.

**Context.** Vulnerability scanning is the cheapest, highest-leverage
supply-chain control you can add. Every other supply-chain
control (signing, SBOM attestation, policy enforcement) is built on
top of "we know what's in the image".

**Alternatives considered.**
- **Snyk.** Excellent, commercial. Free tier is limited.
- **Grype.** Good, Anchore-native. Slightly less polish.
- **Clair.** The original, enterprise-focused.

**Why Trivy.** Open source, fast, no account required, integrates
with GitHub Actions via `aquasecurity/trivy-action`. Default choice
for most teams.

**Cost.** None, beyond the CI minutes. SARIF results surface in
the Security tab as actionable alerts.

**Revisit when.** Your security team mandates a different scanner.
The workflow is one file to swap.

---

## D-19: No canary or blue-green deploy

**Decision.** Deploys are rolling updates with `maxUnavailable: 0`.
No progressive traffic shifting, no automatic rollback on elevated
error rate.

**Context.** A rolling update is zero-downtime, but not
zero-*risk*. If the new version has a bug that manifests at 1% of
requests, the rolling update will roll it out to 100% before
anybody notices.

**Alternatives considered.**
- **Argo Rollouts.** Industry standard. Adds a controller and
  new CRDs.
- **Flagger.** Similar, app-mesh-aware.
- **Service-mesh-based canary.** Requires Istio/Linkerd.

**Why not now.** The complexity is not justified for a single
service in a teaching repo. The cost would outweigh the benefit
until the service is high-traffic enough that a 1% error rate
hurts.

**Cost.** Every deploy is a big-bang release. If it's broken, you
find out in the dashboards, not before.

**Revisit when.** The service crosses a traffic threshold where a
0.1% error rate is user-visible. Layer in Argo Rollouts with a
Prometheus-based analysis.

---

## D-20: Doc-heavy, not blog-heavy

**Decision.** The repo has seven markdown docs (`architecture.md`,
`local-dev.md`, `deployment.md`, `scaling.md`, `security.md`,
`observability.md`, `troubleshooting.md`) plus a `video-script.md`
and a `design-decisions.md`. No blog post, no tutorial series.

**Context.** Engineers evaluating a platform want *durable* answers,
not a single author's opinion. A doc in the repo is reviewable in
a PR, findable by `grep`, and updated as the platform changes.

**Cost.** Writing docs is slower than writing a blog post, and the
first version of each doc took longer to write than the code it
describes.

**Revisit when.** You want to attract new users. Write a blog post
*based on* the docs, not in place of them.
