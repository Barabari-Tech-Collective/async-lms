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

async function triggerStreakUpdate(userId) {
  try {
    await pool.query(
      `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_activity)
       VALUES ($1, 1, 1, CURRENT_DATE)
       ON CONFLICT (user_id) DO UPDATE SET
         current_streak = CASE
           WHEN user_streaks.last_activity::date = CURRENT_DATE THEN user_streaks.current_streak
           WHEN user_streaks.last_activity::date = CURRENT_DATE - 1 THEN user_streaks.current_streak + 1
           ELSE 1
         END,
         longest_streak = GREATEST(
           COALESCE(user_streaks.longest_streak, 0),
           CASE
             WHEN user_streaks.last_activity::date = CURRENT_DATE THEN user_streaks.current_streak
             WHEN user_streaks.last_activity::date = CURRENT_DATE - 1 THEN user_streaks.current_streak + 1
             ELSE 1
           END
         ),
         last_activity = CURRENT_DATE,
         updated_at = CURRENT_TIMESTAMP`,
      [userId],
    );
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
  isUserOnline
};
