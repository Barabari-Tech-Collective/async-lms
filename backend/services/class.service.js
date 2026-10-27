const crypto = require('crypto');
const pool = require('../config/pg');
const { createMeetJob } = require('./meetJob.service');
const { enqueueMeetJob } = require('./meetQueue.service');

const ONE_MINUTE_MS = 60 * 1000;

function normalizeIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String))];
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseDate(value, field) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    const error = new Error(`${field} must be a valid date`);
    error.status = 400;
    throw error;
  }
  return date;
}

function validateSchedule(startValue, endValue) {
  const start = parseDate(startValue, 'scheduledStartAt');
  const end = parseDate(endValue, 'plannedEndAt');
  if (end <= start) {
    const error = new Error('plannedEndAt must be after scheduledStartAt');
    error.status = 400;
    throw error;
  }
  return { start, end };
}

function validateThreshold(value, fallback = 70) {
  const threshold = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    const error = new Error('attendanceThresholdPercent must be between 0 and 100');
    error.status = 400;
    throw error;
  }
  return threshold;
}

function requireUuid(value, field) {
  if (!isUuid(String(value || ''))) {
    const error = new Error(`${field} must be a valid UUID`);
    error.status = 400;
    throw error;
  }
}

async function verifySubjectAccess(client, facilitatorId, subjectId, isAdmin) {
  const subject = await client.query(
    `SELECT id, name, name AS title
       FROM subjects
      WHERE id = $1
        AND is_deleted = false`,
    [subjectId],
  );
  if (!subject.rowCount) {
    const error = new Error('Subject was not found');
    error.status = 404;
    throw error;
  }
  if (!isAdmin) {
    const access = await client.query(
      `SELECT 1 FROM facilitator_subjects
        WHERE facilitator_id = $1
          AND subject_id = $2
          AND is_deleted = false`,
      [facilitatorId, subjectId],
    );
    if (!access.rowCount) {
      const error = new Error('You are not assigned to this subject');
      error.status = 403;
      throw error;
    }
  }
  return subject.rows[0];
}

async function getEligibleStudents(client, subjectId, studentIds) {
  const ids = normalizeIds(studentIds);
  if (!ids.length || ids.some((id) => !isUuid(id))) {
    const error = new Error('studentIds must contain at least one valid student UUID');
    error.status = 400;
    throw error;
  }
  const result = await client.query(
    `SELECT u.id, u.full_name
     FROM users u
     JOIN user_subjects us ON us.user_id = u.id
    WHERE u.id = ANY($1::uuid[])
      AND us.subject_id = $2
      AND u.deleted_at IS NULL`,
    [ids, subjectId],
  );
  const found = new Set(result.rows.map((row) => row.id));
  const invalid = ids.filter((id) => !found.has(id));
  if (invalid.length) {
    const error = new Error('Every selected student must be active and enrolled in the selected subject');
    error.status = 400;
    throw error;
  }
  return result.rows;
}

