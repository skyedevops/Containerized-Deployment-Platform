'use strict';

const express = require('express');
const db = require('../db/postgres');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.pool.query(
      'SELECT id, email, name, created_at FROM users ORDER BY id DESC LIMIT 100'
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { email, name } = req.body || {};
    if (!email || !name) {
      return res.status(400).json({ error: 'email_and_name_required' });
    }
    const { rows } = await db.pool.query(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name, created_at',
      [email, name]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
