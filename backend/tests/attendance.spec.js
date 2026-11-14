const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateAttendanceMetrics,
  createConferenceNotReadyError,
} = require('../services/attendance.service');

function classRow(overrides = {}) {
  return {
    id: 'class-1',
    scheduled_start_at: '2026-01-01T10:00:00.000Z',
    planned_end_at: '2026-01-01T11:00:00.000Z',
    actual_end_at: '2026-01-01T11:45:00.000Z',
    grace_period_minutes: 30,
    attendance_threshold_percent: 70,
    ...overrides,
  };
}

test('calculateAttendanceMetrics merges overlapping sessions', () => {
  const result = calculateAttendanceMetrics(
    classRow(),
    [{ student_id: 'student-1' }],
    [
      {
        matched_student_id: 'student-1',
        joined_at: '2026-01-01T10:00:00.000Z',
        left_at: '2026-01-01T10:40:00.000Z',
      },
      {
        matched_student_id: 'student-1',
        joined_at: '2026-01-01T10:30:00.000Z',
        left_at: '2026-01-01T11:10:00.000Z',
      },
    ],
  );

  assert.deepEqual(result[0], {
    studentId: 'student-1',
    attendedMinutes: 70,
    attendancePercentage: 77.78,
    attendanceStatus: 'present',
  });
});

test('calculateAttendanceMetrics clips sessions to the class window and grace period', () => {
  const result = calculateAttendanceMetrics(
    classRow(),
    [{ student_id: 'student-1' }],
    [{
      matched_student_id: 'student-1',
      joined_at: '2026-01-01T09:45:00.000Z',
      left_at: '2026-01-01T12:00:00.000Z',
    }],
  );

  assert.equal(result[0].attendedMinutes, 90);
  assert.equal(result[0].attendancePercentage, 100);
});

test('calculateAttendanceMetrics applies the configured attendance threshold', () => {
  const result = calculateAttendanceMetrics(
    classRow(),
    [{ student_id: 'student-1' }],
    [{
      matched_student_id: 'student-1',
      joined_at: '2026-01-01T10:00:00.000Z',
      left_at: '2026-01-01T11:03:00.000Z',
    }],
  );

  assert.equal(result[0].attendedMinutes, 63);
  assert.equal(result[0].attendancePercentage, 70);
  assert.equal(result[0].attendanceStatus, 'present');
});

test('missing conference data produces a retryable error', () => {
  const error = createConferenceNotReadyError('class-1');

  assert.equal(error.retryable, true);
  assert.match(error.message, /Google Meet data may not be ready/);
});
