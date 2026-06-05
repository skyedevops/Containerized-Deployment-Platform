# Sample Application

Express-based Node.js service with PostgreSQL and Redis backends.

## Endpoints

| Method | Path                    | Purpose                       |
| ------ | ----------------------- | ----------------------------- |
| GET    | `/healthz`              | Liveness probe                |
| GET    | `/readyz`               | Readiness probe (DB+Redis)    |
| GET    | `/version`              | Build metadata                |
| GET    | `/metrics`              | Prometheus metrics            |
| GET    | `/api/v1/users`         | List users                    |
| POST   | `/api/v1/users`         | Create user                   |
| GET    | `/api/v1/todos`         | List todos (Redis-cached)     |
| POST   | `/api/v1/todos`         | Create todo                   |

## Local development

```bash
npm install
npm run dev
```

The dev server expects Postgres and Redis at the addresses configured in
`../.env.example`. Use `make up` at the repo root to start them via Compose.
