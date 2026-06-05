'use strict';

const Redis = require('ioredis');
const config = require('../config');
const logger = require('../logger');
const { cacheHits, cacheMisses } = require('../metrics');

const client = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

client.on('error', (err) => logger.error({ err }, 'redis error'));
client.on('ready', () => logger.info('redis ready'));

async function init() {
  if (client.status === 'wait' || client.status === 'end') {
    await client.connect();
  }
}

async function ping() {
  const pong = await client.ping();
  return pong === 'PONG';
}

async function getJSON(key) {
  const raw = await client.get(key);
  if (raw === null) {
    cacheMisses.inc({ cache: 'redis' });
    return null;
  }
  cacheHits.inc({ cache: 'redis' });
  return JSON.parse(raw);
}

async function setJSON(key, value, ttlSeconds = config.redis.ttlSeconds) {
  const payload = JSON.stringify(value);
  if (ttlSeconds > 0) {
    await client.set(key, payload, 'EX', ttlSeconds);
  } else {
    await client.set(key, payload);
  }
}

async function del(key) {
  return client.del(key);
}

async function close() {
  await client.quit().catch(() => client.disconnect());
}

module.exports = { client, init, ping, getJSON, setJSON, del, close };
