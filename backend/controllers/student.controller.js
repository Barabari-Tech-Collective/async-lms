const serverError = require('../utils/serverError');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pool = require('../config/pg');
const { logAction } = require('../utils/auditLogger');
const { notify } = require('../services/notificationService');
const { getTotalXP } = require('../services/xpService');
const { calculateSubjectProgress, syncUserSubjectProgress } = require('../utils/progress');
const { presignS3Url } = require('../utils/s3');

const WORKSPACE_ROOT = path.join(__dirname, '..', 'workspaces');
// ============================================
// HELPERS
// ============================================

/**
 * Upsert streak for a user based on today's activity.
 * - Same day  → no change
 * - Yesterday → increment streak
 * - Older     → reset to 1
 */
const { markActionToday, reconcileUserStreak } = require('../services/presenceService');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================
// HELPERS
// ============================================

/**
 * Streak is now updated by presenceService when both action and time requirements are met.
 */

// ── XP-based badge definitions ─────────────────────────────────────────────────
const XP_BADGES = [
  {
    name: 'First Steps',
    description: 'Earned your first 10 XP',
    icon: '🌱',
    threshold: 10,
  },
  {
    name: 'Learner',
    description: 'Reached 100 XP',
    icon: '📚',
    threshold: 100,
  },
  {
    name: 'Scholar',
    description: 'Reached 500 XP',
    icon: '🎓',
    threshold: 500,
  },
  {
    name: 'Expert',
    description: 'Reached 1,000 XP',
    icon: '⚡',
    threshold: 1000,
  },
  {
    name: 'Master',
    description: 'Reached 2,500 XP',
    icon: '🏆',
    threshold: 2500,
  },
  {
    name: 'Legend',
    description: 'Reached 5,000 XP',
    icon: '🌟',
    threshold: 5000,
  },
];

async function checkAndAwardBadges(userId) {
  try {
    // Ensure all XP badge definitions exist (upsert by title using a safe SELECT-then-INSERT)
    // Note: the badge's emoji (b.icon) is baked into the notification text below since
    // the `badges` table has no icon column — title/description are all it stores.
    for (const b of XP_BADGES) {
      await pool.query(
        `INSERT INTO badges (title, description)
         SELECT $1::text, $2::text
         WHERE NOT EXISTS (SELECT 1 FROM badges WHERE title = $1::text)`,
        [b.name, b.description],
      );
    }

    // Get current total XP
    const xpResult = await pool.query(
      'SELECT COALESCE(SUM(points), 0)::int AS total FROM points_log WHERE user_id = $1',
      [userId],
    );
    const totalXP = xpResult.rows[0].total;

    // Award every qualifying badge the user doesn't already have
    for (const b of XP_BADGES) {
      if (totalXP >= b.threshold) {
        const badgeInsert = await pool.query(
          `INSERT INTO user_badges (user_id, badge_id)
           SELECT $1, id FROM badges WHERE title = $2
           ON CONFLICT (user_id, badge_id) DO NOTHING
           RETURNING user_id`,
          [userId, b.name],
        );
        if (badgeInsert.rowCount > 0) {
          notify({
            userId,
            type: 'achievement',
            title: `${b.icon} Badge Unlocked: ${b.name}`,
            body: b.description,
            link: '/dashboard/student/profile',
          });
        }
      }
    }
  } catch (err) {
    console.error('checkAndAwardBadges error:', err.message);
  }
}

// ============================================
// STUDENT PROGRESS
// ============================================

const unlockNextSubtopicIfAvailable = async (userId, subtopicId) => {
  const nextQuery = `
    WITH ordered AS (
      SELECT
        st.id,
        t.subject_id,
        ROW_NUMBER() OVER (
          PARTITION BY t.subject_id
          ORDER BY t.order_index, u.order_index, st.order_index
        ) AS rn
      FROM subtopics st
      INNER JOIN units u ON st.unit_id = u.id
      INNER JOIN topics t ON u.topic_id = t.id
    ),
    current AS (
      SELECT subject_id, rn
      FROM ordered
      WHERE id = $1
    )
    SELECT o.id AS next_id
    FROM ordered o
    INNER JOIN current c ON o.subject_id = c.subject_id
    WHERE o.rn = c.rn + 1
    LIMIT 1;
  `;

  const nextResult = await pool.query(nextQuery, [subtopicId]);
  const nextId = nextResult.rows[0]?.next_id;
  if (!nextId) return;

  // Only unlock if no existing row (prevents overriding admin locks).
  await pool.query(
    `
      INSERT INTO user_subtopic_progress (user_id, subtopic_id, is_unlocked)
      VALUES ($1, $2, true)
      ON CONFLICT (user_id, subtopic_id) DO NOTHING;
    `,
    [userId, nextId],
  );
};

const checkAndCompleteSubtopic = async (userId, subtopicId) => {
  const requirementsQuery = `
    SELECT
      EXISTS (
        SELECT 1
        FROM lesson_content
        WHERE subtopic_id = $1 AND is_published = true AND is_deleted = false
      ) AS has_lesson,
      EXISTS (
        SELECT 1
        FROM quizzes
        WHERE unit_id = (SELECT unit_id FROM subtopics WHERE id = $1 AND is_deleted = false) AND is_deleted = false
      ) AS has_quiz,
      EXISTS (
        SELECT 1
        FROM exercises
        WHERE subtopic_id = $1 AND is_deleted = false
      ) AS has_exercise
  `;

  const requirements = await pool.query(requirementsQuery, [subtopicId]);
  const { has_lesson, has_quiz, has_exercise } = requirements.rows[0];

  const lessonDoneQuery = `
    SELECT EXISTS (
      SELECT 1
      FROM user_lesson_progress ulp
      INNER JOIN lesson_content lc ON lc.id = ulp.lesson_content_id
      WHERE ulp.user_id = $1
        AND lc.subtopic_id = $2
        AND ulp.is_completed = true
        AND lc.is_published = true
        AND lc.is_deleted = false
    ) AS lesson_done
  `;

  const quizDoneQuery = `
    SELECT EXISTS (
      SELECT 1
      FROM quiz_attempts qa
      INNER JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = $1
        AND q.unit_id = (SELECT unit_id FROM subtopics WHERE id = $2 AND is_deleted = false)
        AND qa.is_passed = true
        AND q.is_deleted = false
    ) AS quiz_done
  `;

  const exerciseDoneQuery = `
    SELECT EXISTS (
      SELECT 1
      FROM exercise_submissions es
      INNER JOIN exercises e ON e.id = es.exercise_id
      WHERE es.user_id = $1
        AND e.subtopic_id = $2
        AND es.is_passed = true
        AND e.is_deleted = false
    ) AS exercise_done
  `;

  let lessonDone = null;
  if (has_lesson)
    lessonDone = await pool.query(lessonDoneQuery, [userId, subtopicId]);

  let quizDone = null;
  if (has_quiz)
    quizDone = await pool.query(quizDoneQuery, [userId, subtopicId]);

  let exerciseDone = null;
  if (has_exercise)
    exerciseDone = await pool.query(exerciseDoneQuery, [userId, subtopicId]);

  const isLessonDone = has_lesson ? lessonDone.rows[0].lesson_done : true;
  const isQuizDone = has_quiz ? quizDone.rows[0].quiz_done : true;
  const isExerciseDone = has_exercise
    ? exerciseDone.rows[0].exercise_done
    : true;

  if (!isLessonDone || !isQuizDone || !isExerciseDone) return;

  const updateResult = await pool.query(
    `
      INSERT INTO user_subtopic_progress (user_id, subtopic_id, is_unlocked, is_completed, completed_at)
      VALUES ($1, $2, true, true, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, subtopic_id)
      DO UPDATE SET
        is_completed = true,
        completed_at = CURRENT_TIMESTAMP
      RETURNING *;
    `,
    [userId, subtopicId],
  );

  if (updateResult.rowCount > 0) {
    await unlockNextSubtopicIfAvailable(userId, subtopicId);
  }
};

/**
 * Get current student's progress for a subject
 * GET /api// Get current user's progress for a specific subject
 */
exports.getMyProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subjectId } = req.query;

    const enrollment = await pool.query(
      'SELECT 1 FROM user_subjects WHERE user_id = $1 AND subject_id = $2',
      [userId, subjectId],
    );
    if (enrollment.rows.length === 0) {
      return res
        .status(403)
        .json({ success: false, message: 'Not enrolled in this subject' });
    }

    const query = `
      SELECT 
        -- Topic
        t.id AS topic_id,
        t.title AS topic_title,
        t.description AS topic_description,
        t.order_index AS topic_order,
        
        -- Unit
        u.id AS unit_id,
        u.title AS unit_title,
        u.order_index AS unit_order,

        -- Subtopic
        st.id AS subtopic_id,
        st.title AS subtopic_title,
        st.slug AS subtopic_slug,
        st.order_index AS subtopic_order,

        -- Progress
        COALESCE(usp.is_unlocked, true) AS is_unlocked,
        COALESCE(usp.is_completed, false) AS is_completed,
        usp.completed_at,

        -- Content Existence
        EXISTS(SELECT 1 FROM lesson_content WHERE subtopic_id = st.id AND is_published = true) AS has_lesson,
        EXISTS(SELECT 1 FROM quizzes WHERE unit_id = u.id) AS has_quiz,
        EXISTS(SELECT 1 FROM exercises WHERE subtopic_id = st.id) AS has_exercise,
        (
          SELECT json_agg(
            json_build_object(
              'id', e.id,
              'title', e.title,
              'instructions', e.instructions,
              'max_score', e.max_score,
              'is_passed', COALESCE(es_inner.is_passed, false),
              'best_score', COALESCE(es_inner.max_score, 0)
            )
          )
          FROM exercises e
          LEFT JOIN (
            SELECT exercise_id, bool_or(is_passed) as is_passed, MAX(score) as max_score
            FROM exercise_submissions
            WHERE user_id = $1
            GROUP BY exercise_id
          ) es_inner ON e.id = es_inner.exercise_id
          WHERE e.unit_id = u.id
        ) AS unit_exercises,

        -- Specific Content Progress
        COALESCE(ulp.is_completed, false) AS lesson_completed,
        
        -- Quiz Best Score / Passed
        (
          SELECT json_build_object(
            'is_passed', bool_or(qa.is_passed),
            'max_score', MAX(qa.score)
          )
          FROM quiz_attempts qa
          INNER JOIN quizzes q ON q.id = qa.quiz_id
          WHERE qa.user_id = $1 AND q.unit_id = u.id
        ) AS quiz_stats,

        -- Exercise Best Score / Passed
        (
          SELECT json_build_object(
            'is_passed', bool_or(es.is_passed),
            'max_score', MAX(es.score)
          )
          FROM exercise_submissions es
          INNER JOIN exercises e ON e.id = es.exercise_id
          WHERE es.user_id = $1 AND e.subtopic_id = st.id
        ) AS exercise_stats,
        
        -- Topic Progress (Pre-calculated if needed, or we calculate in JS)
        utp.progress_percent AS topic_progress,
        utp.is_completed AS topic_is_completed

      FROM topics t
      INNER JOIN units u ON t.id = u.topic_id
      INNER JOIN subtopics st ON u.id = st.unit_id
      LEFT JOIN user_topic_progress utp ON utp.topic_id = t.id AND utp.user_id = $1
      LEFT JOIN user_subtopic_progress usp ON usp.subtopic_id = st.id AND usp.user_id = $1
      LEFT JOIN lesson_content lc ON lc.subtopic_id = st.id AND lc.is_published = true
      LEFT JOIN user_lesson_progress ulp ON ulp.lesson_content_id = lc.id AND ulp.user_id = $1
      
      WHERE t.subject_id = $2
      ORDER BY 
        t.order_index,
        u.order_index,
        st.order_index;
    `;

    const { rows } = await pool.query(query, [userId, subjectId]);

    // Build Hierarchy
    const topicsMap = new Map();
    let totalSubtopics = 0;
    let completedSubtopics = 0;
    let totalPoints = 0;

    rows.forEach((row) => {
      // Topic
      if (!topicsMap.has(row.topic_id)) {
        topicsMap.set(row.topic_id, {
          id: row.topic_id,
          title: row.topic_title,
          description: row.topic_description,
          order_index: row.topic_order,
          progress_percent: row.topic_progress || 0,
          is_completed: row.topic_is_completed || false,
          units: new Map(),
        });
      }
      const topic = topicsMap.get(row.topic_id);

      // Unit
      if (!topic.units.has(row.unit_id)) {
        topic.units.set(row.unit_id, {
          id: row.unit_id,
          title: row.unit_title,
          order_index: row.unit_order,
          exercises: row.unit_exercises || [],
          subtopics: [],
        });
      }
      const unit = topic.units.get(row.unit_id);

      // Subtopic Stats
      const quizPassed = row.quiz_stats?.is_passed || false;
      const exercisePassed = row.exercise_stats?.is_passed || false;
      const bestQuizScore = row.quiz_stats?.max_score || 0;
      const bestExerciseScore = row.exercise_stats?.max_score || 0;

      // Add Subtopic
      unit.subtopics.push({
        subtopic_id: row.subtopic_id,
        subtopic_title: row.subtopic_title,
        subtopic_slug: row.subtopic_slug,
        is_unlocked: row.is_unlocked,
        is_completed: row.is_completed,
        completed_at: row.completed_at,
        has_lesson: row.has_lesson,
        has_quiz: row.has_quiz,
        has_exercise: row.has_exercise,
        lesson_completed: row.lesson_completed,
        quiz_passed: quizPassed,
        exercise_passed: exercisePassed,
        best_quiz_score: bestQuizScore,
        best_exercise_score: bestExerciseScore,
      });

      // Aggregates
      totalSubtopics++;
      if (row.is_completed) {
        completedSubtopics++;
      }
      totalPoints += (bestQuizScore || 0) + (bestExerciseScore || 0);
    });

    // Formatting Response
    const topics = Array.from(topicsMap.values()).map((topic) => ({
      ...topic,
      units: Array.from(topic.units.values()),
    }));

    const progressData = await calculateSubjectProgress(userId, subjectId);
    const overallProgress = progressData.percent;

    // Get user stats
    const statsQuery = `
      SELECT 
        CASE 
          WHEN us.last_activity::date >= CURRENT_DATE - 1 THEN COALESCE(us.current_streak, 0)
          ELSE 0 
        END as current_streak,
        COALESCE(us.longest_streak, 0) as longest_streak,
        (us.last_activity::date = CURRENT_DATE) as practiced_today,
        COALESCE(SUM(pl.points), 0) as total_points
      FROM users u
      LEFT JOIN user_streaks us ON u.id = us.user_id
      LEFT JOIN points_log pl ON u.id = pl.user_id
      WHERE u.id = $1
      GROUP BY us.current_streak, us.longest_streak, us.last_activity;
    `;

    const statsResult = await pool.query(statsQuery, [userId]);
    const stats = statsResult.rows[0] || {
      current_streak: 0,
      longest_streak: 0,
      practiced_today: false,
      total_points: 0,
    };

    const enrollmentRow = await pool
      .query(
        `SELECT last_accessed_subtopic_slug FROM user_subjects WHERE user_id = $1 AND subject_id = $2`,
        [userId, subjectId],
      )
      .catch(() => ({ rows: [] }));
    const lastAccessedSlug =
      enrollmentRow.rows[0]?.last_accessed_subtopic_slug ?? null;

    res.json({
      success: true,
      data: {
        overall_progress: overallProgress,
        total_subtopics: progressData.total,
        completed_subtopics: progressData.completed,
        total_points: totalPoints,
        last_accessed_subtopic_slug: lastAccessedSlug,
        stats: stats,
        topics: topics,
      },
    });
  } catch (error) {
    console.error('Error fetching student progress:', error);
    serverError(res, error);
  }
};

/**
 * Mark subtopic as started/unlocked
 * POST /api/students/progress/subtopic/:subtopicId/start
 */
exports.startSubtopic = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subtopicId } = req.params;

    if (!subtopicId || !UUID_RE.test(subtopicId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subtopicId',
      });
    }

    const subtopicExists = await pool.query(
      'SELECT id FROM subtopics WHERE id = $1 LIMIT 1',
      [subtopicId],
    );

    if (subtopicExists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subtopic not found',
      });
    }

    const lockCheck = await pool.query(
      `SELECT usp.is_unlocked, st.slug, st.unit_id,
              u.topic_id, t.subject_id
       FROM user_subtopic_progress usp
       JOIN subtopics st ON st.id = usp.subtopic_id
       JOIN units u ON u.id = st.unit_id
       JOIN topics t ON t.id = u.topic_id
       WHERE usp.user_id = $1 AND usp.subtopic_id = $2
       LIMIT 1`,
      [userId, subtopicId],
    );

    if (lockCheck.rows[0]?.is_unlocked === false) {
      return res.status(200).json({
        success: false,
        message: 'This subtopic is locked by your admin.',
      });
    }

    // Track last accessed subtopic for "Continue Learning"
    if (lockCheck.rows[0]?.subject_id && lockCheck.rows[0]?.slug) {
      await pool
        .query(
          `UPDATE user_subjects
         SET last_accessed_subtopic_slug = $1, last_accessed_at = NOW()
         WHERE user_id = $2 AND subject_id = $3`,
          [lockCheck.rows[0].slug, userId, lockCheck.rows[0].subject_id],
        )
        .catch(() => {}); // non-critical — column may not exist yet
    }

    res.json({
      success: true,
      message: 'Subtopic started',
      data: lockCheck.rows[0],
    });
  } catch (error) {
    console.error('Error starting subtopic:', error);
    serverError(res, error);
  }
};

/**
 * Mark lesson as completed
 * POST /api/students/progress/lesson/:lessonId/complete
 */
