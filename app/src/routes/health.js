'use strict';

const express = require('express');
const db = require('../db/postgres');
const cache = require('../db/redis');

const router = express.Router();

let ready = false;

function setReady(value) {
  ready = value;
}

router.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.get('/readyz', async (_req, res) => {
  if (!ready) return res.status(503).json({ status: 'not_ready' });
  try {
    const [pg, rd] = await Promise.all([db.ping(), cache.ping()]);
    if (!pg || !rd) throw new Error('dependency check failed');
    res.json({ status: 'ready', postgres: pg, redis: rd });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

module.exports = { router, setReady };
