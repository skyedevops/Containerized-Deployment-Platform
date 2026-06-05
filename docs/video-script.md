# Build Process — Video Script

> Target length: **~17 minutes** (1,400 spoken words + visuals).
> Format: dual-column (VISUAL | NARRATION). Bold = on-screen text.
> Trade-off callouts marked with `⚖️` for jump-cut to a side graphic.

---

## 0:00 — COLD OPEN (0:00–0:30)

**VISUAL** *B-roll: terminal scrolling `docker compose up`, Grafana dashboard
panning, `helm template | kubectl apply -f -`. Fast cuts, lo-fi beat.*

**NARRATION**

> Most "container platform" demos stop at `docker run`. That's not a platform —
> it's a container. A platform is the boring scaffolding that lets you ship
> the same artifact to dev, staging, and production without changing anything
> about how it's built. Today I'm walking through a real one, top to bottom,
> and being honest about the trade-offs I made along the way.

---

## 0:30 — INTRO & GOALS (0:30–1:30)

**VISUAL** *Title card: "Containerized Deployment Platform — Build Process".
Quick repo fly-by: tree, then zoom in on the four layers.*

**NARRATION**

> The repo at the top of the screen has four layers stacked on top of each
> other. The sample Node app at the bottom. A multi-stage Docker image. A
> docker-compose stack. And then Kubernetes, with both raw manifests and a
> Helm chart. Plus Prometheus, Grafana, GitHub Actions, and seven markdown
> docs.
>
> Goals I set for myself:
>
> 1. **No toy examples.** A real Express service with PostgreSQL and Redis,
>    not `nginx`. You should be able to `curl` an actual CRUD API.
> 2. **Two paths to production.** Raw manifests with Kustomize for clarity,
>    and a Helm chart for the cases where you need templating.
> 3. **Resilience and security by default.** HPA, PDB, NetworkPolicy,
>    `restricted` PodSecurity — none of these are "add later".
> 4. **Honest trade-offs.** Every time I picked a default, I'll tell you the
>    thing I gave up.

---

## 1:30 — SEGMENT 1: THE APPLICATION (1:30–3:30)

**VISUAL** *VS Code: `app/src/server.js`, `app/src/routes/health.js`, then
`app/src/db/postgres.js`, `app/src/db/redis.js`. Side-by-side: terminal
output of `npm test`.*

**NARRATION**

> The application is a 200-line Express server. Users and todos — classic
> CRUD. Postgres for durable state, Redis for caching the todo list. The
> reason I picked Node for the sample is that it forces every interesting
> problem to surface: connection pooling, graceful shutdown, graceful
> degradation when the DB is briefly unavailable.
>
> `app/src/server.js` is worth lingering on. Three things matter:
>
> **Startup order matters less than readiness.** Look at `start()` — we
> `db.init()` and `cache.init()` inside a try/catch and the server still
> starts listening. That's on purpose. The container can come up before
> Postgres does; readiness probes will keep it out of the Service until
> both dependencies answer a `ping()`. I'll come back to that in the
> Kubernetes section.
>
> **Probes are part of the app, not a k8s detail.** `/healthz` is dumb —
> it just returns ok. `/readyz` does the dependency check. This separation
> is the single most important thing I see teams get wrong.
>
> **Metrics are first-class.** `/metrics` uses `prom-client`, with HTTP
> histograms labelled by route and status code, plus DB connection gauges
> and cache hit/miss counters. That label cardinality is intentional —
> it's the difference between a dashboard that's useful and one that's
> noise.

**⚖️ TRADE-OFF CALLOUT — Node vs Go for the sample**

> **Alternative I considered:** Go with Gin. Single binary, smaller image,
> faster cold start.
> **Why I picked Node:** the platform's job isn't to pick the runtime, it's
> to demonstrate the deployment shape. Node forces you to think about
> graceful shutdown, connection pools, and event-loop back-pressure — all
> the things that go wrong in real Node deployments.

---

## 3:30 — SEGMENT 2: THE CONTAINER IMAGE (3:30–5:30)

**VISUAL** *Side-by-side: `app/Dockerfile` left, `docker history` output
right. Highlight the two stages.*