exports.completeLesson = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lessonId } = req.params;

    if (!lessonId || !UUID_RE.test(lessonId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lessonId',
      });
    }

    const lessonExists = await pool.query(
      'SELECT id, subtopic_id FROM lesson_content WHERE id = $1 LIMIT 1',
      [lessonId],
    );

    if (lessonExists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found',
      });
    }

    const subtopicId = lessonExists.rows[0].subtopic_id;

    // Verify that if this subtopic has active exercises, they are passed
    if (subtopicId) {
      const unpassedExercises = await pool.query(
        `SELECT e.id FROM exercises e
         WHERE e.subtopic_id = $1 AND e.is_deleted = false
           AND NOT EXISTS (
             SELECT 1 FROM exercise_submissions es
             WHERE es.exercise_id = e.id AND es.user_id = $2 AND es.is_passed = true
           )`,
        [subtopicId, userId],
      );

      if (unpassedExercises.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Please complete and pass all exercises for this lesson before marking it as completed.',
        });
      }
    }

    const query = `
      INSERT INTO user_lesson_progress (user_id, lesson_content_id, is_completed)
      VALUES ($1, $2, true)
      ON CONFLICT (user_id, lesson_content_id)
      DO UPDATE SET is_completed = true
      RETURNING *, (xmax = 0) AS is_new_row;
    `;

    const result = await pool.query(query, [userId, lessonId]);

    // Award points only on first completion
    if (result.rows[0].is_new_row) {
      await pool.query(
        'INSERT INTO points_log (user_id, source, points) VALUES ($1, $2, $3)',
        [userId, 'lesson_completion', 10],
      );
      await checkAndAwardBadges(userId);
    }
    markActionToday(userId);

    const subtopicResult = await pool.query(
      `SELECT lc.subtopic_id, t.subject_id 
       FROM lesson_content lc
       JOIN subtopics st ON lc.subtopic_id = st.id
       JOIN units u ON st.unit_id = u.id
       JOIN topics t ON u.topic_id = t.id
       WHERE lc.id = $1 LIMIT 1`,
      [lessonId],
    );

    const subjectId = subtopicResult.rows[0]?.subject_id;

    if (subtopicId) {
      await checkAndCompleteSubtopic(userId, subtopicId);
    }
    if (subjectId) {
      const newPct = await syncUserSubjectProgress(userId, subjectId);
      console.log(`[Progress] lesson ${lessonId} completed → userId=${userId} subjectId=${subjectId} percent=${newPct}%`);
    } else {
      console.warn(`[Progress] lesson ${lessonId} → could not resolve subjectId for userId=${userId}`);
    }

    res.json({
      success: true,
      message: 'Lesson completed',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error completing lesson:', error);
    serverError(res, error);
  }
};

/**
 * Submit quiz attempt
 * POST /api/students/quiz/:quizId/submit
 * Body: { answers: { [question_id]: string } }
 *   For multiple_choice: value is the selected option UUID
 *   For true_false:      value is 'True' or 'False'
 * Score is calculated server-side — client never sends a score.
 */
exports.submitQuizAttempt = async (req, res) => {
  try {
    const userId = req.user.id;
    const { quizId } = req.params;
    const { answers } = req.body; // { [question_id]: string }

    if (!answers || typeof answers !== 'object') {
      return res
        .status(400)
        .json({ success: false, message: 'answers object is required' });
    }

    // Fetch quiz + all questions + correct options in one query
    const quizQuery = await pool.query(
      `SELECT q.passing_score, q.max_score,
              qq.id AS question_id, qq.question_type, qq.points, qq.explanation,
              qo.id AS option_id, qo.option_text, qo.is_correct
       FROM quizzes q
       LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id AND qq.is_deleted = false
       LEFT JOIN quiz_question_options qo ON qo.question_id = qq.id AND qo.is_deleted = false
       WHERE q.id = $1 and q.is_deleted = false
       ORDER BY qq.order_index, qo.order_index`,
      [quizId],
    );

    if (quizQuery.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Quiz not found' });
    }

    const { passing_score, max_score } = quizQuery.rows[0];

    // Group options by question
    const questionsMap = new Map();
    for (const row of quizQuery.rows) {
      if (!row.question_id) continue;
      if (!questionsMap.has(row.question_id)) {
        questionsMap.set(row.question_id, {
          id: row.question_id,
          type: row.question_type,
          points: row.points,
          explanation: row.explanation,
          options: [],
        });
      }
      if (row.option_id) {
        questionsMap.get(row.question_id).options.push({
          id: row.option_id,
          option_text: row.option_text,
          is_correct: row.is_correct,
        });
      }
    }

    // Score each answer and build per-question result for feedback
    let score = 0;
    let actual_max_score = 0;
    const question_results = {};
    for (const [questionId, question] of questionsMap) {
      actual_max_score += question.points;
      const userAnswer = answers[questionId];
      let correctOption = null;
      let userIsCorrect = false;

      let selectedOptionId = null;

      if (question.type === 'multiple_choice') {
        correctOption = question.options.find((o) => o.is_correct);
        const selectedOption = question.options.find(
          (o) => o.id === userAnswer,
        );
        selectedOptionId = selectedOption?.id ?? null;
        if (correctOption && userAnswer === correctOption.id) {
          score += question.points;
          userIsCorrect = true;
        }
      } else if (question.type === 'true_false') {
        correctOption = question.options.find((o) => o.is_correct);
        const selectedOption = question.options.find(
          (o) => o.option_text === userAnswer,
        );
        selectedOptionId = selectedOption?.id ?? null;
        if (correctOption && userAnswer === correctOption.option_text) {
          score += question.points;
          userIsCorrect = true;
        }
      }
      // short_answer: skipped (manual review, no auto-score)

      // correct_option_id/text are withheld until the reveal threshold below —
      // otherwise a failing attempt would hand the student the answer key.
      question.correctOptionId = correctOption?.id ?? null;
      question.correctOptionText = correctOption?.option_text ?? null;

      question_results[questionId] = {
        is_correct: userIsCorrect,
        selected_option_id: selectedOptionId,
        correct_option_id: null,
        correct_option_text: null,
      };
    }

    // Derive passing threshold from actual question points to handle cases where
    // the stored max_score is out of sync with real question points.
    // Clamp to at least 60% (0.60) to enforce the universal 60% passing criteria.
    const rawRatio = max_score > 0 ? passing_score / max_score : 0.6;
    const passingRatio = Math.max(0.6, Math.min(1, rawRatio));
    const effectivePassingScore =
      actual_max_score > 0
        ? Math.ceil(actual_max_score * passingRatio)
        : Math.ceil(max_score > 0 ? max_score * 0.6 : 60);
    const isPassed = score >= effectivePassingScore;

    const result = await pool.query(
      `INSERT INTO quiz_attempts (quiz_id, user_id, score, is_passed)
       VALUES ($1, $2, $3, $4)
       RETURNING *;`,
      [quizId, userId, score, isPassed],
    );

    // Only reveal the correct answer + explanation once the student has
    // attempted the quiz MIN_ATTEMPTS_FOR_REVEAL times — otherwise a failing
    // attempt would hand them the answer key outright. Until then, students
    // only learn whether their own selection was right or wrong.
    const MIN_ATTEMPTS_FOR_REVEAL = 3;
    const attemptCountResult = await pool.query(
      'SELECT COUNT(*) AS count FROM quiz_attempts WHERE quiz_id = $1 AND user_id = $2',
      [quizId, userId],
    );
    const attemptCount = parseInt(attemptCountResult.rows[0].count, 10);
    const canRevealAnswer = attemptCount >= MIN_ATTEMPTS_FOR_REVEAL;
    if (canRevealAnswer) {
      for (const [questionId, question] of questionsMap) {
        if (question_results[questionId]) {
          question_results[questionId].explanation = question.explanation;
          question_results[questionId].correct_option_id =
            question.correctOptionId;
          question_results[questionId].correct_option_text =
            question.correctOptionText;
        }
      }
    }

    // Save per-question results for analytics
    const attemptId = result.rows[0].id;
    const answerRows = Object.entries(question_results);
    if (answerRows.length > 0) {
      // Each row: (quiz_attempt_id, question_id, selected_option_id, is_correct, points_earned)
      const vals = answerRows
        .map(
          (_, i) =>
            `($1, $${i * 4 + 2}::uuid, $${i * 4 + 3}::uuid, $${i * 4 + 4}, $${i * 4 + 5})`,
        )
        .join(', ');
      const params = [
        attemptId,
        ...answerRows.flatMap(([qId, r]) => {
          const q = questionsMap.get(qId);
          return [
            qId,
            r.selected_option_id ?? null,
            r.is_correct,
            r.is_correct ? (q?.points ?? 0) : 0,
          ];
        }),
      ];
      await pool.query(
        `INSERT INTO quiz_question_answers (quiz_attempt_id, question_id, selected_option_id, is_correct, points_earned)
         VALUES ${vals} ON CONFLICT DO NOTHING`,
        params,
      );
    }

    // Delta System for Quizzes: Proportional XP up to 15 points
    const prevMaxRes = await pool.query(
      `SELECT MAX(score) as max_score 
       FROM quiz_attempts 
       WHERE user_id = $1 AND quiz_id = $2 AND id != $3 AND is_passed = true`,
      [userId, quizId, attemptId],
    );
    const prevMaxScore = prevMaxRes.rows[0].max_score || 0;

    const maxPossiblePoints = 15;
    const prevPoints =
      actual_max_score > 0
        ? Math.round((prevMaxScore / actual_max_score) * maxPossiblePoints)
        : 0;
    const newPoints =
      actual_max_score > 0
        ? Math.round((score / actual_max_score) * maxPossiblePoints)
        : 0;

    let pointsAwarded = 0;
    if (isPassed) {
      pointsAwarded = Math.max(0, newPoints - prevPoints);
    }

    if (pointsAwarded > 0) {
      await pool.query(
        'INSERT INTO points_log (user_id, source, points) VALUES ($1, $2, $3)',
        [userId, 'quiz_completion', pointsAwarded],
      );
    }
    markActionToday(userId);
    await checkAndAwardBadges(userId);

    // Trigger completion check for ALL subtopics in the unit (not just the first)
    const unitResult = await pool.query(
      `SELECT q.unit_id, t.subject_id FROM quizzes q
       INNER JOIN units u ON q.unit_id = u.id
       INNER JOIN topics t ON u.topic_id = t.id
       WHERE q.id = $1 LIMIT 1`,
      [quizId],
    );
    const unitId = unitResult.rows[0]?.unit_id;
    const subjectId = unitResult.rows[0]?.subject_id;

    if (unitId) {
      const allSubtopics = await pool.query(
        'SELECT id FROM subtopics WHERE unit_id = $1 ORDER BY order_index',
        [unitId],
      );
      for (const row of allSubtopics.rows) {
        await checkAndCompleteSubtopic(userId, row.id);
      }
    }
    if (subjectId) {
      const newPct = await syncUserSubjectProgress(userId, subjectId);
      console.log(`[Progress] quiz ${quizId} submitted → userId=${userId} subjectId=${subjectId} percent=${newPct}%`);
    } else {
      console.warn(`[Progress] quiz ${quizId} → could not resolve subjectId for userId=${userId}`);
    }

    res.json({
      success: true,
      message: isPassed ? 'Quiz passed!' : 'Quiz attempted',
      data: {
        attempt: result.rows[0],
        points_awarded: pointsAwarded,
        question_results,
        effective_passing_score: effectivePassingScore,
        actual_max_score,
      },
    });
  } catch (error) {
    console.error('Error submitting quiz:', error);
    serverError(res, error);
  }
};

/** An access decision the student may safely be told about. */
class ExerciseAccessError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ExerciseAccessError';
    this.statusCode = statusCode;
    this.expose = true;
  }
}

const EXERCISE_COLUMNS = `
  e.id, e.language, e.initial_files, e.test_cases, e.tasks, e.rubric,
  e.max_score, e.subtopic_id, e.unit_id
`;

/**
 * Load an exercise the student is actually entitled to work on.
 *
 * Every exercise endpoint used to look up `WHERE id = $1` and nothing else, so
 * any authenticated student could initialise a workspace for, execute code
 * against, grade and submit any exercise UUID — including ones an admin had
 * soft-deleted, and ones belonging to courses they were never enrolled in.
 *
 * Entitlement follows enrolment: an exercise hangs off either a subtopic or a
 * unit directly, and both roads lead to units → topics → subjects, which is
 * what `user_subjects` records.
 *
 * @throws {ExerciseAccessError} 404 if missing or deleted, 403 if not enrolled
 */
async function loadAccessibleExercise(userId, exerciseId) {
  const { rows } = await pool.query(
    `SELECT ${EXERCISE_COLUMNS},
            COALESCE(t_unit.subject_id, t_sub.subject_id) AS subject_id
       FROM exercises e
       LEFT JOIN units     u_direct ON u_direct.id = e.unit_id
       LEFT JOIN topics    t_unit   ON t_unit.id   = u_direct.topic_id
       LEFT JOIN subtopics st       ON st.id       = e.subtopic_id
       LEFT JOIN units     u_sub    ON u_sub.id    = st.unit_id
       LEFT JOIN topics    t_sub    ON t_sub.id    = u_sub.topic_id
      WHERE e.id = $1 AND e.is_deleted = false`,
    [exerciseId],
  );

  const exercise = rows[0];
  if (!exercise) {
    throw new ExerciseAccessError(404, 'Exercise not found');
  }

  // An exercise not reachable from any subject cannot be checked against
  // enrolment. Refuse rather than fall open — an unlinked exercise is an
  // authoring mistake, not a public one.
  if (!exercise.subject_id) {
    throw new ExerciseAccessError(
      403,
      'This exercise is not linked to a course yet. Please contact your facilitator.',
    );
  }

  const enrolled = await pool.query(
    'SELECT 1 FROM user_subjects WHERE user_id = $1 AND subject_id = $2',
    [userId, exercise.subject_id],
  );
  if (enrolled.rowCount === 0) {
    throw new ExerciseAccessError(
      403,
      'You are not enrolled in the course this exercise belongs to.',
    );
  }

  const hasHtml =
    (Array.isArray(exercise.initial_files) &&
      exercise.initial_files.some(
        (f) =>
          (f.name || f.path || '').endsWith('.html') ||
          (f.name || f.path || '').endsWith('.htm'),
      )) ||
    /html|css|dom|web/i.test(exercise.title || '');
  if (hasHtml && (!exercise.language || exercise.language === 'javascript')) {
    exercise.language = 'dom';
  }

  return exercise;
}

/**
 * Resolves a safe, canonical workspace directory within WORKSPACE_ROOT.
 * Enforces strict alphanumeric/uuid checks on exerciseId and taskId to prevent path traversal.
 */
function getSafeWorkspaceDir(userId, exerciseId, taskId) {
  const safeTaskId = taskId && /^[a-zA-Z0-9_-]+$/.test(String(taskId)) ? String(taskId) : null;
  const safeExerciseId = /^[a-zA-Z0-9_-]+$/.test(String(exerciseId)) ? String(exerciseId) : 'default';
  const projectId = safeTaskId
    ? `exercise-${safeExerciseId}-task-${safeTaskId}`
    : `exercise-${safeExerciseId}`;
  return path.resolve(WORKSPACE_ROOT, String(userId), projectId);
}

/**
 * Persists student workspace files safely with jail boundary enforcement.
 * Rejects path traversal sequences (..), null bytes, and writes outside the workspace root.
 */
function saveStudentFilesSafely(workspaceDir, files) {
  if (!files || !Array.isArray(files)) return;
  const resolvedWorkspace = path.resolve(workspaceDir);
  fs.mkdirSync(resolvedWorkspace, { recursive: true });

  for (const file of files) {
    const rawName = file.name || file.path;
    if (typeof rawName !== 'string' || typeof file.content !== 'string') continue;
    if (rawName.includes('\0')) {
      throw new ExerciseAccessError(400, 'Security Error: Invalid file name');
    }

    // Normalize path and strip leading traversal dots
    const normalizedPath = path.normalize(rawName).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.resolve(resolvedWorkspace, normalizedPath);

    // Enforce jail boundary: filePath must strictly reside inside resolvedWorkspace
    if (!filePath.startsWith(resolvedWorkspace + path.sep) && filePath !== resolvedWorkspace) {
      throw new ExerciseAccessError(400, 'Security Error: Path traversal attempt detected');
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, 'utf-8');
  }
}

/**
 * Local semantic DOM / HTML evaluator fallback.
 * Evaluates standard HTML5 structure and semantic elements directly
 * when the central evaluator service is offline or unreachable.
 */
function evaluateDomLocally(files, exercise) {
  const htmlFile = (files || []).find((f) => {
    const p = (f.path || f.name || '').toLowerCase();
    return p.endsWith('.html') || p === 'index.html';
  });
  const htmlContent = (htmlFile?.content || '').trim();

  const hasDocType = /<!doctype\s+html/i.test(htmlContent);
  const hasHtml = /<html[\s>]/i.test(htmlContent) && /<\/html>/i.test(htmlContent);
  const hasHead = /<head[\s>]/i.test(htmlContent) && /<\/head>/i.test(htmlContent);
  const hasTitle = /<title[\s>][\s\S]*?<\/title>/i.test(htmlContent);
  const hasBody = /<body[\s>]/i.test(htmlContent) && /<\/body>/i.test(htmlContent);
  const hasContent = /<(h[1-6]|p|div|section|main|article|header|footer)[\s>]/i.test(htmlContent);

  const checks = [
    {
      name: '<!DOCTYPE html> Declaration',
      description: 'Document includes an HTML5 <!DOCTYPE html> declaration',
      passed: hasDocType,
      weight: 20,
    },
    {
      name: 'Root <html> Element',
      description: 'Document includes opening and closing <html> tags',
      passed: hasHtml,
      weight: 20,
    },
    {
      name: '<head> & <title> Tags',
      description: '<head> element contains a valid <title> tag',
      passed: hasHead && hasTitle,
      weight: 20,
    },
    {
      name: '<body> Container',
      description: 'Document includes opening and closing <body> tags',
      passed: hasBody,
      weight: 20,
    },
    {
      name: 'Content & Semantic Elements',
      description: 'Body contains structured content elements',
      passed: hasContent && htmlContent.length > 40,
      weight: 20,
    },
  ];

  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = checks.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);
  const ratio = totalWeight > 0 ? passedWeight / totalWeight : 1;
  const maxScore = exercise.max_score || 100;
  const calculatedScore = Math.round(ratio * maxScore);

  const rubric_breakdown = checks.map((c) => ({
    name: c.name,
    score: c.passed ? Math.round((c.weight / totalWeight) * maxScore) : 0,
    max_score: Math.round((c.weight / totalWeight) * maxScore),
    feedback: c.passed ? `Passed: ${c.description}` : `Missing: ${c.description}`,
  }));

  const feedbackText =
    ratio >= 0.6
      ? '🎉 Excellent work! All core HTML document structure requirements are satisfied.'
      : 'Incomplete HTML structure. Please ensure your document has <!DOCTYPE html>, <html>, <head>, <title>, and <body> tags.';

  return {
    score: calculatedScore,
    testResults: {
      feedback: feedbackText,
      rubric_breakdown,
    },
  };
}

/**
 * Submit exercise
 * POST /api/students/exercise/:exerciseId/submit
 */
