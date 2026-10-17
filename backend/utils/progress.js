const pool = require('../config/pg');

/**
 * Calculates item-level completion progress for a user on a specific subject.
 * Returns total items count, completed items count, and overall progress percentage.
 * 
 * @param {string} userId - User ID (UUID)
 * @param {string} subjectId - Subject ID (UUID)
 * @returns {Promise<{total: number, completed: number, percent: number}>}
 */
exports.calculateSubjectProgress = async (userId, subjectId) => {
  if (!userId || !subjectId) {
    return { total: 0, completed: 0, percent: 0, is_completed: false, has_new_content: false, new_content_count: 0 };
  }

  // 1. Fast-Path O(1) Exit: Check existing enrollment state
  let storedPercent = 0;
  let isAlreadyCompleted = false;
  let certificateId = null;
  let completedAt = null;

  try {
    const enrollment = await pool.query(
      `SELECT progress_percent, COALESCE(is_completed, false) as is_completed, certificate_id, completed_at 
       FROM user_subjects 
       WHERE user_id = $1 AND subject_id = $2`,
      [userId, subjectId]
    );
    if (enrollment.rows.length > 0) {
      storedPercent = enrollment.rows[0].progress_percent || 0;
      isAlreadyCompleted = Boolean(enrollment.rows[0].is_completed);
      certificateId = enrollment.rows[0].certificate_id;
      completedAt = enrollment.rows[0].completed_at;
    }
  } catch (err) {
    console.warn('[Progress] Could not query user_subjects enrollment:', err.message);
  }

  const query = `
    WITH active_lessons AS (
      SELECT lc.id 
      FROM lesson_content lc
      JOIN subtopics st ON lc.subtopic_id = st.id AND st.is_deleted = false
      JOIN units u ON st.unit_id = u.id AND u.is_deleted = false
      JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
      WHERE t.subject_id = $2 AND lc.is_published = true AND lc.is_deleted = false
    ),
    active_quizzes AS (
      SELECT q.id
      FROM quizzes q
      JOIN units u ON q.unit_id = u.id AND u.is_deleted = false
      JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
      WHERE t.subject_id = $2 AND q.is_deleted = false
    ),
    active_exercises AS (
      SELECT e.id
      FROM exercises e
      JOIN subtopics st ON e.subtopic_id = st.id AND st.is_deleted = false
      JOIN units u ON st.unit_id = u.id AND u.is_deleted = false
      JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
      WHERE t.subject_id = $2 AND e.is_deleted = false
    ),
    active_assignments AS (
      SELECT a.id
      FROM assignments a
      JOIN units u ON a.unit_id = u.id AND u.is_deleted = false
      JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
      WHERE t.subject_id = $2 AND a.is_deleted = false
    ),
    active_projects AS (
      SELECT p.id
      FROM projects p
      JOIN topics t ON p.topic_id = t.id AND t.is_deleted = false
      WHERE t.subject_id = $2 AND p.is_deleted = false
    ),
    completed_lessons AS (
      SELECT COUNT(DISTINCT ulp.lesson_content_id) as count
      FROM user_lesson_progress ulp
      WHERE ulp.user_id = $1 AND ulp.is_completed = true 
        AND ulp.lesson_content_id IN (SELECT id FROM active_lessons)
    ),
    completed_quizzes AS (
      SELECT COUNT(DISTINCT qa.quiz_id) as count
      FROM quiz_attempts qa
      WHERE qa.user_id = $1 AND qa.is_passed = true
        AND qa.quiz_id IN (SELECT id FROM active_quizzes)
    ),
    completed_exercises AS (
      SELECT COUNT(DISTINCT es.exercise_id) as count
      FROM exercise_submissions es
      WHERE es.user_id = $1 AND es.is_passed = true
        AND es.exercise_id IN (SELECT id FROM active_exercises)
    ),
    completed_assignments AS (
      SELECT COUNT(DISTINCT asub.assignment_id) as count
      FROM assignment_submissions asub
      WHERE asub.user_id = $1
        AND asub.assignment_id IN (SELECT id FROM active_assignments)
    ),
    completed_projects AS (
      SELECT COUNT(DISTINCT ps.project_id) as count
      FROM project_submissions ps
      WHERE ps.user_id = $1
        AND ps.project_id IN (SELECT id FROM active_projects)
    )
    SELECT 
      ((SELECT COUNT(*) FROM active_lessons) +
       (SELECT COUNT(*) FROM active_quizzes) +
       (SELECT COUNT(*) FROM active_exercises) +
       (SELECT COUNT(*) FROM active_assignments) +
       (SELECT COUNT(*) FROM active_projects))::int AS total_items,
       
      ((SELECT count FROM completed_lessons) +
       (SELECT count FROM completed_quizzes) +
       (SELECT count FROM completed_exercises) +
       (SELECT count FROM completed_assignments) +
       (SELECT count FROM completed_projects))::int AS completed_items;
  `;

  const { rows } = await pool.query(query, [userId, subjectId]);
  const total = rows[0]?.total_items || 0;
  const completed = rows[0]?.completed_items || 0;

  // State-Based New Content Detection for completed students
  const uncompletedCount = Math.max(0, total - completed);
  const hasNewContent = (isAlreadyCompleted || storedPercent >= 100) && uncompletedCount > 0;
  const newContentCount = hasNewContent ? uncompletedCount : 0;

  // Permanent completion lock: if course was already completed, freeze at 100%
  if (isAlreadyCompleted || storedPercent >= 100) {
    return { 
      total, 
      completed, 
      percent: 100, 
      is_completed: true, 
      has_new_content: hasNewContent, 
      new_content_count: newContentCount,
      certificate_id: certificateId,
      completed_at: completedAt
    };
  }

  // Curriculum Pruning Rule: If completed active items >= total active items, auto-graduate to 100%
  if (total > 0 && completed >= total) {
    return { 
      total, 
      completed, 
      percent: 100, 
      is_completed: true, 
      has_new_content: false, 
      new_content_count: 0,
      certificate_id: certificateId,
      completed_at: completedAt
    };
  }

  const rawPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const percent = Math.min(100, Math.max(storedPercent, rawPercent));
  const isCompleted = percent >= 100;

  return { 
    total, 
    completed, 
    percent, 
    rawPercent,
    is_completed: isCompleted, 
    has_new_content: false, 
    new_content_count: 0,
    certificate_id: certificateId,
    completed_at: completedAt
  };
};

