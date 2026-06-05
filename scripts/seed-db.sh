#!/usr/bin/env bash
set -euo pipefail

# Seed Postgres with sample rows.
# Usage: ./scripts/seed-db.sh
PGPASSWORD="${POSTGRES_PASSWORD:-changeme}" psql -h "${POSTGRES_HOST:-localhost}" \
  -U "${POSTGRES_USER:-app}" -d "${POSTGRES_DB:-appdb}" <<'SQL'
INSERT INTO users (email, name) VALUES
  ('alice@example.com', 'Alice'),
  ('bob@example.com',   'Bob')
ON CONFLICT (email) DO NOTHING;

INSERT INTO todos (title) VALUES
  ('Try the deployment platform'),
  ('Read the architecture doc')
ON CONFLICT DO NOTHING;
SQL