async function createClass({ facilitatorId, isAdmin, input }) {
  const startedAt = Date.now();
  requireUuid(input.subjectId, 'subjectId');
  const { start, end } = validateSchedule(input.scheduledStartAt, input.plannedEndAt);
  const threshold = validateThreshold(input.attendanceThresholdPercent);
  const idempotencyKey = String(input.idempotencyKey || crypto.randomUUID()).trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    const error = new Error('idempotencyKey must be a non-empty value of at most 200 characters');
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, status, title
         FROM classes
        WHERE idempotency_key = $1
        FOR UPDATE`,
      [idempotencyKey],
    );
    if (existing.rowCount) {
      await client.query('COMMIT');
      return { class: existing.rows[0], existing: true };
    }

    const subject = await verifySubjectAccess(client, facilitatorId, input.subjectId, isAdmin);
    const students = await getEligibleStudents(client, input.subjectId, input.studentIds);
    const classResult = await client.query(
      `INSERT INTO classes
         (subject_id, facilitator_id, title, scheduled_start_at,
          planned_end_at, attendance_threshold_percent, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.subjectId,
        facilitatorId,
        String(input.title || subject.title || subject.name || '').trim(),
        start,
        end,
        threshold,
        idempotencyKey,
      ],
    );
    const classRow = classResult.rows[0];
    const studentIds = students.map((student) => student.id);
    await client.query(
      `INSERT INTO class_students
         (class_id, student_id, source_subject_id)
       SELECT $1, student_id, $2
       FROM unnest($3::uuid[]) AS selected(student_id)`,
      [classRow.id, input.subjectId, studentIds],
    );
    await client.query(
      `INSERT INTO attendance (class_id, student_id)
       SELECT $1, student_id
       FROM unnest($2::uuid[]) AS selected(student_id)
       ON CONFLICT (class_id, student_id) DO NOTHING`,
      [classRow.id, studentIds],
    );
    const job = await createMeetJobInTransaction(client, {
      classId: classRow.id,
      operation: 'create_meet_space',
      idempotencyKey: `class:${classRow.id}:create-meet-space`,
    });
    await client.query('COMMIT');
    console.info(JSON.stringify({
      component: 'class-service',
      operation: 'create_class',
      classId: classRow.id,
      stage: 'total',
      elapsedMilliseconds: Date.now() - startedAt,
      rosterCount: students.length,
    }));
    await enqueueMeetJob(job);
    return { class: classRow, subject, rosterCount: students.length, existing: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createMeetJobInTransaction(client, values) {
  const result = await client.query(
    `INSERT INTO meet_jobs (class_id, operation, idempotency_key, available_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key)
     DO UPDATE SET
       state = CASE
         WHEN meet_jobs.state IN ('succeeded', 'failed') THEN 'pending'
         ELSE meet_jobs.state
       END,
       available_at = CASE
         WHEN meet_jobs.state IN ('succeeded', 'failed') THEN EXCLUDED.available_at
         ELSE meet_jobs.available_at
       END,
       attempt_count = CASE
         WHEN meet_jobs.state IN ('succeeded', 'failed') THEN 0
         ELSE meet_jobs.attempt_count
       END,
       started_at = CASE
         WHEN meet_jobs.state IN ('succeeded', 'failed') THEN NULL
         ELSE meet_jobs.started_at
       END,
       completed_at = CASE
         WHEN meet_jobs.state IN ('succeeded', 'failed') THEN NULL
         ELSE meet_jobs.completed_at
       END,
       error_summary = CASE
         WHEN meet_jobs.state IN ('succeeded', 'failed') THEN NULL
         ELSE meet_jobs.error_summary
       END,
       updated_at = NOW()
     RETURNING *`,
    [values.classId, values.operation, values.idempotencyKey, values.availableAt || new Date()],
  );
  return result.rows[0];
}

async function updateClass({ facilitatorId, isAdmin, classId, input }) {
  requireUuid(classId, 'classId');
  const startedAt = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT * FROM classes
        WHERE id = $1
        FOR UPDATE`,
      [classId],
    );
    if (!current.rowCount) {
      const error = new Error('Class was not found');
      error.status = 404;
      throw error;
    }
    const row = current.rows[0];
    if (!isAdmin && row.facilitator_id !== facilitatorId) {
      const error = new Error('You do not own this class');
      error.status = 403;
      throw error;
    }
    if (!['creating', 'scheduled'].includes(row.status)) {
      const error = new Error('Only creating or scheduled classes can be edited');
      error.status = 409;
      throw error;
    }
    const { start, end } = validateSchedule(
      input.scheduledStartAt || row.scheduled_start_at,
      input.plannedEndAt || row.planned_end_at,
    );
    const threshold = validateThreshold(
      input.attendanceThresholdPercent,
      Number(row.attendance_threshold_percent),
    );
    const selectedIds = input.studentIds === undefined
      ? null
      : normalizeIds(input.studentIds);
    if (selectedIds && (!selectedIds.length || selectedIds.some((id) => !isUuid(id)))) {
      const error = new Error('studentIds must contain valid student UUIDs');
      error.status = 400;
      throw error;
    }
    if (input.subjectId !== undefined && input.subjectId !== row.subject_id) {
      const error = new Error('A class subject cannot be changed');
      error.status = 400;
      throw error;
    }
    if (selectedIds) {
      const students = await getEligibleStudents(client, row.subject_id, selectedIds);
      const existingRoster = await client.query(
        `SELECT student_id FROM class_students
          WHERE class_id = $1 AND roster_status = 'eligible'`,
        [classId],
      );
      const next = new Set(selectedIds);
      for (const existing of existingRoster.rows) {
        if (!next.has(existing.student_id)) {
          await client.query(
            `UPDATE class_students
                SET roster_status = 'removed', removed_at = NOW(), roster_reason = 'removed_by_facilitator'
              WHERE class_id = $1 AND student_id = $2`,
            [classId, existing.student_id],
          );
        }
      }
      const studentIds = students.map((student) => student.id);
      await client.query(
        `INSERT INTO class_students
           (class_id, student_id, source_subject_id, roster_status, removed_at)
         SELECT $1, student_id, $2, 'eligible', NULL
         FROM unnest($3::uuid[]) AS selected(student_id)
         ON CONFLICT (class_id, student_id)
         DO UPDATE SET roster_status = 'eligible', removed_at = NULL, roster_reason = NULL`,
        [classId, row.subject_id, studentIds],
      );
      await client.query(
        `INSERT INTO attendance (class_id, student_id)
         SELECT $1, student_id
         FROM unnest($2::uuid[]) AS selected(student_id)
         ON CONFLICT (class_id, student_id) DO NOTHING`,
        [classId, studentIds],
      );
    }
    const updated = await client.query(
      `UPDATE classes
          SET title = COALESCE($2, title),
              scheduled_start_at = $3,
              planned_end_at = $4,
              attendance_threshold_percent = $5,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [classId, input.title === undefined ? null : String(input.title).trim(), start, end, threshold],
    );
    await client.query('COMMIT');
    console.info(JSON.stringify({
      component: 'class-service',
      operation: 'update_class',
      classId,
      stage: 'database_transaction',
      elapsedMilliseconds: Date.now() - startedAt,
    }));
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function getJoinState(row, now = new Date()) {
  if (!row.meet_space_name || !row.meet_uri) return 'creating';
  if (['ending', 'sync_pending', 'processing'].includes(row.status)) return row.status;
  if (['ended', 'cancelled', 'failed'].includes(row.status)) return 'ended';
  if (now < new Date(row.scheduled_start_at)) return 'too_early';
  if (row.actual_end_at && now >= new Date(row.actual_end_at)) return 'ended';
  return 'joinable';
}

module.exports = {
  ONE_MINUTE_MS,
  createClass,
  updateClass,
  createMeetJobInTransaction,
  getJoinState,
  normalizeIds,
  requireUuid,
};