exports.submitExercise = async (req, res) => {
  try {
    const userId = req.user.id;
    const { exerciseId } = req.params;
    const { files, taskId } = req.body;

    const exercise = await loadAccessibleExercise(userId, exerciseId);
    let score = null;
    let testResults = null;
    let isExplicitPassed = undefined;

    const hasTasks = Array.isArray(exercise.tasks) && exercise.tasks.length > 0;
    const hasTestCases = hasTasks
      ? exercise.tasks.some((t) => t.test_cases && t.test_cases.length > 0)
      : exercise.test_cases && exercise.test_cases.length > 0;

    if (hasTasks && hasTestCases) {
      // Multi-task exercise: run tests for each task and aggregate
      let totalPassed = 0;
      let totalTests = 0;
      let anyWorkspaceFound = false;
      const taskResults = [];

      for (const task of exercise.tasks) {
        if (!task.test_cases || task.test_cases.length === 0) continue;
        const taskWorkspaceDir = path.join(
          WORKSPACE_ROOT,
          String(userId),
          `exercise-${exerciseId}-task-${task.id}`,
        );
        // Only the task the student just submitted carries fresh files from the
        // client — other tasks keep whatever was last auto-saved to their own
        // workspace dir (they must not be overwritten with this task's files).
        const isSubmittedTask = !taskId || task.id === taskId;

        if (!fs.existsSync(taskWorkspaceDir)) {
          if (isSubmittedTask && files && Array.isArray(files)) {
            fs.mkdirSync(taskWorkspaceDir, { recursive: true });
          } else {
            continue;
          }
        }

        // Write files to workspace if provided, and only for the submitted task
        if (isSubmittedTask && files && Array.isArray(files)) {
          for (const file of files) {
            if (file.path && typeof file.content === 'string') {
              const filePath = path.join(taskWorkspaceDir, file.path);
              const relative = path.relative(taskWorkspaceDir, filePath);
              const isSafe =
                relative &&
                !relative.startsWith('..') &&
                !path.isAbsolute(relative);
              if (isSafe) {
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, file.content);
              }
            }
          }
        }

        anyWorkspaceFound = true;
        try {
          const result = await runTests(
            taskWorkspaceDir,
            exercise.language,
            testSpecFrom(task),
          );
          totalPassed += result.passed;
          totalTests += result.total;
          taskResults.push({
            taskId: task.id,
            taskTitle: task.title,
            ...result,
          });
        } catch (err) {
          // count all tests in this task as failed
          totalTests += task.test_cases.length;
          taskResults.push({
            taskId: task.id,
            taskTitle: task.title,
            passed: 0,
            failed: task.test_cases.length,
            total: task.test_cases.length,
            error: err.message,
          });
        }
      }

      if (!anyWorkspaceFound) {
        return res.status(400).json({
          success: false,
          message: 'Workspace not initialised. Open the exercise first.',
        });
      }

      score =
        totalTests > 0
          ? Math.round((totalPassed / totalTests) * exercise.max_score)
          : 0;
      testResults = { totalPassed, totalTests, taskResults };
    } else if (exercise.test_cases && exercise.test_cases.length > 0) {
      // Legacy: single workspace test cases
      const workspaceDir = path.join(
        WORKSPACE_ROOT,
        String(userId),
        `exercise-${exerciseId}`,
      );
      if (!fs.existsSync(workspaceDir)) {
        if (files && Array.isArray(files)) {
          fs.mkdirSync(workspaceDir, { recursive: true });
        } else {
          return res.status(400).json({
            success: false,
            message: 'Workspace not initialised. Open the exercise first.',
          });
        }
      }

      // Write files to workspace if provided
      if (files && Array.isArray(files)) {
        for (const file of files) {
          if (file.path && typeof file.content === 'string') {
            const filePath = path.join(workspaceDir, file.path);
            const relative = path.relative(workspaceDir, filePath);
            const isSafe =
              relative &&
              !relative.startsWith('..') &&
              !path.isAbsolute(relative);
            if (isSafe) {
              fs.mkdirSync(path.dirname(filePath), { recursive: true });
              fs.writeFileSync(filePath, file.content);
            }
          }
        }
      }
      try {
        testResults = await runTests(
          workspaceDir,
          exercise.language,
          testSpecFrom(exercise),
        );
        score =
          testResults.total > 0
            ? Math.round(
                (testResults.passed / testResults.total) * exercise.max_score,
              )
            : 0;
      } catch (err) {
        // Code that fails to compile/run scores 0 with the runner output as
        // feedback — not a 500, which told the student nothing.
        const total = exercise.test_cases.length;
        testResults = {
          passed: 0,
          failed: total,
          total,
          results: [
            {
              description: 'Your code could not be executed',
              passed: false,
              error: String(err.message || err).slice(0, 4000),
            },
          ],
        };
        score = 0;
      }
    } else if (
      exercise.rubric ||
      ['dom', 'html', 'react', 'backend'].includes(exercise.language) ||
      (files && Array.isArray(files) && files.some((f) => (f.name || f.path || '').endsWith('.html') || (f.name || f.path || '').endsWith('.htm')))
    ) {
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res
          .status(400)
          .json({
            success: false,
            message: 'Files are required for this environment.',
          });
      }

      const isDomLike =
        exercise.language === 'dom' ||
        exercise.language === 'html' ||
        (files && Array.isArray(files) && files.some((f) => (f.name || f.path || '').endsWith('.html') || (f.name || f.path || '').endsWith('.htm')));

      if (isDomLike) {
        // Direct local evaluation for HTML/DOM exercises without central evaluator overhead
        const workspaceDir = getSafeWorkspaceDir(userId, exerciseId, taskId);
        try {
          saveStudentFilesSafely(workspaceDir, files);
        } catch (e) {
          if (e instanceof ExerciseAccessError) throw e;
          console.warn('[submitExercise] Could not persist workspace files:', e.message);
        }

        const localEval = evaluateDomLocally(files, exercise);
        score = localEval.score;
        testResults = localEval.testResults;
        isExplicitPassed = score >= (exercise.max_score || 100) * 0.6;
      } else {
        const evalTypeMap = {
          dom: 'visual',
          html: 'visual',
          react: 'react',
          backend: 'backend',
          javascript: 'javascript',
          python: 'python',
        };
        const evaluatorType = evalTypeMap[exercise.language] || 'backend';

        const payload = {
          type: evaluatorType,
          ideFiles: files,
        };

      if (evaluatorType === 'visual') {
        payload.expectedUrl = 'https://example.com'; // placeholder since it's ide files

        let rubricStr = '';
        if (Array.isArray(exercise.rubric)) {
          rubricStr = exercise.rubric
            .map(
              (item) =>
                `- ${item.name}: ${item.description} (Weight: ${item.weight}%)`,
            )
            .join('\n');
        } else if (typeof exercise.rubric === 'string') {
          rubricStr = exercise.rubric;
        } else if (exercise.rubric?.criteria) {
          rubricStr = exercise.rubric.criteria
            .map(
              (item) =>
                `- ${item.name}: ${item.description} (Weight: ${item.weight}%)`,
            )
            .join('\n');
        } else {
          rubricStr = 'Evaluate the HTML/CSS code';
        }

        payload.rubricText = rubricStr;
        payload.submissions = [
          {
            studentId: userId,
            studentName: req.user.full_name || 'Student',
            repoUrl: 'https://github.com/example/placeholder',
            ideFiles: files,
          },
        ];
      } else {
        payload.rubric = exercise.rubric || {
          criteria: [{ name: 'Completeness', weight: 100 }],
        };
      }

      const CENTRAL_URL =
        process.env.CENTRAL_EVALUATOR_URL || 'http://localhost:3004';

      let evalResponse = null;
      let postRetries = 2;
      for (let attempt = 1; attempt <= postRetries; attempt++) {
        try {
          evalResponse = await axios.post(`${CENTRAL_URL}/evaluate`, payload, {
            headers: {
              'x-api-key':
                process.env.CENTRAL_EVALUATOR_API_KEY || 'test-key-123',
            },
            timeout: 3000,
          });
          break;
        } catch (error) {
          if (attempt === postRetries) {
            console.warn(`[Exercise Submit] Central evaluator connection failed (${CENTRAL_URL}): ${error.message}`);
          } else {
            await new Promise((res) => setTimeout(res, 500));
          }
        }
      }

      if (!evalResponse) {
        // Central evaluator service is offline or unreachable
        if (exercise.language === 'dom' || evaluatorType === 'visual') {
          const localEval = evaluateDomLocally(files, exercise);
          score = localEval.score;
          testResults = localEval.testResults;
          isExplicitPassed = score >= (exercise.max_score || 100) * 0.6;
        } else {
          throw new ExerciseAccessError(
            503,
            'Code evaluation service is currently unavailable. Please ensure the central evaluator service is running on port 4000.',
          );
        }
      } else {
        const jobId =
          evalResponse.data.jobId ||
          (evalResponse.data.jobs && evalResponse.data.jobs[0].jobId);
        if (!jobId)
          throw new Error('Failed to get job ID from central evaluator');

      let evalResult = null;
      for (let i = 0; i < 30; i++) {
        // wait up to 60 seconds
        await new Promise((res) => setTimeout(res, 2000));
        try {
          const statusResponse = await axios.get(
            `${CENTRAL_URL}/jobs/${evaluatorType}/${jobId}`,
            {
              headers: {
                'x-api-key':
                  process.env.CENTRAL_EVALUATOR_API_KEY || 'test-key-123',
              },
            },
          );
          if (statusResponse.data.state === 'completed') {
            evalResult =
              statusResponse.data.result || statusResponse.data.returnvalue;
            break;
          } else if (statusResponse.data.state === 'failed') {
            throw new Error(
              'Evaluation failed: ' + statusResponse.data.failedReason,
            );
          }
        } catch (e) {
          const status = e.response ? e.response.status : null;
          // Continue polling on 404 (not yet ready), or transient gateway/proxy errors (502/503/504)
          if (
            status === 404 ||
            status === 502 ||
            status === 503 ||
            status === 504 ||
            !e.response
          ) {
            continue;
          }
          throw e;
        }
      }

      if (!evalResult) throw new Error('Evaluation timed out');
      const resultObj = evalResult.result
        ? evalResult.result[0]
        : evalResult.results;
      score = evalResult.success ? resultObj?.score || 0 : 0;

      let rawFeedback = resultObj?.feedback || '';
      let feedbackText =
        typeof rawFeedback === 'object' && rawFeedback !== null
          ? rawFeedback.feedback ||
            rawFeedback.reason ||
            JSON.stringify(rawFeedback)
          : rawFeedback;

      let rubricBreakdown = [];
      if (resultObj) {
        // Get the list of allowed rubric criteria names and descriptions from the exercise
        const allowedNames = [];
        const allowedDescriptions = [];
        const rubricItems = Array.isArray(exercise.rubric)
          ? exercise.rubric
          : exercise.rubric?.criteria
            ? exercise.rubric.criteria
            : [];

        rubricItems.forEach((item) => {
          if (item.name) allowedNames.push(item.name.toLowerCase().trim());
          if (item.description)
            allowedDescriptions.push(item.description.toLowerCase().trim());
        });

        if (Array.isArray(resultObj.rubric_breakdown)) {
          rubricBreakdown = resultObj.rubric_breakdown;
        } else {
          // Merge visual, dom, behavior, and code breakdowns
          const breakdowns = [
            ...(resultObj.domBreakdown || []),
            ...(resultObj.behaviorBreakdown || []),
            ...(resultObj.codeBreakdown || []),
            ...(resultObj.visualBreakdown || []),
          ];

          rubricBreakdown = breakdowns
            .map((item) => {
              const itemName = item.item || item.name || '';
              // Find matching criteria in the database rubric by either name or description
              const match = rubricItems.find(
                (r) =>
                  (r.name &&
                    r.name.toLowerCase().trim() ===
                      itemName.toLowerCase().trim()) ||
                  (r.description &&
                    r.description.toLowerCase().trim() ===
                      itemName.toLowerCase().trim()),
              );

              // Extract max weight
              const maxVal =
                item.max !== undefined ? item.max : item.max_score || 100;
              let awardedVal =
                item.awarded !== undefined ? item.awarded : item.score || 0;

              // Auto-generate details for DOM/Code checks
              let itemFeedback = item.reason || item.feedback || '';

              if (Array.isArray(item.checks)) {
                // Special check correction: if criterion is to "avoid divs", and the check is '<div' passed=false,
                // that means they successfully avoided divs! Give them full credit.
                const isAvoidDiv =
                  match &&
                  ((match.name || '').toLowerCase().includes('avoid') ||
                    (match.description || '')
                      .toLowerCase()
                      .includes('avoid')) &&
                  ((match.name || '').toLowerCase().includes('div') ||
                    (match.description || '').toLowerCase().includes('div'));

                if (isAvoidDiv) {
                  const divCheck = item.checks.find(
                    (c) => (c.selector || c.pattern) === '<div',
                  );
                  if (divCheck && divCheck.passed === false) {
                    awardedVal = maxVal;
                    itemFeedback =
                      'Success: Correctly avoided using generic <div> containers.';
                    divCheck.passed = true; // Mark as passed
                  }
                }

                if (!itemFeedback) {
                  const failedChecks = item.checks.filter((c) => !c.passed);
                  if (failedChecks.length > 0) {
                    itemFeedback =
                      `Missing or incorrect element(s): ` +
                      failedChecks
                        .map((c) => `\`${c.selector || c.pattern}\u200b\``)
                        .join(', ');
                  }
                }
              }

              return {
                name: match ? match.name : itemName,
                score: awardedVal,
                max_score: maxVal,
                feedback: itemFeedback,
              };
            })
            .filter((item) => {
              if (allowedNames.length === 0) return true;
              const nameLower = (item.name || '').toLowerCase().trim();
              return allowedNames.includes(nameLower);
            });
        }
      }

      // Recalculate score from the mapped rubric breakdown (since we corrected the 'avoid div' check)
      if (rubricBreakdown.length > 0) {
        const totalAwarded = rubricBreakdown.reduce(
          (sum, item) => sum + item.score,
          0,
        );
        const totalMax = rubricBreakdown.reduce(
          (sum, item) => sum + item.max_score,
          0,
        );
        score = totalMax > 0 ? (totalAwarded / totalMax) * 100 : 0;
      }

      // If the exercise does not contain visual layout criteria but the OpenAI vision output returned
      // a general layout/spacing mismatch feedback, dynamically construct student feedback from the rubric results
      const hasVisualCriteria =
        resultObj?.visualBreakdown &&
        resultObj.visualBreakdown.some((item) => item.max > 0);

      if (!hasVisualCriteria && rubricBreakdown.length > 0) {
        const failedItems = rubricBreakdown.filter(
          (item) => item.score < item.max_score,
        );
        if (failedItems.length > 0) {
          feedbackText =
            `Your code is close, but has some issues: \n` +
            failedItems
              .map(
                (item) =>
                  `- **${item.name}**: ${item.feedback || 'Check that you implemented all elements correctly.'}`,
              )
              .join('\n') +
            `\n\nPlease review the instructions and update your code accordingly.`;
        } else {
          feedbackText =
            'Excellent job! All criteria for this semantic layout exercise have been met perfectly.';
        }
      }

      testResults = {
        feedback: feedbackText,
        rubric_breakdown: rubricBreakdown,
      };

      // Rescale the score relative to max_score
      score = Math.round((score / 100) * exercise.max_score);
    }
  }
} else {
  // Practice / open-ended exercise without formal test suite or rubric:
  // Save student files to workspace and award completion credit
  const workspaceDir = getSafeWorkspaceDir(userId, exerciseId, taskId);
  try {
    saveStudentFilesSafely(workspaceDir, files);
  } catch (e) {
    if (e instanceof ExerciseAccessError) throw e;
    console.warn('[submitExercise] Could not persist workspace files:', e.message);
  }

  score = null;
  isExplicitPassed = true;
  testResults = {
    feedback: 'Successfully submitted.',
  };
}

    const isPassed = isExplicitPassed !== undefined
      ? isExplicitPassed
      : (score != null ? score >= (exercise.max_score || 100) * 0.7 : true);
    const finalScore = score;

    const submissionResult = await pool.query(
      `INSERT INTO exercise_submissions (exercise_id, user_id, score, is_passed, feedback, test_results)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *;`,
      [
        exerciseId,
        userId,
        finalScore,
        isPassed,
        testResults?.feedback || (isPassed ? 'Successfully submitted.' : 'Test evaluation failed.'),
        testResults ? JSON.stringify(testResults) : null,
      ],
    );

    // Delta System: Find previous highest score for this exercise
    const prevMaxRes = await pool.query(
      `SELECT MAX(score) as max_score 
       FROM exercise_submissions 
       WHERE user_id = $1 AND exercise_id = $2 AND id != $3 AND is_passed = true`,
      [userId, exerciseId, submissionResult.rows[0].id],
    );
    const prevMaxScore = prevMaxRes.rows[0].max_score || 0;

    const prevPoints = (exercise.max_score && prevMaxScore) ? Math.round((prevMaxScore / exercise.max_score) * 100) : 0;
    const newPoints = (exercise.max_score && finalScore != null) ? Math.round((finalScore / exercise.max_score) * 100) : 0;
    const pointsAwarded = isPassed ? Math.max(0, newPoints - prevPoints) : 0;

    if (pointsAwarded > 0) {
      await pool.query(
        'INSERT INTO points_log (user_id, source, points) VALUES ($1, $2, $3)',
        [userId, 'exercise_completion', pointsAwarded],
      );
    }
    markActionToday(userId);
    await checkAndAwardBadges(userId);

    if (exercise.subtopic_id) {
      await checkAndCompleteSubtopic(userId, exercise.subtopic_id);
    }
    // BUG FIX: exercises use subtopic_id (not unit_id), so join via subtopics -> units -> topics
    const subjectIdRes = await pool.query(
      `SELECT t.subject_id FROM exercises e
       INNER JOIN subtopics st ON e.subtopic_id = st.id
       INNER JOIN units u ON st.unit_id = u.id
       INNER JOIN topics t ON u.topic_id = t.id
       WHERE e.id = $1 LIMIT 1`,
      [exerciseId]
    );
    const subjectId = subjectIdRes.rows[0]?.subject_id;
    if (subjectId) {
      const newPct = await syncUserSubjectProgress(userId, subjectId);
      console.log(`[Progress] exercise ${exerciseId} synced → userId=${userId} subjectId=${subjectId} percent=${newPct}%`);
    } else {
      console.warn(`[Progress] exercise ${exerciseId} → could not resolve subjectId for userId=${userId}`);
    }

    res.json({
      success: true,
      message: 'Successfully submitted',
      data: {
        submission: submissionResult.rows[0],
        points_awarded: pointsAwarded,
        test_results: testResults,
      },
    });
  } catch (error) {
    console.error('Error submitting exercise:', error);
    serverError(res, error);
  }
};

// ============================================
// EXERCISE WORKSPACE
// ============================================

const runnerService = require('../services/runnerService');

const {
  runTests,
  testSpecFrom,
  HARNESS_FILES,
} = require('../services/exerciseGrader');

const DEFAULT_INITIAL_FILES = {
  javascript: [{ name: 'index.js', content: '// Write your solution here\n' }],
  python: [{ name: 'main.py', content: '# Write your solution here\n' }],
  java: [
    {
      name: 'Main.java',
      content:
        'public class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n',
    },
  ],
  sql: [{ name: 'solution.sql', content: '-- Write your SQL here\n' }],
};

