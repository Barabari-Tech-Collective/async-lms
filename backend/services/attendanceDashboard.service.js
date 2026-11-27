const IST = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_RANGES = new Map([['7d', 7], ['30d', 30], ['90d', 90]]);
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function parseTrendsFilters({ timeRange = '30d', batchId = 'all', date, subjectId = 'all' } = {}) {
  if (!TIME_RANGES.has(timeRange)) {
    throw badRequest('timeRange must be 7d, 30d, or 90d');
  }
  if (subjectId !== 'all' && (typeof subjectId !== 'string' || !UUID.test(subjectId))) {
    throw badRequest('subjectId must be all or a valid UUID');
  }
  if (batchId !== 'all') {
    const separator = typeof batchId === 'string' ? batchId.indexOf(':') : -1;
    if (separator !== 36 || !UUID.test(batchId.slice(0, separator)) || !batchId.slice(separator + 1)) {
      throw badRequest('batchId must be all or a batch ID from the overview');
    }
  }

  let dayRange = null;
  if (date !== undefined && date !== 'all') {
    const isoDate = typeof date === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(date)
      ? date.split('-').reverse().join('-')
      : date;
    const midnight = typeof isoDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)
      ? new Date(`${isoDate}T00:00:00Z`)
      : null;
    if (!midnight || !Number.isFinite(midnight.getTime()) ||
        midnight.toISOString().slice(0, 10) !== isoDate || isoDate.startsWith('0000-')) {
      throw badRequest('date must be a valid date in DD-MM-YYYY or YYYY-MM-DD format');
    }
    const start = new Date(`${isoDate}T00:00:00+05:30`);
    dayRange = [start, new Date(start.getTime() + DAY_MS)];
  }

  return {
    days: TIME_RANGES.get(timeRange),
    batchId: batchId === 'all' ? null : batchId,
    subjectId: subjectId === 'all' ? null : subjectId,
    date,
    dayRange,
  };
}

// Use the same course and college permissions for every attendance aggregate.
const SCOPED_DATA = `
  scoped_subjects AS (
    SELECT s.id, s.name, s.order_index
      FROM subjects s
     WHERE s.is_deleted = false
       AND ($2::boolean OR EXISTS (
         SELECT 1 FROM facilitator_subjects fs
          WHERE fs.facilitator_id = $1 AND fs.subject_id = s.id AND fs.is_deleted = false
       ))
  ),
  scoped_colleges AS (
    SELECT c.id, c.name, c.created_at
      FROM colleges c
     WHERE c.is_deleted = false AND c.deleted_at IS NULL
       AND ($2::boolean OR EXISTS (
         SELECT 1 FROM facilitator_colleges fc
          WHERE fc.facilitator_id = $1 AND fc.college_id = c.id AND fc.is_deleted = false
       ))
  ),
  scoped_students AS (
    SELECT u.id, u.full_name, u.email, u.created_at, sp.created_at AS profile_created_at,
           sp.college_id, c.name AS college_name,
           COALESCE(NULLIF(BTRIM(sp.expected_graduation_year::text), ''), sp.year::text) AS batch_year
      FROM student_profiles sp
      JOIN scoped_colleges c ON c.id = sp.college_id
      JOIN users u ON u.id = sp.user_id AND u.deleted_at IS NULL
      JOIN roles r ON r.id = u.role_id AND r.role_key = 'STUDENT'
  ),
  scoped_attendance AS (
    SELECT c.id AS class_id, c.subject_id, c.title, c.scheduled_start_at,
           st.id AS student_id, st.full_name, st.email, st.college_id, st.college_name, st.batch_year,
           a.attendance_percentage
      FROM classes c
      JOIN scoped_subjects s ON s.id = c.subject_id
      JOIN attendance a ON a.class_id = c.id AND a.attendance_percentage IS NOT NULL
      JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = a.student_id
                            AND cs.roster_status = 'eligible'
      JOIN scoped_students st ON st.id = a.student_id
  )`;

