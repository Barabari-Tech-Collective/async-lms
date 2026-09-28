'use strict';
/**
 * Log the full error server-side and return a safe generic response.
 * Never expose SQL, stack traces, or internal details to the client.
 */
function serverError(res, err, context = '') {
  console.error(`[SERVER ERROR]${context ? ' ' + context + ':' : ''}`, err);

  // The code runner being down is an infrastructure outage, not a bug in the
  // student's code. Say so honestly with a 503 so the client can distinguish
  // "try again shortly" from "something is broken" — the underlying cause stays
  // in the logs rather than leaking image names to the browser.
  if (err?.name === 'RunnerUnavailableError') {
    return res.status(503).json({
      success: false,
      message:
        'The code runner is temporarily unavailable. Your work is saved — please try again in a moment.',
    });
  }

  // Errors explicitly marked safe to show carry their own status and wording
  // (e.g. "not enrolled in this course"). Everything else stays generic.
  if (err?.expose === true && err?.statusCode) {
    return res
      .status(err.statusCode)
      .json({ success: false, message: err.message });
  }

  res.status(500).json({ success: false, message: 'Internal server error' });
}

module.exports = serverError;