/**
 * Initialise (or re-open) an exercise workspace for the student.
 * Creates the directory and seeds initial files on the first open.
 * POST /api/students/exercise/:exerciseId/workspace/init
 */
exports.initExerciseWorkspace = async (req, res) => {
  try {
    const userId = req.user.id;
    const { exerciseId } = req.params;
    const { taskId } = req.body;

    const { language, initial_files, tasks } = await loadAccessibleExercise(
      userId,
      exerciseId,
    );

    // Determine which files to seed: task-specific or exercise-level
    let filesToSeedFromDb = null;
    if (taskId && Array.isArray(tasks) && tasks.length > 0) {
      const task = tasks.find((t) => t.id === taskId);
      if (!task)
        return res
          .status(404)
          .json({ success: false, message: 'Task not found' });
      filesToSeedFromDb = task.initial_files;
    } else {
      filesToSeedFromDb = initial_files;
    }

    const projectId = taskId
      ? `exercise-${exerciseId}-task-${taskId}`
      : `exercise-${exerciseId}`;
    const workspaceDir = path.join(WORKSPACE_ROOT, String(userId), projectId);

    fs.mkdirSync(workspaceDir, { recursive: true });

    const existing = fs.readdirSync(workspaceDir);
    if (existing.length === 0) {
      const filesToSeed =
        Array.isArray(filesToSeedFromDb) && filesToSeedFromDb.length > 0
          ? filesToSeedFromDb
          : (DEFAULT_INITIAL_FILES[language] ??
            DEFAULT_INITIAL_FILES.javascript);

      for (const file of filesToSeed) {
        const filePath = path.join(workspaceDir, file.name);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, file.content, 'utf-8');
      }
    }

    // Workspaces graded before the harness moved to a staging directory still
    // hold a generated __tests__ file containing every hidden case and its
    // expected value. Delete it rather than merely hiding it — it has no reason
    // to exist on disk, and leaving it there keeps the answers one path
    // traversal away.
    for (const name of fs.readdirSync(workspaceDir)) {
      if (HARNESS_FILES.has(name)) {
        fs.rmSync(path.join(workspaceDir, name), { force: true });
      }
    }

    // Return current files from disk so returning students see their saved work
    const files = fs
      .readdirSync(workspaceDir)
      .filter((f) => fs.statSync(path.join(workspaceDir, f)).isFile())
      .map((name) => ({
        name,
        content: fs.readFileSync(path.join(workspaceDir, name), 'utf-8'),
      }));

    // Fetch the latest submission for this student and exercise
    const latestSubmission = await pool.query(
      `SELECT score, is_passed, feedback, test_results 
       FROM exercise_submissions 
       WHERE user_id = $1 AND exercise_id = $2 
       ORDER BY submitted_at DESC LIMIT 1`,
      [userId, exerciseId],
    );

    const submission = latestSubmission.rows[0] || null;

    res.json({
      success: true,
      data: {
        language,
        files,
        projectId,
        submission: submission
          ? {
              score: submission.score,
              isPassed: Boolean(submission.is_passed),
              testResults:
                submission.test_results ||
                (submission.feedback
                  ? { feedback: submission.feedback }
                  : null),
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Error initialising exercise workspace:', error);
    serverError(res, error);
  }
};

/**
 * Save exercise workspace.
 * Writes student's modified code files to their local workspace.
 * POST /api/students/exercise/:exerciseId/workspace/save
 */
exports.saveExerciseWorkspace = async (req, res) => {
  try {
    const userId = req.user.id;
    const { exerciseId } = req.params;
    const { files, taskId } = req.body;

    if (!files || !Array.isArray(files)) {
      return res
        .status(400)
        .json({ success: false, message: 'Files array is required' });
    }

    // Saving creates directories on disk keyed by exercise id — gate it on the
    // same entitlement as the rest, so an unenrolled student cannot seed
    // arbitrary workspaces.
    await loadAccessibleExercise(userId, exerciseId);

    const projectId = taskId
      ? `exercise-${exerciseId}-task-${taskId}`
      : `exercise-${exerciseId}`;
    const workspaceDir = path.join(WORKSPACE_ROOT, String(userId), projectId);

    fs.mkdirSync(workspaceDir, { recursive: true });

    for (const file of files) {
      if (file.name && typeof file.content === 'string') {
        // Skip saving instruction file to disk since it's read-only
        if (file.name === 'Instructions.md') continue;

        const filePath = path.join(workspaceDir, file.name);
        const relative = path.relative(workspaceDir, filePath);
        const isSafe =
          relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        if (isSafe) {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, file.content, 'utf-8');
        }
      }
    }

    res.json({ success: true, message: 'Workspace saved successfully' });
  } catch (error) {
    console.error('Error saving exercise workspace:', error);
    serverError(res, error);
  }
};

/**

/**
 * Run test cases against the student's workspace (without submitting).
 * POST /api/students/exercise/:exerciseId/run-tests
 */
exports.runExerciseTests = async (req, res) => {
  try {
    const userId = req.user.id;
    const { exerciseId } = req.params;
    const { taskId } = req.body;

    const exercise = await loadAccessibleExercise(userId, exerciseId);
    const { language, tasks } = exercise;

    // Grade against the task the student is on, else the legacy exercise row.
    let source = exercise;
    if (taskId && Array.isArray(tasks) && tasks.length > 0) {
      const task = tasks.find((t) => t.id === taskId);
      if (!task)
        return res
          .status(404)
          .json({ success: false, message: 'Task not found' });
      source = task;
    }

    const spec = testSpecFrom(source);
    if (spec.cases.length === 0) {
      return res.json({
        success: true,
        data: { message: 'No test cases defined for this task' },
      });
    }

    const projectId = taskId
      ? `exercise-${exerciseId}-task-${taskId}`
      : `exercise-${exerciseId}`;
    const workspaceDir = path.join(WORKSPACE_ROOT, String(userId), projectId);
    if (!fs.existsSync(workspaceDir)) {
      return res
        .status(400)
        .json({ success: false, message: 'Workspace not initialised' });
    }

    // "Run tests" is the cheap feedback loop: for data-driven exercises it runs
    // only the visible sample cases. Hidden cases are held back for Submit.
    const testResult = await runTests(workspaceDir, language, spec, {
      visibleOnly: true,
    });
    res.json({
      success: true,
      data: { ...testResult, sample_only: spec.kind === 'data' },
    });
  } catch (error) {
    console.error('Error running exercise tests:', error);
    serverError(res, error);
  }
};

/**
 * Run exercise code.
 * POST /api/students/exercise/:exerciseId/run
 */
exports.runExercise = async (req, res) => {
  try {
    const userId = req.user.id;
    const { exerciseId } = req.params;
    const { taskId, activeFile } = req.body;

    const { language } = await loadAccessibleExercise(userId, exerciseId);

    const projectId = taskId
      ? `exercise-${exerciseId}-task-${taskId}`
      : `exercise-${exerciseId}`;
    const workspaceDir = path.join(WORKSPACE_ROOT, String(userId), projectId);
    if (!fs.existsSync(workspaceDir)) {
      return res
        .status(400)
        .json({ success: false, message: 'Workspace not initialised' });
    }

    const runResult = await runnerService.execute(
      workspaceDir,
      language,
      activeFile,
    );
    res.json({ success: true, data: runResult });
  } catch (error) {
    console.error('Error running exercise:', error);
    serverError(res, error);
  }
};

// ============================================
// STUDENT LEADERBOARDS
// ============================================

/**
 * Get overall leaderboard (student view)
 * GET /api/students/leaderboard/overall
 */
exports.getOverallLeaderboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.pageSize, 10) || 50),
    );
    const offset = (page - 1) * pageSize;

    const result = await pool.query(
      `WITH ranked AS (
        SELECT
          u.id AS user_id,
          u.full_name,
          c.name AS college_name,
          COALESCE(SUM(pl.points), 0)::integer AS total_points,
          RANK() OVER (ORDER BY COALESCE(SUM(pl.points), 0) DESC)::integer AS rank,
          COUNT(*) OVER ()::integer AS total_count
        FROM users u
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        LEFT JOIN colleges c ON sp.college_id = c.id
        LEFT JOIN points_log pl ON pl.user_id = u.id
        WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')
        GROUP BY u.id, u.full_name, c.name
      )
      SELECT * FROM ranked ORDER BY rank LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );

    const userRank = await pool.query(
      `SELECT rank, total_points FROM (
        SELECT
          u.id AS user_id,
          COALESCE(SUM(pl.points), 0)::integer AS total_points,
          RANK() OVER (ORDER BY COALESCE(SUM(pl.points), 0) DESC)::integer AS rank
        FROM users u
        LEFT JOIN points_log pl ON pl.user_id = u.id
        WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')
        GROUP BY u.id
      ) ranked WHERE user_id = $1`,
      [userId],
    );

    const totalCount = result.rows[0]?.total_count ?? 0;
    const leaderboard = result.rows.map(({ total_count, ...row }) => row);

    res.json({
      success: true,
      data: { leaderboard, my_rank: userRank.rows[0] || null },
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      },
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    serverError(res, error);
  }
};

/**
 * Get weekly leaderboard (student view)
 * GET /api/students/leaderboard/weekly
 */
exports.getWeeklyLeaderboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.pageSize, 10) || 50),
    );
    const offset = (page - 1) * pageSize;

    // ISO Monday of current week
    const now = new Date();
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    const weekStartStr = monday.toISOString().split('T')[0];

    const result = await pool.query(
      `WITH ranked AS (
        SELECT
          u.id AS user_id,
          u.full_name,
          c.name AS college_name,
          COALESCE(SUM(pl.points), 0)::integer AS total_points,
          RANK() OVER (ORDER BY COALESCE(SUM(pl.points), 0) DESC)::integer AS rank,
          COUNT(*) OVER ()::integer AS total_count
        FROM users u
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        LEFT JOIN colleges c ON sp.college_id = c.id
        LEFT JOIN points_log pl ON pl.user_id = u.id AND pl.created_at >= $3
        WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')
        GROUP BY u.id, u.full_name, c.name
      )
      SELECT * FROM ranked ORDER BY rank LIMIT $1 OFFSET $2`,
      [pageSize, offset, weekStartStr],
    );

    const userRank = await pool.query(
      `SELECT rank, total_points FROM (
        SELECT
          u.id AS user_id,
          COALESCE(SUM(pl.points), 0)::integer AS total_points,
          RANK() OVER (ORDER BY COALESCE(SUM(pl.points), 0) DESC)::integer AS rank
        FROM users u
        LEFT JOIN points_log pl ON pl.user_id = u.id AND pl.created_at >= $2
        WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')
        GROUP BY u.id
      ) ranked WHERE user_id = $1`,
      [userId, weekStartStr],
    );

    const totalCount = result.rows[0]?.total_count ?? 0;
    const leaderboard = result.rows.map(({ total_count, ...row }) => row);

    res.json({
      success: true,
      week_start: weekStartStr,
      data: { leaderboard, my_rank: userRank.rows[0] || null },
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      },
    });
  } catch (error) {
    console.error('Error fetching weekly leaderboard:', error);
    serverError(res, error);
  }
};

/**
 * Get college leaderboard (student view)
 * GET /api/students/leaderboard/college
 */
exports.getCollegeLeaderboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.pageSize, 10) || 50),
    );
    const offset = (page - 1) * pageSize;

    const userQuery = await pool.query(
      'SELECT college_id FROM student_profiles WHERE user_id = $1',
      [userId],
    );
    if (!userQuery.rows[0]?.college_id) {
      return res.status(400).json({
        success: false,
        message: 'User is not associated with any college',
      });
    }

    const collegeId = userQuery.rows[0].college_id;

    const result = await pool.query(
      `WITH ranked AS (
        SELECT
          u.id AS user_id,
          u.full_name,
          COALESCE(SUM(pl.points), 0)::integer AS total_points,
          RANK() OVER (ORDER BY COALESCE(SUM(pl.points), 0) DESC)::integer AS rank,
          COUNT(*) OVER ()::integer AS total_count
        FROM users u
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        LEFT JOIN points_log pl ON pl.user_id = u.id
        WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT') AND sp.college_id = $3
        GROUP BY u.id, u.full_name
      )
      SELECT * FROM ranked ORDER BY rank LIMIT $1 OFFSET $2`,
      [pageSize, offset, collegeId],
    );

    const userRank = await pool.query(
      `SELECT rank, total_points FROM (
        SELECT
          u.id AS user_id,
          COALESCE(SUM(pl.points), 0)::integer AS total_points,
          RANK() OVER (ORDER BY COALESCE(SUM(pl.points), 0) DESC)::integer AS rank
        FROM users u
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        LEFT JOIN points_log pl ON pl.user_id = u.id
        WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT') AND sp.college_id = $2
        GROUP BY u.id
      ) ranked WHERE user_id = $1`,
      [userId, collegeId],
    );

    const totalCount = result.rows[0]?.total_count ?? 0;
    const leaderboard = result.rows.map(({ total_count, ...row }) => row);

    res.json({
      success: true,
      college_id: collegeId,
      data: { leaderboard, my_rank: userRank.rows[0] || null },
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      },
    });
  } catch (error) {
    console.error('Error fetching college leaderboard:', error);
    serverError(res, error);
  }
};

// ============================================
// STUDENT PROJECTS (personal editor workspaces)
// ============================================

/**
 * List all personal projects for the logged-in student
 * GET /api/students/projects
 */
exports.getStudentProjects = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT id, name, profile, created_at, updated_at
       FROM student_projects
       WHERE user_id = $1 AND is_deleted = false
       ORDER BY updated_at DESC`,
      [userId],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching student projects:', error);
    serverError(res, error);
  }
};

/**
 * Create a new personal project
 * POST /api/students/projects
 * Body: { name: string, profile: string }
 */
exports.createStudentProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, profile } = req.body;

    if (!name || !profile) {
      return res
        .status(400)
        .json({ success: false, message: 'name and profile are required' });
    }

    const result = await pool.query(
      `INSERT INTO student_projects (user_id, name, profile)
       VALUES ($1, $2, $3)
       RETURNING id, name, profile, created_at`,
      [userId, name.trim(), profile],
    );

    logAction({
      req,
      action: 'CREATE',
      entityType: 'student_project',
      entityId: result.rows[0].id,
      details: { name, profile },
    });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating student project:', error);
    serverError(res, error);
  }
};

/**
 * Delete a personal project
 * DELETE /api/students/projects/:id
 */
exports.deleteStudentProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE student_projects SET is_deleted = true WHERE id = $1 AND user_id = $2 AND is_deleted = false RETURNING *`,
      [id, userId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Project not found' });
    }

    logAction({
      req,
      action: 'DELETE',
      entityType: 'student_project',
      entityId: id,
      details: { name: result.rows[0].name },
    });
    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    console.error('Error deleting student project:', error);
    serverError(res, error);
  }
};

// ============================================
// ASSIGNMENTS
// ============================================

/**
 * Get a single assignment by ID (student must be enrolled in the subject)
 * GET /api/students/assignments/:id
 */
exports.getAssignmentById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        a.id,
        a.title,
        a.instructions,
        a.max_score,
        a.evaluator_type,
        a.test_cases,
        a.rubric,
        s.name AS subject_title,
        s.slug AS subject_slug,
        u.title AS unit_title,
        sub.submission_link,
        sub.submitted_at
       FROM assignments a
       INNER JOIN units u ON a.unit_id = u.id
       INNER JOIN topics t ON u.topic_id = t.id
       INNER JOIN subjects s ON t.subject_id = s.id
       INNER JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
       LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.user_id = $1
       WHERE a.id = $2`,
      [userId, id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Assignment not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching assignment:', error);
    serverError(res, error);
  }
};

/**
 * Submit (or update) an assignment solution link
 * POST /api/students/assignments/:id/submit
 */
exports.submitAssignment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { submission_link } = req.body;

    if (!submission_link || !submission_link.trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'submission_link is required' });
    }

    // Verify the student is enrolled in the subject this assignment belongs to
    const enrolled = await pool.query(
      `SELECT a.id FROM assignments a
       INNER JOIN units u ON a.unit_id = u.id
       INNER JOIN topics t ON u.topic_id = t.id
       INNER JOIN subjects s ON t.subject_id = s.id
       INNER JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
       WHERE a.id = $2`,
      [userId, id],
    );

    if (enrolled.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Assignment not found' });
    }

    const result = await pool.query(
      `INSERT INTO assignment_submissions (assignment_id, user_id, submission_link)
       VALUES ($1, $2, $3)
       ON CONFLICT (assignment_id, user_id)
       DO UPDATE SET submission_link = EXCLUDED.submission_link, updated_at = CURRENT_TIMESTAMP
       RETURNING submission_link, submitted_at`,
      [id, userId, submission_link.trim()],
    );

    markActionToday(userId);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'assignment_submission',
      entityId: id,
      details: { submission_link: submission_link.trim() },
    });

    const subjectIdRes = await pool.query(
      `SELECT t.subject_id FROM assignments a
       INNER JOIN units u ON a.unit_id = u.id
       INNER JOIN topics t ON u.topic_id = t.id
       WHERE a.id = $1 LIMIT 1`,
      [id]
    );
    const subjectId = subjectIdRes.rows[0]?.subject_id;
    if (subjectId) {
      const newPct = await syncUserSubjectProgress(userId, subjectId);
      console.log(`[Progress] assignment ${id} submitted → userId=${userId} subjectId=${subjectId} percent=${newPct}%`);
    } else {
      console.warn(`[Progress] assignment ${id} → could not resolve subjectId for userId=${userId}`);
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error submitting assignment:', error);
    serverError(res, error);
  }
};

/**
 * Get all assignments for the student's enrolled subjects
 * GET /api/students/assignments
 */