**NARRATION**

> The Dockerfile has two stages. The first one — `deps` — runs `npm ci
> --omit=dev` to produce production-only `node_modules`. The second stage
> — `runtime` — copies them into a fresh `node:20-alpine`, adds `tini`,
> creates a non-root user, and runs the app as that user.
>
> Five things to call out:
>
> **1. Multi-stage isn't just a size optimization.** It's a *trust*
> optimization. The final image literally cannot contain `eslint` or
> `jest` — they're not in `node_modules` of the runtime stage. Smaller
> attack surface.
>
> **2. `tini` as PID 1.** Node doesn't reap zombie processes and doesn't
> handle `SIGTERM` correctly under all conditions. `tini` does both. The
> cost is six lines in the image.
>
> **3. Non-root by uid, not name.** `USER app` plus the `addgroup`/`adduser`
> earlier. The image declares `app:app` with uid 1000. The Pod will run
> with `runAsUser: 1000` later — they match. ⚠️ don't `USER root` and
> then add a chown; the runtime will fight you.
>
> **4. Read-only root filesystem.** Implemented in the container security
> context, not the Dockerfile. The only writable place is `/tmp`, mounted
> from an `emptyDir`. If a process tries to write anywhere else, it
> crashes loudly.
>
> **5. HEALTHCHECK.** Uses `curl` against `/healthz`. The container is now
> self-aware: if `/healthz` stops responding, the Docker daemon will
> restart it — and so will Kubernetes if the kubelet's HTTP probe is
> disabled.

**⚖️ TRADE-OFF CALLOUT — Alpine vs distroless**

> **Alternative I considered:** `gcr.io/distroless/nodejs20-debian12`. Even
> smaller, no shell at all.
> **Why I picked Alpine:** the `curl` in HEALTHCHECK is convenient. With
> distroless, I'd need a Node-based healthcheck in the image or rely
> entirely on Kubernetes probes. For a teaching repo, explicit is better
> than implicit. For a real production image with strict hardening
> requirements, I'd revisit this.

---

## 5:30 — SEGMENT 3: LOCAL ORCHESTRATION (5:30–7:00)

**VISUAL** *Terminal split-screen: `docker compose up` output and
`curl http://localhost:3000/...` results.*

**NARRATION**

> `docker-compose.yml` runs the full stack — app, Postgres, Redis. The
> piece I want to highlight is `depends_on: condition: service_healthy`.
> Without that, Docker starts the containers in declaration order, full
> stop. The app would race Postgres, fail to connect for 10 seconds, then
> succeed. With health-gated `depends_on`, the app container doesn't
> start until Postgres's healthcheck is green. No race.
>
> The other quiet detail: the app and data services get different
> `deploy.resources.limits`. The app can be cgroup-killed for being
> greedy; Postgres can be paged out if it grows. The data tier is
> *fatter* than the app tier, which matches reality.
>
> I deliberately did not put `nginx` or a reverse proxy in front of the
> app. The app itself is the HTTP server. Adding a proxy in dev hides
> networking bugs that will only show up in staging.

**⚖️ TRADE-OFF CALLOUT — Compose v2 vs `docker-compose` v1**

> Compose v2 ships with Docker and is written in Go. The `docker compose`
> (no hyphen) syntax is the new one. I used it. If your team is on v1
> (`docker-compose`), `condition: service_healthy` still works but the
> command is hyphenated. Pick one and stick with it.

---

## 7:00 — SEGMENT 4: KUBERNETES MANIFESTS (7:00–10:00)

**VISUAL** *Quick fly through `k8s/base/`. Pause on `app.yaml`,
`hpa.yaml`, `pdb.yaml`, `networkpolicy.yaml`. Switch to
`kustomize build k8s/overlays/prod` output.*

**NARRATION**

