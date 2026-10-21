'use strict';

const pool = require('../config/pg');
const { notify } = require('./notificationService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(val) {
  return typeof val === 'string' && UUID_RE.test(val);
}

/**
 * Service to manage student course enrollments, requests, approvals, and revocations.
 */

/**
 * Transactional enrollment helper:
 * 1. Inserts into user_subjects
 * 2. Seeds user_subtopic_progress respecting cohort_admin_locks
 * 3. Resolves any active pending request in enrollment_requests
 */
async function enrollStudentInSubject(client, { userId, subjectId, reviewerId = null, notifyStudent = true }) {
  if (!isValidUUID(userId) || !isValidUUID(subjectId)) {
    const err = new Error('Invalid userId or subjectId format');
    err.statusCode = 400;
    throw err;
  }

  const safeReviewerId = isValidUUID(reviewerId) ? reviewerId : null;

  let shouldRelease = false;
  let managedClient = client;

  if (!managedClient) {
    managedClient = await pool.connect();
    shouldRelease = true;
    await managedClient.query('BEGIN');
  }

  try {
    // 1. Insert enrollment (idempotent)
    await managedClient.query(
      `INSERT INTO user_subjects (user_id, subject_id, started_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, subject_id) DO NOTHING`,
      [userId, subjectId],
    );

    // 2. Seed subtopic progress respecting cohort_admin_locks
    await managedClient.query(
      `WITH new_student_profile AS (
        SELECT college_id, year FROM student_profiles WHERE user_id = $1
      ),
      subject_subtopics AS (
        SELECT
          st.id AS subtopic_id,
          DENSE_RANK() OVER (
            PARTITION BY t.subject_id
            ORDER BY t.order_index, u.order_index
          ) AS unit_rn
        FROM topics t
        INNER JOIN units u ON u.topic_id = t.id
        INNER JOIN subtopics st ON st.unit_id = u.id
        WHERE t.subject_id = $2
      ),
      admin_locks AS (
        SELECT cal.subtopic_id, cal.is_locked
        FROM cohort_admin_locks cal
        CROSS JOIN new_student_profile nsp
        WHERE cal.college_id = nsp.college_id
          AND cal.year = nsp.year
      )
      INSERT INTO user_subtopic_progress (user_id, subtopic_id, is_unlocked)
      SELECT $1, ss.subtopic_id,
        CASE
          WHEN al.is_locked = true THEN false
          ELSE true
        END
      FROM subject_subtopics ss
      LEFT JOIN admin_locks al ON al.subtopic_id = ss.subtopic_id
      ON CONFLICT (user_id, subtopic_id)
        DO UPDATE SET is_unlocked = (user_subtopic_progress.is_unlocked OR EXCLUDED.is_unlocked)`,
      [userId, subjectId],
    );

    // 3. Resolve any existing pending request for this user and course
    await managedClient.query(
      `UPDATE enrollment_requests
       SET status = 'approved',
           reviewed_by = $3,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1 AND subject_id = $2 AND status = 'pending'`,
      [userId, subjectId, safeReviewerId],
    );

    if (shouldRelease) {
      await managedClient.query('COMMIT');
    }

    // Direct enrollment: Notify student if requested (e.g. not called from review request)
    if (notifyStudent) {
      try {
        const subInfo = await pool.query(
          `SELECT name FROM subjects WHERE id = $1`,
          [subjectId],
        );
        const courseName = subInfo.rows[0]?.name || 'a new course';
        await notify({
          userId,
          type: 'achievement',
          title: 'New Course Enrolled',
          body: `You have been enrolled in ${courseName}. You can now begin your lessons!`,
          link: `/dashboard/student/courses/${subjectId}`,
        });
      } catch (notifErr) {
        console.warn('[enrollStudentInSubject] Notification dispatch notice:', notifErr.message);
      }
    }

    return true;
  } catch (err) {
    if (shouldRelease) {
      await managedClient.query('ROLLBACK');
    }
    throw err;
  } finally {
    if (shouldRelease) {
      managedClient.release();
    }
  }
}

/**
 * Remove a student from a subject with certificate / completion safety guard
 */