exports.getStudentAssignments = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT
        a.id,
        a.title,
        a.instructions,
        a.max_score,
        s.name AS subject_title,
        s.slug AS subject_slug,
        u.title AS unit_title
      FROM assignments a
      INNER JOIN units u ON a.unit_id = u.id
      INNER JOIN topics t ON u.topic_id = t.id
      INNER JOIN subjects s ON t.subject_id = s.id
      INNER JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
      ORDER BY s.name, t.order_index, u.order_index, a.id;
    `;

    const result = await pool.query(query, [userId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching student assignments:', error);
    serverError(res, error);
  }
};

/**
 * Get comprehensive overview of all assignments (Curriculum + College) for the student
 * with 3-state evaluation tracking (pending, pending_evaluation, evaluated) and rubric feedback.
 * GET /api/students/assignments/overview
 */
exports.getStudentAssignmentsOverview = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch student's college_id
    let collegeId = req.user.college_id;
    if (!collegeId) {
      const profileRes = await pool.query(
        'SELECT college_id FROM student_profiles WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      collegeId = profileRes.rows[0]?.college_id;
    }

    // 2. Query Curriculum Assignments
    const curriculumQuery = `
      SELECT
        a.id,
        a.title,
        'CURRICULUM' AS type,
        s.name AS course_name,
        s.slug AS subject_slug,
        t.title AS topic_title,
        u.title AS unit_title,
        COALESCE(a.max_score, 100) AS max_score,
        NULL::timestamp AS due_date,
        a.created_at,
        sub.id AS submission_id,
        sub.submission_link,
        NULL::text AS submission_file_url,
        sub.submitted_at,
        er.id AS evaluation_result_id,
        er.status AS evaluation_status,
        er.marks,
        er.feedback
      FROM assignments a
      INNER JOIN units u ON a.unit_id = u.id
      INNER JOIN topics t ON u.topic_id = t.id
      INNER JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
      LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.user_id = $1
      LEFT JOIN LATERAL (
        SELECT er_inner.id, er_inner.status, er_inner.marks, er_inner.feedback
        FROM evaluation_results er_inner
        JOIN evaluations e ON er_inner.evaluation_id = e.id
        WHERE (er_inner.submission_id = sub.id OR (er_inner.student_id = $1 AND e.assignment_id = a.id))
        ORDER BY er_inner.created_at DESC
        LIMIT 1
      ) er ON true
      WHERE (us.user_id IS NOT NULL OR sub.id IS NOT NULL OR er.id IS NOT NULL)
      ORDER BY s.name, t.order_index, u.order_index, a.id
    `;
    const curriculumRes = await pool.query(curriculumQuery, [userId]);

    // 3. Query College Assignments (if student has a college)
    let collegeRows = [];
    if (collegeId) {
      const collegeQuery = `
        SELECT
          ca.id,
          ca.title,
          'COLLEGE' AS type,
          CASE
            WHEN ca.course ILIKE '%python%' THEN 'Python Basics'
            WHEN ca.course ILIKE '%js%' OR ca.course ILIKE '%react%' OR ca.course ILIKE '%web%' OR ca.course ILIKE '%node%' OR ca.course ILIKE '%html%' OR ca.course ILIKE '%css%' OR ca.course ILIKE '%frontend%' OR ca.course ILIKE '%backend%' THEN 'Full Stack Web Development'
            WHEN s.name IS NOT NULL THEN s.name
            ELSE 'Full Stack Web Development'
          END AS course_name,
          s.slug AS subject_slug,
          COALESCE(t.title, ca.course, 'General') AS topic_title,
          COALESCE(t.title, ca.course, 'General') AS unit_title,
          100 AS max_score,
          ca.due_date,
          ca.created_at,
          ca.rubric,
          cas.id AS submission_id,
          cas.submission_link,
          cas.submission_file_url,
          cas.submitted_at,
          er.id AS evaluation_result_id,
          er.status AS evaluation_status,
          er.marks,
          er.feedback
        FROM college_assignments ca
        LEFT JOIN subjects s ON (s.id::text = ca.course OR s.slug = ca.course OR s.name = ca.course)
        LEFT JOIN topics t ON ca.topic_id = t.id
        LEFT JOIN college_assignment_submissions cas ON cas.assignment_id = ca.id AND cas.student_id = $1
        LEFT JOIN LATERAL (
          SELECT er_inner.id, er_inner.status, er_inner.marks, er_inner.feedback
          FROM evaluation_results er_inner
          JOIN evaluations e ON er_inner.evaluation_id = e.id
          WHERE (er_inner.submission_id = cas.id OR (er_inner.student_id = $1 AND e.college_assignment_id = ca.id))
          ORDER BY er_inner.created_at DESC
          LIMIT 1
        ) er ON true
        WHERE ca.college_id = $2 AND ca.is_deleted = false
        ORDER BY ca.due_date ASC NULLS LAST, ca.created_at DESC
      `;
      const collegeRes = await pool.query(collegeQuery, [userId, collegeId]);
      collegeRows = collegeRes.rows;
    }

    // 4. Process and normalize items
    const allAssignments = [];

    const getRubricMaxScore = (rubric, fallback = 100) => {
      if (!rubric) return fallback;
      try {
        const parsed = typeof rubric === 'string' ? JSON.parse(rubric) : rubric;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sum = parsed.reduce((acc, curr) => acc + (Number(curr.max_points || curr.weight || curr.max) || 0), 0);
          if (sum > 0) return sum;
        }
      } catch {}
      return fallback;
    };

    const parseFeedback = (feedback) => {
      if (!feedback) return null;
      if (typeof feedback === 'object') return feedback;
      try {
        const parsed = JSON.parse(feedback);
        if (typeof parsed.summary === 'string' && parsed.summary.trim().startsWith('{')) {
          try {
            const inner = JSON.parse(parsed.summary);
            if (inner && typeof inner === 'object') {
              return { ...parsed, ...inner };
            }
          } catch {}
        }
        return parsed;
      } catch {
        return { summary: String(feedback) };
      }
    };

    // Process curriculum assignments
    for (const row of curriculumRes.rows) {
      const isSubmitted = Boolean(row.submission_link || row.submitted_at);
      let status = 'pending';
      if (row.evaluation_status === 'completed') {
        status = 'evaluated';
      } else if (isSubmitted || row.evaluation_status === 'pending') {
        status = 'pending_evaluation';
      }

      const feedback = parseFeedback(row.feedback);
      const submissionLink = row.submission_link ? await presignS3Url(row.submission_link) : null;

      allAssignments.push({
        id: row.id,
        title: row.title,
        type: 'CURRICULUM',
        course_name: row.course_name,
        subject_slug: row.subject_slug,
        topic_title: row.topic_title || null,
        unit_title: row.unit_title,
        max_score: Number(row.max_score) || 100,
        due_date: row.due_date,
        created_at: row.created_at,
        status,
        submitted_at: row.submitted_at,
        submission_link: submissionLink,
        submission_file_url: null,
        marks: (status === 'evaluated' || row.evaluation_status === 'completed') && row.marks !== null ? Number(row.marks) : null,
        feedback,
        navigation_url: `/dashboard/student/courses/${row.subject_slug}/assignment/${row.id}`,
      });
    }

    // Process college assignments
    for (const row of collegeRows) {
      const isSubmitted = Boolean(row.submission_link || row.submission_file_url || row.submitted_at);
      let status = 'pending';
      if (row.evaluation_status === 'completed') {
        status = 'evaluated';
      } else if (isSubmitted || row.evaluation_status === 'pending') {
        status = 'pending_evaluation';
      }

      const maxScore = getRubricMaxScore(row.rubric, 100);
      const feedback = parseFeedback(row.feedback);
      const submissionLink = row.submission_link ? await presignS3Url(row.submission_link) : null;
      const submissionFileUrl = row.submission_file_url ? await presignS3Url(row.submission_file_url) : null;

      allAssignments.push({
        id: row.id,
        title: row.title,
        type: 'COLLEGE',
        course_name: row.course_name,
        subject_slug: row.subject_slug || null,
        topic_title: row.topic_title || null,
        unit_title: row.unit_title || null,
        max_score: maxScore,
        due_date: row.due_date,
        created_at: row.created_at,
        status,
        submitted_at: row.submitted_at,
        submission_link: submissionLink,
        submission_file_url: submissionFileUrl,
        marks: (status === 'evaluated' || row.evaluation_status === 'completed') && row.marks !== null ? Number(row.marks) : null,
        feedback,
        navigation_url: `/dashboard/student/assignments/${row.id}`,
      });
    }

    // Sort: Pending first, then Pending Evaluation, then Evaluated
    const statusOrder = { pending: 0, pending_evaluation: 1, evaluated: 2 };
    allAssignments.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    res.json({
      success: true,
      data: allAssignments,
      counts: {
        total: allAssignments.length,
        pending: allAssignments.filter((a) => a.status === 'pending').length,
        pending_evaluation: allAssignments.filter((a) => a.status === 'pending_evaluation').length,
        evaluated: allAssignments.filter((a) => a.status === 'evaluated').length,
      },
    });
  } catch (error) {
    console.error('Error in getStudentAssignmentsOverview:', error);
    serverError(res, error);
  }
};

// ============================================
// CAPSTONE PROJECTS
// ============================================

/**
 * Get comprehensive overview of all curriculum capstone projects for the student
 * with 3-state evaluation tracking (pending, pending_evaluation, evaluated) and rubric feedback.
 * GET /api/students/projects/overview
 */
exports.getStudentProjectsOverview = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT
        p.id,
        p.title,
        'CAPSTONE' AS type,
        s.name AS course_name,
        s.slug AS subject_slug,
        t.title AS topic_title,
        COALESCE(p.max_score, 100) AS max_score,
        NULL::timestamp AS due_date,
        p.created_at,
        p.evaluator_type,
        ps.id AS submission_id,
        ps.submission_link,
        ps.submitted_at,
        ps.score AS ps_score,
        ps.rubric_breakdown AS ps_rubric_breakdown,
        er.id AS evaluation_result_id,
        er.status AS evaluation_status,
        er.marks AS er_marks,
        er.feedback AS er_feedback
      FROM projects p
      INNER JOIN topics t ON p.topic_id = t.id
      INNER JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
      LEFT JOIN project_submissions ps ON ps.project_id = p.id AND ps.user_id = $1
      LEFT JOIN LATERAL (
        SELECT er_inner.id, er_inner.status, er_inner.marks, er_inner.feedback
        FROM evaluation_results er_inner
        JOIN evaluations e ON er_inner.evaluation_id = e.id
        WHERE (er_inner.submission_id = ps.id OR (er_inner.student_id = $1 AND e.project_id = p.id))
        ORDER BY er_inner.created_at DESC
        LIMIT 1
      ) er ON true
      WHERE (p.is_deleted = false OR p.is_deleted IS NULL)
        AND (us.user_id IS NOT NULL OR ps.id IS NOT NULL OR er.id IS NOT NULL)
      ORDER BY s.name, t.order_index, p.id
    `;

    const result = await pool.query(query, [userId]);

    const parseFeedback = (feedback) => {
      if (!feedback) return null;
      if (typeof feedback === 'object') return feedback;
      try {
        const parsed = JSON.parse(feedback);
        if (typeof parsed.summary === 'string' && parsed.summary.trim().startsWith('{')) {
          try {
            const inner = JSON.parse(parsed.summary);
            if (inner && typeof inner === 'object') {
              return { ...parsed, ...inner };
            }
          } catch {}
        }
        return parsed;
      } catch {
        return { summary: String(feedback) };
      }
    };

    const allProjects = [];

    for (const row of result.rows) {
      const isSubmitted = Boolean(row.submission_link || row.submitted_at);
      const isEvaluated = row.evaluation_status === 'completed' || (row.ps_score !== null && row.ps_score !== undefined);

      let status = 'pending';
      if (isEvaluated) {
        status = 'evaluated';
      } else if (isSubmitted || row.evaluation_status === 'pending') {
        status = 'pending_evaluation';
      }

      const rawFeedback = row.er_feedback || row.ps_rubric_breakdown;
      const feedback = parseFeedback(rawFeedback);

      let marks = null;
      if (status === 'evaluated') {
        if (row.er_marks !== null && row.er_marks !== undefined) {
          marks = Number(row.er_marks);
        } else if (row.ps_score !== null && row.ps_score !== undefined) {
          marks = Number(row.ps_score);
        }
      }

      allProjects.push({
        id: row.id,
        title: row.title,
        type: 'CAPSTONE',
        course_name: row.course_name,
        subject_slug: row.subject_slug,
        topic_title: row.topic_title || null,
        unit_title: row.topic_title || null,
        max_score: Number(row.max_score) || 100,
        due_date: row.due_date,
        created_at: row.created_at,
        status,
        submitted_at: row.submitted_at,
        submission_link: row.submission_link,
        submission_file_url: null,
        marks,
        feedback,
        navigation_url: `/dashboard/student/courses/${row.subject_slug}/capstone/${row.id}`,
      });
    }

    // Sort: Pending first, then Pending Evaluation, then Evaluated
    const statusOrder = { pending: 0, pending_evaluation: 1, evaluated: 2 };
    allProjects.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    res.json({
      success: true,
      data: allProjects,
      counts: {
        total: allProjects.length,
        pending: allProjects.filter((p) => p.status === 'pending').length,
        pending_evaluation: allProjects.filter((p) => p.status === 'pending_evaluation').length,
        evaluated: allProjects.filter((p) => p.status === 'evaluated').length,
      },
    });
  } catch (error) {
    console.error('Error in getStudentProjectsOverview:', error);
    serverError(res, error);
  }
};

/**
 * Get capstone project for a topic (with existing submission if any)
 * GET /api/students/capstone/:projectId
 */
exports.getCapstone = async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId } = req.params;

    const result = await pool.query(
      `SELECT
        p.id, p.title, p.instructions, p.max_score, p.evaluator_type, p.rubric,
        ps.submission_link, ps.is_approved, ps.submitted_at, 
        COALESCE(er.marks, ps.score) AS score,
        er.feedback AS er_feedback,
        ps.rubric_breakdown AS ps_rubric_breakdown,
        ps.execution_logs,
        er.status AS evaluation_status
       FROM projects p
       INNER JOIN topics t ON p.topic_id = t.id
       INNER JOIN subjects s ON t.subject_id = s.id
       LEFT JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
       LEFT JOIN project_submissions ps ON ps.project_id = p.id AND ps.user_id = $1
       LEFT JOIN LATERAL (
         SELECT er_inner.marks, er_inner.feedback, er_inner.status
         FROM evaluation_results er_inner
         JOIN evaluations e ON er_inner.evaluation_id = e.id
         WHERE (er_inner.submission_id = ps.id OR (er_inner.student_id = $1 AND e.project_id = p.id))
         ORDER BY er_inner.created_at DESC
         LIMIT 1
       ) er ON true
       WHERE p.id = $2
         AND (p.is_deleted = false OR p.is_deleted IS NULL)
         AND (us.user_id IS NOT NULL OR ps.id IS NOT NULL OR er.marks IS NOT NULL)`,
      [userId, projectId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Capstone project not found' });
    }

    const row = result.rows[0];

    const parseFeedback = (feedback) => {
      if (!feedback) return null;
      if (typeof feedback === 'object') return feedback;
      try {
        const parsed = JSON.parse(feedback);
        if (typeof parsed.summary === 'string' && parsed.summary.trim().startsWith('{')) {
          try {
            const inner = JSON.parse(parsed.summary);
            if (inner && typeof inner === 'object') {
              return { ...parsed, ...inner };
            }
          } catch {}
        }
        return parsed;
      } catch {
        return { summary: String(feedback) };
      }
    };

    const rawFeedback = row.er_feedback || row.ps_rubric_breakdown;
    const rubric_breakdown = parseFeedback(rawFeedback);
    const submission_link = row.submission_link
      ? await presignS3Url(row.submission_link)
      : null;

    res.json({
      success: true,
      data: {
        id: row.id,
        title: row.title,
        instructions: row.instructions,
        max_score: row.max_score ? Number(row.max_score) : 100,
        evaluator_type: row.evaluator_type,
        rubric: row.rubric,
        submission_link,
        is_approved: row.is_approved,
        submitted_at: row.submitted_at,
        score: row.score !== null && row.score !== undefined ? Number(row.score) : null,
        rubric_breakdown,
        execution_logs: row.execution_logs,
        evaluation_status: row.evaluation_status,
      },
    });
  } catch (error) {
    console.error('Error fetching capstone:', error);
    serverError(res, error);
  }
};

/**
 * Submit (or update) a capstone project solution link
 * POST /api/students/capstone/:projectId/submit
 */
exports.submitCapstone = async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId } = req.params;
    const { submission_link } = req.body;

    if (!submission_link || !submission_link.trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'submission_link is required' });
    }

    // Verify enrollment
    const enrolled = await pool.query(
      `SELECT p.id FROM projects p
       INNER JOIN topics t ON p.topic_id = t.id
       INNER JOIN subjects s ON t.subject_id = s.id
       LEFT JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
       LEFT JOIN project_submissions ps ON ps.project_id = p.id AND ps.user_id = $1
       WHERE p.id = $2
         AND (p.is_deleted = false OR p.is_deleted IS NULL)
         AND (us.user_id IS NOT NULL OR ps.id IS NOT NULL)`,
      [userId, projectId],
    );

    if (enrolled.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Project not found' });
    }

    const result = await pool.query(
      `INSERT INTO project_submissions (project_id, user_id, submission_link)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id)
       DO UPDATE SET submission_link = EXCLUDED.submission_link, updated_at = CURRENT_TIMESTAMP
       RETURNING submission_link, submitted_at, is_approved`,
      [projectId, userId, submission_link.trim()],
    );

    // Award 20 points once per capstone (idempotent via unique source key)
    const source = `capstone_${projectId}`;
    const alreadyAwarded = await pool.query(
      'SELECT 1 FROM points_log WHERE user_id = $1 AND source = $2 LIMIT 1',
      [userId, source],
    );
    if (alreadyAwarded.rows.length === 0) {
      await pool.query(
        'INSERT INTO points_log (user_id, source, points) VALUES ($1, $2, $3)',
        [userId, source, 20],
      );
      await checkAndAwardBadges(userId);
    }
    markActionToday(userId);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'project_submission',
      entityId: projectId,
      details: { submission_link: submission_link.trim() },
    });

    const subjectIdRes = await pool.query(
      `SELECT t.subject_id FROM projects p
       INNER JOIN topics t ON p.topic_id = t.id
       WHERE p.id = $1 LIMIT 1`,
      [projectId]
    );
    const subjectId = subjectIdRes.rows[0]?.subject_id;
    if (subjectId) {
      const newPct = await syncUserSubjectProgress(userId, subjectId);
      console.log(`[Progress] capstone ${projectId} submitted → userId=${userId} subjectId=${subjectId} percent=${newPct}%`);
    } else {
      console.warn(`[Progress] capstone ${projectId} → could not resolve subjectId for userId=${userId}`);
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error submitting capstone:', error);
    serverError(res, error);
  }
};

// ── Enroll in Subject ──────────────────────────────────────────────────────────

