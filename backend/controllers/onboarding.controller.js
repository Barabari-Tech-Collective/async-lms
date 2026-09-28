const serverError = require('../utils/serverError');
const pool = require('../config/pg');
const { logAction } = require('../utils/auditLogger');
const { notify } = require('../services/notificationService');

// 1. College Selection Step
exports.selectCollege = async (req, res) => {
  const userId = req.user.id;
  const { college_id } = req.body;

  if (!college_id) {
    return res.status(400).json({ message: 'college_id is required' });
  }

  try {
    const college = await pool.query('SELECT id FROM colleges WHERE id = $1', [
      college_id,
    ]);

    if (!college.rowCount) {
      return res.status(400).json({ message: 'Invalid college' });
    }

    await pool.query(
      `UPDATE student_profiles 
             SET college_id = $1 
             WHERE user_id = $2`,
      [college_id, userId],
    );

    await pool.query(
      `UPDATE users 
             SET onboarding_step = 'batch', updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
      [userId],
    );

    logAction({ req, action: 'UPDATE', entityType: 'student_profile', entityId: userId, details: { college_id } });
    res.json({ message: 'College added successfully', next_step: 'batch' });
  } catch (err) {
    console.error(err);
    serverError(res, err);
  }
};

// 2. Batch Details Step
exports.updateBatchDetails = async (req, res) => {
  const userId = req.user.id;
  const { degree, current_academic_year, expected_graduation_year } = req.body;

  if (!degree || !current_academic_year || !expected_graduation_year) {
    return res.status(400).json({ message: 'degree, current_academic_year, and expected_graduation_year are required' });
  }

  // Parse "1st year" → 1, "2nd year" → 2, etc.
  const year = parseInt(current_academic_year) || null;

  try {
    await pool.query(
      `UPDATE student_profiles
             SET degree = $1, current_academic_year = $2, expected_graduation_year = $3, year = $4
             WHERE user_id = $5`,
      [degree, current_academic_year, expected_graduation_year, year, userId],
    );

    await pool.query(
      `UPDATE users
             SET onboarding_step = 'program', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
      [userId],
    );

    logAction({ req, action: 'UPDATE', entityType: 'student_profile', entityId: userId, details: { degree, current_academic_year, expected_graduation_year } });
    res.json({ message: 'Batch details added', next_step: 'subject' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// 3. Subject Selection Step
exports.selectSubjects = async (req, res) => {
  const userId = req.user.id;
  const { subjectIds } = req.body;

  if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
    return res
      .status(400)
      .json({ message: 'Please select at least one subject' });
  }

  const existingRes = await pool.query(
    'SELECT id FROM subjects WHERE id = ANY($1::uuid[])',
    [subjectIds],
  );
  if (existingRes.rows.length !== subjectIds.length) {
    return res
      .status(400)
      .json({ message: 'One or more selected subjects do not exist' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertQuery = `
            INSERT INTO user_subjects (user_id, subject_id, started_at)
            SELECT $1, unnest($2::uuid[]), CURRENT_TIMESTAMP
            ON CONFLICT (user_id, subject_id) DO NOTHING
        `;
    await client.query(insertQuery, [userId, subjectIds]);

    // Seed progress for all subtopics:
    //  - Unlocked by default (peer-progression locking is not enforced yet)
    //  - Only locked if an admin explicitly locked it via cohort_admin_locks
    //  - ON CONFLICT: never re-lock a row that is already unlocked
    const seedProgressQuery = `
      WITH new_student_profile AS (
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
        WHERE t.subject_id = ANY($2::uuid[])
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
          WHEN al.is_locked = true THEN false   -- admin explicitly locked
          ELSE true                             -- unlocked by default; locking mechanism TBD
        END
      FROM subject_subtopics ss
      LEFT JOIN admin_locks al ON al.subtopic_id = ss.subtopic_id
      ON CONFLICT (user_id, subtopic_id) DO UPDATE
        SET is_unlocked = (user_subtopic_progress.is_unlocked OR EXCLUDED.is_unlocked);
    `;
    await client.query(seedProgressQuery, [userId, subjectIds]);

    await client.query(
      "UPDATE users SET onboarding_step = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [userId],
    );

    await client.query('COMMIT');

    logAction({ req, action: 'CREATE', entityType: 'user_subjects', entityId: userId, details: { subjectIds } });

    // Notify all facilitators assigned to this student's college (best-effort, after commit)
    try {
      const studentRes = await pool.query(
        `SELECT u.full_name, sp.college_id
         FROM users u JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = $1`,
        [userId],
      );
      const { full_name, college_id } = studentRes.rows[0] || {};
      if (college_id) {
        const facRes = await pool.query(
          `SELECT fc.facilitator_id FROM facilitator_colleges fc
           JOIN users u ON u.id = fc.facilitator_id
           WHERE fc.college_id = $1 AND u.is_verified = true AND fc.is_deleted = false`,
          [college_id],
        );
        await Promise.all(
          facRes.rows.map(({ facilitator_id }) =>
            notify({
              userId: facilitator_id,
              type: 'general',
              title: 'New student requires verification',
              body: `${full_name} has completed onboarding and is awaiting your verification.`,
              link: '/dashboard/facilitator/students',
            }),
          ),
        );
      }
    } catch (notifyErr) {
      console.error('[onboarding] facilitator notify failed:', notifyErr.message);
    }

    res.json({
      success: true,
      message: 'Learning path created!',
      next_step: 'dashboard',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Transaction Error:', err);
    res
      .status(500)
      .json({ message: 'Failed to save subjects' });
  } finally {
    client.release();
  }
};

// 4. Facilitator College & Subject Selection Step
exports.selectFacilitatorColleges = async (req, res) => {
  const userId = req.user.id;
  const { college_ids, subject_id, subject_ids } = req.body;

  if (!Array.isArray(college_ids) || college_ids.length === 0) {
    return res
      .status(400)
      .json({ message: 'At least one college must be selected' });
  }

  const chosenSubjectId = subject_id || (Array.isArray(subject_ids) && subject_ids.length > 0 ? subject_ids[0] : null);
  if (!chosenSubjectId) {
    return res
      .status(400)
      .json({ message: 'A subject must be selected' });
  }

  // Validate that the subject exists and is active/published
  const validSubject = await pool.query(
    'SELECT id FROM subjects WHERE id = $1 AND is_deleted = false AND is_published = true',
    [chosenSubjectId],
  );
  if (validSubject.rows.length === 0) {
    return res
      .status(400)
      .json({ message: 'Selected subject does not exist or is unavailable' });
  }

  // Deduplicate: ON CONFLICT DO UPDATE cannot affect the same row twice in one statement
  const uniqueCollegeIds = [...new Set(college_ids)];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Assign colleges
    await client.query(
      'UPDATE facilitator_colleges SET is_deleted = true WHERE facilitator_id = $1 AND is_deleted = false',
      [userId],
    );

    const insertCollegesQuery = `
      INSERT INTO facilitator_colleges (facilitator_id, college_id)
      SELECT $1, unnest($2::uuid[])
      ON CONFLICT (facilitator_id, college_id)
      DO UPDATE SET is_deleted = false, updated_at = CURRENT_TIMESTAMP
    `;
    await client.query(insertCollegesQuery, [userId, uniqueCollegeIds]);

    // 2. Assign subject
    await client.query(
      'UPDATE facilitator_subjects SET is_deleted = true WHERE facilitator_id = $1 AND is_deleted = false',
      [userId],
    );

    const insertSubjectQuery = `
      INSERT INTO facilitator_subjects (facilitator_id, subject_id)
      VALUES ($1, $2)
      ON CONFLICT (facilitator_id, subject_id)
      DO UPDATE SET is_deleted = false, updated_at = CURRENT_TIMESTAMP
    `;
    await client.query(insertSubjectQuery, [userId, chosenSubjectId]);

    // 3. Mark onboarding step as done
    await client.query(
      "UPDATE users SET onboarding_step = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [userId],
    );

    await client.query('COMMIT');
    logAction({
      req,
      action: 'UPDATE',
      entityType: 'facilitator_onboarding',
      entityId: userId,
      details: { college_ids: uniqueCollegeIds, subject_id: chosenSubjectId },
    });

    res.json({
      success: true,
      message: 'Colleges and subject assigned! Awaiting admin verification.',
      next_step: 'dashboard',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Facilitator Onboarding Error:', err);
    res
      .status(500)
      .json({ message: 'Failed to save onboarding selections' });
  } finally {
    client.release();
  }
};
