const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { Client } = require('pg');
const { getOverview, getTrends } = require('../services/attendanceDashboard.service');

const uuid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const admin = { id: uuid(1), role: 'admin' };
const facilitator = { id: uuid(2), role: 'facilitator' };
const collegeA = uuid(11);
const collegeB = uuid(12);
const web = uuid(21);
const dataScience = uuid(22);
const noClasses = uuid(23);
const deletedCourse = uuid(24);
const revokedCourse = uuid(25);
const asSqlValues = (ids) => ids.map((id) => `('${id}')`).join(', ');

test('dashboard filters reject invalid dates, ranges, course IDs and batch IDs', async () => {
  const db = { query: () => assert.fail('Invalid filters should be rejected before any query') };
  for (const query of [
    { date: '31-02-2026' },
    { date: '2026-02-29' },
    { date: '2026-13-01' },
    { date: '0000-01-01' },
    { date: ['2026-11-19', '2026-11-20'] },
    { timeRange: '15d' },
    { subjectId: 'invalid' },
    { batchId: '2026' },
  ]) {
    await assert.rejects(getTrends(db, admin, query), { status: 400 });
  }
});

test('single-day filters bind both date formats to the same half-open IST window', async () => {
  const db = {
    query: async (_sql, params) => {
      assert.deepEqual(params.slice(4).map((bound) => bound.toISOString()), [
        '2028-02-28T18:30:00.000Z',
        '2028-02-29T18:30:00.000Z',
      ]);
      return { rows: [{ courseAllowed: true, data: [] }] };
    },
  };
  for (const date of ['29-02-2028', '2028-02-29']) {
    assert.deepEqual(await getTrends(db, admin, { date }), { mode: 'day', selectedDate: date, data: [] });
  }
});

test('course authorization preserves HTTP 403 for an out-of-scope course', async () => {
  const db = { query: async () => ({ rows: [{ courseAllowed: false, data: [] }] }) };
  await assert.rejects(getTrends(db, facilitator, { subjectId: dataScience }), { status: 403 });
});

const testDatabaseUrl = process.env.ATTENDANCE_TEST_DATABASE_URL;