exports.enrollInSubject = async (req, res) => {
  const userId = req.user.id;
  const { subjectId } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify subject exists and is published
    const subjectCheck = await client.query(
      'SELECT id FROM subjects WHERE id = $1 AND is_published = true AND is_deleted = false',
      [subjectId],
    );
    if (subjectCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Subject not found or not available',
      });
    }

    // Insert enrollment (idempotent)
    await client.query(
      `INSERT INTO user_subjects (user_id, subject_id, started_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, subject_id) DO NOTHING`,
      [userId, subjectId],
    );

    // Seed subtopic progress: unlocked by default (peer-progression locking
    // not enforced yet); only locked if an admin explicitly locked it.
    await client.query(
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
          WHEN al.is_locked = true THEN false   -- admin explicitly locked
          ELSE true                             -- unlocked by default; locking mechanism TBD
        END
      FROM subject_subtopics ss
      LEFT JOIN admin_locks al ON al.subtopic_id = ss.subtopic_id
      ON CONFLICT (user_id, subtopic_id)
        DO UPDATE SET is_unlocked = (user_subtopic_progress.is_unlocked OR EXCLUDED.is_unlocked)`,
      [userId, subjectId],
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Enrolled successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error enrolling in subject:', error);
    serverError(res, error);
  } finally {
    client.release();
  }
};

// ── Scorecard ──────────────────────────────────────────────────────────────────
// Returns topic-wise weighted scores for all subjects the student is enrolled in.
// Weights: exercises 20%, quizzes 10%, assignments 30%, projects 40%
//
// NOTE: Assignment scoring requires this column (run once on DB):
//   ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT NULL;

exports.getStudentScorecard = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `
      WITH enrolled AS (
        SELECT s.id AS subject_id, s.name AS subject_name
        FROM user_subjects us
        JOIN subjects s ON s.id = us.subject_id
        WHERE us.user_id = $1
      ),
      topic_list AS (
        SELECT t.id, t.title, t.order_index, t.subject_id
        FROM topics t
        WHERE t.subject_id IN (SELECT subject_id FROM enrolled)
      ),
      -- Best exercise score per exercise for this user
      best_exercise AS (
        SELECT exercise_id, MAX(score) AS best_score
        FROM exercise_submissions
        WHERE user_id = $1
        GROUP BY exercise_id
      ),
      -- Map exercises to topics (via unit_id or subtopic -> unit)
      exercise_topic AS (
        SELECT e.id AS exercise_id, u.topic_id
        FROM exercises e
        JOIN units u ON e.unit_id = u.id
        WHERE u.topic_id IN (SELECT id FROM topic_list)
        UNION
        SELECT e.id AS exercise_id, u.topic_id
        FROM exercises e
        JOIN subtopics st ON e.subtopic_id = st.id
        JOIN units u ON st.unit_id = u.id
        WHERE u.topic_id IN (SELECT id FROM topic_list)
      ),
      exercise_weighted AS (
        SELECT
          et.topic_id,
          ROUND(
            COALESCE(SUM(be.best_score)::numeric / NULLIF(SUM(e.max_score), 0) * 20, 0),
            1
          ) AS weighted
        FROM exercise_topic et
        JOIN exercises e ON e.id = et.exercise_id
        LEFT JOIN best_exercise be ON be.exercise_id = et.exercise_id
        GROUP BY et.topic_id
      ),
      -- Best quiz score per quiz for this user
      best_quiz AS (
        SELECT quiz_id, MAX(score) AS best_score
        FROM quiz_attempts
        WHERE user_id = $1
        GROUP BY quiz_id
      ),
      quiz_weighted AS (
        SELECT
          u.topic_id,
          ROUND(
            COALESCE(SUM(bq.best_score)::numeric / NULLIF(SUM(q.max_score), 0) * 10, 0),
            1
          ) AS weighted
        FROM best_quiz bq
        JOIN quizzes q ON q.id = bq.quiz_id
        JOIN units u ON q.unit_id = u.id
        WHERE u.topic_id IN (SELECT id FROM topic_list)
        GROUP BY u.topic_id
      ),
      -- Assignment scores (only graded submissions count)
      assignment_weighted AS (
        SELECT
          u.topic_id,
          ROUND(
            COALESCE(SUM(asub.score)::numeric / NULLIF(SUM(a.max_score), 0) * 30, 0),
            1
          ) AS weighted
        FROM assignment_submissions asub
        JOIN assignments a ON a.id = asub.assignment_id
        JOIN units u ON a.unit_id = u.id
        WHERE asub.user_id = $1
          AND asub.score IS NOT NULL
          AND u.topic_id IN (SELECT id FROM topic_list)
        GROUP BY u.topic_id
      ),
      -- Project (capstone) scores
      project_weighted AS (
        SELECT
          p.topic_id,
          ROUND(
            COALESCE(SUM(ps.score)::numeric / NULLIF(SUM(p.max_score), 0) * 40, 0),
            1
          ) AS weighted
        FROM project_submissions ps
        JOIN projects p ON p.id = ps.project_id
        WHERE ps.user_id = $1
          AND ps.score IS NOT NULL
          AND p.topic_id IN (SELECT id FROM topic_list)
        GROUP BY p.topic_id
      )
      SELECT
        e.subject_id,
        e.subject_name,
        t.id AS topic_id,
        t.title AS topic_title,
        t.order_index,
        COALESCE(ew.weighted, 0) AS exercise_score,
        COALESCE(qw.weighted, 0) AS quiz_score,
        COALESCE(aw.weighted, 0) AS assignment_score,
        COALESCE(pw.weighted, 0) AS project_score,
        ROUND(
          COALESCE(ew.weighted, 0) +
          COALESCE(qw.weighted, 0) +
          COALESCE(aw.weighted, 0) +
          COALESCE(pw.weighted, 0),
          1
        ) AS total_score
      FROM topic_list t
      JOIN enrolled e ON e.subject_id = t.subject_id
      LEFT JOIN exercise_weighted ew ON ew.topic_id = t.id
      LEFT JOIN quiz_weighted qw ON qw.topic_id = t.id
      LEFT JOIN assignment_weighted aw ON aw.topic_id = t.id
      LEFT JOIN project_weighted pw ON pw.topic_id = t.id
      ORDER BY e.subject_name, t.order_index
      `,
      [userId],
    );

    // Group topics by subject
    const subjectMap = new Map();
    for (const row of result.rows) {
      if (!subjectMap.has(row.subject_id)) {
        subjectMap.set(row.subject_id, {
          subject_id: row.subject_id,
          subject_name: row.subject_name,
          topics: [],
        });
      }
      subjectMap.get(row.subject_id).topics.push({
        topic_id: row.topic_id,
        topic_title: row.topic_title,
        exercise_score: parseFloat(row.exercise_score),
        quiz_score: parseFloat(row.quiz_score),
        assignment_score: parseFloat(row.assignment_score),
        project_score: parseFloat(row.project_score),
        total_score: parseFloat(row.total_score),
      });
    }

    res.json({ success: true, data: Array.from(subjectMap.values()) });
  } catch (error) {
    console.error('Error fetching scorecard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch scorecard',
    });
  }
};

/**
 * Student per-module analytics breakdown
 * GET /api/students/analytics/modules
 */
exports.getStudentModuleAnalytics = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT
         t.id AS topic_id,
         t.title AS topic_title,
         s.id AS subject_id,
         s.name AS subject_name,
         -- Best quiz score for this topic (sum of best per-quiz scores vs total max)
         COALESCE((
           SELECT SUM(bq.best_score)
           FROM (
             SELECT qa.quiz_id, MAX(qa.score) AS best_score
             FROM quiz_attempts qa
             JOIN quizzes q ON q.id = qa.quiz_id
             JOIN units un ON un.id = q.unit_id
             WHERE qa.user_id = $1 AND un.topic_id = t.id
             GROUP BY qa.quiz_id
           ) bq
         ), 0)::int AS quiz_score,
         -- Real max achievable points (sum of question points) for quizzes
         -- ATTEMPTED so far, not the quizzes.max_score column (a fixed
         -- constant, can be out of sync with actual question points — see
         -- submitQuizAttempt's actual_max_score) and not all quizzes in the
         -- topic (quiz_score/quiz_max should reflect accuracy on what's been
         -- attempted; quizzes_attempted/quizzes_total below covers completion).
         COALESCE((
           SELECT SUM(qq.points)
           FROM quiz_questions qq
           JOIN quizzes q ON q.id = qq.quiz_id
           JOIN units un ON un.id = q.unit_id
           WHERE un.topic_id = t.id AND qq.is_deleted = false
             AND EXISTS (
               SELECT 1 FROM quiz_attempts qa
               WHERE qa.quiz_id = q.id AND qa.user_id = $1
             )
         ), 0)::int AS quiz_max,
         -- Assignment status is now derived in JS from asg_submitted/asg_total
         -- (below) instead of a binary EXISTS check, so partial completion
         -- across multiple assignments in a topic isn't hidden behind a
         -- single Submitted/Pending flag.
         -- Project status is now derived in JS from proj_submitted/proj_approved/
         -- proj_total (below), same reasoning as assignment_status: a binary
         -- EXISTS check would hide partial completion across multiple projects
         -- in one topic.
         -- NEW PROGRESS COUNTS
         COALESCE((
           SELECT COUNT(*)::int
           FROM user_lesson_progress ulp
           JOIN lesson_content lc ON lc.id = ulp.lesson_content_id
           JOIN subtopics st ON st.id = lc.subtopic_id
           JOIN units un ON un.id = st.unit_id
           WHERE ulp.is_completed = true AND ulp.user_id = $1 AND un.topic_id = t.id
         ), 0) AS lessons_completed,
         COALESCE((
           SELECT COUNT(*)::int
           FROM lesson_content lc
           JOIN subtopics st ON st.id = lc.subtopic_id
           JOIN units un ON un.id = st.unit_id
           WHERE un.topic_id = t.id
         ), 0) AS lessons_total,
         COALESCE((
           SELECT COUNT(DISTINCT q.id)::int
           FROM quiz_attempts qa
           JOIN quizzes q ON q.id = qa.quiz_id
           JOIN units un ON un.id = q.unit_id
           WHERE qa.user_id = $1 AND qa.is_passed = true AND un.topic_id = t.id
         ), 0) AS quizzes_passed,
         -- Distinct quizzes attempted at all (pass or fail) — used to show
         -- completion ("2 of 5 quizzes attempted") separately from accuracy
         -- (quiz_score/quiz_max), so an un-attempted quiz doesn't silently
         -- drag down the accuracy percentage as if it were scored 0.
         COALESCE((
           SELECT COUNT(DISTINCT q.id)::int
           FROM quiz_attempts qa
           JOIN quizzes q ON q.id = qa.quiz_id
           JOIN units un ON un.id = q.unit_id
           WHERE qa.user_id = $1 AND un.topic_id = t.id
         ), 0) AS quizzes_attempted,
         COALESCE((
           SELECT COUNT(*)::int
           FROM quizzes q
           JOIN units un ON un.id = q.unit_id
           WHERE un.topic_id = t.id
         ), 0) AS quizzes_total,
         COALESCE((
           SELECT COUNT(*)::int
           FROM assignment_submissions sub
           JOIN assignments a ON a.id = sub.assignment_id
           JOIN units un ON un.id = a.unit_id
           WHERE sub.user_id = $1 AND un.topic_id = t.id
         ), 0) AS asg_submitted,
         COALESCE((
           SELECT COUNT(*)::int
           FROM assignments a
           JOIN units un ON un.id = a.unit_id
           WHERE un.topic_id = t.id
         ), 0) AS asg_total,
         COALESCE((
           SELECT COUNT(*)::int
           FROM project_submissions sub
           JOIN projects p ON p.id = sub.project_id
           WHERE sub.user_id = $1 AND p.topic_id = t.id
         ), 0) AS proj_submitted,
         COALESCE((
           SELECT COUNT(*)::int
           FROM project_submissions sub
           JOIN projects p ON p.id = sub.project_id
           WHERE sub.user_id = $1 AND p.topic_id = t.id AND sub.is_approved = true
         ), 0) AS proj_approved,
         COALESCE((
           SELECT COUNT(*)::int
           FROM projects p
           WHERE p.topic_id = t.id
         ), 0) AS proj_total
       FROM topics t
       JOIN subjects s ON s.id = t.subject_id
       JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
       ORDER BY s.name, t.order_index`,
      [userId],
    );

    // Group by subject
    const subjectMap = new Map();
    let totalProgressSum = 0;
    let totalTopics = 0;

    for (const row of result.rows) {
      if (!subjectMap.has(row.subject_id)) {
        subjectMap.set(row.subject_id, {
          subject_id: row.subject_id,
          subject_name: row.subject_name,
          topics: [],
        });
      }

      // Calculate progress for this topic
      const calcPct = (completed, total) =>
        total > 0 ? Math.round((completed / total) * 100) : null;
      const lessonPct = calcPct(row.lessons_completed, row.lessons_total);
      const quizPct = calcPct(row.quizzes_passed, row.quizzes_total);
      const asgPct = calcPct(row.asg_submitted, row.asg_total);
      const projPct = calcPct(row.proj_submitted, row.proj_total);

      const pcts = [lessonPct, quizPct, asgPct, projPct].filter(
        (p) => p !== null,
      );
      const progress =
        pcts.length > 0
          ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
          : 0;

      totalProgressSum += progress;
      totalTopics++;

      // Derived from counts (not a binary EXISTS check) so partial
      // completion across multiple assignments in a topic is visible
      // instead of collapsing to a single Submitted/Pending flag.
      let assignmentStatus = null;
      if (row.asg_total > 0) {
        assignmentStatus =
          row.asg_submitted === 0
            ? 'Pending'
            : row.asg_submitted < row.asg_total
              ? 'Partial'
              : 'Submitted';
      }

      // Same reasoning as assignmentStatus above — distinguishes "no
      // projects in this topic" from partial/full submission and approval.
      let projectStatus = null;
      if (row.proj_total > 0) {
        projectStatus =
          row.proj_submitted === 0
            ? 'Not Started'
            : row.proj_approved === row.proj_total
              ? 'Approved'
              : row.proj_submitted < row.proj_total
                ? 'Partial'
                : 'Submitted';
      }

      subjectMap.get(row.subject_id).topics.push({
        topic_id: row.topic_id,
        topic_title: row.topic_title,
        quiz_score: row.quiz_score,
        quiz_max: row.quiz_max,
        quizzes_attempted: row.quizzes_attempted,
        quizzes_total: row.quizzes_total,
        assignment_status: assignmentStatus,
        assignments_submitted: row.asg_submitted,
        assignments_total: row.asg_total,
        project_status: projectStatus,
        projects_submitted: row.proj_submitted,
        projects_approved: row.proj_approved,
        projects_total: row.proj_total,
        progress,
      });
    }

    const overall_progress =
      totalTopics > 0 ? Math.round(totalProgressSum / totalTopics) : 0;

    res.json({
      success: true,
      overall_progress,
      data: Array.from(subjectMap.values()),
    });
  } catch (err) {
    console.error('getStudentModuleAnalytics error:', err);
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch module analytics' });
  }
};

/**
 * Student self-analytics summary
 * GET /api/students/analytics
 */
