'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/server');

test('GET /healthz returns ok', async () => {
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('GET /version returns service metadata', async () => {
  const res = await request(app).get('/version');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'deployment-platform-app');
  assert.ok(res.body.version);
});

test('GET /metrics exposes Prometheus format', async () => {
  const res = await request(app).get('/metrics');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/plain/);
  assert.match(res.text, /http_requests_total/);
});

test('Unknown route returns 404 JSON', async () => {
  const res = await request(app).get('/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'not_found');
});