async function getOverview(db, user) {
  const { rows: [overview] } = await db.query(
    `WITH ${SCOPED_DATA},
     batches AS (
       SELECT college_id::text || ':' || batch_year AS id,
              college_name || ' - ' || batch_year AS name,
              MIN(profile_created_at) AS first_profile_at
         FROM scoped_students
        WHERE batch_year IS NOT NULL
        GROUP BY college_id, college_name, batch_year
     ),
     batch_attendance AS (
       SELECT college_name || ' - ' || batch_year AS name,
              AVG(attendance_percentage) AS average
         FROM scoped_attendance
        WHERE batch_year IS NOT NULL
        GROUP BY college_id, college_name, batch_year
     ),
     top_students AS (
       SELECT student_id AS id, full_name AS "fullName", email,
              AVG(attendance_percentage) AS average, COUNT(*) AS recorded_classes
         FROM scoped_attendance
        GROUP BY student_id, full_name, email
        HAVING MAX(attendance_percentage) > 0
        ORDER BY average DESC, recorded_classes DESC, id
        LIMIT 5
     )
     SELECT (SELECT COUNT(*)::int FROM scoped_students) AS "totalStudents",
            (SELECT COUNT(*)::int FROM scoped_students WHERE created_at >= NOW() - INTERVAL '30 days') AS "studentsDeltaMonth",
            (SELECT COUNT(*)::int FROM batches) AS "totalCohorts",
            (SELECT COUNT(*)::int FROM batches WHERE first_profile_at >= NOW() - INTERVAL '30 days') AS "cohortsDeltaMonth",
            (SELECT COUNT(*)::int FROM scoped_colleges) AS "totalColleges",
            (SELECT COUNT(*)::int FROM scoped_colleges WHERE created_at >= NOW() - INTERVAL '30 days') AS "collegesDeltaMonth",
            (SELECT json_build_object('name', name, 'averageAttendance', ROUND(average, 1))
               FROM batch_attendance ORDER BY average DESC, name LIMIT 1) AS "highestAttendingBatch",
            (SELECT json_build_object('name', name, 'averageAttendance', ROUND(average, 1))
               FROM batch_attendance ORDER BY average ASC, name LIMIT 1) AS "lowestAttendingBatch",
            (SELECT COALESCE(json_agg(json_build_object('id', id, 'fullName', "fullName", 'email', email,
                                                      'attendancePercent', ROUND(average, 1))
                                     ORDER BY average DESC, recorded_classes DESC, id), '[]') FROM top_students) AS "topStudents",
            (SELECT COALESCE(json_agg(json_build_object('id', id, 'name', name) ORDER BY name, id), '[]') FROM batches) AS batches,
            (SELECT COALESCE(json_agg(json_build_object('id', id, 'name', name) ORDER BY order_index, name, id), '[]')
               FROM scoped_subjects) AS subjects`,
    [user.id, user.role === 'admin'],
  );

  const { topStudents, batches, subjects, highestAttendingBatch, lowestAttendingBatch, ...counts } = overview;
  const emptyBatch = { name: 'N/A', averageAttendance: 0 };
  return {
    stats: {
      ...counts,
      highestAttendingBatch: highestAttendingBatch ?? emptyBatch,
      lowestAttendingBatch: lowestAttendingBatch ?? emptyBatch,
    },
    topStudents,
    batches,
    subjects,
  };
}

async function getTrends(db, user, query) {
  const { days, batchId, subjectId, date, dayRange } = parseTrendsFilters(query);
  const params = [user.id, user.role === 'admin', subjectId, batchId];
  const localDate = `(scheduled_start_at AT TIME ZONE '${IST}')::date`;
  let windowClause;
  let summary;
  if (dayRange) {
    params.push(...dayRange);
    windowClause = 'scheduled_start_at >= $5 AND scheduled_start_at < $6';
    summary = `SELECT scheduled_start_at AS sort_key, class_id::text AS tie_breaker,
                      scheduled_start_at AS date, title AS day,
                      ROUND(AVG(attendance_percentage), 1) AS "onlineAttendancePercent",
                      1 AS "totalClasses"
                 FROM filtered_attendance
                GROUP BY scheduled_start_at, class_id, title`;
  } else {
    params.push(days);
    windowClause = `scheduled_start_at >= (
      date_trunc('day', NOW() AT TIME ZONE '${IST}') - ($5::int - 1) * INTERVAL '1 day'
    ) AT TIME ZONE '${IST}' AND scheduled_start_at <= NOW()`;
    summary = `SELECT ${localDate} AS sort_key, '' AS tie_breaker,
                      TO_CHAR(${localDate}, 'DD-MM-YYYY') AS date, TO_CHAR(${localDate}, 'Dy') AS day,
                      ROUND(AVG(attendance_percentage), 1) AS "onlineAttendancePercent",
                      COUNT(DISTINCT class_id)::int AS "totalClasses"
                 FROM filtered_attendance
                GROUP BY ${localDate}`;
  }

  const { rows: [result] } = await db.query(
    `WITH ${SCOPED_DATA},
     filtered_attendance AS (
       SELECT * FROM scoped_attendance
        WHERE ($3::uuid IS NULL OR subject_id = $3)
          AND ($4::text IS NULL OR college_id::text || ':' || batch_year = $4)
          AND ${windowClause}
     ), summary AS (${summary})
     SELECT ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM scoped_subjects WHERE id = $3)) AS "courseAllowed",
            COALESCE((SELECT json_agg(to_jsonb(summary) - 'sort_key' - 'tie_breaker' ORDER BY sort_key, tie_breaker)
                        FROM summary), '[]') AS data`,
    params,
  );

  if (!result.courseAllowed) {
    throw Object.assign(new Error('You do not have access to this course'), { status: 403 });
  }

  return dayRange ? { mode: 'day', selectedDate: date, data: result.data } : { data: result.data };
}

module.exports = { getOverview, getTrends };