exports.getStudentAnalytics = async (req, res) => {
  const userId = req.user.id;
  try {
    // Reconcile user streak to ensure dashboard metrics reflect true activity
    await reconcileUserStreak(userId);

    // Fetch data sequentially to prevent Neon connection pool exhaustion/timeouts
    const metricsRes = await pool.query(
      `SELECT
         (SELECT COUNT(DISTINCT quiz_id)::int FROM quiz_attempts WHERE user_id = $1)         AS quizzes_attempted,
         COALESCE((
           SELECT ROUND(AVG(best_score_pct))::int
           FROM (
             SELECT MAX(qa.score)::numeric / NULLIF(q.max_score, 0) * 100 AS best_score_pct
             FROM quiz_attempts qa
             JOIN quizzes q ON q.id = qa.quiz_id
             WHERE qa.user_id = $1 AND q.max_score > 0
             GROUP BY qa.quiz_id, q.max_score
           ) best_scores
         ), 0)                                                                 AS avg_quiz_score,
         (SELECT COUNT(DISTINCT assignment_id)::int FROM assignment_submissions WHERE user_id = $1) AS assignments_submitted,
         (SELECT COUNT(DISTINCT project_id)::int FROM project_submissions WHERE user_id = $1 AND is_approved = true)
                                                                               AS projects_completed,
          (SELECT CASE WHEN last_activity::date >= CURRENT_DATE - 1 THEN current_streak ELSE 0 END FROM user_streaks WHERE user_id = $1) AS current_streak,
          (SELECT COALESCE(longest_streak, 0) FROM user_streaks WHERE user_id = $1) AS longest_streak,
          (SELECT (last_activity::date = CURRENT_DATE) FROM user_streaks WHERE user_id = $1) AS practiced_today,
          (SELECT last_activity FROM user_streaks WHERE user_id = $1)           AS last_activity,
          (SELECT (CURRENT_DATE - last_activity::date) FROM user_streaks WHERE user_id = $1) AS days_since_active`,
      [userId],
    );

    const recentQuizzesRes = await pool.query(
      `SELECT q.id AS id, un.title AS name,
              MAX(qa.score)::int AS score,
              CASE WHEN bool_or(qa.is_passed) THEN 'Passed' ELSE 'Failed' END AS status,
              MAX(qa.created_at) AS created_at
       FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quiz_id
       JOIN units un ON un.id = q.unit_id
       WHERE qa.user_id = $1
       GROUP BY q.id, un.title
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId],
    );

    const pendingRes = await pool.query(
      `SELECT COUNT(*)::int AS assignments_pending
       FROM assignments a
       JOIN units u ON u.id = a.unit_id
       JOIN topics t ON t.id = u.topic_id
       JOIN subjects s ON s.id = t.subject_id
       JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
       WHERE NOT EXISTS (
         SELECT 1 FROM assignment_submissions sub
         WHERE sub.assignment_id = a.id AND sub.user_id = $1
       )`,
      [userId],
    );

    const totalXp = await getTotalXP(userId);

    const m = metricsRes.rows[0];
    res.json({
      success: true,
      data: {
        metrics: {
          quizzes_attempted: m.quizzes_attempted,
          avg_quiz_score: m.avg_quiz_score,
          assignments_submitted: m.assignments_submitted,
          assignments_pending: pendingRes.rows[0].assignments_pending,
          projects_completed: m.projects_completed,
          current_streak: m.current_streak || 0,
          longest_streak: m.longest_streak || 0,
          practiced_today: Boolean(m.practiced_today),
          last_activity: m.last_activity || null,
          days_since_active: m.days_since_active || 0,
          total_xp: totalXp,
        },
        recent_quizzes: recentQuizzesRes.rows,
      },
    });
  } catch (err) {
    console.error('getStudentAnalytics error:', err);
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch analytics' });
  }
};

/**
 * Get active progress-driven milestone deadlines (5 days for quiz, 10 days for assignment)
 * GET /api/v1/students/deadlines/active-milestones
 */
exports.getActiveMilestoneDeadlines = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch user basic info and registration timestamp
    let studentName = 'Student';
    let firstName = 'Student';
    let collegeId = null;
    let userCreatedAt = new Date();

    try {
      const userRes = await pool.query(
        `SELECT u.full_name, u.created_at, sp.college_id
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = $1`,
        [userId],
      );
      studentName = userRes.rows[0]?.full_name || 'Student';
      firstName = studentName.trim().split(' ')[0] || 'Student';
      collegeId = userRes.rows[0]?.college_id || null;
      if (userRes.rows[0]?.created_at) {
        userCreatedAt = new Date(userRes.rows[0].created_at);
      }
    } catch (uErr) {
      console.warn('[Milestones] Error fetching user profile:', uErr.message);
    }

    // 2. Identify units where the student has completed 100% of reading lessons / subtopics
    // Timer for a unit starts ONLY after the student finishes all lessons in that unit
    const completedUnitsRes = await pool.query(
      `SELECT 
         u.id AS unit_id,
         u.title AS unit_title,
         u.order_index AS unit_order,
         t.id AS topic_id,
         t.title AS topic_title,
         t.order_index AS topic_order,
         s.id AS subject_id,
         s.name AS subject_name,
         s.slug AS subject_slug,
         COUNT(DISTINCT st.id)::int AS total_subtopics,
         COUNT(DISTINCT st.id) FILTER (
           WHERE usp.is_completed = true
              OR (
                EXISTS(
                  SELECT 1 FROM lesson_content lc 
                  JOIN user_lesson_progress ulp ON ulp.lesson_content_id = lc.id 
                  WHERE lc.subtopic_id = st.id AND ulp.user_id = $1 AND ulp.is_completed = true
                )
                AND NOT EXISTS(
                  SELECT 1 FROM exercises e 
                  WHERE e.subtopic_id = st.id AND e.is_deleted = false 
                    AND NOT EXISTS(
                      SELECT 1 FROM exercise_submissions es 
                      WHERE es.exercise_id = e.id AND es.user_id = $1 AND es.is_passed = true
                    )
                )
              )
         )::int AS completed_subtopics,
         MAX(usp.completed_at) AS unit_completed_at
       FROM units u
       JOIN topics t ON t.id = u.topic_id AND t.is_deleted = false
       JOIN subjects s ON s.id = t.subject_id AND s.is_deleted = false
       JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
       JOIN subtopics st ON st.unit_id = u.id AND st.is_deleted = false
       LEFT JOIN user_subtopic_progress usp ON usp.subtopic_id = st.id AND usp.user_id = $1
       WHERE u.is_deleted = false
       GROUP BY u.id, u.title, u.order_index, t.id, t.title, t.order_index, s.id, s.name, s.slug
       HAVING (
         COUNT(DISTINCT st.id) > 0
         AND COUNT(DISTINCT st.id) FILTER (
           WHERE usp.is_completed = true
              OR (
                EXISTS(
                  SELECT 1 FROM lesson_content lc 
                  JOIN user_lesson_progress ulp ON ulp.lesson_content_id = lc.id 
                  WHERE lc.subtopic_id = st.id AND ulp.user_id = $1 AND ulp.is_completed = true
                )
                AND NOT EXISTS(
                  SELECT 1 FROM exercises e 
                  WHERE e.subtopic_id = st.id AND e.is_deleted = false 
                    AND NOT EXISTS(
                      SELECT 1 FROM exercise_submissions es 
                      WHERE es.exercise_id = e.id AND es.user_id = $1 AND es.is_passed = true
                    )
                )
              )
         ) >= COUNT(DISTINCT st.id)
       )
       ORDER BY MAX(usp.completed_at) DESC NULLS LAST, t.order_index DESC, u.order_index DESC`,
      [userId],
    );

    const milestones = [];
    const now = new Date();

    if (completedUnitsRes.rows.length > 0) {
      const unitMap = new Map();
      const unitIds = [];

      for (const unit of completedUnitsRes.rows) {
        unitIds.push(unit.unit_id);
        const completedAtRaw = unit.unit_completed_at;
        const t0 = (completedAtRaw && !Number.isNaN(new Date(completedAtRaw).getTime()))
          ? new Date(completedAtRaw)
          : userCreatedAt;
        unitMap.set(unit.unit_id, { unit, t0 });
      }

      // A. Batch query unpassed Quizzes for all completed units (5-Day Milestone)
      try {
        const quizzesRes = await pool.query(
          `SELECT q.id, q.unit_id, COALESCE(q.max_score, 100) AS max_score,
                  EXISTS(
                    SELECT 1 FROM quiz_attempts qa
                    WHERE qa.quiz_id = q.id AND qa.user_id = $1 AND qa.is_passed = true
                  ) AS is_passed,
                  (
                    SELECT COUNT(*)::int
                    FROM quiz_questions qq
                    WHERE qq.quiz_id = q.id AND qq.is_deleted = false
                  ) AS question_count
           FROM quizzes q
           WHERE q.unit_id = ANY($2::uuid[]) AND q.is_deleted = false`,
          [userId, unitIds],
        );

        for (const q of quizzesRes.rows) {
          if (!q.is_passed) {
            const unitData = unitMap.get(q.unit_id);
            if (!unitData) continue;
            const { unit, t0 } = unitData;
            const dueDate = new Date(t0.getTime() + 5 * 24 * 60 * 60 * 1000);
            const diffMs = dueDate.getTime() - now.getTime();
            const hoursLeft = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
            const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
            const isOverdue = hoursLeft <= 0;
            const urgencyLevel = isOverdue
              ? 'overdue'
              : hoursLeft <= 24
              ? 'urgent'
              : hoursLeft <= 72
              ? 'approaching'
              : 'relaxed';

            milestones.push({
              item_id: q.id,
              item_type: 'quiz',
              title: `${unit.unit_title} Quiz`,
              description: '',
              unit_id: unit.unit_id,
              unit_title: unit.unit_title,
              topic_title: unit.topic_title,
              subject_name: unit.subject_name,
              subject_slug: unit.subject_slug,
              completed_lessons_at: t0.toISOString(),
              due_date: dueDate.toISOString(),
              duration_days: 5,
              hours_left: hoursLeft,
              days_left: daysLeft,
              is_overdue: isOverdue,
              urgency_level: urgencyLevel,
              action_url: `/dashboard/student/courses/${unit.subject_slug}/quiz/${q.id}`,
              estimated_time: q.question_count > 0 ? `${q.question_count} questions · ~10 mins` : '10 mins quiz',
            });
          }
        }
      } catch (qErr) {
        console.warn('[Milestones] Error querying batched quizzes:', qErr.message);
      }

      // B. Batch query unsubmitted Assignments for all completed units (10-Day Milestone)
      try {
        const asgRes = await pool.query(
          `SELECT a.id, a.title, a.instructions, a.unit_id, COALESCE(a.max_score, 100) AS max_score,
                  EXISTS(
                    SELECT 1 FROM assignment_submissions asub
                    WHERE asub.assignment_id = a.id AND asub.user_id = $1
                  ) AS is_submitted
           FROM assignments a
           WHERE a.unit_id = ANY($2::uuid[]) AND a.is_deleted = false`,
          [userId, unitIds],
        );

        for (const a of asgRes.rows) {
          if (!a.is_submitted) {
            const unitData = unitMap.get(a.unit_id);
            if (!unitData) continue;
            const { unit, t0 } = unitData;
            const dueDate = new Date(t0.getTime() + 10 * 24 * 60 * 60 * 1000);
            const diffMs = dueDate.getTime() - now.getTime();
            const hoursLeft = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
            const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
            const isOverdue = hoursLeft <= 0;
            const urgencyLevel = isOverdue
              ? 'overdue'
              : hoursLeft <= 24
              ? 'urgent'
              : hoursLeft <= 72
              ? 'approaching'
              : 'relaxed';

            milestones.push({
              item_id: a.id,
              item_type: 'assignment',
              title: a.title || `${unit.unit_title} Assignment`,
              description: a.instructions ? a.instructions.substring(0, 120) : '',
              unit_id: unit.unit_id,
              unit_title: unit.unit_title,
              topic_title: unit.topic_title,
              subject_name: unit.subject_name,
              subject_slug: unit.subject_slug,
              completed_lessons_at: t0.toISOString(),
              due_date: dueDate.toISOString(),
              duration_days: 10,
              hours_left: hoursLeft,
              days_left: daysLeft,
              is_overdue: isOverdue,
              urgency_level: urgencyLevel,
              action_url: `/dashboard/student/courses/${unit.subject_slug}/assignment/${a.id}`,
              estimated_time: 'Hands-on Submission · AI Graded',
            });
          }
        }
      } catch (aErr) {
        console.warn('[Milestones] Error querying batched assignments:', aErr.message);
      }
    }

    // C. Check unsubmitted Capstone Projects (15-Day Milestone)
    // ONLY unlocks when ALL units in that specific topic are 100% completed by the student
    try {
      const capstoneRes = await pool.query(
        `SELECT p.id, p.title, p.instructions, COALESCE(p.max_score, 100) AS max_score,
                t.id AS topic_id, t.title AS topic_title,
                s.id AS subject_id, s.name AS subject_name, s.slug AS subject_slug,
                EXISTS(
                  SELECT 1 FROM project_submissions ps
                  WHERE ps.project_id = p.id AND ps.user_id = $1 AND ps.submission_link IS NOT NULL
                ) AS is_submitted,
                (
                  SELECT MAX(usp.completed_at)
                  FROM units u_inner
                  JOIN subtopics st ON st.unit_id = u_inner.id AND st.is_deleted = false
                  LEFT JOIN user_subtopic_progress usp ON usp.subtopic_id = st.id AND usp.user_id = $1
                  WHERE u_inner.topic_id = t.id AND u_inner.is_deleted = false
                ) AS topic_completed_at
         FROM projects p
         JOIN topics t ON p.topic_id = t.id AND t.is_deleted = false
         JOIN subjects s ON t.subject_id = s.id AND s.is_deleted = false
         JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
         WHERE p.is_deleted = false
           -- Must have at least 1 unit in this topic
           AND EXISTS (
             SELECT 1 FROM units u_check
             WHERE u_check.topic_id = t.id AND u_check.is_deleted = false
           )
           -- AND ALL units in this topic must have all subtopics completed by user
           AND NOT EXISTS (
             SELECT 1 FROM units u_uncomp
             WHERE u_uncomp.topic_id = t.id AND u_uncomp.is_deleted = false
               AND (
                 (SELECT COUNT(DISTINCT st_sub.id) FROM subtopics st_sub WHERE st_sub.unit_id = u_uncomp.id AND st_sub.is_deleted = false) = 0
                 OR
                 (SELECT COUNT(DISTINCT st_sub.id) FILTER (
                    WHERE usp_sub.is_completed = true
                       OR (
                         EXISTS(
                           SELECT 1 FROM lesson_content lc_sub 
                           JOIN user_lesson_progress ulp_sub ON ulp_sub.lesson_content_id = lc_sub.id 
                           WHERE lc_sub.subtopic_id = st_sub.id AND ulp_sub.user_id = $1 AND ulp_sub.is_completed = true
                         )
                         AND NOT EXISTS(
                           SELECT 1 FROM exercises e_sub 
                           WHERE e_sub.subtopic_id = st_sub.id AND e_sub.is_deleted = false 
                             AND NOT EXISTS(
                               SELECT 1 FROM exercise_submissions es_sub 
                               WHERE es_sub.exercise_id = e_sub.id AND es_sub.user_id = $1 AND es_sub.is_passed = true
                             )
                         )
                       )
                  )
                  FROM subtopics st_sub
                  LEFT JOIN user_subtopic_progress usp_sub ON usp_sub.subtopic_id = st_sub.id AND usp_sub.user_id = $1
                  WHERE st_sub.unit_id = u_uncomp.id AND st_sub.is_deleted = false
                 ) < (SELECT COUNT(DISTINCT st_sub.id) FROM subtopics st_sub WHERE st_sub.unit_id = u_uncomp.id AND st_sub.is_deleted = false)
               )
           )`,
        [userId],
      );

      for (const cap of capstoneRes.rows) {
        if (!cap.is_submitted) {
          const capCompletedAt = cap.topic_completed_at;
          const t0Cap = (capCompletedAt && !Number.isNaN(new Date(capCompletedAt).getTime()))
            ? new Date(capCompletedAt)
            : userCreatedAt;

          const dueDate = new Date(t0Cap.getTime() + 15 * 24 * 60 * 60 * 1000);
          const diffMs = dueDate.getTime() - now.getTime();
          const hoursLeft = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
          const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          const isOverdue = hoursLeft <= 0;
          const urgencyLevel = isOverdue
            ? 'overdue'
            : hoursLeft <= 24
            ? 'urgent'
            : hoursLeft <= 72
            ? 'approaching'
            : 'relaxed';

          milestones.push({
            item_id: cap.id,
            item_type: 'capstone',
            title: cap.title || `${cap.topic_title} Capstone Project`,
            description: cap.instructions ? cap.instructions.substring(0, 120) : '',
            unit_id: '',
            unit_title: cap.topic_title,
            topic_title: cap.topic_title,
            subject_name: cap.subject_name,
            subject_slug: cap.subject_slug,
            completed_lessons_at: t0Cap.toISOString(),
            due_date: dueDate.toISOString(),
            duration_days: 15,
            hours_left: hoursLeft,
            days_left: daysLeft,
            is_overdue: isOverdue,
            urgency_level: urgencyLevel,
            action_url: `/dashboard/student/courses/${cap.subject_slug}/capstone/${cap.id}`,
            estimated_time: '15-Day Capstone · Project Submission',
          });
        }
      }
    } catch (capErr) {
      console.warn('[Milestones] Error fetching capstones:', capErr.message);
    }

    // D. Include pending College Assignments
    if (collegeId) {
      try {
        const collegeAsgRes = await pool.query(
          `SELECT ca.id, ca.title, ca.description, ca.due_date, ca.created_at, ca.course,
                  s.name AS resolved_subject_name, s.slug AS resolved_subject_slug
           FROM college_assignments ca
           LEFT JOIN subjects s ON (s.id::text = ca.course OR s.slug = ca.course OR s.name = ca.course)
           WHERE ca.college_id = $1
             AND ca.is_deleted = false
             AND NOT EXISTS (
               SELECT 1 FROM college_assignment_submissions cas
               WHERE cas.assignment_id = ca.id AND cas.student_id = $2
             )`,
          [collegeId, userId],
        );

        for (const ca of collegeAsgRes.rows) {
          // 1. Direct Facilitator Deadline Preservation
          const dueDate = ca.due_date
            ? new Date(ca.due_date)
            : new Date(userCreatedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

          // 2. Discard only if archived/overdue by more than 7 days
          if (dueDate.getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000) {
            continue;
          }

          const diffMs = dueDate.getTime() - now.getTime();
          const hoursLeft = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
          const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          const isOverdue = hoursLeft <= 0;
          const urgencyLevel = isOverdue
            ? 'overdue'
            : hoursLeft <= 24
            ? 'urgent'
            : hoursLeft <= 72
            ? 'approaching'
            : 'relaxed';

          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ca.course || '');
          const courseDisplayName = ca.resolved_subject_name || (!isUuid ? ca.course : 'College Assignment');
          const subjectDisplayName = ca.resolved_subject_name || (!isUuid ? ca.course : '');

          milestones.push({
            item_id: ca.id,
            item_type: 'college_assignment',
            title: ca.title,
            description: ca.description || '',
            unit_id: '',
            unit_title: courseDisplayName,
            subject_name: subjectDisplayName,
            subject_slug: ca.resolved_subject_slug || '',
            completed_lessons_at: null,
            due_date: dueDate.toISOString(),
            duration_days: Math.max(1, daysLeft),
            hours_left: hoursLeft,
            days_left: daysLeft,
            is_overdue: isOverdue,
            urgency_level: urgencyLevel,
            action_url: `/dashboard/student/assignments/${ca.id}`,
            estimated_time: 'College Submission',
          });
        }
      } catch (caErr) {
        console.warn('[Milestones] Error fetching college assignments:', caErr.message);
      }
    }

    // E. Determine the student's Learning Pathway (Previous Completed Unit vs Current / Next Unit)
    let journey = null;
    if (completedUnitsRes.rows.length > 0) {
      const topCompletedUnit = completedUnitsRes.rows[0];

      let nextUnit = null;
      try {
        const nextUnitRes = await pool.query(
          `SELECT u.id AS unit_id, u.title AS unit_title, u.order_index AS unit_order,
                  t.id AS topic_id, t.title AS topic_title,
                  s.slug AS subject_slug, s.name AS subject_name
           FROM units u
           JOIN topics t ON t.id = u.topic_id AND t.is_deleted = false
           JOIN subjects s ON s.id = t.subject_id AND s.is_deleted = false
           WHERE s.id = $1
             AND (
               t.order_index > (SELECT t2.order_index FROM topics t2 WHERE t2.id = $2)
               OR (
                 t.id = $2 AND u.order_index > $3
               )
             )
             AND u.is_deleted = false
           ORDER BY t.order_index ASC, u.order_index ASC
           LIMIT 1`,
          [topCompletedUnit.subject_id, topCompletedUnit.topic_id, topCompletedUnit.unit_order],
        );
        if (nextUnitRes.rows.length > 0) {
          nextUnit = nextUnitRes.rows[0];
        }
      } catch (nextErr) {
        console.warn('[Milestones] Error fetching next unit:', nextErr.message);
      }

      let completedUnitXp = 0;
      try {
        const xpRes = await pool.query(
          `SELECT (
             COALESCE(
               (SELECT COUNT(DISTINCT ulp.lesson_content_id) * 10
                FROM lesson_content lc
                JOIN subtopics st ON lc.subtopic_id = st.id
                JOIN user_lesson_progress ulp ON ulp.lesson_content_id = lc.id
                WHERE st.unit_id = $1 AND ulp.user_id = $2 AND ulp.is_completed = true), 0
             ) +
             COALESCE(
               (SELECT SUM(es.score)
                FROM exercise_submissions es
                JOIN exercises e ON es.exercise_id = e.id
                JOIN subtopics st ON e.subtopic_id = st.id
                WHERE st.unit_id = $1 AND es.user_id = $2 AND es.is_passed = true), 0
             )
           )::int AS earned_unit_xp`,
          [topCompletedUnit.unit_id, userId],
        );
        completedUnitXp = Number(xpRes.rows[0]?.earned_unit_xp) || 0;
        if (completedUnitXp === 0 && topCompletedUnit.completed_subtopics > 0) {
          completedUnitXp = topCompletedUnit.completed_subtopics * 10;
        }
      } catch (xpErr) {
        console.warn('[Milestones] Error fetching completed unit XP:', xpErr.message);
      }

      journey = {
        subject_name: topCompletedUnit.subject_name,
        subject_slug: topCompletedUnit.subject_slug,
        completed_unit_id: topCompletedUnit.unit_id,
        completed_unit_title: topCompletedUnit.unit_title,
        completed_unit_topic: topCompletedUnit.topic_title,
        completed_unit_order: topCompletedUnit.unit_order,
        completed_unit_xp: completedUnitXp,
        current_unit_id: nextUnit?.unit_id || topCompletedUnit.unit_id,
        current_unit_title: nextUnit?.unit_title || 'Next Module in Syllabus',
        current_unit_topic: nextUnit?.topic_title || topCompletedUnit.topic_title,
        current_unit_order: nextUnit?.unit_order || topCompletedUnit.unit_order + 1,
        current_unit_url: nextUnit
          ? `/dashboard/student/courses/${nextUnit.subject_slug}`
          : `/dashboard/student/courses/${topCompletedUnit.subject_slug}`,
      };
    } else {
      // Fallback for students who just started and haven't completed a full unit yet
      try {
        const firstUnitRes = await pool.query(
          `SELECT u.id AS unit_id, u.title AS unit_title, u.order_index AS unit_order,
                  t.id AS topic_id, t.title AS topic_title,
                  s.slug AS subject_slug, s.name AS subject_name
           FROM user_subjects us
           JOIN subjects s ON s.id = us.subject_id AND s.is_deleted = false
           JOIN topics t ON t.subject_id = s.id AND t.is_deleted = false
           JOIN units u ON u.topic_id = t.id AND u.is_deleted = false
           WHERE us.user_id = $1
           ORDER BY t.order_index ASC, u.order_index ASC
           LIMIT 1`,
          [userId],
        );
        if (firstUnitRes.rows.length > 0) {
          const firstUnit = firstUnitRes.rows[0];
          journey = {
            subject_name: firstUnit.subject_name,
            subject_slug: firstUnit.subject_slug,
            completed_unit_id: null,
            completed_unit_title: 'Course Orientation & Getting Started',
            completed_unit_topic: 'Welcome',
            completed_unit_order: 0,
            current_unit_id: firstUnit.unit_id,
            current_unit_title: firstUnit.unit_title,
            current_unit_topic: firstUnit.topic_title,
            current_unit_order: firstUnit.unit_order,
            current_unit_url: `/dashboard/student/courses/${firstUnit.subject_slug}`,
          };
        }
      } catch (fErr) {
        console.warn('[Milestones] Error fetching fallback first unit:', fErr.message);
      }
    }

    // Sort milestones so active items for the current unit appear first, ordered by urgency / hours left
    milestones.sort((a, b) => a.hours_left - b.hours_left);

    res.json({
      success: true,
      data: {
        has_pending_milestones: milestones.length > 0,
        total_pending: milestones.length,
        student_first_name: firstName,
        journey,
        milestones,
      },
    });
  } catch (err) {
    console.error('getActiveMilestoneDeadlines error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch active milestone deadlines' 
    });
  }
};

/**
 * GET /api/v1/students/streak-details
 * Returns detailed habit streak status, personal best, and 7-day weekly calendar (Mon-Sun)
 */
exports.getStudentStreakDetails = async (req, res) => {
  try {
    const userId = req.user.id;

    // Self-heal and synchronize streak state directly from user's real activity history
    await reconcileUserStreak(userId);

    // 1. Fetch user streak state
    const streakRes = await pool.query(
      `SELECT 
         CASE 
           WHEN us.last_activity::date >= CURRENT_DATE - 1 THEN COALESCE(us.current_streak, 0)
           ELSE 0 
         END AS current_streak,
         COALESCE(us.longest_streak, 0) AS longest_streak,
         (us.last_activity::date = CURRENT_DATE) AS practiced_today,
         (us.last_activity::date = CURRENT_DATE - 1 AND COALESCE(us.current_streak, 0) > 0) AS streak_in_jeopardy,
         us.last_activity::date AS last_activity,
         CASE 
           WHEN us.last_activity IS NOT NULL THEN (CURRENT_DATE - us.last_activity::date)
           ELSE 999 
         END AS days_since_active
       FROM users u
       LEFT JOIN user_streaks us ON us.user_id = u.id
       WHERE u.id = $1`,
      [userId],
    );

    const streakData = streakRes.rows[0] || {
      current_streak: 0,
      longest_streak: 0,
      practiced_today: false,
      streak_in_jeopardy: false,
      last_activity: null,
      days_since_active: 999,
    };

    const currentStreak = parseInt(streakData.current_streak, 10) || 0;
    const longestStreak = parseInt(streakData.longest_streak, 10) || 0;
    const practicedToday = Boolean(streakData.practiced_today);
    const streakInJeopardy = Boolean(streakData.streak_in_jeopardy);

    // 2. Fetch 7-day Monday through Sunday activity for current week
    const weekRes = await pool.query(
      `WITH week_days AS (
         SELECT 
           (DATE_TRUNC('week', CURRENT_DATE) + (i || ' days')::interval)::date AS day_date,
           TRIM(TO_CHAR(DATE_TRUNC('week', CURRENT_DATE) + (i || ' days')::interval, 'Dy')) AS day_name,
           EXTRACT(DAY FROM (DATE_TRUNC('week', CURRENT_DATE) + (i || ' days')::interval))::int AS day_number
         FROM generate_series(0, 6) AS i
       ),
       user_actions AS (
         SELECT completed_at::date AS act_date FROM public.user_subtopic_progress WHERE user_id = $1::uuid AND completed_at >= DATE_TRUNC('week', CURRENT_DATE)
         UNION
         SELECT COALESCE(attempted_at, created_at)::date AS act_date FROM public.quiz_attempts WHERE user_id = $1::uuid AND COALESCE(attempted_at, created_at) >= DATE_TRUNC('week', CURRENT_DATE)
         UNION
         SELECT submitted_at::date AS act_date FROM public.exercise_submissions WHERE user_id = $1::uuid AND submitted_at >= DATE_TRUNC('week', CURRENT_DATE)
         UNION
         SELECT submitted_at::date AS act_date FROM public.assignment_submissions WHERE user_id = $1::uuid AND submitted_at >= DATE_TRUNC('week', CURRENT_DATE)
         UNION
         SELECT submitted_at::date AS act_date FROM public.project_submissions WHERE user_id = $1::uuid AND submitted_at >= DATE_TRUNC('week', CURRENT_DATE)
         UNION
         SELECT COALESCE(submitted_at, updated_at)::date AS act_date FROM public.college_assignment_submissions WHERE student_id = $1::uuid AND COALESCE(submitted_at, updated_at) >= DATE_TRUNC('week', CURRENT_DATE)
         UNION
         SELECT created_at::date AS act_date FROM public.points_log WHERE user_id = $1::uuid AND created_at >= DATE_TRUNC('week', CURRENT_DATE)
         UNION
         SELECT last_activity::date AS act_date FROM public.user_streaks WHERE user_id = $1::uuid AND last_activity >= DATE_TRUNC('week', CURRENT_DATE)
       )
       SELECT 
         w.day_name,
         w.day_date::text AS date,
         w.day_number,
         (w.day_date = CURRENT_DATE) AS is_today,
         (w.day_date > CURRENT_DATE) AS is_future,
         EXISTS(SELECT 1 FROM user_actions ua WHERE ua.act_date = w.day_date) AS is_active
       FROM week_days w
       ORDER BY w.day_date ASC`,
      [userId],
    );

    const weeklyCalendar = weekRes.rows.map((row) => {
      let status = 'future';
      if (row.is_today) {
        status = row.is_active || practicedToday ? 'today_completed' : 'today_pending';
      } else if (row.is_future) {
        status = 'future';
      } else {
        status = row.is_active ? 'completed' : 'missed';
      }

      return {
        day: row.day_name,
        date: row.date,
        day_number: row.day_number,
        is_today: row.is_today,
        is_future: row.is_future,
        is_active: Boolean(row.is_active || (row.is_today && practicedToday)),
        status,
      };
    });

    // 3. Dynamic motivational message
    const getMotivationalMessage = (currentStreak, practicedToday, longestStreak) => {
      let motivationalMessage = 'Start practicing today to build your streak!';
      if (practicedToday) {
        motivationalMessage = currentStreak > 1
          ? `🔥 You're on a roll! ${currentStreak} days strong. Keep it up tomorrow!`
          : "🎉 Great job! You started your 1-day streak today!";
      } else if (streakInJeopardy) {
        motivationalMessage = `⚠️ Practice today to keep your ${currentStreak}-day streak alive!`;
      } else if (longestStreak > 0 && currentStreak === 0) {
        motivationalMessage = `Your streak reset. Complete a lesson today to start fresh! Personal best: ${longestStreak} days.`;
      }
      return motivationalMessage;
    };

    res.json({
      success: true,
      data: {
        current_streak: currentStreak,
        longest_streak: longestStreak,
        practiced_today: practicedToday,
        streak_in_jeopardy: streakInJeopardy,
        weekly_calendar: weeklyCalendar,
        motivational_message: getMotivationalMessage(currentStreak, practicedToday, longestStreak),
      },
    });
  } catch (err) {
    console.error('getStudentStreakDetails error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student streak details',
    });
  }
};

