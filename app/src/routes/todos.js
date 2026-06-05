'use strict';

const express = require('express');
const db = require('../db/postgres');
const cache = require('../db/redis');

const router = express.Router();
const CACHE_KEY = 'todos:all';

router.get('/', async (req, res, next) => {
  try {
    const cached = await cache.getJSON(CACHE_KEY);
    if (cached) {
      return res.json({ data: cached, cached: true });
    }
    const { rows } = await db.pool.query(
      'SELECT id, title, completed, created_at FROM todos ORDER BY id DESC LIMIT 100'
    );
    await cache.setJSON(CACHE_KEY, rows);
    res.json({ data: rows, cached: false });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title } = req.body || {};
    if (!title) {
      return res.status(400).json({ error: 'title_required' });
    }
    const { rows } = await db.pool.query(
      'INSERT INTO todos (title) VALUES ($1) RETURNING id, title, completed, created_at',
      [title]
    );
    await cache.del(CACHE_KEY);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
