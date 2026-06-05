'use strict';

const express = require('express');
const config = require('./config');
const logger = require('./logger');
const db = require('./db/postgres');
const cache = require('./db/redis');
const { register, httpMetricsMiddleware } = require('./metrics');
const { router: healthRouter, setReady } = require('./routes/health');
const usersRouter = require('./routes/users');
const todosRouter = require('./routes/todos');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '100kb' }));
app.use(httpMetricsMiddleware);

app.get('/version', (_req, res) => {
  res.json({ name: 'deployment-platform-app', version: config.version, env: config.env });
});

app.use(healthRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/todos', todosRouter);

app.get(config.metrics.path, async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

app.use(notFound);
app.use(errorHandler);

let server;

async function start() {
  try {
    await db.init();
    await cache.init();
    setReady(true);
  } catch (err) {
    logger.error({ err }, 'failed to initialize dependencies');
    setReady(false);
  }

  server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env, version: config.version }, 'listening');
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    setReady(false);
    server.close(async () => {
      await db.close().catch(() => {});
      await cache.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
