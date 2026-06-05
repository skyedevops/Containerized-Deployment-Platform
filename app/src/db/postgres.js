'use strict';

const { Pool } = require('pg');
const config = require('../config');
const logger = require('../logger');
const { dbConnectionsActive } = require('../metrics');

const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.postgres.password,
  max: config.postgres.poolMax,
  ssl: config.postgres.ssl ? { rejectUnauthorized: false } : false,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('connect', () => {
  dbConnectionsActive.inc({ db: 'postgres' });
});

pool.on('remove', () => {
  dbConnectionsActive.dec({ db: 'postgres' });
});

pool.on('error', (err) => {
  logger.error({ err }, 'unexpected pg pool error');
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function ping() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

async function close() {
  await pool.end();
}

module.exports = { pool, init, ping, close };
