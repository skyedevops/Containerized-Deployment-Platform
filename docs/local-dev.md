# Local development

## Prerequisites

| Tool       | Version   |
| ---------- | --------- |
| Docker     | 24+       |
| Docker Compose | v2 (`docker compose`) |
| Node.js    | 20+ (only for running tests outside Docker) |
| Make       | any       |

## Run the full stack

```bash
make up
```

This builds the application image and starts three services:

- `app`       - <http://localhost:3000>
- `postgres`  - localhost:5432  (`app` / `changeme`)
- `redis`     - localhost:6379

Tear down (deletes volumes too):

```bash
make down
```

## Smoke test the API

```bash
# Health probes
curl -s http://localhost:3000/healthz
curl -s http://localhost:3000/readyz
curl -s http://localhost:3000/version

# Create and list users
curl -s -X POST http://localhost:3000/api/v1/users \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","name":"Alice"}'
curl -s http://localhost:3000/api/v1/users

# Create and list todos (Redis cached)
curl -s -X POST http://localhost:3000/api/v1/todos \
  -H 'content-type: application/json' \
  -d '{"title":"first todo"}'
curl -s http://localhost:3000/api/v1/todos

# Metrics
curl -s http://localhost:3000/metrics | head
```

## Add the observability stack

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

- Prometheus: <http://localhost:9090>
- Grafana:    <http://localhost:3001>  (admin / admin)

Import the dashboards from `observability/grafana/dashboards/`.

## Run the application directly on the host (no Docker)

Useful for fast iteration:

```bash
cd app
npm install
POSTGRES_HOST=localhost REDIS_HOST=localhost npm run dev
```

Or boot only the data services with compose and run the app on the host:

```bash
docker compose up -d postgres redis
cd app && npm run dev
```

## Run tests

```bash
cd app
npm test          # node --test
npm run lint
```

The tests use `supertest` to hit the Express app in-process; they do **not**
require a live database because the `/readyz` and DB-touching paths are
mocked.