async function removeStudentFromSubject({ userId, subjectId, force = false }) {
  if (!isValidUUID(userId) || !isValidUUID(subjectId)) {
    const err = new Error('Invalid userId or subjectId format');
    err.statusCode = 400;
    throw err;
  }

  // Check if enrolled and whether already completed with a certificate
  const checkRes = await pool.query(
    `SELECT is_completed, certificate_id, completed_at 
     FROM user_subjects 
     WHERE user_id = $1 AND subject_id = $2`,
    [userId, subjectId],
  );

  if (checkRes.rows.length === 0) {
    const err = new Error('Student is not enrolled in this course');
    err.statusCode = 404;
    throw err;
  }

  const enrollment = checkRes.rows[0];
  if ((enrollment.is_completed || enrollment.certificate_id) && !force) {
    const err = new Error(
      'Cannot revoke a course that the student has already completed with an issued certificate. Pass force=true to override.',
    );
    err.statusCode = 400;
    err.isCompleted = true;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete from user_subjects
    await client.query(
      `DELETE FROM user_subjects WHERE user_id = $1 AND subject_id = $2`,
      [userId, subjectId],
    );

    // Clean up any pending request so it does not linger in review queues
    await client.query(
      `DELETE FROM enrollment_requests WHERE user_id = $1 AND subject_id = $2 AND status = 'pending'`,
      [userId, subjectId],
    );

    await client.query('COMMIT');
  } catch (txErr) {
    await client.query('ROLLBACK');
    throw txErr;
  } finally {
    client.release();
  }

  // Send notification to student (non-critical)
  try {
    const subjectRes = await pool.query(`SELECT name FROM subjects WHERE id = $1`, [subjectId]);
    const subjectName = subjectRes.rows[0]?.name || 'Course';

    await notify({
      userId,
      type: 'general',
      title: 'Course Access Revoked',
      body: `Your access to ${subjectName} has been revoked by an instructor/admin.`,
      link: '/dashboard/student',
    });
  } catch (notifErr) {
    console.warn('[removeStudentFromSubject] Notification dispatch notice:', notifErr.message);
  }

  return { success: true, message: `Access to course revoked successfully` };
}

/**
 * Get published subjects that a student is NOT currently enrolled in
 */