> This is the heart of the platform. The `k8s/base/` directory is
> deliberately flat — no Helm, no overlays, no cleverness. Just
> Kubernetes resources that any operator can read.
>
> Five decisions that matter:
>
> **1. `maxSurge: 1`, `maxUnavailable: 0` on the Deployment.**
> This means the rolling update always has full capacity. We spin up one
> new pod before killing the old one. The cost: a brief overshoot of
> resource requests. The benefit: zero dropped requests during a deploy.
> For a stateful, latency-sensitive service, this is the right default.
>
> **2. Three probes, not one.** `startupProbe` is the safety net — it
> gives slow-starting pods up to 150 seconds before `livenessProbe`
> starts. That single line has saved me from a thousand 3am pages
> caused by JVM-style warmup, cold caches, lazy DB pool initialization.
> `livenessProbe` then restarts truly broken pods. `readinessProbe`
> removes pods from the Service endpoint while they can't serve
> traffic.
>
> **3. HPA on CPU *and* memory.** Most tutorials show CPU only. Memory
> is a leak detector. If RSS doubles per request because of a missing
> cleanup, the HPA will scale out before the OOMKiller shows up.
>
> **4. PDB with `minAvailable: 1`.** During `kubectl drain` or a node
> upgrade, this guarantees at least one pod is always serving. Combined
> with the HPA min of 2, you can lose a node without dropping below
> capacity.
>
> **5. NetworkPolicy with default-deny egress.** This is the
> *container network* equivalent of a firewall. The app pod cannot reach
> the internet, cannot reach random pods in other namespaces — only DNS,
> Postgres, Redis, and the API server. If a future code change tries to
> call out to an attacker-controlled host, it just doesn't work. ⚖️
>
> That last one is the most-debated choice in the repo. Let me show you
> why.

**⚖️ TRADE-OFF CALLOUT — Default-deny egress**

> **Alternative:** allow-all egress, lock down per-app.
> **Why I picked default-deny:** the average CVE in a Node service is
> somebody making an outbound HTTP call they shouldn't. `npm install`
> running post-deploy, an SSRF, a misconfigured telemetry endpoint.
> Default-deny means the pod is *inert* by default; you have to
> explicitly add an egress rule to reach a new dependency.
> **What I gave up:** you have to remember to add egress rules. When
> someone adds Kafka or Elasticsearch, they have to remember to update
> the NetworkPolicy. That's a process problem, not a platform problem.
> **When to revisit:** if you have 50+ services and the policy
> maintenance becomes a bottleneck, switch to Cilium's `L7` policies
> or move to a service mesh.

---

## 10:00 — SEGMENT 5: KUSTOMIZE OVERLAYS (10:00–11:30)

**VISUAL** *`tree k8s/`, then split-screen with `kubectl kustomize
k8s/overlays/dev` and `k8s/overlays/prod` side by side. Highlight the
patched values (replicas, HPA bounds, host).*

**NARRATION**

> The base manifest is intentionally a single replica-less template.
> Kustomize overlays in `k8s/overlays/{dev,staging,prod}` apply a
> component that patches replicas, HPA bounds, and the Ingress host.
>
> This is the part of the platform I had the most back-and-forth on.
> Three options:
>
> - **A.** One big base, env-specific values via a script.
> - **B.** Three full copies of the manifests.
> - **C.** Base + components. ← picked this
>
> C wins because the diff between environments is *intentional and
> visible* in the component file, but 90% of the resources are shared.
> When Postgres schema changes, you change it once in `base/postgres.yaml`
> and every environment gets it.
>
> ⚖️ **The thing I got wrong first:** my dev component tried to
> *remove* the HPA, the Ingress, and the ServiceMonitor. JSON patch's
> `op: remove` works on fields, not on whole resources. I had to
> restructure the base into `core/` and `optional/` so the dev overlay
> could include only `core/`. The lesson: Kustomize encourages you to
> structure your manifests around *what is optional*, which is a healthy
> forcing function.

---

## 11:30 — SEGMENT 6: THE HELM CHART (11:30–13:30)

**VISUAL** *`tree helm/app/templates/`, then `helm template dp helm/app -f
values-prod.yaml` output. Zoom in on the helper template file.*

**NARRATION**

