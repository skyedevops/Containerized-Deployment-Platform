'use strict';

const env = (key, fallback) => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};

const envInt = (key, fallback) => {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid integer for ${key}: ${v}`);
  return n;
};

const envBool = (key, fallback) => {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

module.exports = {
  env: env('NODE_ENV', 'production'),
  port: envInt('PORT', 3000),
  logLevel: env('LOG_LEVEL', 'info'),
  version: env('APP_VERSION', '0.0.0'),

  postgres: {
    host: env('POSTGRES_HOST', 'postgres'),
    port: envInt('POSTGRES_PORT', 5432),
    database: env('POSTGRES_DB', 'appdb'),
    user: env('POSTGRES_USER', 'app'),
    password: env('POSTGRES_PASSWORD', 'changeme'),
    poolMax: envInt('POSTGRES_POOL_MAX', 10),
    ssl: envBool('POSTGRES_SSL', false),
  },

  redis: {
    host: env('REDIS_HOST', 'redis'),
    port: envInt('REDIS_PORT', 6379),
    password: env('REDIS_PASSWORD', '') || undefined,
    db: envInt('REDIS_DB', 0),
    ttlSeconds: envInt('REDIS_TTL_SECONDS', 300),
  },

  metrics: {
    path: env('METRICS_PATH', '/metrics'),
  },
};