async function getAvailableCoursesForStudent({ userId, allowedSubjectIds = null }) {
  if (!isValidUUID(userId)) {
    const err = new Error('Invalid userId format');
    err.statusCode = 400;
    throw err;
  }

  let query = `
    SELECT s.id, s.name, s.slug, s.description
    FROM subjects s
    WHERE s.is_published = true 
      AND s.is_deleted = false
      AND s.id NOT IN (
        SELECT us.subject_id FROM user_subjects us WHERE us.user_id = $1
      )
  `;
  const params = [userId];

  if (Array.isArray(allowedSubjectIds) && allowedSubjectIds.length > 0) {
    params.push(allowedSubjectIds);
    query += ` AND s.id = ANY($2::uuid[])`;
  } else if (allowedSubjectIds !== null) {
    // If an empty array was explicitly passed for a facilitator, they have no assigned subjects
    return [];
  }

  query += ` ORDER BY s.name ASC`;
  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Student requests enrollment in an additional subject
 */
async function requestEnrollment({ userId, subjectId }) {
  if (!isValidUUID(userId) || !isValidUUID(subjectId)) {
    const err = new Error('Invalid userId or subjectId format');
    err.statusCode = 400;
    throw err;
  }

  // 1. Verify subject exists and is active
  const subRes = await pool.query(
    `SELECT id, name FROM subjects WHERE id = $1 AND is_published = true AND is_deleted = false`,
    [subjectId],
  );
  if (subRes.rows.length === 0) {
    const err = new Error('Course not found or is no longer available');
    err.statusCode = 404;
    throw err;
  }
  const subjectName = subRes.rows[0].name;

  // 2. Check if already enrolled
  const enrolledRes = await pool.query(
    `SELECT 1 FROM user_subjects WHERE user_id = $1 AND subject_id = $2`,
    [userId, subjectId],
  );
  if (enrolledRes.rows.length > 0) {
    const err = new Error('You are already enrolled in this course');
    err.statusCode = 409;
    throw err;
  }

  // 3. Check for existing pending request (guaranteed by partial unique index)
  const existingPending = await pool.query(
    `SELECT id, created_at FROM enrollment_requests WHERE user_id = $1 AND subject_id = $2 AND status = 'pending'`,
    [userId, subjectId],
  );
  if (existingPending.rows.length > 0) {
    const err = new Error('You already have a pending enrollment request for this course');
    err.statusCode = 409;
    throw err;
  }

  // 4. Insert new pending request (guarded against concurrent inserts by unique partial index)
  let insertRes;
  try {
    insertRes = await pool.query(
      `INSERT INTO enrollment_requests (user_id, subject_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [userId, subjectId],
    );
  } catch (insertErr) {
    if (insertErr.code === '23505') {
      const err = new Error('You already have a pending enrollment request for this course');
      err.statusCode = 409;
      throw err;
    }
    throw insertErr;
  }

  // 5. Notify facilitators of that college & subject (or fallback to admins if unassigned)
  try {
    const userProfileRes = await pool.query(
      `SELECT u.full_name, sp.college_id 
       FROM users u 
       LEFT JOIN student_profiles sp ON sp.user_id = u.id 
       WHERE u.id = $1`,
      [userId],
    );
    const studentName = userProfileRes.rows[0]?.full_name || 'A student';
    const collegeId = userProfileRes.rows[0]?.college_id;

    if (collegeId) {
      const facRes = await pool.query(
        `SELECT DISTINCT fc.facilitator_id
         FROM facilitator_colleges fc
         JOIN facilitator_subjects fs ON fs.facilitator_id = fc.facilitator_id
         WHERE fc.college_id = $1 AND fs.subject_id = $2 AND fc.is_deleted = false AND fs.is_deleted = false`,
        [collegeId, subjectId],
      );

      if (facRes.rows.length > 0) {
        for (const fac of facRes.rows) {
          await notify({
            userId: fac.facilitator_id,
            type: 'general',
            title: 'New Course Enrollment Request',
            body: `${studentName} requested enrollment in ${subjectName}.`,
            link: '/dashboard/facilitator/requests',
          });
        }
      } else {
        // Fallback: Notify admins if no facilitator is assigned
        const adminRes = await pool.query(
          `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.role_key = 'ADMIN' AND u.deleted_at IS NULL LIMIT 5`,
        );
        for (const adm of adminRes.rows) {
          await notify({
            userId: adm.id,
            type: 'general',
            title: 'New Course Enrollment Request (Unassigned)',
            body: `${studentName} requested enrollment in ${subjectName} (No facilitator assigned).`,
            link: '/dashboard/admin/requests',
          });
        }
      }
    }
  } catch (notifErr) {
    console.warn('[requestEnrollment] Notification dispatch warning:', notifErr.message);
  }

  return insertRes.rows[0];
}

/**
 * Review (approve or reject) an enrollment request with optimistic concurrency
 */
async function reviewEnrollmentRequest({
  requestId,
  reviewerId,
  status,
  rejectionReason = null,
  allowedCollegeIds = null,
  allowedSubjectIds = null,
  isAdmin = false,
}) {
  if (!isValidUUID(requestId)) {
    const err = new Error('Invalid requestId format');
    err.statusCode = 400;
    throw err;
  }

  if (!['approved', 'rejected'].includes(status)) {
    const err = new Error('Status must be either approved or rejected');
    err.statusCode = 400;
    throw err;
  }

  // 1. Fetch request details with student college and subject status
  const reqCheck = await pool.query(
    `SELECT er.id, er.user_id, er.subject_id, er.status,
            sp.college_id, u.full_name AS student_name, s.name AS subject_name,
            s.is_published, s.is_deleted
     FROM enrollment_requests er
     JOIN users u ON er.user_id = u.id
     JOIN subjects s ON er.subject_id = s.id
     LEFT JOIN student_profiles sp ON er.user_id = sp.user_id
     WHERE er.id = $1`,
    [requestId],
  );

  if (reqCheck.rows.length === 0) {
    const err = new Error('Enrollment request not found');
    err.statusCode = 404;
    throw err;
  }

  const reqItem = reqCheck.rows[0];

  if (reqItem.status !== 'pending') {
    const err = new Error(`Request has already been ${reqItem.status}`);
    err.statusCode = 409;
    throw err;
  }

  // 2. Facilitator scoping check
  if (!isAdmin) {
    const hasCollegeAccess =
      Array.isArray(allowedCollegeIds) && allowedCollegeIds.includes(reqItem.college_id);
    const hasSubjectAccess =
      Array.isArray(allowedSubjectIds) && allowedSubjectIds.includes(reqItem.subject_id);

    if (!hasCollegeAccess || !hasSubjectAccess) {
      const err = new Error('You do not have permission to review requests for this student or course');
      err.statusCode = 403;
      throw err;
    }
  }

  // 3. Subject availability validation on approval
  if (status === 'approved' && (!reqItem.is_published || reqItem.is_deleted)) {
    const err = new Error('This course is unpublished or deleted and cannot be approved');
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 4. Optimistic lock update on enrollment_requests
    const updateRes = await client.query(
      `UPDATE enrollment_requests
       SET status = $1,
           rejection_reason = $2,
           reviewed_by = $3,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4 AND status = 'pending'
       RETURNING *`,
      [status, status === 'rejected' ? rejectionReason : null, reviewerId, requestId],
    );

    if (updateRes.rows.length === 0) {
      await client.query('ROLLBACK');
      const err = new Error('Request has already been reviewed by another instructor or admin');
      err.statusCode = 409;
      throw err;
    }

    // 5. If approved, execute transactional student enrollment + progress seeding
    if (status === 'approved') {
      await enrollStudentInSubject(client, {
        userId: reqItem.user_id,
        subjectId: reqItem.subject_id,
        reviewerId,
        notifyStudent: false, // Prevents duplicate notification since review sends specific approval notice below
      });
    }

    await client.query('COMMIT');

    // 6. Notify student of outcome
    const notifTitle =
      status === 'approved'
        ? `Enrollment Approved: ${reqItem.subject_name}`
        : `Enrollment Request Update: ${reqItem.subject_name}`;
    const notifBody =
      status === 'approved'
        ? `Your request to enroll in ${reqItem.subject_name} was approved! You can now start learning.`
        : `Your request to enroll in ${reqItem.subject_name} was not approved.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`;

    await notify({
      userId: reqItem.user_id,
      type: status === 'approved' ? 'achievement' : 'general',
      title: notifTitle,
      body: notifBody,
      link: status === 'approved' ? `/dashboard/student/courses/${reqItem.subject_id}` : '/dashboard/student',
    });

    return updateRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * List enrollment requests with filtering and pagination
 */
async function listEnrollmentRequests({
  status = 'pending',
  search = '',
  allowedCollegeIds = null,
  allowedSubjectIds = null,
  isAdmin = false,
  limit = 20,
  offset = 0,
}) {
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  let whereClauses = [];
  let params = [];
  let pIdx = 1;

  if (status && status !== 'all') {
    whereClauses.push(`er.status = $${pIdx++}`);
    params.push(status);
  }

  if (!isAdmin) {
    if (!Array.isArray(allowedCollegeIds) || allowedCollegeIds.length === 0 ||
        !Array.isArray(allowedSubjectIds) || allowedSubjectIds.length === 0) {
      return { requests: [], total: 0 };
    }
    whereClauses.push(`sp.college_id = ANY($${pIdx++}::uuid[])`);
    params.push(allowedCollegeIds);
    whereClauses.push(`er.subject_id = ANY($${pIdx++}::uuid[])`);
    params.push(allowedSubjectIds);
  }

  if (search && search.trim()) {
    whereClauses.push(`(u.full_name ILIKE $${pIdx} OR u.email ILIKE $${pIdx} OR s.name ILIKE $${pIdx})`);
    params.push(`%${search.trim()}%`);
    pIdx++;
  }

  const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM enrollment_requests er
     JOIN users u ON er.user_id = u.id
     JOIN subjects s ON er.subject_id = s.id
     LEFT JOIN student_profiles sp ON er.user_id = sp.user_id
     ${whereSQL}`,
    params,
  );
  const total = countRes.rows[0]?.total || 0;

  const dataParams = [...params, safeLimit, safeOffset];
  const dataRes = await pool.query(
    `SELECT er.id, er.user_id, er.subject_id, er.status, er.rejection_reason,
            er.created_at, er.reviewed_at,
            u.full_name AS student_name, u.email AS student_email,
            sp.degree, sp.year AS batch,
            c.id AS college_id, c.name AS college_name, c.short_code AS college_short_name,
            s.name AS subject_name, s.slug AS subject_slug,
            rev.full_name AS reviewer_name
     FROM enrollment_requests er
     JOIN users u ON er.user_id = u.id
     JOIN subjects s ON er.subject_id = s.id
     LEFT JOIN student_profiles sp ON er.user_id = sp.user_id
     LEFT JOIN colleges c ON sp.college_id = c.id
     LEFT JOIN users rev ON er.reviewed_by = rev.id
     ${whereSQL}
     ORDER BY er.created_at DESC
     LIMIT $${pIdx++} OFFSET $${pIdx++}`,
    dataParams,
  );

  return { requests: dataRes.rows, total };
}

module.exports = {
  enrollStudentInSubject,
  removeStudentFromSubject,
  getAvailableCoursesForStudent,
  requestEnrollment,
  reviewEnrollmentRequest,
  listEnrollmentRequests,
};
