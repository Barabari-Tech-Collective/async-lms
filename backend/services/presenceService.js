const pool = require('../config/pg'); // Need pool for streak update

const presenceCache = new Map(); // userId -> { firstSeenToday, lastSeenToday, hasActionToday, streakUpdatedToday }

// In-memory clean up every hour
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of presenceCache.entries()) {
    // If not seen in 24 hours, remove from cache
    if (now - data.lastSeenToday > 24 * 60 * 60 * 1000) {
      presenceCache.delete(userId);
    }
  }
}, 60 * 60 * 1000);

function isSameDay(t1, t2) {
  const d1 = new Date(t1);
  const d2 = new Date(t2);
  return d1.getUTCFullYear() === d2.getUTCFullYear() &&
         d1.getUTCMonth() === d2.getUTCMonth() &&
         d1.getUTCDate() === d2.getUTCDate();
}

/**
 * Reconciles and updates a student's streak state based on actual completed activity records.
 * Dynamically computes:
 * - current_streak: Consecutive calendar days with learning activity ending today or yesterday.
 *                   If a day was missed (gap > 1 day from today/yesterday), current_streak is 0.
 * - longest_streak: The maximum consecutive streak in the user's history, retaining previous records.
 * - practiced_today: Whether an action was recorded on CURRENT_DATE.
 * Synchronizes the result directly into public.user_streaks.
 */
async function reconcileUserStreak(userId) {
  if (!userId) return null;
  try {
    const query = `
      WITH user_activity_dates AS (
        SELECT DISTINCT act_date
        FROM (
          SELECT completed_at::date AS act_date FROM public.user_subtopic_progress WHERE user_id = $1::uuid AND completed_at IS NOT NULL
          UNION
          SELECT COALESCE(attempted_at, created_at)::date AS act_date FROM public.quiz_attempts WHERE user_id = $1::uuid AND (attempted_at IS NOT NULL OR created_at IS NOT NULL)
          UNION
          SELECT submitted_at::date AS act_date FROM public.exercise_submissions WHERE user_id = $1::uuid AND submitted_at IS NOT NULL
          UNION
          SELECT submitted_at::date AS act_date FROM public.assignment_submissions WHERE user_id = $1::uuid AND submitted_at IS NOT NULL
          UNION
          SELECT submitted_at::date AS act_date FROM public.project_submissions WHERE user_id = $1::uuid AND submitted_at IS NOT NULL
          UNION
          SELECT COALESCE(submitted_at, updated_at)::date AS act_date FROM public.college_assignment_submissions WHERE student_id = $1::uuid AND (submitted_at IS NOT NULL OR updated_at IS NOT NULL)
          UNION
          SELECT created_at::date AS act_date FROM public.points_log WHERE user_id = $1::uuid AND created_at IS NOT NULL
        ) a
        WHERE act_date <= CURRENT_DATE
      ),
      streak_groups AS (
        SELECT 
          act_date,
          act_date - (ROW_NUMBER() OVER (ORDER BY act_date))::int AS grp
        FROM user_activity_dates
      ),
      streak_lengths AS (
        SELECT 
          grp,
          COUNT(*)::int AS length,
          MAX(act_date) AS end_date,
          MIN(act_date) AS start_date
        FROM streak_groups
        GROUP BY grp
      ),
      computed AS (
        SELECT 
          COALESCE(
            (SELECT length FROM streak_lengths WHERE end_date >= CURRENT_DATE - 1 ORDER BY end_date DESC LIMIT 1),
            0
          )::int AS calc_current_streak,
          COALESCE(
            (SELECT MAX(length) FROM streak_lengths),
            0
          )::int AS calc_longest_streak,
          EXISTS(SELECT 1 FROM user_activity_dates WHERE act_date = CURRENT_DATE) AS calc_practiced_today,
          (SELECT MAX(act_date) FROM user_activity_dates) AS calc_last_activity
      )
      INSERT INTO public.user_streaks (user_id, current_streak, longest_streak, last_activity, updated_at)
      SELECT 
        $1::uuid,
        c.calc_current_streak,
        c.calc_longest_streak,
        COALESCE(c.calc_last_activity, CURRENT_DATE),
        CURRENT_TIMESTAMP
      FROM computed c
      ON CONFLICT (user_id) DO UPDATE SET
        current_streak = EXCLUDED.current_streak,
        longest_streak = GREATEST(COALESCE(user_streaks.longest_streak, 0), EXCLUDED.longest_streak),
        last_activity = COALESCE(EXCLUDED.last_activity, user_streaks.last_activity),
        updated_at = CURRENT_TIMESTAMP
      RETURNING 
        user_id,
        current_streak,
        longest_streak,
        last_activity,
        (last_activity::date = CURRENT_DATE) AS practiced_today,
        (last_activity::date = CURRENT_DATE - 1 AND COALESCE(current_streak, 0) > 0) AS streak_in_jeopardy;
    `;

    const res = await pool.query(query, [userId]);
    return res.rows[0] || null;
  } catch (err) {
    console.error('[presenceService] Error reconciling streak for user:', userId, err);
    return null;
  }
}

async function triggerStreakUpdate(userId) {
  try {
    await reconcileUserStreak(userId);
  } catch (err) {
    console.error('Failed to trigger streak update:', err);
  }
}

/**
 * Marks a user as active/online at the current timestamp.
 */
function markUserActive(userId) {
  if (!userId) return;
  const now = Date.now();
  let data = presenceCache.get(userId);

  if (!data || !isSameDay(data.lastSeenToday, now)) {
    data = { firstSeenToday: now, lastSeenToday: now, hasActionToday: false, streakUpdatedToday: false };
    presenceCache.set(userId, data);
  } else {
    data.lastSeenToday = now;
  }
}

/**
 * Call this when a user submits a quiz/assignment/project or reads a lesson.
 * Updates the streak immediately — the underlying SQL is idempotent per
 * calendar day, so repeated calls on the same day are safe no-ops.
 */
function markActionToday(userId) {
  if (!userId) return;
  const now = Date.now();
  let data = presenceCache.get(userId);

  if (!data || !isSameDay(data.lastSeenToday, now)) {
    data = { firstSeenToday: now, lastSeenToday: now, hasActionToday: true, streakUpdatedToday: true };
    presenceCache.set(userId, data);
  } else {
    data.hasActionToday = true;
    data.streakUpdatedToday = true;
  }

  triggerStreakUpdate(userId);
}

/**
 * Returns true if the user was active in the last 10 minutes.
 */
function isUserOnline(userId) {
  const data = presenceCache.get(userId);
  if (!data) return false;
  const now = Date.now();
  return (now - data.lastSeenToday) < (10 * 60 * 1000);
}

module.exports = {
  markUserActive,
  markActionToday,
  isUserOnline,
  reconcileUserStreak,
  triggerStreakUpdate,
};