/**
 * Recalculates course progress for a user and subject on a learning action,
 * using proportional step accumulation so progress never drops and never freezes.
 * 
 * @param {string} userId - User ID (UUID)
 * @param {string} subjectId - Subject ID (UUID)
 * @returns {Promise<number>} - Saved progress percentage
 */
exports.syncUserSubjectProgress = async (userId, subjectId) => {
  if (!userId || !subjectId) {
    console.warn('[Progress] syncUserSubjectProgress called with missing userId or subjectId');
    return 0;
  }

  // 1. Check if user already finished this course (O(1) fast-path)
  const enrollment = await pool.query(
    'SELECT progress_percent, COALESCE(is_completed, false) as is_completed, certificate_id FROM user_subjects WHERE user_id = $1 AND subject_id = $2',
    [userId, subjectId]
  );
  const enrolledRow = enrollment.rows[0];

  if (enrolledRow?.is_completed || (enrolledRow?.progress_percent >= 100)) {
    return 100;
  }

  const { total, completed, percent, rawPercent, is_completed } = await exports.calculateSubjectProgress(userId, subjectId);
  const currentPercent = enrolledRow?.progress_percent || 0;
  let finalPercent = percent;

  // Curriculum Pruning Rule
  if (total > 0 && completed >= total) {
    finalPercent = 100;
  } else if (currentPercent > rawPercent) {
    // Proportional Step Accumulation (Killing the Dead Zone):
    // When total items increase and rawPercent < currentPercent,
    // distribute the remaining percentage (100 - currentPercent) proportionally
    // across remaining items so completing an item moves progress forward immediately.
    const remainingNeeded = Math.max(0, 100 - currentPercent);
    const remainingItems = Math.max(1, total - completed);
    const step = Math.max(1, Math.round(remainingNeeded / (remainingItems + 1)));
    finalPercent = Math.min(99, currentPercent + step);
  }

  // Absolute Monotonic Guarantee: progress can never decrease below current earned watermark
  finalPercent = Math.max(currentPercent, finalPercent);

  const finalIsCompleted = is_completed || finalPercent >= 100;

  console.log(`[Progress] syncUserSubjectProgress → userId=${userId} subjectId=${subjectId} total=${total} completed=${completed} finalPercent=${finalPercent}% isCompleted=${finalIsCompleted}`);

  const updateRes = await pool.query(
    `UPDATE user_subjects 
     SET progress_percent = $1,
         is_completed = CASE WHEN $2 = true THEN true ELSE is_completed END,
         completed_at = CASE WHEN $2 = true AND completed_at IS NULL THEN NOW() ELSE completed_at END,
         certificate_issued_at = CASE WHEN $2 = true AND certificate_issued_at IS NULL THEN NOW() ELSE certificate_issued_at END
     WHERE user_id = $3 AND subject_id = $4 
     RETURNING user_id, progress_percent, is_completed, certificate_id, completed_at`,
    [finalPercent, finalIsCompleted, userId, subjectId]
  );

  if (updateRes.rowCount === 0) {
    console.warn(`[Progress] syncUserSubjectProgress → no row updated. userId=${userId} may not be enrolled in subjectId=${subjectId}`);
  } else {
    console.log(`[Progress] user_subjects updated to ${finalPercent}% (completed: ${finalIsCompleted}) → userId=${userId} subjectId=${subjectId}`);
  }
  return finalPercent;
};


