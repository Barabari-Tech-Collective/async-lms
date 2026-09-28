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
    return { total: 0, completed: 0, percent: 0 };
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
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
};

/**
 * Recalculates course progress for a user and subject, and saves it in the database.
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
  const { total, completed, percent } = await exports.calculateSubjectProgress(userId, subjectId);
  console.log(`[Progress] calculateSubjectProgress → userId=${userId} subjectId=${subjectId} total=${total} completed=${completed} percent=${percent}%`);
  const updateRes = await pool.query(
    'UPDATE user_subjects SET progress_percent = $1 WHERE user_id = $2 AND subject_id = $3 RETURNING user_id',
    [percent, userId, subjectId]
  );
  if (updateRes.rowCount === 0) {
    console.warn(`[Progress] syncUserSubjectProgress → no row updated. userId=${userId} may not be enrolled in subjectId=${subjectId}`);
  } else {
    console.log(`[Progress] user_subjects.progress_percent updated to ${percent}% → userId=${userId} subjectId=${subjectId}`);
  }
  return percent;
};
