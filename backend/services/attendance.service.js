function calculateAttendanceMetrics(classRow, rosterRows, sessionRows) {
  const windowStart = new Date(classRow.scheduled_start_at).getTime();
  const plannedEnd = new Date(classRow.planned_end_at).getTime();
  const graceEnd = plannedEnd + Number(classRow.grace_period_minutes || 0) * 60000;
  const actualEnd = new Date(classRow.actual_end_at).getTime();
  const windowEnd = Math.min(actualEnd, graceEnd);
  const durationMinutes = Math.max((windowEnd - windowStart) / 60000, 0);
  if (!durationMinutes) {
    throw new Error(`Class ${classRow.id || 'unknown'} has an invalid attendance window`);
  }

  const grouped = new Map();
  for (const session of sessionRows) {
    const start = Math.max(new Date(session.joined_at).getTime(), windowStart);
    const end = Math.min(
      new Date(session.left_at || classRow.actual_end_at).getTime(),
      windowEnd,
    );
    if (end <= start) continue;
    const intervals = grouped.get(session.matched_student_id) || [];
    intervals.push([start, end]);
    grouped.set(session.matched_student_id, intervals);
  }

  return rosterRows.map((student) => {
    const intervals = (grouped.get(student.student_id) || []).sort((a, b) => a[0] - b[0]);
    let totalMs = 0;
    let current = null;
    for (const interval of intervals) {
      if (!current) {
        current = interval.slice();
      } else if (interval[0] <= current[1]) {
        current[1] = Math.max(current[1], interval[1]);
      } else {
        totalMs += current[1] - current[0];
        current = interval.slice();
      }
    }
    if (current) totalMs += current[1] - current[0];

    const minutes = Number((totalMs / 60000).toFixed(2));
    const percentage = Number(Math.min((minutes / durationMinutes) * 100, 100).toFixed(2));
    return {
      studentId: student.student_id,
      attendedMinutes: minutes,
      attendancePercentage: percentage,
      attendanceStatus: percentage >= Number(classRow.attendance_threshold_percent)
        ? 'present'
        : 'absent',
    };
  });
}

function createConferenceNotReadyError(classId) {
  const error = new Error(
    `No conference record matched class ${classId}; Google Meet data may not be ready`,
  );
  error.retryable = true;
  return error;
}

module.exports = {
  calculateAttendanceMetrics,
  createConferenceNotReadyError,
};
