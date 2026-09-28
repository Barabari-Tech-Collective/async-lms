'use strict';
const crypto = require('crypto');

/**
 * Stamp every request with an id and capture the caller's IP once.
 *
 * A single request can emit several log lines (the request record, whatever the
 * controller audits, an error). Without a shared id there is no way to tie them
 * together, and no reference a user can quote when they report a problem — so
 * the id also goes out on the response as `X-Request-Id`.
 *
 * Must run before the routes and before any auditing middleware.
 */
function requestContext(req, res, next) {
  // Honour an upstream id if the proxy already set one, so a request keeps the
  // same identity across hops. Constrained to avoid header injection into logs.
  const inbound = req.headers['x-request-id'];
  req.requestId =
    typeof inbound === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(inbound)
      ? inbound
      : crypto.randomUUID();

  // `trust proxy` is set, so req.ip is the client rather than the load balancer.
  req.clientIp = req.ip || req.socket?.remoteAddress || null;

  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = requestContext;