test('PostgreSQL dashboard results respect assignments, college batches, and midnight IST', {
  skip: !testDatabaseUrl && 'Set ATTENDANCE_TEST_DATABASE_URL to run against a PostgreSQL test database',
}, async (t) => {
  const db = new Client({ connectionString: testDatabaseUrl });
  await db.connect();
  t.after(() => db.end());
  await db.query(`
    SET TIME ZONE 'UTC';
    CREATE TEMP TABLE subjects (id uuid, name text, order_index int, is_deleted bool DEFAULT false);
    CREATE TEMP TABLE facilitator_subjects (facilitator_id uuid, subject_id uuid, is_deleted bool DEFAULT false);
    CREATE TEMP TABLE colleges (id uuid, name text, created_at timestamptz DEFAULT now(), is_deleted bool DEFAULT false, deleted_at timestamptz);
    CREATE TEMP TABLE facilitator_colleges (facilitator_id uuid, college_id uuid, is_deleted bool DEFAULT false);
    CREATE TEMP TABLE roles (id int, role_key text);
    CREATE TEMP TABLE users (id uuid, full_name text, email text, role_id int, created_at timestamptz DEFAULT now(), deleted_at timestamptz);
    CREATE TEMP TABLE student_profiles (user_id uuid, college_id uuid, expected_graduation_year text, year int, created_at timestamptz DEFAULT now());
    CREATE TEMP TABLE classes (id uuid, subject_id uuid, title text, scheduled_start_at timestamptz);
    CREATE TEMP TABLE attendance (class_id uuid, student_id uuid, attendance_percentage numeric);
    CREATE TEMP TABLE class_students (class_id uuid, student_id uuid, roster_status text DEFAULT 'eligible');

    INSERT INTO colleges (id, name) VALUES ('${collegeA}', 'College A'), ('${collegeB}', 'College B');
    INSERT INTO facilitator_colleges (facilitator_id, college_id) VALUES ('${facilitator.id}', '${collegeA}');
    INSERT INTO subjects VALUES
      ('${web}', 'Web Development', 1, false),
      ('${dataScience}', 'Data Science', 2, false),
      ('${noClasses}', 'Course without classes', 3, false),
      ('${deletedCourse}', 'Deleted', 4, true),
      ('${revokedCourse}', 'Revoked', 5, false);
    INSERT INTO facilitator_subjects VALUES
      ('${facilitator.id}', '${web}', false),
      ('${facilitator.id}', '${noClasses}', false),
      ('${facilitator.id}', '${deletedCourse}', false),
      ('${facilitator.id}', '${revokedCourse}', true);

    INSERT INTO roles VALUES (1, 'STUDENT');
    INSERT INTO users (id) VALUES ${asSqlValues([uuid(31), uuid(32), uuid(33), uuid(34)])};
    UPDATE users SET role_id = 1, full_name = id::text, email = id::text || '@example.test';
    INSERT INTO student_profiles (user_id, college_id, expected_graduation_year, year) VALUES
      ('${uuid(31)}', '${collegeA}', '2026', 2025),
      ('${uuid(32)}', '${collegeB}', NULL, 2026),
      ('${uuid(33)}', '${collegeA}', NULL, 2026),
      ('${uuid(34)}', '${collegeA}', NULL, 2026);
    UPDATE student_profiles SET created_at = NOW() - INTERVAL '60 days' WHERE user_id = '${uuid(31)}';

    CREATE TEMP TABLE test_dates AS SELECT
      ((NOW() AT TIME ZONE 'Asia/Kolkata')::date - 1) AS day,
      (((NOW() AT TIME ZONE 'Asia/Kolkata')::date - 1)::timestamp AT TIME ZONE 'Asia/Kolkata') AS midnight;
    INSERT INTO classes
      SELECT '${uuid(41)}'::uuid, '${web}'::uuid, 'Before midnight', midnight - INTERVAL '15 minutes' FROM test_dates
      UNION ALL SELECT '${uuid(42)}', '${web}', 'After midnight', midnight + INTERVAL '30 minutes' FROM test_dates
      UNION ALL SELECT '${uuid(43)}', '${dataScience}', 'Unassigned course', midnight + INTERVAL '1 hour' FROM test_dates
      UNION ALL SELECT '${uuid(44)}', '${web}', 'Next midnight', midnight + INTERVAL '1 day' FROM test_dates;
    INSERT INTO attendance VALUES
      ('${uuid(41)}', '${uuid(31)}', 80),
      ('${uuid(42)}', '${uuid(31)}', 90),
      ('${uuid(42)}', '${uuid(32)}', 50),
      ('${uuid(43)}', '${uuid(33)}', 100),
      ('${uuid(44)}', '${uuid(31)}', NULL);
    INSERT INTO class_students (class_id, student_id) SELECT class_id, student_id FROM attendance;
  `);

  const { rows: [dates] } = await db.query(`
    SELECT TO_CHAR(day - 1, 'DD-MM-YYYY') AS previous,
           TO_CHAR(day, 'DD-MM-YYYY') AS selected FROM test_dates
  `);
  const overview = await getOverview(db, admin);
  assert.deepEqual(overview.subjects.map(({ id }) => id), [web, dataScience, noClasses, revokedCourse]);
  assert.equal(overview.stats.totalCohorts, 2);
  assert.equal(overview.stats.cohortsDeltaMonth, 1);
  assert.deepEqual(overview.batches.map(({ id }) => id), [`${collegeA}:2026`, `${collegeB}:2026`]);
  assert.equal(overview.stats.lowestAttendingBatch.averageAttendance, 50);

  const scopedOverview = await getOverview(db, facilitator);
  assert.deepEqual(scopedOverview.subjects.map(({ id }) => id), [web, noClasses]);
  assert.deepEqual(scopedOverview.topStudents.map(({ id }) => id), [uuid(31)]);
  assert.equal(scopedOverview.stats.highestAttendingBatch.averageAttendance, 85);

  const range = await getTrends(db, facilitator, { timeRange: '7d', subjectId: web });
  assert.deepEqual(range.data.map(({ date }) => date), [dates.previous, dates.selected]);
  assert.deepEqual(range.data.map(({ onlineAttendancePercent }) => onlineAttendancePercent), [80, 90]);
  await db.query('UPDATE attendance SET attendance_percentage = 75 WHERE class_id = $1', [uuid(44)]);
  const day = await getTrends(db, facilitator, { date: dates.selected });
  assert.deepEqual(day.data.map(({ day: title }) => title), ['After midnight']);
  assert.equal(day.data[0].onlineAttendancePercent, 90);
  assert.equal(day.data[0].totalClasses, 1);

  const otherBatch = await getTrends(db, admin, { date: dates.selected, batchId: `${collegeB}:2026` });
  assert.deepEqual(otherBatch.data.map(({ onlineAttendancePercent }) => onlineAttendancePercent), [50]);
  const adminCourse = await getTrends(db, admin, { date: dates.selected, subjectId: dataScience });
  assert.equal(adminCourse.data[0].onlineAttendancePercent, 100);
  await assert.rejects(getTrends(db, facilitator, { subjectId: dataScience }), { status: 403 });
  await assert.rejects(getTrends(db, facilitator, { date: dates.selected, subjectId: revokedCourse }), { status: 403 });

  await db.query(`
    INSERT INTO class_students (class_id, student_id)
    VALUES ('${uuid(41)}', '${uuid(34)}'), ('${uuid(43)}', '${uuid(31)}');
    INSERT INTO attendance VALUES ('${uuid(41)}', '${uuid(34)}', 0), ('${uuid(43)}', '${uuid(31)}', 0);
  `);
  const rankedStudents = (await getOverview(db, admin)).topStudents;
  assert.ok(!rankedStudents.some(({ id }) => id === uuid(34)));
  assert.equal(rankedStudents.find(({ id }) => id === uuid(31)).attendancePercent, 61.3);

  await t.test('class routes enforce staff access and return scoped data and filter errors', async (routeTest) => {
    const express = require('express');
    const users = { admin, facilitator, student: { id: uuid(31), role: 'student' } };
    const testModules = {
      '../config/pg': db,
      '../services/meetQueue.service': {},
      '../middlewares/verfiyToken': (req, res, next) => {
        req.user = users[req.get('x-test-role')];
        if (!req.user) return res.status(401).json({ message: 'Authentication required' });
        next();
      },
    };
    // Use the production routes and role middleware, with fixture authentication and database.
    for (const [path, exports] of Object.entries(testModules)) {
      const id = require.resolve(path);
      require.cache[id] = { id, loaded: true, exports };
    }
    const app = express();
    app.use('/api/v1/classes', require('../routes/class.routes'));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    routeTest.after(() => new Promise((resolve) => server.close(resolve)));
    const request = (path, role) => fetch(
      `http://127.0.0.1:${server.address().port}/api/v1/classes${path}`,
      { headers: { 'x-test-role': role ?? '' } },
    );

    assert.equal((await request('/dashboard/overview')).status, 401);
    assert.equal((await request('/dashboard/trends', 'student')).status, 403);
    const response = await request('/dashboard/overview', 'facilitator');
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.subjects.map(({ id }) => id), [web, noClasses]);
    assert.equal((await request(`/dashboard/trends?subjectId=${dataScience}`, 'facilitator')).status, 403);
    assert.equal((await request('/dashboard/trends?date=31-02-2026', 'admin')).status, 400);
    const accessible = await request(`/dashboard/trends?date=${dates.selected}&subjectId=${dataScience}`, 'admin');
    assert.equal(accessible.status, 200);
    assert.equal((await accessible.json()).data[0].onlineAttendancePercent, 50);

    await db.query(`
      ALTER TABLE classes ADD COLUMN facilitator_id uuid, ADD COLUMN status text,
        ADD COLUMN planned_end_at timestamptz, ADD COLUMN grace_period_minutes int DEFAULT 30,
        ADD COLUMN actual_end_at timestamptz;
      INSERT INTO classes (id, subject_id, title, scheduled_start_at, planned_end_at, status, facilitator_id)
      VALUES ('${uuid(45)}', '${web}', 'Stale scheduled class', NOW() - INTERVAL '1 day',
              NOW() - INTERVAL '23 hours', 'scheduled', '${facilitator.id}'),
             ('${uuid(46)}', '${web}', 'Active class', NOW() - INTERVAL '5 minutes',
              NOW() + INTERVAL '1 hour', 'active', '${facilitator.id}'),
             ('${uuid(47)}', '${web}', 'Tomorrow', NOW() + INTERVAL '1 day',
              NOW() + INTERVAL '25 hours', 'scheduled', '${facilitator.id}');
    `);
    const upcoming = await request('/?status=upcoming&limit=2', 'facilitator');
    assert.equal(upcoming.status, 200);
    assert.deepEqual((await upcoming.json()).data.map(({ title }) => title), ['Active class', 'Tomorrow']);
  });

  await db.query('DELETE FROM facilitator_colleges');
  const emptyOverview = await getOverview(db, facilitator);
  assert.deepEqual(emptyOverview.subjects.map(({ id }) => id), [web, noClasses]);
  assert.deepEqual(emptyOverview.topStudents, []);
  assert.deepEqual(await getTrends(db, facilitator, { date: dates.selected }), {
    mode: 'day', selectedDate: dates.selected, data: [],
  });
});
