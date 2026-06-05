'use strict';

const logger = require('../logger');

function notFound(req, res, _next) {
  res.status(404).json({ error: 'not_found', path: req.path });
}

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const body = {
    error: err.code || (status >= 500 ? 'internal_error' : 'bad_request'),
    message: status >= 500 ? 'Internal Server Error' : err.message,
  };
  if (status >= 500) {
    logger.error({ err, path: req.path }, 'unhandled error');
  } else {
    logger.warn({ err: err.message, path: req.path }, 'client error');
  }
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
