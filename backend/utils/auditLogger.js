'use strict';

/**
 * Audit trail — structured JSON on stdout, captured by PM2.
 *
 * Every line is one auditable action with the actor, their IP, and a request id
 * that ties together all the lines a single request produced. Lines are ndjson,
 * so `grep '[AUDIT]' | jq` gets you a queryable stream.
 *
 * NOTE: stdout alone is not a durable record — it lives on one instance's disk
 * and goes away when that instance does. A persistent sink is still an open
 * decision; the entry shape below is deliberately flat so it can be pointed at
 * one (a table, CloudWatch, an external collector) without changing callers.
 */

const ACTOR_FIELDS = ['id', 'email', 'role'];

/** Never let a caller's `details` blob carry a secret into permanent storage. */
const REDACTED_KEYS =
  /^(password|password_hash|token|access_token|refresh_token|otp|otp_hash|secret|authorization|api_key|jwt)$/i;

function redact(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACTED_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

/** Cap a payload so one oversized blob cannot bloat the table. */
function bounded(value, maxBytes = 16000) {
  if (value === undefined || value === null) return null;
  const safe = redact(value);
  const json = JSON.stringify(safe);
  if (json !== undefined && json.length <= maxBytes) return safe;
  return { truncated: true, preview: String(json).slice(0, 1000) };
}

/**
 * Record an auditable action.
 *
 * @param {object}  p
 * @param {object}  p.req         Express request — supplies actor, ip, request id
 * @param {string}  p.action      CREATE | UPDATE | DELETE | LOGIN | LOGIN_FAILED | ...
 * @param {string} [p.entityType] e.g. 'exercise', 'user'
 * @param {string} [p.entityId]
 * @param {object} [p.details]    Anything else worth keeping
 * @param {object} [p.before]     Prior state — the half that makes an UPDATE answerable
 * @param {object} [p.after]      New state
 * @param {object} [p.actor]      Explicit actor when req.user is not set yet (login)
 */
function logAction({
  req,
  action,
  entityType,
  entityId,
  details,
  before,
  after,
  actor,
}) {
  const who = actor ?? req?.user ?? {};
  const entry = {
    // ISO-8601 UTC: sortable, machine-parseable, and directly comparable with
    // CloudWatch and nginx timestamps. The previous 'DD-MM-YYYY hh:mm A' in
    // Asia/Kolkata was none of those things.
    timestamp: new Date().toISOString(),
    requestId: req?.requestId ?? null,
    actorUserId: who.id ?? null,
    actorEmail: who.email ?? null,
    actorRole: who.role ?? null,
    actorIp: req?.clientIp ?? req?.ip ?? null,
    action,
    entityType: entityType ?? null,
    entityId: entityId != null ? String(entityId) : null,
    method: req?.method ?? null,
    path: req?.originalUrl ?? null,
    statusCode: req?.res?.statusCode ?? null,
    details: bounded(details),
    before: bounded(before),
    after: bounded(after),
  };

  // Tells the catch-all request logger that this request already produced a
  // specific, more informative record — so one action is not stored twice.
  if (req) req._audited = true;

  console.log('[AUDIT]', JSON.stringify(entry));
  return entry;
}

module.exports = { logAction, ACTOR_FIELDS };
