const crypto = require('crypto');
const pool = require('../config/pg');
const { enqueueMeetJob } = require('../services/meetQueue.service');
const { createMeetJob } = require('../services/meetJob.service');
const {
  createClass,
  updateClass,
  createMeetJobInTransaction,
  getJoinState,
  requireUuid,
} = require('../services/class.service');

function sendError(res, error) {
  console.error('[classes]', error);
  return res.status(error.status || 500).json({
    message: error.status ? error.message : 'Unable to process class request',
  });
}

function isAdmin(req) {
  return req.user?.role === 'admin';
}

function isFacilitator(req) {
  return req.user?.role === 'facilitator' || isAdmin(req);
}

function getPagination(req, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.parseInt(req.query.limit, 10) || defaultLimit),
  );
  return { page, limit, offset: (page - 1) * limit };
}

function pagination(page, limit, totalCount) {
  return {
    page,
    limit,
    totalCount: Number(totalCount),
    totalPages: Math.max(1, Math.ceil(Number(totalCount) / limit)),
  };
}

function safeClass(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    scheduledStartAt: row.scheduled_start_at,
    plannedEndAt: row.planned_end_at,
    actualEndAt: row.actual_end_at,
    attendanceThresholdPercent: Number(row.attendance_threshold_percent),
    status: row.status,
    hasMeetSpace: Boolean(row.meet_space_name && row.meet_uri),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

exports.create = async (req, res) => {
  if (!isFacilitator(req)) return res.status(403).json({ message: 'Facilitator access required' });
  const startedAt = Date.now();
  try {
    const result = await createClass({
      facilitatorId: req.user.id,
      isAdmin: isAdmin(req),
      input: req.body || {},
    });
    const response = {
      success: true,
      data: safeClass(result.class),
      message: result.existing ? 'Existing class returned' : 'Class created and Meet setup queued',
    };
    console.info(JSON.stringify({
      component: 'class-controller',
      operation: 'create_class',
      classId: result.class.id,
      stage: 'http_response',
      elapsedMilliseconds: Date.now() - startedAt,
    }));
    return res.status(result.existing ? 200 : 202).json(response);
  } catch (error) {
    return sendError(res, error);
  }
};

exports.update = async (req, res) => {
  if (!isFacilitator(req)) return res.status(403).json({ message: 'Facilitator access required' });
  const startedAt = Date.now();
  try {
    const result = await updateClass({
      facilitatorId: req.user.id,
      isAdmin: isAdmin(req),
      classId: req.params.id,
      input: req.body || {},
    });
    console.info(JSON.stringify({
      component: 'class-controller',
      operation: 'update_class',
      classId: req.params.id,
      stage: 'http_response',
      elapsedMilliseconds: Date.now() - startedAt,
    }));
    return res.json({ success: true, data: safeClass(result) });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getOne = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    requireUuid(req.params.id, 'classId');
    const result = await pool.query(
      `SELECT c.*, s.name AS subject_title,
              (SELECT COUNT(*)::int
                 FROM class_students cs
                WHERE cs.class_id = c.id
                  AND cs.roster_status = 'eligible') AS roster_count
         FROM classes c
         JOIN subjects s ON s.id = c.subject_id
        WHERE c.id = $1`,
      [req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Class was not found' });
    const row = result.rows[0];
    if (req.user?.role === 'facilitator' && row.facilitator_id !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this class' });
    }
    if (req.user?.role === 'student') {
      const enrollment = await pool.query(
        `SELECT 1 FROM class_students
          WHERE class_id = $1 AND student_id = $2 AND roster_status = 'eligible'`,
        [req.params.id, req.user.id],
      );
      if (!enrollment.rowCount) return res.status(403).json({ message: 'You are not enrolled in this class' });
    }
    const data = { ...safeClass(row), subjectTitle: row.subject_title, rosterCount: row.roster_count };
    if (isFacilitator(req)) {
      const { page, limit, offset } = getPagination(req);
      const roster = await pool.query(
        `SELECT cs.student_id, u.full_name, u.email, cs.roster_status,
                sgi.status AS meet_identity_status,
                COUNT(*) OVER ()::int AS total_count
           FROM class_students cs
           JOIN users u ON u.id = cs.student_id
           LEFT JOIN student_google_identities sgi
             ON sgi.student_id = cs.student_id
            AND sgi.status <> 'revoked'
          WHERE cs.class_id = $1
            AND cs.roster_status = 'eligible'
          ORDER BY u.full_name, cs.student_id
          LIMIT $2 OFFSET $3`,
        [req.params.id, limit, offset],
      );
      data.students = roster.rows.map((student) => ({
        studentId: student.student_id,
        fullName: student.full_name,
        email: student.email,
        rosterStatus: student.roster_status,
        meetIdentityStatus: student.meet_identity_status || null,
      }));
      return res.json({
        success: true,
        data,
        pagination: pagination(page, limit, roster.rows[0]?.total_count || 0),
      });
    }
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.listStudentClasses = async (req, res) => {
  if (req.user?.role !== 'student') return res.status(403).json({ message: 'Student access required' });
  try {
    const { page, limit, offset } = getPagination(req, 20);
    const result = await pool.query(
      `SELECT c.*, s.name AS subject_title, u.full_name AS facilitator_name,
              sgi.status AS identity_status,
              COUNT(*) OVER ()::int AS total_count
         FROM classes c
         JOIN class_students cs ON cs.class_id = c.id AND cs.roster_status = 'eligible'
         JOIN subjects s ON s.id = c.subject_id
         JOIN users u ON u.id = c.facilitator_id
         LEFT JOIN student_google_identities sgi
           ON sgi.student_id = cs.student_id AND sgi.status <> 'revoked'
        WHERE cs.student_id = $1
        ORDER BY c.scheduled_start_at DESC, c.id DESC
        LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset],
    );
    const totalCount = result.rows[0]?.total_count || 0;
    return res.json({
      success: true,
      data: result.rows.map((row) => {
        const joinState = getJoinState(row);
        return {
          ...safeClass(row),
          subjectTitle: row.subject_title,
          facilitatorName: row.facilitator_name,
          meetIdentityStatus: row.identity_status || null,
          joinState,
          canJoin: joinState === 'joinable' && row.identity_status === 'verified',
        };
      }),
      pagination: pagination(page, limit, totalCount),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.listClasses = async (req, res) => {
  if (!isFacilitator(req)) return res.status(403).json({ message: 'Facilitator access required' });
  try {
    const { page, limit, offset } = getPagination(req, 15);
    const statusFilter = String(req.query.status || '').trim().toLowerCase();
    const params = [];
    let ownerClause = '';
    if (!isAdmin(req)) {
      params.push(req.user.id);
      ownerClause = 'AND c.facilitator_id = $1';
    }
    let statusClause = '';
    if (statusFilter === 'upcoming') {
      statusClause = `AND c.status IN ('creating', 'scheduled', 'active', 'ending')`;
    } else if (statusFilter === 'past') {
      statusClause = `AND c.status IN ('ended', 'sync_pending', 'processing', 'ready_for_review', 'finalised', 'cleanup_pending', 'end_unknown', 'cancelled', 'failed')`;
    } else if (statusFilter && statusFilter !== 'all') {
      return res.status(400).json({ message: 'status must be upcoming, past, or all' });
    }
    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT c.*, s.name AS subject_title,
              COUNT(*) OVER ()::int AS total_count
         FROM classes c
         JOIN subjects s ON s.id = c.subject_id
        WHERE true
          ${ownerClause}
          ${statusClause}
        ORDER BY c.scheduled_start_at DESC, c.id DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      params,
    );
    const totalCount = result.rows[0]?.total_count || 0;
    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        ...safeClass(row),
        subjectTitle: row.subject_title,
      })),
      pagination: pagination(page, limit, totalCount),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.listClassStudents = async (req, res) => {
  if (!isFacilitator(req)) return res.status(403).json({ message: 'Facilitator access required' });
  try {
    requireUuid(req.query.subjectId, 'subjectId');
    const { page, limit, offset } = getPagination(req, 50);
    const search = String(req.query.search || '').trim();
    const params = [req.query.subjectId];
    let facilitatorClause = '';
    if (!isAdmin(req)) {
      params.push(req.user.id);
      facilitatorClause = `AND EXISTS (
        SELECT 1
          FROM facilitator_subjects fs
         WHERE fs.subject_id = us.subject_id
           AND fs.facilitator_id = $${params.length}
           AND fs.is_deleted = false
      )`;
    }
    params.push(`%${search}%`, limit, offset);
    const searchIndex = params.length - 2;
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email,
              COUNT(*) OVER ()::int AS total_count
         FROM users u
         JOIN user_subjects us ON us.user_id = u.id
        WHERE us.subject_id = $1
          AND u.deleted_at IS NULL
          AND (u.full_name ILIKE $${searchIndex} OR u.email ILIKE $${searchIndex})
          ${facilitatorClause}
        ORDER BY u.full_name, u.id
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const totalCount = result.rows[0]?.total_count || 0;
    return res.json({
      success: true,
      data: result.rows.map(({ id, full_name, email }) => ({
        studentId: id,
        fullName: full_name,
        email,
      })),
      pagination: pagination(page, limit, totalCount),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.join = async (req, res) => {
  if (req.user?.role !== 'student') return res.status(403).json({ message: 'Student access required' });
  try {
    requireUuid(req.params.id, 'classId');
    const result = await pool.query(
      `SELECT c.*, cs.roster_status, sgi.status AS identity_status
         FROM classes c
         JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = $2
         LEFT JOIN student_google_identities sgi
           ON sgi.student_id = $2 AND sgi.status <> 'revoked'
        WHERE c.id = $1`,
      [req.params.id, req.user.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Class was not found or you are not enrolled' });
    const row = result.rows[0];
    const joinState = getJoinState(row);
    if (joinState !== 'joinable') return res.status(409).json({ message: `Class is ${joinState}`, joinState });
    if (row.roster_status !== 'eligible') return res.status(403).json({ message: 'You are not eligible for this class' });
    if (row.identity_status !== 'verified') return res.status(403).json({ message: 'Link and verify your Meet account before joining' });

    const rawTicket = crypto.randomBytes(32).toString('base64url');
    const ticketHash = crypto.createHash('sha256').update(rawTicket).digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const ticket = await pool.query(
      `INSERT INTO class_access_tickets
         (class_id, student_id, ticket_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.params.id, req.user.id, ticketHash, expiresAt],
    );
    await pool.query(
      `INSERT INTO class_access_events
         (class_id, student_id, ticket_id, event_type, request_id, ip_address, user_agent)
       VALUES ($1, $2, $3, 'issued', $4, $5, $6)`,
      [req.params.id, req.user.id, ticket.rows[0].id, req.id || null, req.ip || null, req.get('user-agent') || null],
    );
    const base = `${req.protocol}://${req.get('host')}`;
    return res.status(201).json({
      success: true,
      data: { accessUrl: `${base}/api/v1/classes/${req.params.id}/access/${rawTicket}` },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.facilitatorAccess = async (req, res) => {
  if (!isFacilitator(req)) return res.status(403).json({ message: 'Facilitator access required' });
  try {
    requireUuid(req.params.id, 'classId');
    const result = await pool.query(
      `SELECT facilitator_id, meet_uri, status
         FROM classes
        WHERE id = $1`,
      [req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Class was not found' });
    const row = result.rows[0];
    if (!isAdmin(req) && row.facilitator_id !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this class' });
    }
    if (!row.meet_uri || ['cancelled', 'failed'].includes(row.status)) {
      return res.status(409).json({ message: 'Meet is not available for this class' });
    }
    return res.redirect(303, row.meet_uri);
  } catch (error) {
    return sendError(res, error);
  }
};

exports.access = async (req, res) => {
  try {
    const hash = crypto.createHash('sha256').update(String(req.params.ticket || '')).digest('hex');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT t.*, c.meet_uri, c.status AS class_status
           FROM class_access_tickets t
           JOIN classes c ON c.id = t.class_id
          WHERE t.ticket_hash = $1
          FOR UPDATE`,
        [hash],
      );
      if (!result.rowCount) throw Object.assign(new Error('Access ticket is invalid'), { status: 404 });
      const ticket = result.rows[0];
      if (ticket.state !== 'issued' || new Date(ticket.expires_at) <= new Date() ||
          !['scheduled', 'active'].includes(ticket.class_status)) {
        await client.query(
          `UPDATE class_access_tickets SET state = 'rejected', rejection_reason = 'invalid_or_expired' WHERE id = $1`,
          [ticket.id],
        );
        throw Object.assign(new Error('Access ticket is expired or no longer valid'), { status: 410 });
      }
      await client.query(
        `UPDATE class_access_tickets
            SET state = 'consumed', consumed_at = NOW()
          WHERE id = $1`,
        [ticket.id],
      );
      await client.query(
        `INSERT INTO class_access_events (class_id, student_id, ticket_id, event_type)
         VALUES ($1, $2, $3, 'consumed')`,
        [ticket.class_id, ticket.student_id, ticket.id],
      );
      await client.query('COMMIT');
      return res.redirect(303, ticket.meet_uri);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return sendError(res, error);
  }
};

exports.end = async (req, res) => {
  if (!isFacilitator(req)) return res.status(403).json({ message: 'Facilitator access required' });
  const startedAt = Date.now();
  try {
    requireUuid(req.params.id, 'classId');
    const client = await pool.connect();
    let job;
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM classes WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!result.rowCount) throw Object.assign(new Error('Class was not found'), { status: 404 });
      const row = result.rows[0];
      if (!isAdmin(req) && row.facilitator_id !== req.user.id) throw Object.assign(new Error('You do not own this class'), { status: 403 });
      if (['ended', 'sync_pending', 'processing'].includes(row.status)) {
        await client.query('COMMIT');
        console.info(JSON.stringify({
          component: 'class-controller',
          operation: 'end_class',
          classId: req.params.id,
          stage: 'http_response',
          elapsedMilliseconds: Date.now() - startedAt,
          alreadyEnding: true,
        }));
        return res.json({ success: true, data: safeClass(row), message: 'Class is already ending or ended' });
      }
      if (!['scheduled', 'active', 'ending'].includes(row.status)) throw Object.assign(new Error('Class cannot be ended in its current state'), { status: 409 });
      await client.query(`UPDATE classes SET status = 'ending', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      job = await createMeetJobInTransaction(client, {
        classId: req.params.id,
        operation: 'end_meet_space',
        idempotencyKey: `class:${req.params.id}:end-meet-space`,
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await enqueueMeetJob(job);
    console.info(JSON.stringify({
      component: 'class-controller',
      operation: 'end_class',
      classId: req.params.id,
      stage: 'http_response',
      elapsedMilliseconds: Date.now() - startedAt,
    }));
    return res.status(202).json({ success: true, message: 'Class ending queued' });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.sync = async (req, res) => {
  if (!isFacilitator(req)) return res.status(403).json({ message: 'Facilitator access required' });
  const startedAt = Date.now();
  try {
    requireUuid(req.params.id, 'classId');
    const result = await pool.query('SELECT * FROM classes WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Class was not found' });
    const row = result.rows[0];
    if (!isAdmin(req) && row.facilitator_id !== req.user.id) return res.status(403).json({ message: 'You do not own this class' });
    if (!['sync_pending', 'failed'].includes(row.status)) {
      return res.status(409).json({
        message: row.status === 'ended' || row.status === 'finalised'
          ? 'Attendance is already completed and cannot be resynchronized'
          : 'Class is not ready for attendance synchronization',
      });
    }
    const job = await createMeetJob({
      classId: req.params.id,
      operation: 'sync_meet_sessions',
      idempotencyKey: row.status === 'failed'
        ? `class:${req.params.id}:sync-meet-sessions:retry:${Date.now()}`
        : `class:${req.params.id}:sync-meet-sessions`,
    });
    await enqueueMeetJob(job);
    console.info(JSON.stringify({
      component: 'class-controller',
      operation: 'sync_attendance',
      classId: req.params.id,
      stage: 'http_response',
      elapsedMilliseconds: Date.now() - startedAt,
    }));
    return res.status(202).json({ success: true, message: 'Attendance synchronization queued' });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.attendance = async (req, res) => {
  const startedAt = Date.now();
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user?.role === 'student') {
      return res.status(403).json({
        message: 'Students must access their attendance via the individual student endpoint',
      });
    }
    if (!['facilitator', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Attendance access required' });
    }
    requireUuid(req.params.id, 'classId');
    const classResult = await pool.query(
      `SELECT facilitator_id, status FROM classes WHERE id = $1`,
      [req.params.id],
    );
    if (!classResult.rowCount) return res.status(404).json({ message: 'Class was not found' });
    if (req.user.role === 'facilitator' && classResult.rows[0].facilitator_id !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this class' });
    }
    const status = classResult.rows[0].status;
    if (['ending', 'sync_pending', 'processing'].includes(status)) {
      console.info(JSON.stringify({
        component: 'class-controller',
        operation: 'read_attendance',
        classId: req.params.id,
        stage: 'not_ready_response',
        elapsedMilliseconds: Date.now() - startedAt,
        status,
      }));
      return res.status(202).json({
        success: true,
        ready: false,
        status,
        message: 'Attendance synchronization is still in progress',
        data: { attendance: [], anonymousUsers: [] },
      });
    }
    if (status !== 'ended') {
      return res.status(409).json({
        success: false,
        ready: false,
        status,
        message: 'Attendance is not available for this class state',
      });
    }
    const { page, limit, offset } = getPagination(req, 25);
    const [result, sessions] = await Promise.all([
      pool.query(
        `SELECT a.id, a.class_id, a.student_id, a.attended_minutes,
                a.attendance_percentage, a.attendance_status, a.calculated_at,
                a.updated_at, u.full_name, u.email,
                COUNT(*) OVER ()::int AS total_count
           FROM attendance a
           JOIN users u ON u.id = a.student_id
          WHERE a.class_id = $1
          ORDER BY u.full_name, a.student_id
          LIMIT $2 OFFSET $3`,
        [req.params.id, limit, offset],
      ),
      pool.query(
        `WITH anonymous_sessions AS (
          SELECT participant_type,
                 meet_user_id,
                 joined_at,
                 left_at,
                 COALESCE(
                   CASE
                     WHEN participant_name ILIKE 'conferenceRecords/%' THEN NULL
                     ELSE NULLIF(participant_name, participant_session_name)
                   END,
                   raw_participant_data->'signedinUser'->>'displayName',
                   raw_participant_data->'anonymousUser'->>'displayName',
                   raw_participant_data->'phoneUser'->>'displayName',
                   'Anonymous participant'
                 ) AS display_name
            FROM meet_sessions
           WHERE class_id = $1
             AND matched_student_id IS NULL
        ),
        grouped_anonymous_users AS (
          SELECT MAX(display_name) AS display_name,
                 (ARRAY_AGG(participant_type ORDER BY joined_at))[1] AS participant_type,
                 MIN(joined_at) AS joined_at,
                 MAX(left_at) AS left_at
            FROM anonymous_sessions
           GROUP BY COALESCE(
             'meet-user:' || meet_user_id,
             'display-name:' || LOWER(TRIM(display_name))
           )
        )
        SELECT participant_type, joined_at, left_at, display_name,
               COUNT(*) OVER ()::int AS total_count
          FROM grouped_anonymous_users
         ORDER BY joined_at, display_name
         LIMIT $2 OFFSET $3`,
        [req.params.id, limit, offset],
      ),
    ]);
    const totalCount = result.rows[0]?.total_count || 0;
    const attendance = result.rows.map(({ total_count, ...row }) => row);
    const sessionTotalCount = sessions.rows[0]?.total_count || 0;
    const anonymousUsers = sessions.rows.map(({ total_count, ...row }) => ({
      participantType: row.participant_type,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
      displayName: row.display_name,
    }));
    const response = {
      success: true,
      ready: true,
      status,
      data: {
        attendance,
        anonymousUsers,
      },
      pagination: {
        attendance: pagination(page, limit, totalCount),
        anonymousUsers: pagination(page, limit, sessionTotalCount),
      },
    };
    console.info(JSON.stringify({
      component: 'class-controller',
      operation: 'read_attendance',
      classId: req.params.id,
      stage: 'http_response',
      elapsedMilliseconds: Date.now() - startedAt,
      attendanceCount: attendance.length,
      anonymousUserCount: anonymousUsers.length,
    }));
    return res.json(response);
  } catch (error) {
    return sendError(res, error);
  }
};

exports.studentAttendance = async (req, res) => {
  const startedAt = Date.now();
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    requireUuid(req.params.id, 'classId');
    const targetStudentId = req.params.studentId === 'me'
      ? req.user.id
      : req.params.studentId;
    requireUuid(targetStudentId, 'studentId');

    if (!['student', 'facilitator', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Attendance access required' });
    }
    if (req.user.role === 'student' && req.user.id !== targetStudentId) {
      return res.status(403).json({ message: 'Students can only view their own attendance' });
    }

    const classResult = await pool.query(
      `SELECT id, title, facilitator_id, scheduled_start_at, planned_end_at,
              actual_end_at, attendance_threshold_percent, status
         FROM classes
        WHERE id = $1`,
      [req.params.id],
    );
    if (!classResult.rowCount) return res.status(404).json({ message: 'Class was not found' });
    const classRow = classResult.rows[0];
    if (req.user.role === 'facilitator' && classRow.facilitator_id !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this class' });
    }

    const status = classRow.status;
    if (['ending', 'sync_pending', 'processing'].includes(status)) {
      console.info(JSON.stringify({
        component: 'class-controller',
        operation: 'read_student_attendance',
        classId: req.params.id,
        studentId: targetStudentId,
        stage: 'not_ready_response',
        elapsedMilliseconds: Date.now() - startedAt,
        status,
      }));
      return res.status(202).json({
        success: true,
        ready: false,
        status,
        message: 'Attendance synchronization is still in progress',
        data: { class: safeClass(classRow), student: null, summary: null, sessions: [] },
      });
    }
    if (status !== 'ended') {
      return res.status(409).json({
        success: false,
        ready: false,
        status,
        message: 'Attendance is not available for this class state',
      });
    }

    const attendanceResult = await pool.query(
      `SELECT a.student_id, a.attended_minutes, a.attendance_percentage,
              a.attendance_status, a.calculated_at,
              u.full_name, u.email,
              cs.roster_status
         FROM class_students cs
         JOIN users u ON u.id = cs.student_id
         LEFT JOIN attendance a
           ON a.class_id = cs.class_id
          AND a.student_id = cs.student_id
        WHERE cs.class_id = $1
          AND cs.student_id = $2
          AND cs.roster_status = 'eligible'`,
      [req.params.id, targetStudentId],
    );
    if (!attendanceResult.rowCount) {
      return res.status(404).json({ message: 'Student is not enrolled in this class' });
    }

    const { page, limit, offset } = getPagination(req, 50);
    const sessionsResult = await pool.query(
      `SELECT joined_at, left_at, COUNT(*) OVER ()::int AS total_count
         FROM meet_sessions
        WHERE class_id = $1
          AND matched_student_id = $2
        ORDER BY joined_at ASC, id
        LIMIT $3 OFFSET $4`,
      [req.params.id, targetStudentId, limit, offset],
    );
    const totalCount = sessionsResult.rows[0]?.total_count || 0;
    const attendanceRow = attendanceResult.rows[0];
    const sessions = sessionsResult.rows.map(({ total_count, ...session }, index) => {
      const joinedAt = new Date(session.joined_at);
      const leftAt = session.left_at ? new Date(session.left_at) : null;
      const durationMinutes = leftAt
        ? Number(((leftAt.getTime() - joinedAt.getTime()) / 60000).toFixed(2))
        : null;
      return {
        sessionIndex: (page - 1) * limit + index + 1,
        joinedAt: session.joined_at,
        leftAt: session.left_at,
        durationMinutes,
      };
    });

    console.info(JSON.stringify({
      component: 'class-controller',
      operation: 'read_student_attendance',
      classId: req.params.id,
      studentId: targetStudentId,
      stage: 'http_response',
      elapsedMilliseconds: Date.now() - startedAt,
      sessionCount: sessions.length,
    }));
    return res.json({
      success: true,
      ready: true,
      status,
      data: {
        class: {
          id: classRow.id,
          title: classRow.title,
          scheduledStartAt: classRow.scheduled_start_at,
          plannedEndAt: classRow.planned_end_at,
          actualEndAt: classRow.actual_end_at,
          attendanceThresholdPercent: Number(classRow.attendance_threshold_percent),
        },
        student: {
          id: attendanceRow.student_id,
          fullName: attendanceRow.full_name,
          email: attendanceRow.email,
        },
        summary: {
          attendedMinutes: attendanceRow.attended_minutes === null
            ? null
            : Number(attendanceRow.attended_minutes),
          attendancePercentage: attendanceRow.attendance_percentage === null
            ? null
            : Number(attendanceRow.attendance_percentage),
          attendanceStatus: attendanceRow.attendance_status,
          calculatedAt: attendanceRow.calculated_at,
        },
        sessions,
      },
      pagination: pagination(page, limit, totalCount),
    });
  } catch (error) {
    return sendError(res, error);
  }
};