> Same workload, packaged two ways. The Helm chart in `helm/app/` has
> the same Deployment, the same HPA, the same NetworkPolicy — but as
> 13 separate templates wired through `_helpers.tpl`.
>
> Why ship both Kustomize *and* Helm? They serve different audiences.
>
> - **Kustomize** is for humans reading the manifests. You can
>   `grep` it, you can `kubectl kustomize` it, you can `kubectl apply
>   -f` it. There's no template language.
> - **Helm** is for ops. You `helm install` it, you have a release
>   history, you can `helm rollback`. The values file is the
>   contract between the chart author and the operator.
>
> If you're building a service for *your* team to deploy, Kustomize is
> usually enough. If you're building a service for *other* teams to
> deploy, you need Helm.
>
> ⚖️ **The big trade-off inside the chart:** subcharts. I originally
> had bitnami's Postgres and Redis charts as subcharts. They're the
> gold standard. The problem: Helm v4's dependency resolution has a
> quirk where it expects extracted subchart directories, not the
> `.tgz` files. CI breaks, contributors get confused.
>
> The simpler choice was to ship my own Postgres and Redis as part of
> the chart. They're not as featureful as the bitnami versions — no
> replication, no point-in-time recovery — but they have:
> - the same security context I want,
> - the same labels the NetworkPolicy expects,
> - zero external dependencies.
>
> For a teaching repo, that wins. For a real production deployment,
> swap them for the managed cloud service and set `postgresql.enabled:
> false`.

---

## 13:30 — SEGMENT 7: OBSERVABILITY (13:30–14:30)

**VISUAL** *Grafana dashboard screenshot panning, then a slide listing
the four golden signals.*

**NARRATION**

> The app exposes four metric families: HTTP request rate and duration,
> DB connections, cache hits and misses, and the standard Node runtime
> metrics from `prom-client`.
>
> The Helm chart ships a `ServiceMonitor`, which the Prometheus
> Operator auto-discovers. If you're using `kube-prometheus-stack`,
> you don't have to configure a single scrape job. The chart
> contributes its own labels — `release: prometheus` — which is the
> default selector for the stack.
>
> The alert rules are deliberately small: high 5xx ratio, p95
> latency, pod crash-looping, and "app down". I did not include
> "predictive" alerts like *latency might exceed SLO in 30 minutes*
> — those need historical data the platform doesn't have yet.
>
> The two Grafana dashboards — application and Kubernetes — are
> versioned as JSON and provisioned automatically when you run
> `docker compose -f docker-compose.observability.yml up`. No
> clicking through the Grafana UI to import things.

**⚖️ TRADE-OFF CALLOUT — Prometheus vs an APM vendor**

> For a small team, the self-hosted Prometheus + Grafana stack costs
> $0 and a few hours of setup. For a large team, a SaaS APM gives you
> distributed tracing, error tracking, and profiling that this stack
> doesn't. Don't be a hero; pick the tool that matches the team
> size. The point is to expose the *shape* of the workload, not the
> vendor.

---

## 14:30 — SEGMENT 8: CI/CD (14:30–15:30)

**VISUAL** *Walk through `.github/workflows/` in tree form, then
`cd.yml` job by job.*

**NARRATION**

> Four workflows, one responsibility each:
>
> - **ci.yml** runs on every PR. Lints, tests, builds the image with
>   `docker/build-push-action`, lints and templates the Helm chart,
>   builds the Kustomize overlays. Catches the obvious stuff in under
>   five minutes.
> - **cd.yml** runs on push to `main` and on `v*` tags. Builds the
>   image, pushes to GHCR with provenance and SBOM, and deploys via
>   `kubectl kustomize ... | kubectl apply`. Note: it deploys to
>   staging on main, but only deploys to production on a tag. That's
>   the line between *continuous* and *release*. Don't cross it.
> - **security.yml** runs Trivy against the image and the repo, then
>   uploads SARIF to the Security tab. Also runs a Conftest check
>   against the rendered manifests using the upstream Kubernetes
>   policy library.
> - **release.yml** runs on tags, packages the Helm chart, and creates
>   a GitHub release with the chart `.tgz` attached.
>
> ⚖️ **Two trade-offs worth flagging:**
>
> 1. I did not wire up a database migration step. In a real
>    production pipeline, that would be its own job between `build` and
>    `deploy`, with a manual approval for destructive migrations. The
>    app uses a `CREATE TABLE IF NOT EXISTS` on boot for the demo,
>    which is the right choice for a teaching repo and the wrong
>    choice for production.
> 2. I did not include a canary or blue-green deploy. With the current
>    shape, every deploy is a rolling update with `maxUnavailable: 0`.
>    That's a zero-downtime deploy, but it is *not* a safe deploy —
>    there's no automatic rollback on elevated error rate. For
>    mission-critical services, layer in Argo Rollouts or Flagger.

