'use strict';
// notificationService.js
// Central service for creating and delivering notifications.
// All callers use `notify()` — it persists to DB and pushes via Socket.io.

const pool = require('../config/pg');

let _io = null; // injected by setupSocket

function setIo(io) {
  _io = io;
}

/**
 * Create a notification and push it to the user in real-time.
 *
 * @param {object} opts
 * @param {string} opts.userId      - recipient UUID
 * @param {string} opts.type        - 'assignment_graded' | 'new_assignment' | 'achievement' | 'submission_received' | 'general'
 * @param {string} opts.title       - short heading
 * @param {string} opts.body        - detail text
 * @param {string} [opts.link]      - optional client-side route to navigate to
 */
async function notify({ userId, type, title, body, link = null, meta = null }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, type, title, body, link],
    );

    const notification = rows[0];

    // Real-time push to the user's personal socket room
    if (_io) {
      _io.to(`user:${userId}`).emit('notification:new', notification);
      if (type === 'new_assignment') {
        _io.to(`user:${userId}`).emit('assignment:created', {
          title,
          link,
          ...meta,
        });
      }
    }

    return notification;
  } catch (err) {
    // Never crash the caller — notifications are best-effort
    console.error('[notify] Failed to send notification:', err.message);
    return null;
  }
}

/**
 * Notify all students belonging to a college.
 */
async function notifyCollege({ collegeId, type, title, body, link = null, meta = null }) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id FROM users u
       JOIN student_profiles sp ON sp.user_id = u.id
       WHERE sp.college_id = $1 AND u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')`,
      [collegeId],
    );
    await Promise.all(rows.map(({ id }) => notify({ userId: id, type, title, body, link, meta })));
  } catch (err) {
    console.error('[notifyCollege] Failed:', err.message);
  }
}

module.exports = { setIo, notify, notifyCollege };