/**
 * GET /api/v1/students/activity-calendar
 * Query params: ?year=YYYY&month=MM (1-12)
 * Returns full monthly activity calendar with daily habit markings,
 * activity counts, contribution heatmap levels (0-3), and detailed breakdown.
 */
exports.getStudentActivityCalendar = async (req, res) => {
  try {
    const userId = req.user.id;

    const now = new Date();
    const queryYear = parseInt(req.query.year, 10) || now.getFullYear();
    const queryMonth = parseInt(req.query.month, 10) || (now.getMonth() + 1);

    // Validate bounds
    if (queryMonth < 1 || queryMonth > 12 || queryYear < 2020 || queryYear > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid year or month parameter',
      });
    }

    // 1. Reconcile and fetch streak data for current user to accurately tag today's state
    await reconcileUserStreak(userId);
    const streakRes = await pool.query(
      `SELECT 
         CASE 
           WHEN last_activity::date >= CURRENT_DATE - 1 THEN COALESCE(current_streak, 0)
           ELSE 0 
         END AS current_streak,
         COALESCE(longest_streak, 0) AS longest_streak,
         (last_activity::date = CURRENT_DATE) AS practiced_today
       FROM user_streaks
       WHERE user_id = $1::uuid`,
      [userId],
    );

    const userStreak = streakRes.rows[0] || {
      current_streak: 0,
      longest_streak: 0,
      practiced_today: false,
    };
    const currentStreak = parseInt(userStreak.current_streak, 10) || 0;
    const longestStreak = parseInt(userStreak.longest_streak, 10) || 0;
    const practicedToday = Boolean(userStreak.practiced_today);

    // 2. Query month calendar and all 7 activity touchpoints
    const query = `
      WITH month_days AS (
        SELECT 
          d::date AS day_date,
          TRIM(TO_CHAR(d, 'Dy')) AS day_name,
          EXTRACT(DAY FROM d)::int AS day_number,
          EXTRACT(ISODOW FROM d)::int AS iso_dow
        FROM generate_series(
          make_date($2::int, $3::int, 1)::timestamp,
          (make_date($2::int, $3::int, 1) + INTERVAL '1 month - 1 day')::timestamp,
          '1 day'::interval
        ) AS d
      ),
      user_actions AS (
        SELECT completed_at::date AS act_date, 'lesson' AS action_type, 1 AS count, 0 AS xp
        FROM public.user_subtopic_progress
        WHERE user_id = $1::uuid 
          AND completed_at IS NOT NULL
          AND completed_at >= make_date($2::int, $3::int, 1) 
          AND completed_at < make_date($2::int, $3::int, 1) + INTERVAL '1 month'

        UNION ALL

        SELECT COALESCE(attempted_at, created_at)::date AS act_date, 'quiz' AS action_type, 1 AS count, 0 AS xp
        FROM public.quiz_attempts
        WHERE user_id = $1::uuid 
          AND (attempted_at IS NOT NULL OR created_at IS NOT NULL)
          AND COALESCE(attempted_at, created_at) >= make_date($2::int, $3::int, 1) 
          AND COALESCE(attempted_at, created_at) < make_date($2::int, $3::int, 1) + INTERVAL '1 month'

        UNION ALL

        SELECT submitted_at::date AS act_date, 'exercise' AS action_type, 1 AS count, 0 AS xp
        FROM public.exercise_submissions
        WHERE user_id = $1::uuid 
          AND submitted_at IS NOT NULL
          AND submitted_at >= make_date($2::int, $3::int, 1) 
          AND submitted_at < make_date($2::int, $3::int, 1) + INTERVAL '1 month'

        UNION ALL

        SELECT submitted_at::date AS act_date, 'assignment' AS action_type, 1 AS count, 0 AS xp
        FROM public.assignment_submissions
        WHERE user_id = $1::uuid 
          AND submitted_at IS NOT NULL
          AND submitted_at >= make_date($2::int, $3::int, 1) 
          AND submitted_at < make_date($2::int, $3::int, 1) + INTERVAL '1 month'

        UNION ALL

        SELECT submitted_at::date AS act_date, 'project' AS action_type, 1 AS count, 0 AS xp
        FROM public.project_submissions
        WHERE user_id = $1::uuid 
          AND submitted_at IS NOT NULL
          AND submitted_at >= make_date($2::int, $3::int, 1) 
          AND submitted_at < make_date($2::int, $3::int, 1) + INTERVAL '1 month'

        UNION ALL

        SELECT COALESCE(submitted_at, updated_at)::date AS act_date, 'college_assignment' AS action_type, 1 AS count, 0 AS xp
        FROM public.college_assignment_submissions
        WHERE student_id = $1::uuid 
          AND (submitted_at IS NOT NULL OR updated_at IS NOT NULL)
          AND COALESCE(submitted_at, updated_at) >= make_date($2::int, $3::int, 1) 
          AND COALESCE(submitted_at, updated_at) < make_date($2::int, $3::int, 1) + INTERVAL '1 month'

        UNION ALL

        SELECT last_activity::date AS act_date, 'streak' AS action_type, 1 AS count, 0 AS xp
        FROM public.user_streaks
        WHERE user_id = $1::uuid
          AND last_activity IS NOT NULL
          AND last_activity >= make_date($2::int, $3::int, 1)
          AND last_activity < make_date($2::int, $3::int, 1) + INTERVAL '1 month'

        UNION ALL

        SELECT created_at::date AS act_date, 'points' AS action_type, 0 AS count, points AS xp
        FROM public.points_log
        WHERE user_id = $1::uuid 
          AND created_at IS NOT NULL
          AND created_at >= make_date($2::int, $3::int, 1) 
          AND created_at < make_date($2::int, $3::int, 1) + INTERVAL '1 month'
      )
      SELECT 
        d.day_date::text AS date,
        d.day_number,
        d.day_name,
        d.iso_dow,
        (d.day_date = CURRENT_DATE) AS is_today,
        (d.day_date > CURRENT_DATE) AS is_future,
        COALESCE(COUNT(CASE WHEN ua.action_type != 'points' THEN 1 END), 0)::int AS activity_count,
        COALESCE(COUNT(CASE WHEN ua.action_type = 'lesson' THEN 1 END), 0)::int AS lessons_completed,
        COALESCE(COUNT(CASE WHEN ua.action_type = 'quiz' THEN 1 END), 0)::int AS quizzes_attempted,
        COALESCE(COUNT(CASE WHEN ua.action_type = 'exercise' THEN 1 END), 0)::int AS exercises_completed,
        COALESCE(COUNT(CASE WHEN ua.action_type = 'assignment' THEN 1 END), 0)::int AS assignments_submitted,
        COALESCE(COUNT(CASE WHEN ua.action_type = 'project' THEN 1 END), 0)::int AS projects_submitted,
        COALESCE(COUNT(CASE WHEN ua.action_type = 'college_assignment' THEN 1 END), 0)::int AS college_assignments_submitted,
        COALESCE(SUM(ua.xp), 0)::int AS xp_earned
      FROM month_days d
      LEFT JOIN user_actions ua ON ua.act_date = d.day_date
      GROUP BY d.day_date, d.day_number, d.day_name, d.iso_dow
      ORDER BY d.day_date ASC;
    `;

    const { rows } = await pool.query(query, [userId, queryYear, queryMonth]);

    let totalActiveDays = 0;
    let totalActionsCount = 0;
    let totalXpEarned = 0;

    const days = rows.map((row) => {
      let activityCount = parseInt(row.activity_count, 10) || 0;
      const xpEarned = parseInt(row.xp_earned, 10) || 0;

      // If points were earned on this day but no separate action row, count as at least 1 activity
      if (activityCount === 0 && xpEarned > 0) {
        activityCount = 1;
      }

      // If practiced today is true, guarantee today has at least 1 action
      if (row.is_today && practicedToday && activityCount === 0) {
        activityCount = 1;
      }

      const isActive = activityCount > 0 || xpEarned > 0;
      if (isActive) totalActiveDays++;
      totalActionsCount += activityCount;
      totalXpEarned += xpEarned;

      // Heatmap Intensity Level: 0 (none), 1 (light), 2 (medium), 3 (intense)
      let activityLevel = 0;
      if (activityCount >= 4) {
        activityLevel = 3;
      } else if (activityCount >= 2) {
        activityLevel = 2;
      } else if (activityCount >= 1) {
        activityLevel = 1;
      }

      // Daily Status
      let status = 'future';
      if (row.is_today) {
        status = isActive || practicedToday ? 'today_completed' : 'today_pending';
      } else if (row.is_future) {
        status = 'future';
      } else {
        status = isActive ? 'completed' : 'missed';
      }

      return {
        date: row.date,
        day_number: row.day_number,
        day_name: row.day_name,
        iso_dow: row.iso_dow, // 1 (Mon) to 7 (Sun)
        is_today: row.is_today,
        is_future: row.is_future,
        is_active: isActive,
        activity_count: activityCount,
        activity_level: activityLevel,
        status,
        details: {
          lessons: row.lessons_completed,
          quizzes: row.quizzes_attempted,
          exercises: row.exercises_completed,
          assignments: row.assignments_submitted,
          projects: row.projects_submitted,
          college_assignments: row.college_assignments_submitted,
          xp_earned: xpEarned,
        },
      };
    });

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const firstDayIsoDow = days.length > 0 ? days[0].iso_dow : 1; // 1 = Monday
    const daysInMonth = days.length;

    // Elapsed days in month for consistency calculation
    let elapsedDays = daysInMonth;
    const isCurrentMonth = queryYear === now.getFullYear() && queryMonth === (now.getMonth() + 1);
    if (isCurrentMonth) {
      elapsedDays = Math.max(1, now.getDate());
    } else if (queryYear > now.getFullYear() || (queryYear === now.getFullYear() && queryMonth > (now.getMonth() + 1))) {
      elapsedDays = 0;
    }

    const consistencyPct = elapsedDays > 0 ? Math.round((totalActiveDays / elapsedDays) * 100) : 0;

    res.json({
      success: true,
      data: {
        year: queryYear,
        month: queryMonth,
        month_name: `${monthNames[queryMonth - 1]} ${queryYear}`,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        practiced_today: practicedToday,
        total_active_days: totalActiveDays,
        total_actions_count: totalActionsCount,
        total_xp_earned: totalXpEarned,
        monthly_consistency_pct: consistencyPct,
        first_day_iso_dow: firstDayIsoDow,
        days_in_month: daysInMonth,
        days,
      },
    });
  } catch (err) {
    console.error('getStudentActivityCalendar error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student activity calendar',
    });
  }
};

module.exports = exports;