---

## 15:30 — SEGMENT 9: WHAT I'D CHANGE (15:30–16:30)

**VISUAL** *Speaker card with bullet list. Each bullet has a hand-drawn
arrow to a hypothetical PR.*

**NARRATION**

> Things I would change before running this for real money:
>
> **1. Replace the in-chart Postgres with a managed service.** RDS,
> Cloud SQL, or whatever your cloud offers. The in-chart version is
> fine for dev and demos. The day a node fails, you will wish you
> had a managed replica and automated backups.
>
> **2. Add OpenTelemetry tracing.** The metrics tell you the
> application's health. They do not tell you *which* request was
> slow. Add an OTel SDK in the app and a Tempo/Jaeger backend. The
> express middleware is a 30-line change.
>
> **3. Wire in a secret store.** Today the chart has a `Secret` with
> a placeholder password. In production, that should come from
> External Secrets Operator reading from AWS Secrets Manager or
> HashiCorp Vault. The chart already supports
> `postgresql.existingSecret`, so the swap is a values-file change.
>
> **4. Add PodSecurityStandards audit-only at first.** I jumped
> straight to `enforce: restricted`. For an existing codebase, the
> right move is `warn: restricted` and `enforce: baseline`, fix the
> namespace, then move to `restricted`. Start where you can ship.
>
> **5. Make CI run against a real cluster.** `kind` or `k3d` in CI,
> then `helm install` and `curl` the actual pod. Manifest validation
> catches typos; an actual deployment catches *runtime* issues like
> wrong port numbers, missing RBAC for the metrics endpoint, or
> ConfigMap keys that the app doesn't read.

---

## 16:30 — OUTRO (16:30–17:00)

**VISUAL** *Repo tree, then the README's "Quick start" commands in
sequence.*

**NARRATION**

> The whole thing — sample app, container image, compose stack,
> Kubernetes manifests, Helm chart, observability, CI/CD, docs — is
> roughly 6,600 lines, fits in one git clone, and runs end-to-end
> with `make up`.
>
> The pattern, more than the code, is the point. Build the image
> once. Parameterize the deployment. Put the security and resilience
> in by default. Make the trade-offs visible.
>
> The full design-decision reference is in `docs/design-decisions.md`
> in the repo. Thanks for watching.

**VISUAL** *End card with repo URL.*

---

## B-ROLL & VISUAL NOTES

| Timestamp      | Visual                                            |
| -------------- | ------------------------------------------------- |
| 0:00–0:30      | Terminal montage over lo-fi beat                  |
| 1:30           | Title card                                        |
| 1:30–3:30      | VS Code + side-by-side terminal                   |
| 3:30–5:30      | Split: Dockerfile + `docker history`              |
| 5:30–7:00      | Live terminal: `docker compose up`                 |
| 7:00–10:00     | `k8s/base/` fly-through, single-file pauses       |
| 10:00–11:30    | Split-screen kustomize dev vs prod                |
| 11:30–13:30    | Helm tree + `helm template` output                |
| 13:30–14:30    | Grafana screenshot + slide                        |
| 14:30–15:30    | GitHub Actions UI + YAML overlay                  |
| 15:30–16:30    | Speaker card with bullet list                    |
| 16:30–17:00    | Repo tree + README quick start                    |

## PRODUCTION NOTES

- **Pace target:** 130-150 words per minute spoken. Section timers
  above are based on 6,600 LOC and the visual density.
- **Music:** low-key lo-fi or post-rock. Nothing with lyrics in
  the cold open.
- **Color palette:** dark terminals, one accent color (teal works
  well), white text on slides.
- **Code blocks:** use a real monospaced font, 18pt minimum, with
  a soft background.
- **No marketing.** This is a technical walkthrough. The audience
  is engineers evaluating the platform.
