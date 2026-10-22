const pool = require('../config/pg');

async function createMeetJob({
  classId = null,
  operation,
  idempotencyKey,
  availableAt = new Date(),
}) {
  const result = await pool.query(
    `INSERT INTO meet_jobs
       (class_id, operation, idempotency_key, available_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [classId, operation, idempotencyKey, availableAt],
  );
  return result.rows[0];
}

async function getMeetJob(id) {
  const result = await pool.query('SELECT * FROM meet_jobs WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function claimMeetJob(id) {
  const result = await pool.query(
    `UPDATE meet_jobs
        SET state = 'running',
            attempt_count = attempt_count + 1,
            started_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
        AND state IN ('pending', 'retrying')
        AND available_at <= NOW()
      RETURNING *`,
    [id],
  );
  return result.rows[0] || null;
}

async function getMeetJobAvailability(id) {
  const result = await pool.query(
    'SELECT id, state, available_at FROM meet_jobs WHERE id = $1',
    [id],
  );
  return result.rows[0] || null;
}

async function markMeetJobSucceeded(id) {
  await pool.query(
    `UPDATE meet_jobs
        SET state = 'succeeded',
            completed_at = NOW(),
            updated_at = NOW(),
            error_summary = NULL
      WHERE id = $1`,
    [id],
  );
}

async function markMeetJobRetrying(id, error, delayMs) {
  await pool.query(
    `UPDATE meet_jobs
        SET state = 'retrying',
            available_at = NOW() + ($2 * INTERVAL '1 millisecond'),
            updated_at = NOW(),
            error_summary = $3
      WHERE id = $1`,
    [id, delayMs, formatError(error)],
  );
}

async function markMeetJobFailed(id, error) {
  await pool.query(
    `UPDATE meet_jobs
        SET state = 'failed',
            completed_at = NOW(),
            updated_at = NOW(),
            error_summary = $2
      WHERE id = $1`,
    [id, formatError(error)],
  );
}

function formatError(error) {
  return error?.message || String(error);
}

module.exports = {
  createMeetJob,
  getMeetJob,
  claimMeetJob,
  getMeetJobAvailability,
  markMeetJobSucceeded,
  markMeetJobRetrying,
  markMeetJobFailed,
};
