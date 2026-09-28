const serverError = require('../utils/serverError');
const pool = require('../config/pg');
const path = require('path');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { withS3Prefix, s3 } = require('../utils/s3');
const slugify = require('../utils/slugify');
const { logAction } = require('../utils/auditLogger');
const moment = require('moment-timezone');
const { calculateSubjectProgress } = require('../utils/progress');
const bcrypt = require('bcrypt');

// ============================================
// EXISTING ADMIN FEATURES (Keep these!)
// ============================================

exports.getAdminStats = async (req, res) => {
  try {
    const queries = [
      pool.query(
        `SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.role_key = $1 AND u.deleted_at IS NULL`,
        ['STUDENT'],
      ),
      pool.query('SELECT COUNT(*) FROM colleges'),
      pool.query('SELECT COUNT(*) FROM subjects'),
      pool.query(
        `SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.role_key = $1 AND u.deleted_at IS NULL`,
        ['FACILITATOR'],
      ),
      pool.query(
        'SELECT full_name, email, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5',
      ),
    ];

    const [students, colleges, subjects, facilitators, recentUsers] =
      await Promise.all(queries);

    res.status(200).json({
      stats: {
        totalStudents: parseInt(students.rows[0].count),
        totalColleges: parseInt(colleges.rows[0].count),
        totalSubjects: parseInt(subjects.rows[0].count),
        totalFacilitators: parseInt(facilitators.rows[0].count),
      },
      recentActivity: recentUsers.rows,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard data' });
  }
};

// ── Analytics ──────────────────────────────────────────────────────────────

exports.getAdminAnalytics = async (req, res) => {
  try {
    const [
      quizStats,
      exerciseStats,
      contentInventory,
      studentsPerCollege,
      dailyRegistrations,
      subjectActivity,
    ] = await Promise.all([
      // 1. Quiz stats
      pool.query(`
        SELECT
          COUNT(*) AS total_attempts,
          ROUND(AVG(score)::numeric, 1) AS avg_score,
          COUNT(*) FILTER (WHERE is_passed = true) AS passed_count
        FROM quiz_attempts
      `),
      // 2. Exercise stats
      pool.query(`
        SELECT
          COUNT(*) AS total_submissions,
          COUNT(*) FILTER (WHERE is_passed = true) AS passed_count
        FROM exercise_submissions
      `),
      // 3. Content inventory
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM topics WHERE is_deleted = false)        AS total_topics,
          (SELECT COUNT(*) FROM units WHERE is_deleted = false)         AS total_units,
          (SELECT COUNT(*) FROM subtopics WHERE is_deleted = false)     AS total_subtopics,
          (SELECT COUNT(*) FROM lesson_content WHERE is_deleted = false)AS total_lessons,
          (SELECT COUNT(*) FROM quizzes WHERE is_deleted = false)       AS total_quizzes,
          (SELECT COUNT(*) FROM exercises WHERE is_deleted = false)     AS total_exercises
      `),
      // 4. Students per college (top 10)
      pool.query(`
        SELECT c.name AS college_name, COUNT(u.id) AS student_count
        FROM colleges c
        LEFT JOIN student_profiles sp ON sp.college_id = c.id
        LEFT JOIN users u ON sp.user_id = u.id AND u.deleted_at IS NULL
        GROUP BY c.id, c.name
        ORDER BY student_count DESC
        LIMIT 10
      `),
      // 5. Daily new student registrations – last 7 days
      pool.query(`
        SELECT TO_CHAR(DATE(u.created_at), 'Mon DD') AS label, COUNT(*) AS count
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE r.role_key = 'STUDENT'
          AND u.deleted_at IS NULL
          AND u.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(u.created_at), label
        ORDER BY DATE(u.created_at)
      `),
      // 6. Top subjects by quiz activity
      pool.query(`
        SELECT
          sub.name AS subject_name,
          COUNT(qa.id) AS attempt_count,
          ROUND(AVG(qa.score)::numeric, 1) AS avg_score,
          COUNT(DISTINCT qa.user_id) AS unique_students
        FROM subjects sub
        LEFT JOIN topics t    ON t.subject_id = sub.id AND t.is_deleted = false
        LEFT JOIN units u     ON u.topic_id   = t.id AND u.is_deleted = false
        LEFT JOIN quizzes q   ON q.unit_id    = u.id AND q.is_deleted = false
        LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id
        GROUP BY sub.id, sub.name
        ORDER BY attempt_count DESC
        LIMIT 6
      `),
    ]);

    const qs = quizStats.rows[0];
    const es = exerciseStats.rows[0];
    const ci = contentInventory.rows[0];

    res.status(200).json({
      success: true,
      data: {
        quizStats: {
          totalAttempts: parseInt(qs.total_attempts),
          avgScore: parseFloat(qs.avg_score) || 0,
          passedCount: parseInt(qs.passed_count),
          passRate:
            qs.total_attempts > 0
              ? Math.round((qs.passed_count / qs.total_attempts) * 100)
              : 0,
        },
        exerciseStats: {
          totalSubmissions: parseInt(es.total_submissions),
          passedCount: parseInt(es.passed_count),
          passRate:
            es.total_submissions > 0
              ? Math.round((es.passed_count / es.total_submissions) * 100)
              : 0,
        },
        contentInventory: {
          topics: parseInt(ci.total_topics),
          units: parseInt(ci.total_units),
          subtopics: parseInt(ci.total_subtopics),
          lessons: parseInt(ci.total_lessons),
          quizzes: parseInt(ci.total_quizzes),
          exercises: parseInt(ci.total_exercises),
        },
        studentsPerCollege: studentsPerCollege.rows.map((r) => ({
          college: r.college_name,
          count: parseInt(r.student_count),
        })),
        dailyRegistrations: dailyRegistrations.rows.map((r) => ({
          label: r.label,
          count: parseInt(r.count),
        })),
        subjectActivity: subjectActivity.rows.map((r) => ({
          subject: r.subject_name,
          attempts: parseInt(r.attempt_count),
          avgScore: parseFloat(r.avg_score) || 0,
          uniqueStudents: parseInt(r.unique_students),
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching analytics' });
  }
};

// ── Student Registrations Chart (dynamic date range) ───────────────────────
// GET /admin/analytics/registrations?days=30
// GET /admin/analytics/registrations?from=2026-08-01&to=2026-08-18

exports.getStudentRegistrations = async (req, res) => {
  try {
    let { days, from, to } = req.query;

    let startDate, endDate, groupBy;

    if (from && to) {
      // Custom date range
      const startStr = /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00.000Z` : from;
      const endStr = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to;

      startDate = new Date(startStr);
      endDate = new Date(endStr);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        return res.status(400).json({ success: false, message: 'Invalid date range. "from" must be before "to".' });
      }
      // Clamp to max 365 days
      const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
      if (diffDays > 365) {
        return res.status(400).json({ success: false, message: 'Date range cannot exceed 365 days.' });
      }
      groupBy = diffDays > 90 ? 'month' : 'day';
    } else {
      // Preset days
      const numDays = Math.max(1, Math.min(parseInt(days) || 7, 365));
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - numDays);
      groupBy = numDays > 90 ? 'month' : 'day';
    }

    const labelFormat = groupBy === 'month' ? 'Mon YYYY' : 'Mon DD';
    const truncUnit = groupBy === 'month' ? 'month' : 'day';

    const result = await pool.query(
      `SELECT
         TO_CHAR(DATE_TRUNC($1, u.created_at), $2) AS label,
         COUNT(*) AS count
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.role_key = 'STUDENT'
         AND u.created_at >= $3
         AND u.created_at <= $4
       GROUP BY DATE_TRUNC($1, u.created_at)
       ORDER BY DATE_TRUNC($1, u.created_at)`,
      [truncUnit, labelFormat, startDate.toISOString(), endDate.toISOString()]
    );

    res.status(200).json({
      success: true,
      data: {
        registrations: result.rows.map((r) => ({
          label: r.label,
          count: parseInt(r.count),
        })),
        meta: {
          from: startDate.toISOString().split('T')[0],
          to: endDate.toISOString().split('T')[0],
          groupBy,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching student registrations:', error);
    res.status(500).json({ success: false, message: 'Error fetching student registrations' });
  }
};

exports.getActiveUsersTimeline = async (req, res) => {
  try {
    let { days, from, to } = req.query;

    let startDate, endDate, groupBy;

    if (from && to) {
      // Custom date range
      const startStr = /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00.000Z` : from;
      const endStr = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to;

      startDate = new Date(startStr);
      endDate = new Date(endStr);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        return res.status(400).json({ success: false, message: 'Invalid date range. "from" must be before "to".' });
      }
      // Clamp to max 365 days
      const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
      if (diffDays > 365) {
        return res.status(400).json({ success: false, message: 'Date range cannot exceed 365 days.' });
      }
      groupBy = diffDays > 90 ? 'month' : 'day';
    } else {
      // Preset days
      const numDays = Math.max(1, Math.min(parseInt(days) || 7, 365));
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - numDays);
      groupBy = numDays > 90 ? 'month' : 'day';
    }

    const labelFormat = groupBy === 'month' ? 'Mon YYYY' : 'Mon DD';
    const truncUnit = groupBy === 'month' ? 'month' : 'day';

    const result = await pool.query(
      `SELECT
         TO_CHAR(DATE_TRUNC($1, active_actions.activity_date), $2) AS label,
         COUNT(DISTINCT active_actions.user_id) AS count
       FROM (
         SELECT user_id, completed_at AS activity_date FROM public.user_subtopic_progress WHERE completed_at >= $3 AND completed_at <= $4
         UNION ALL
         SELECT user_id, attempted_at AS activity_date FROM public.quiz_attempts WHERE attempted_at >= $3 AND attempted_at <= $4
         UNION ALL
         SELECT user_id, submitted_at AS activity_date FROM public.exercise_submissions WHERE submitted_at >= $3 AND submitted_at <= $4
         UNION ALL
         SELECT user_id, submitted_at AS activity_date FROM public.assignment_submissions WHERE submitted_at >= $3 AND submitted_at <= $4
         UNION ALL
         SELECT user_id, submitted_at AS activity_date FROM public.project_submissions WHERE submitted_at >= $3 AND submitted_at <= $4
         UNION ALL
         SELECT student_id AS user_id, submitted_at AS activity_date FROM public.college_assignment_submissions WHERE submitted_at >= $3 AND submitted_at <= $4
       ) active_actions
       JOIN public.users u ON active_actions.user_id = u.id
       JOIN public.roles r ON u.role_id = r.id
       WHERE r.role_key = 'STUDENT'
       GROUP BY DATE_TRUNC($1, active_actions.activity_date)
       ORDER BY DATE_TRUNC($1, active_actions.activity_date)`,
      [truncUnit, labelFormat, startDate.toISOString(), endDate.toISOString()]
    );

    res.status(200).json({
      success: true,
      data: {
        activeUsers: result.rows.map((r) => ({
          label: r.label,
          count: parseInt(r.count),
        })),
        meta: {
          from: startDate.toISOString().split('T')[0],
          to: endDate.toISOString().split('T')[0],
          groupBy,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching active users timeline:', error);
    res.status(500).json({ success: false, message: 'Error fetching active users timeline' });
  }
};

exports.getAllStudents = async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id, 
        u.full_name, 
        u.email, 
        sp.degree, 
        sp.year as batch, 
        u.created_at as joined_date,
        LOWER(r.role_key) AS role,
        u.is_verified,
        c.name as college_name,
        c.short_code as college_short_name
      FROM public.users u
      JOIN public.roles r ON r.id = u.role_id
      LEFT JOIN public.student_profiles sp ON u.id = sp.user_id
      LEFT JOIN public.colleges c ON sp.college_id = c.id
      WHERE r.role_key = 'STUDENT'
      ORDER BY u.created_at DESC
      LIMIT 1000
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getProjectSubmissions = async (req, res) => {
  try {
    const query = `
      SELECT 
        ps.id,
        u.full_name as student_name,
        s.name as subject_name,      
        p.title as task_name,       
        p.type,                      
        ps.submitted_at,
        ps.is_approved               
      FROM public.project_submissions ps
      JOIN public.users u ON ps.user_id = u.id          
      JOIN public.projects p ON ps.project_id = p.id    
      JOIN public.topics t ON p.topic_id = t.id         
      JOIN public.subjects s ON t.subject_id = s.id     
      WHERE ps.is_approved IS NOT TRUE
      ORDER BY ps.submitted_at DESC
      LIMIT 1000;
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ============================================
// ADMIN SUBJECT STRUCTURE (INCLUDES DRAFTS)
// ============================================

exports.getAdminSubjectStructure = async (req, res) => {
  try {
    const { slug } = req.params;

    const subjectResult = await pool.query(
      `SELECT id, name, description, is_published 
       FROM subjects 
       WHERE slug = $1`,
      [slug],
    );

    if (subjectResult.rows.length === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const subject = subjectResult.rows[0];

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
        u.slug AS unit_slug,
        u.description AS unit_description,
        u.order_index AS unit_order,

        -- Subtopic
        st.id AS subtopic_id,
        st.title AS subtopic_title,
        st.slug AS subtopic_slug,
        st.description AS subtopic_description,
        st.order_index AS subtopic_order,

        -- Lesson Content (all versions, draft + published)
        lc.id AS lesson_id,
        lc.content_type AS lesson_type,
        lc.markdown_path AS lesson_path,
        lc.estimated_read_time AS lesson_read_time,
        lc.version AS lesson_version,
        lc.is_published AS lesson_is_published,
        lc.video_url AS lesson_video_url,

        -- Quiz (presence only — questions loaded separately on demand)
        q.id AS quiz_id,
        q.passing_score AS quiz_passing_score,
        q.max_score AS quiz_max_score,

        -- Exercise (subtopic-level only — instructions omitted, fetched on edit)
        e.id AS exercise_id,
        e.title AS exercise_title,
        e.max_score AS exercise_max_score,

        -- Assignment (unit-level — instructions omitted, fetched on edit)
        a.id AS assignment_id,
        a.title AS assignment_title,
        a.max_score AS assignment_max_score,

        -- Capstone (topic-level)
        p.id AS capstone_id,
        p.title AS capstone_title,
        p.instructions AS capstone_instructions,
        p.max_score AS capstone_max_score

      FROM topics t
      LEFT JOIN projects p ON t.id = p.topic_id AND p.is_deleted = false
      LEFT JOIN units u ON t.id = u.topic_id AND u.is_deleted = false
      LEFT JOIN subtopics st ON u.id = st.unit_id AND st.is_deleted = false
      LEFT JOIN lesson_content lc
        ON st.id = lc.subtopic_id AND lc.is_deleted = false
      LEFT JOIN quizzes q ON u.id = q.unit_id AND q.is_deleted = false
      LEFT JOIN exercises e ON st.id = e.subtopic_id AND e.is_deleted = false
      LEFT JOIN assignments a ON u.id = a.unit_id AND a.is_deleted = false

      WHERE t.subject_id = $1 AND t.is_deleted = false
      ORDER BY
        t.order_index,
        u.order_index,
        st.order_index,
        lc.version;
    `;

    const { rows } = await pool.query(query, [subject.id]);

    const topicsMap = new Map();

    rows.forEach((row) => {
      if (!topicsMap.has(row.topic_id)) {
        topicsMap.set(row.topic_id, {
          id: row.topic_id,
          title: row.topic_title,
          description: row.topic_description,
          order_index: row.topic_order,
          capstone: row.capstone_id
            ? {
                id: row.capstone_id,
                title: row.capstone_title,
                instructions: row.capstone_instructions,
                max_score: row.capstone_max_score,
              }
            : null,
          units: new Map(),
        });
      }

      const topic = topicsMap.get(row.topic_id);

      // Unit
      if (row.unit_id && !topic.units.has(row.unit_id)) {
        topic.units.set(row.unit_id, {
          id: row.unit_id,
          title: row.unit_title,
          slug: row.unit_slug,
          description: row.unit_description,
          order_index: row.unit_order,
          subtopics: new Map(),
          assignments: [],
          quizzes: new Map(),
        });
      }

      const unit = topic.units.get(row.unit_id);

      // Subtopic
      if (row.subtopic_id && unit && !unit.subtopics.has(row.subtopic_id)) {
        unit.subtopics.set(row.subtopic_id, {
          id: row.subtopic_id,
          title: row.subtopic_title,
          slug: row.subtopic_slug,
          description: row.subtopic_description,
          order_index: row.subtopic_order,
          lesson_content: [],
          exercises: [],
        });
      }

      const subtopic = unit ? unit.subtopics.get(row.subtopic_id) : null;

      if (row.lesson_id && subtopic) {
        if (!subtopic.lesson_content.some((l) => l.id === row.lesson_id)) {
          subtopic.lesson_content.push({
            id: row.lesson_id,
            content_type: row.lesson_type,
            markdown_path: row.lesson_path,
            estimated_read_time: row.lesson_read_time,
            version: row.lesson_version,
            is_published: row.lesson_is_published,
            video_url: row.lesson_video_url,
          });
        }
      }

      // Quiz (title/score only — no questions)
      if (row.quiz_id && unit) {
        if (!unit.quizzes.has(row.quiz_id)) {
          unit.quizzes.set(row.quiz_id, {
            id: row.quiz_id,
            passing_score: row.quiz_passing_score,
            max_score: row.quiz_max_score,
          });
        }
      }

      // Exercise (subtopic-level — no instructions)
      if (row.exercise_id && subtopic) {
        if (!subtopic.exercises.some((e) => e.id === row.exercise_id)) {
          subtopic.exercises.push({
            id: row.exercise_id,
            title: row.exercise_title,
            max_score: row.exercise_max_score,
          });
        }
      }

      // Assignment (unit-level — no instructions)
      if (row.assignment_id && unit) {
        if (!unit.assignments.some((a) => a.id === row.assignment_id)) {
          unit.assignments.push({
            id: row.assignment_id,
            title: row.assignment_title,
            max_score: row.assignment_max_score,
          });
        }
      }
    });

    const structure = Array.from(topicsMap.values()).map((topic) => ({
      id: topic.id,
      title: topic.title,
      description: topic.description,
      order_index: topic.order_index,
      capstone: topic.capstone,
      units: Array.from(topic.units.values()).map((unit) => ({
        id: unit.id,
        title: unit.title,
        slug: unit.slug,
        description: unit.description,
        order_index: unit.order_index,
        assignments: unit.assignments,
        quizzes: Array.from(unit.quizzes.values()),
        subtopics: Array.from(unit.subtopics.values()).map((sub) => ({
          ...sub,
        })),
      })),
    }));

    res.json({
      success: true,
      name: subject.name,
      description: subject.description,
      is_published: subject.is_published,
      data: structure,
    });
  } catch (error) {
    console.error('Error | getAdminSubjectStructure:', error);
    res.status(500).json({ message: 'Error fetching course structure' });
  }
};

// ============================================
// NEW CONTENT MANAGEMENT FEATURES
// ============================================

// ============================================
// TOPIC MANAGEMENT
// ============================================

// Create a new topic
exports.createTopic = async (req, res) => {
  try {
    const { subject_id, title, description, order_index } = req.body;

    // Validation
    if (!subject_id || !title) {
      return res.status(400).json({
        success: false,
        message: 'Subject ID and title are required',
      });
    }

    const query = `
      INSERT INTO topics (subject_id, title, description, order_index)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const values = [subject_id, title, description || null, order_index || 0];

    const result = await pool.query(query, values);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'topic',
      entityId: result.rows[0].id,
      details: { title: result.rows[0].title },
    });

    res.status(201).json({
      success: true,
      message: 'Topic created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create topic',
    });
  }
};

// Update an existing topic
exports.updateTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, order_index } = req.body;

    // Build dynamic query based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (order_index !== undefined) {
      updates.push(`order_index = $${paramCount++}`);
      values.push(order_index);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE topics
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    logAction({
      req,
      action: 'UPDATE',
      entityType: 'topic',
      entityId: result.rows[0].id,
      details: { title: result.rows[0].title },
    });

    res.json({
      success: true,
      message: 'Topic updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating topic:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update topic',
    });
  }
};

// Delete a topic
exports.deleteTopic = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE topics SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *;',
      [id],
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    // Cascade soft-delete to child rows: units -> subtopics -> lesson_content/exercises,
    // units -> quizzes -> quiz_questions -> quiz_question_options, units -> assignments,
    // and topic-level projects (capstones).
    await client.query(
      `UPDATE quiz_question_options SET is_deleted = true
       WHERE question_id IN (
         SELECT qq.id FROM quiz_questions qq
         INNER JOIN quizzes q ON qq.quiz_id = q.id
         INNER JOIN units u ON q.unit_id = u.id
         WHERE u.topic_id = $1
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE quiz_questions SET is_deleted = true
       WHERE quiz_id IN (
         SELECT q.id FROM quizzes q
         INNER JOIN units u ON q.unit_id = u.id
         WHERE u.topic_id = $1
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE quizzes SET is_deleted = true
       WHERE unit_id IN (SELECT id FROM units WHERE topic_id = $1) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE lesson_content SET is_deleted = true
       WHERE subtopic_id IN (
         SELECT st.id FROM subtopics st
         INNER JOIN units u ON st.unit_id = u.id
         WHERE u.topic_id = $1
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE exercises SET is_deleted = true
       WHERE subtopic_id IN (
         SELECT st.id FROM subtopics st
         INNER JOIN units u ON st.unit_id = u.id
         WHERE u.topic_id = $1
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE assignments SET is_deleted = true
       WHERE unit_id IN (SELECT id FROM units WHERE topic_id = $1) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE subtopics SET is_deleted = true
       WHERE unit_id IN (SELECT id FROM units WHERE topic_id = $1) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE units SET is_deleted = true WHERE topic_id = $1 AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE projects SET is_deleted = true WHERE topic_id = $1 AND is_deleted = false`,
      [id],
    );

    await client.query('COMMIT');

    logAction({
      req,
      action: 'DELETE',
      entityType: 'topic',
      entityId: id,
      details: { title: result.rows[0].title },
    });

    res.json({
      success: true,
      message: 'Topic deleted successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting topic:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete topic',
    });
  } finally {
    client.release();
  }
};

// ============================================
// ============================================
// UNIT MANAGEMENT
// ============================================

// Create a new unit
exports.createUnit = async (req, res) => {
  try {
    const {
      topic_id,
      title,
      description,
      slug: manualSlug,
      order_index,
    } = req.body;
    const slug = manualSlug || slugify(title);

    // Validation
    if (!topic_id || !title || !slug) {
      return res.status(400).json({
        success: false,
        message: 'Topic ID and title are required',
      });
    }

    const query = `
      INSERT INTO units (topic_id, title, description, slug, order_index)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const values = [
      topic_id,
      title,
      description || null,
      slug,
      order_index || 0,
    ];

    const result = await pool.query(query, values);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'unit',
      entityId: result.rows[0].id,
      details: { title: result.rows[0].title },
    });

    res.status(201).json({
      success: true,
      message: 'Unit created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating unit:', error);

    // Handle unique constraint violation for slug
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A unit with this slug already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create unit',
    });
  }
};

// Update an existing unit
exports.updateUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, slug: manualSlug, order_index } = req.body;
    const slug = manualSlug || (title ? slugify(title) : undefined);

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (slug !== undefined) {
      updates.push(`slug = $${paramCount++}`);
      values.push(slug);
    }
    if (order_index !== undefined) {
      updates.push(`order_index = $${paramCount++}`);
      values.push(order_index);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE units
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found',
      });
    }

    logAction({
      req,
      action: 'UPDATE',
      entityType: 'unit',
      entityId: result.rows[0].id,
      details: { title: result.rows[0].title },
    });

    res.json({
      success: true,
      message: 'Unit updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating unit:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A unit with this slug already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update unit',
    });
  }
};

// Delete a unit
exports.deleteUnit = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE units SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *;',
      [id],
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Unit not found',
      });
    }

    // Cascade soft-delete to child rows: subtopics -> lesson_content/exercises,
    // quizzes -> quiz_questions -> quiz_question_options, and assignments.
    await client.query(
      `UPDATE quiz_question_options SET is_deleted = true
       WHERE question_id IN (
         SELECT qq.id FROM quiz_questions qq
         INNER JOIN quizzes q ON qq.quiz_id = q.id
         WHERE q.unit_id = $1
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE quiz_questions SET is_deleted = true
       WHERE quiz_id IN (SELECT id FROM quizzes WHERE unit_id = $1) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE quizzes SET is_deleted = true WHERE unit_id = $1 AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE lesson_content SET is_deleted = true
       WHERE subtopic_id IN (SELECT id FROM subtopics WHERE unit_id = $1) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE exercises SET is_deleted = true
       WHERE subtopic_id IN (SELECT id FROM subtopics WHERE unit_id = $1) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE assignments SET is_deleted = true WHERE unit_id = $1 AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE subtopics SET is_deleted = true WHERE unit_id = $1 AND is_deleted = false`,
      [id],
    );

    await client.query('COMMIT');

    logAction({
      req,
      action: 'DELETE',
      entityType: 'unit',
      entityId: id,
      details: { title: result.rows[0].title },
    });

    res.json({
      success: true,
      message: 'Unit deleted successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting unit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete unit',
    });
  } finally {
    client.release();
  }
};

// ============================================
// SUBTOPIC MANAGEMENT
// ============================================

// Create a new subtopic
exports.createSubtopic = async (req, res) => {
  try {
    const {
      unit_id,
      title,
      description,
      slug: manualSlug,
      order_index,
    } = req.body;
    const slug = manualSlug || slugify(title);

    // Validation
    if (!unit_id || !title || !slug) {
      return res.status(400).json({
        success: false,
        message: 'Unit ID and title are required',
      });
    }

    const query = `
      INSERT INTO subtopics (unit_id, title, description, slug, order_index)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const values = [
      unit_id,
      title,
      description || null,
      slug,
      order_index || 0,
    ];

    const result = await pool.query(query, values);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'subtopic',
      entityId: result.rows[0].id,
      details: { title: result.rows[0].title },
    });

    res.status(201).json({
      success: true,
      message: 'Subtopic created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating subtopic:', error);

    // Handle unique constraint violation for slug
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A subtopic with this slug already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create subtopic',
    });
  }
};

// Update an existing subtopic
exports.updateSubtopic = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, slug: manualSlug, order_index } = req.body;
    const slug = manualSlug || (title ? slugify(title) : undefined);

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (slug !== undefined) {
      updates.push(`slug = $${paramCount++}`);
      values.push(slug);
    }
    if (order_index !== undefined) {
      updates.push(`order_index = $${paramCount++}`);
      values.push(order_index);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE subtopics
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subtopic not found',
      });
    }

    logAction({
      req,
      action: 'UPDATE',
      entityType: 'subtopic',
      entityId: result.rows[0].id,
      details: { title: result.rows[0].title },
    });

    res.json({
      success: true,
      message: 'Subtopic updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating subtopic:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A subtopic with this slug already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update subtopic',
    });
  }
};

// Delete a subtopic
exports.deleteSubtopic = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE subtopics SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *;',
      [id],
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Subtopic not found',
      });
    }

    // Cascade soft-delete to lesson_content and exercises attached to this subtopic.
    await client.query(
      `UPDATE lesson_content SET is_deleted = true WHERE subtopic_id = $1 AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE exercises SET is_deleted = true WHERE subtopic_id = $1 AND is_deleted = false`,
      [id],
    );

    await client.query('COMMIT');

    logAction({
      req,
      action: 'DELETE',
      entityType: 'subtopic',
      entityId: id,
      details: { title: result.rows[0].title },
    });

    res.json({
      success: true,
      message: 'Subtopic deleted successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting subtopic:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete subtopic',
    });
  } finally {
    client.release();
  }
};

// ============================================
// LESSON CONTENT MANAGEMENT
// ============================================

// Create lesson content
exports.createLessonContent = async (req, res) => {
  try {
    const {
      subtopic_id,
      content_type,
      markdown_path,
      estimated_read_time,
      video_url,
    } = req.body;

    // Validation
    if (!subtopic_id || !content_type) {
      return res.status(400).json({
        success: false,
        message: 'Subtopic ID and content type are required',
      });
    }

    // Validate content_type
    const validTypes = ['markdown', 'video', 'external'];
    if (!validTypes.includes(content_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content type. Must be: markdown, video, or external',
      });
    }

    if (content_type === 'markdown' && !markdown_path) {
      return res.status(400).json({
        success: false,
        message: 'Markdown path is required for markdown content',
      });
    }

    if (content_type !== 'markdown' && !video_url) {
      return res.status(400).json({
        success: false,
        message: 'Video URL is required for video/external content',
      });
    }

    const query = `
      INSERT INTO lesson_content 
        (subtopic_id, content_type, markdown_path, estimated_read_time, is_published, video_url, version)
      VALUES ($1, $2, $3, $4, $5, $6, 1)
      ON CONFLICT (subtopic_id, version)
      DO UPDATE SET
        markdown_path = CASE
          WHEN EXCLUDED.content_type = 'markdown' AND EXCLUDED.markdown_path <> ''
            THEN EXCLUDED.markdown_path
          ELSE lesson_content.markdown_path
        END,
        video_url = CASE
          WHEN EXCLUDED.video_url IS NOT NULL AND EXCLUDED.video_url <> ''
            THEN EXCLUDED.video_url
          ELSE lesson_content.video_url
        END,
        estimated_read_time = COALESCE(EXCLUDED.estimated_read_time, lesson_content.estimated_read_time),
        is_published = COALESCE(EXCLUDED.is_published, lesson_content.is_published),
        content_type = CASE
          WHEN lesson_content.markdown_path <> '' THEN 'markdown'
          WHEN EXCLUDED.content_type = 'markdown' THEN 'markdown'
          ELSE EXCLUDED.content_type
        END,
        is_deleted = false,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const values = [
      subtopic_id,
      content_type,
      markdown_path || '',
      estimated_read_time || null,
      true,
      video_url || null,
    ];

    const result = await pool.query(query, values);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'lesson_content',
      entityId: result.rows[0].id,
      details: {
        content_type: result.rows[0].content_type,
        subtopic_id: result.rows[0].subtopic_id,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Lesson content created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating lesson content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create lesson content',
    });
  }
};

// Update lesson content
exports.updateLessonContent = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      content_type,
      markdown_path,
      estimated_read_time,
      is_published,
      version,
      video_url,
    } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (content_type !== undefined) {
      updates.push(`content_type = $${paramCount++}`);
      values.push(content_type);
    }
    if (markdown_path !== undefined) {
      updates.push(`markdown_path = $${paramCount++}`);
      values.push(markdown_path);
    }
    if (estimated_read_time !== undefined) {
      updates.push(`estimated_read_time = $${paramCount++}`);
      values.push(estimated_read_time);
    }
    if (is_published !== undefined) {
      updates.push(`is_published = $${paramCount++}`);
      values.push(is_published);
    }
    if (version !== undefined) {
      updates.push(`version = $${paramCount++}`);
      values.push(version);
    }
    if (video_url !== undefined) {
      updates.push(`video_url = $${paramCount++}`);
      values.push(video_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE lesson_content
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lesson content not found',
      });
    }

    logAction({
      req,
      action: 'UPDATE',
      entityType: 'lesson_content',
      entityId: result.rows[0].id,
      details: { content_type: result.rows[0].content_type },
    });

    res.json({
      success: true,
      message: 'Lesson content updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating lesson content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update lesson content',
    });
  }
};

// Delete lesson content
exports.deleteLessonContent = async (req, res) => {
  try {
    const { id } = req.params;

    const query =
      'UPDATE lesson_content SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *;';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lesson content not found',
      });
    }

    logAction({
      req,
      action: 'DELETE',
      entityType: 'lesson_content',
      entityId: id,
      details: {
        content_type: result.rows[0].content_type,
        subtopic_id: result.rows[0].subtopic_id,
      },
    });

    res.json({
      success: true,
      message: 'Lesson content deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting lesson content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete lesson content',
    });
  }
};

// Publish/unpublish lesson content
exports.publishLessonContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_published } = req.body || {};

    if (typeof is_published !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'is_published (boolean) is required',
      });
    }

    const query = `
      UPDATE lesson_content
      SET is_published = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;

    const result = await pool.query(query, [is_published, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lesson content not found',
      });
    }

    logAction({
      req,
      action: 'PUBLISH',
      entityType: 'lesson_content',
      entityId: id,
      details: { is_published },
    });
    res.json({
      success: true,
      message: `Lesson content ${
        is_published ? 'published' : 'unpublished'
      } successfully`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error publishing lesson content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish lesson content',
    });
  }
};

// ============================================
// QUIZ MANAGEMENT
// ============================================

// max_score is always 100 — passing_score/max_score exist purely to derive a
// pass-threshold percentage (applied against the real point total of a quiz's
// questions at grading time), not a literal points target. See submitQuizAttempt.
const QUIZ_MAX_SCORE = 100;

exports.createQuiz = async (req, res) => {
  try {
    const { unit_id, passing_score } = req.body;

    if (!unit_id || !passing_score) {
      return res.status(400).json({
        success: false,
        message: 'Unit ID and passing threshold are required',
      });
    }

    if (passing_score < 1 || passing_score > 100) {
      return res.status(400).json({
        success: false,
        message: 'Passing threshold must be between 1 and 100',
      });
    }

    const query = `
      INSERT INTO quizzes (unit_id, passing_score, max_score)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      unit_id,
      passing_score,
      QUIZ_MAX_SCORE,
    ]);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'quiz',
      entityId: result.rows[0].id,
      details: { unit_id: result.rows[0].unit_id },
    });

    res.status(201).json({
      success: true,
      message: 'Quiz created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create quiz',
    });
  }
};

exports.updateQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const { passing_score } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (passing_score !== undefined) {
      if (passing_score < 1 || passing_score > 100) {
        return res.status(400).json({
          success: false,
          message: 'Passing threshold must be between 1 and 100',
        });
      }
      updates.push(`passing_score = $${paramCount++}`);
      values.push(passing_score);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE quizzes
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      logAction({
        req,
        action: 'UPDATE',
        entityType: 'quiz',
        entityId: result.rows[0].id,
        details: { unit_id: result.rows[0].unit_id },
      });
    }

    res.json({
      success: true,
      message: 'Quiz updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update quiz',
    });
  }
};

exports.deleteQuiz = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE quizzes SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *;',
      [id],
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    // Cascade soft-delete to quiz_questions and their quiz_question_options.
    await client.query(
      `UPDATE quiz_question_options SET is_deleted = true
       WHERE question_id IN (SELECT id FROM quiz_questions WHERE quiz_id = $1) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE quiz_questions SET is_deleted = true WHERE quiz_id = $1 AND is_deleted = false`,
      [id],
    );

    await client.query('COMMIT');

    logAction({
      req,
      action: 'DELETE',
      entityType: 'quiz',
      entityId: id,
      details: { unit_id: result.rows[0].unit_id },
    });

    res.json({
      success: true,
      message: 'Quiz deleted successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete quiz',
    });
  } finally {
    client.release();
  }
};

// ============================================
// EXERCISE MANAGEMENT
// ============================================

exports.getExercise = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, title, instructions, max_score, subtopic_id, language, initial_files, test_cases, tasks, rubric FROM exercises WHERE id = $1 AND is_deleted = false',
      [id],
    );
    if (!result.rowCount)
      return res.status(404).json({ message: 'Exercise not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createExercise = async (req, res) => {
  try {
    const {
      subtopic_id,
      title,
      instructions,
      max_score,
      language,
      initial_files,
      test_cases,
      tasks,
      rubric,
    } = req.body;

    if (!subtopic_id || !title || !max_score) {
      return res.status(400).json({
        success: false,
        message: 'Subtopic ID, title, and max score are required',
      });
    }

    const query = `
      INSERT INTO exercises (subtopic_id, title, instructions, max_score, language, initial_files, test_cases, tasks, rubric)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      subtopic_id,
      title,
      instructions,
      max_score,
      language || 'javascript',
      JSON.stringify(initial_files || []),
      JSON.stringify(test_cases || []),
      JSON.stringify(tasks || []),
      rubric ? JSON.stringify(rubric) : null,
    ]);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'exercise',
      entityId: result.rows[0].id,
      details: { title: result.rows[0].title },
    });

    res.status(201).json({
      success: true,
      message: 'Exercise created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating exercise:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create exercise',
    });
  }
};

exports.updateExercise = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      instructions,
      max_score,
      language,
      initial_files,
      test_cases,
      tasks,
      rubric,
    } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (instructions !== undefined) {
      updates.push(`instructions = $${paramCount++}`);
      values.push(instructions);
    }
    if (max_score !== undefined) {
      updates.push(`max_score = $${paramCount++}`);
      values.push(max_score);
    }
    if (language !== undefined) {
      updates.push(`language = $${paramCount++}`);
      values.push(language);
    }
    if (initial_files !== undefined) {
      updates.push(`initial_files = $${paramCount++}`);
      values.push(JSON.stringify(initial_files));
    }
    if (test_cases !== undefined) {
      updates.push(`test_cases = $${paramCount++}`);
      values.push(JSON.stringify(test_cases));
    }
    if (tasks !== undefined) {
      updates.push(`tasks = $${paramCount++}`);
      values.push(JSON.stringify(tasks));
    }
    if (rubric !== undefined) {
      updates.push(`rubric = $${paramCount++}`);
      values.push(rubric ? JSON.stringify(rubric) : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE exercises
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      logAction({
        req,
        action: 'UPDATE',
        entityType: 'exercise',
        entityId: result.rows[0].id,
        details: { title: result.rows[0].title },
      });
    }

    res.json({
      success: true,
      message: 'Exercise updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating exercise:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update exercise',
    });
  }
};

exports.deleteExercise = async (req, res) => {
  try {
    const { id } = req.params;

    const query =
      'UPDATE exercises SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *;';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exercise not found',
      });
    }

    logAction({
      req,
      action: 'DELETE',
      entityType: 'exercise',
      entityId: id,
      details: { title: result.rows[0].title },
    });

    res.json({
      success: true,
      message: 'Exercise deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting exercise:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete exercise',
    });
  }
};

// ============================================
// ASSIGNMENT MANAGEMENT
// ============================================

exports.getAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, title, instructions, max_score, unit_id FROM assignments WHERE id = $1 AND is_deleted = false',
      [id],
    );
    if (!result.rowCount)
      return res.status(404).json({ message: 'Assignment not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

// max_score is always 100 — not client-configurable, mirrors QUIZ_MAX_SCORE above.
const ASSIGNMENT_MAX_SCORE = 100;

exports.createAssignment = async (req, res) => {
  try {
    const {
      unit_id,
      title,
      instructions,
      max_score,
      evaluator_type,
      test_cases,
      rubric,
    } = req.body;

    if (!unit_id || !title) {
      return res.status(400).json({
        success: false,
        message: 'Unit ID and title are required',
      });
    }

    const query = `
      INSERT INTO assignments (unit_id, title, instructions, max_score, evaluator_type, test_cases, rubric)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    let testCasesObj = test_cases;
    if (typeof test_cases === 'string') {
      try {
        testCasesObj = JSON.parse(test_cases);
      } catch (e) {
        // keep as string or handle error
      }
    }

    let rubricObj = rubric;
    if (typeof rubric === 'string') {
      try {
        rubricObj = JSON.parse(rubric);
      } catch (e) {}
    }

    const result = await pool.query(query, [
      unit_id,
      title,
      instructions,
      max_score || ASSIGNMENT_MAX_SCORE,
      evaluator_type || null,
      testCasesObj ? JSON.stringify(testCasesObj) : null,
      rubricObj ? JSON.stringify(rubricObj) : null,
    ]);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'assignment',
      entityId: result.rows[0].id,
      details: { title: result.rows[0].title },
    });

    res.status(201).json({
      success: true,
      message: 'Assignment created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create assignment',
    });
  }
};

exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      instructions,
      max_score,
      test_cases,
      evaluator_type,
      rubric,
    } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (instructions !== undefined) {
      updates.push(`instructions = $${paramCount++}`);
      values.push(instructions);
    }
    if (max_score !== undefined) {
      updates.push(`max_score = $${paramCount++}`);
      values.push(max_score);
    }
    if (evaluator_type !== undefined) {
      updates.push(`evaluator_type = $${paramCount++}`);
      values.push(evaluator_type);
    }
    if (test_cases !== undefined) {
      let testCasesObj = test_cases;
      if (typeof test_cases === 'string') {
        try {
          testCasesObj = JSON.parse(test_cases);
        } catch (e) {}
      }
      updates.push(`test_cases = $${paramCount++}`);
      values.push(testCasesObj ? JSON.stringify(testCasesObj) : null);
    }
    if (rubric !== undefined) {
      let rubricObj = rubric;
      if (typeof rubric === 'string') {
        try {
          rubricObj = JSON.parse(rubric);
        } catch (e) {}
      }
      updates.push(`rubric = $${paramCount++}`);
      values.push(rubricObj ? JSON.stringify(rubricObj) : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE assignments
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      logAction({
        req,
        action: 'UPDATE',
        entityType: 'assignment',
        entityId: result.rows[0].id,
        details: { title: result.rows[0].title },
      });
    }

    res.json({
      success: true,
      message: 'Assignment updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update assignment',
    });
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    const query =
      'UPDATE assignments SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *;';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found',
      });
    }

    logAction({
      req,
      action: 'DELETE',
      entityType: 'assignment',
      entityId: id,
      details: { title: result.rows[0].title },
    });

    res.json({
      success: true,
      message: 'Assignment deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete assignment',
    });
  }
};

// ============================================
// PROJECT MANAGEMENT
// ============================================

exports.createProject = async (req, res) => {
  try {
    const { topic_id, title, instructions } = req.body;

    if (!topic_id || !title) {
      return res.status(400).json({
        success: false,
        message: 'Topic ID and title are required',
      });
    }

    const query = `
      INSERT INTO projects (topic_id, title, instructions, max_score)
      VALUES ($1, $2, $3, 20)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      topic_id,
      title,
      instructions || null,
    ]);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'project',
      entityId: result.rows[0].id,
      details: { title: result.rows[0].title },
    });

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create project',
    });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, instructions } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (instructions !== undefined) {
      updates.push(`instructions = $${paramCount++}`);
      values.push(instructions);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE projects
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      logAction({
        req,
        action: 'UPDATE',
        entityType: 'project',
        entityId: result.rows[0].id,
        details: { title: result.rows[0].title },
      });
    }

    res.json({
      success: true,
      message: 'Project updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update project',
    });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    const query =
      'UPDATE projects SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *;';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    logAction({
      req,
      action: 'DELETE',
      entityType: 'project',
      entityId: id,
      details: { title: result.rows[0].title },
    });

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete project',
    });
  }
};

// ============================================
// QUIZ QUESTIONS MANAGEMENT
// ============================================

/**
 * Create a new quiz question
 * POST /api/admin/quiz-questions
 */
exports.createQuizQuestion = async (req, res) => {
  try {
    const {
      quiz_id,
      question_text,
      question_type,
      points,
      explanation,
      order_index,
    } = req.body;

    if (!quiz_id || !question_text || !question_type || !points) {
      return res.status(400).json({
        success: false,
        message: 'Quiz ID, question text, type, and points are required',
      });
    }

    const query = `
      INSERT INTO quiz_questions 
        (quiz_id, question_text, question_type, points, explanation, order_index)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, (
        SELECT COALESCE(MAX(order_index), 0) + 1 
        FROM quiz_questions 
        WHERE quiz_id = $1
      )))
      RETURNING *;
    `;

    const result = await pool.query(query, [
      quiz_id,
      question_text,
      question_type,
      points,
      explanation || null,
      order_index || null,
    ]);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'quiz_question',
      entityId: result.rows[0].id,
      details: { quiz_id: result.rows[0].quiz_id },
    });

    res.status(201).json({
      success: true,
      message: 'Quiz question created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating quiz question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create quiz question',
    });
  }
};

/**
 * Update a quiz question
 * PUT /api/admin/quiz-questions/:id
 */
exports.updateQuizQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { question_text, question_type, points, explanation, order_index } =
      req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (question_text !== undefined) {
      updates.push(`question_text = $${paramCount++}`);
      values.push(question_text);
    }
    if (question_type !== undefined) {
      updates.push(`question_type = $${paramCount++}`);
      values.push(question_type);
    }
    if (points !== undefined) {
      updates.push(`points = $${paramCount++}`);
      values.push(points);
    }
    if (explanation !== undefined) {
      updates.push(`explanation = $${paramCount++}`);
      values.push(explanation);
    }
    if (order_index !== undefined) {
      updates.push(`order_index = $${paramCount++}`);
      values.push(order_index);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    values.push(id);

    const query = `
      UPDATE quiz_questions
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Quiz question not found',
      });
    }

    logAction({
      req,
      action: 'UPDATE',
      entityType: 'quiz_question',
      entityId: result.rows[0].id,
      details: { quiz_id: result.rows[0].quiz_id },
    });

    res.json({
      success: true,
      message: 'Quiz question updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating quiz question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update quiz question',
    });
  }
};

/**
 * Delete a quiz question
 * DELETE /api/admin/quiz-questions/:id
 */
exports.deleteQuizQuestion = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE quiz_questions SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *;',
      [id],
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Quiz question not found',
      });
    }

    // Cascade soft-delete to this question's options.
    await client.query(
      `UPDATE quiz_question_options SET is_deleted = true WHERE question_id = $1 AND is_deleted = false`,
      [id],
    );

    await client.query('COMMIT');

    logAction({
      req,
      action: 'DELETE',
      entityType: 'quiz_question',
      entityId: id,
      details: { quiz_id: result.rows[0].quiz_id },
    });

    res.json({
      success: true,
      message: 'Quiz question deleted successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting quiz question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete quiz question',
    });
  } finally {
    client.release();
  }
};

/**
 * Get all questions for a quiz
 * GET /api/admin/quizzes/:quizId/questions
 */
exports.getQuizQuestions = async (req, res) => {
  try {
    const { quizId } = req.params;

    const query = `
      SELECT qq.*, 
        json_agg(
          json_build_object(
            'id', qo.id,
            'option_text', qo.option_text,
            'is_correct', qo.is_correct,
            'order_index', qo.order_index
          ) ORDER BY qo.order_index
        ) FILTER (WHERE qo.id IS NOT NULL) as options
      FROM quiz_questions qq
      LEFT JOIN quiz_question_options qo ON qq.id = qo.question_id AND qo.is_deleted = false
      WHERE qq.quiz_id = $1 AND qq.is_deleted = false
      GROUP BY qq.id
      ORDER BY qq.order_index;
    `;

    const result = await pool.query(query, [quizId]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching quiz questions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz questions',
    });
  }
};

// ============================================
// QUIZ QUESTION OPTIONS MANAGEMENT
// ============================================

/**
 * Create a new quiz question option
 * POST /api/admin/quiz-question-options
 */
exports.createQuizQuestionOption = async (req, res) => {
  try {
    const { question_id, option_text, is_correct, order_index } = req.body;

    if (!question_id || !option_text) {
      return res.status(400).json({
        success: false,
        message: 'Question ID and option text are required',
      });
    }

    const query = `
      INSERT INTO quiz_question_options 
        (question_id, option_text, is_correct, order_index)
      VALUES ($1, $2, $3, COALESCE($4, (
        SELECT COALESCE(MAX(order_index), 0) + 1 
        FROM quiz_question_options 
        WHERE question_id = $1
      )))
      RETURNING *;
    `;

    const result = await pool.query(query, [
      question_id,
      option_text,
      is_correct || false,
      order_index || null,
    ]);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'quiz_question_option',
      entityId: result.rows[0].id,
      details: { question_id: result.rows[0].question_id },
    });

    res.status(201).json({
      success: true,
      message: 'Quiz option created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating quiz option:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create quiz option',
    });
  }
};

/**
 * Update a quiz question option
 * PUT /api/admin/quiz-question-options/:id
 */
exports.updateQuizQuestionOption = async (req, res) => {
  try {
    const { id } = req.params;
    const { option_text, is_correct, order_index } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (option_text !== undefined) {
      updates.push(`option_text = $${paramCount++}`);
      values.push(option_text);
    }
    if (is_correct !== undefined) {
      updates.push(`is_correct = $${paramCount++}`);
      values.push(is_correct);
    }
    if (order_index !== undefined) {
      updates.push(`order_index = $${paramCount++}`);
      values.push(order_index);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    values.push(id);

    const query = `
      UPDATE quiz_question_options
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Quiz option not found',
      });
    }

    logAction({
      req,
      action: 'UPDATE',
      entityType: 'quiz_question_option',
      entityId: result.rows[0].id,
      details: { question_id: result.rows[0].question_id },
    });

    res.json({
      success: true,
      message: 'Quiz option updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating quiz option:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update quiz option',
    });
  }
};

/**
 * Delete a quiz question option
 * DELETE /api/admin/quiz-question-options/:id
 */
exports.deleteQuizQuestionOption = async (req, res) => {
  try {
    const { id } = req.params;

    const query =
      'UPDATE quiz_question_options SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *;';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Quiz option not found',
      });
    }

    logAction({
      req,
      action: 'DELETE',
      entityType: 'quiz_question_option',
      entityId: id,
      details: { question_id: result.rows[0].question_id },
    });

    res.json({
      success: true,
      message: 'Quiz option deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting quiz option:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete quiz option',
    });
  }
};

// ============================================
// LESSON CONTENT UPLOAD (MARKDOWN)
// ============================================

exports.uploadLessonMarkdown = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const bucket = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION;
    const prefix = process.env.AWS_S3_PREFIX || 'lesson-content/';

    if (!bucket || !region) {
      return res.status(500).json({
        success: false,
        message: 'S3 is not configured (AWS_S3_BUCKET/AWS_REGION)',
      });
    }

    // Every lesson upload is stored as markdown regardless of the source
    // filename's extension — strip whatever extension it had before adding
    // ours, so a "notes.md" upload doesn't end up keyed as "notes.md.md".
    const baseName = path
      .basename(req.file.originalname, path.extname(req.file.originalname))
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '');
    const key = withS3Prefix(`${prefix}${Date.now()}-${baseName}.md`);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: 'text/markdown; charset=utf-8',
      }),
    );

    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    logAction({
      req,
      action: 'CREATE',
      entityType: 'lesson_markdown_upload',
      entityId: null,
      details: { url },
    });
    res.json({
      success: true,
      url,
    });
  } catch (error) {
    console.error('Error uploading markdown:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload markdown',
    });
  }
};

// ============================================
// GENERAL FILE UPLOAD
// ============================================

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const region = process.env.AWS_REGION;
    const privateBucket = process.env.AWS_S3_BUCKET;
    const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;

    if (!privateBucket || !region) {
      return res.status(500).json({
        success: false,
        message: 'S3 is not configured (AWS_S3_BUCKET/AWS_REGION)',
      });
    }

    const isImage = req.file.mimetype.startsWith('image/');
    const bucket = isImage && publicBucket ? publicBucket : privateBucket;
    const prefix = isImage
      ? process.env.AWS_S3_PREFIX_PUBLIC_IMAGES || 'uploads/'
      : process.env.AWS_S3_PREFIX_FILES || 'uploads/';

    const originalExt = path.extname(req.file.originalname) || '';
    const baseName = path
      .basename(req.file.originalname, originalExt)
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9_-]/g, '');
    const key = withS3Prefix(
      `${prefix}${Date.now()}-${baseName}${originalExt}`,
    );

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || 'application/octet-stream',
      }),
    );

    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    logAction({
      req,
      action: 'CREATE',
      entityType: 'file_upload',
      entityId: null,
      details: { url },
    });
    res.json({
      success: true,
      url,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file',
    });
  }
};

/**
 * Get all options for a quiz question
 * GET /api/admin/quiz-questions/:questionId/options
 */
exports.getQuizQuestionOptions = async (req, res) => {
  try {
    const { questionId } = req.params;

    const query = `
      SELECT id, option_text, is_correct, order_index
      FROM quiz_question_options
      WHERE question_id = $1 AND is_deleted = false
      ORDER BY order_index;
    `;

    const result = await pool.query(query, [questionId]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching quiz options:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz options',
    });
  }
};

// ============================================
// STUDENT PROGRESS TRACKING
// ============================================

/**
 * Get student progress for a specific course
 * GET /api/admin/students/:userId/progress/:subjectId
 */
exports.getStudentProgress = async (req, res) => {
  try {
    const { userId, subjectId } = req.params;

    const query = `
      SELECT 
        t.id as topic_id,
        t.title as topic_title,
        utp.progress_percent,
        utp.is_completed as topic_completed,
        
        json_agg(
          json_build_object(
            'subtopic_id', st.id,
            'subtopic_title', st.title,
            'is_unlocked', usp.is_unlocked,
            'is_completed', usp.is_completed,
            'completed_at', usp.completed_at,
            'lesson_progress', (
              SELECT json_build_object(
                'is_completed', ulp.is_completed,
                'last_scroll_position', ulp.last_scroll_position
              )
              FROM user_lesson_progress ulp
              INNER JOIN lesson_content lc ON ulp.lesson_content_id = lc.id AND lc.is_deleted = false
              WHERE ulp.user_id = $1 AND lc.subtopic_id = st.id
              LIMIT 1
            ),
            'quiz_attempts', (
              SELECT json_agg(
                json_build_object(
                  'quiz_id', qa.quiz_id,
                  'score', qa.score,
                  'is_passed', qa.is_passed,
                  'attempted_at', qa.attempted_at
                )
              )
              FROM quiz_attempts qa
              INNER JOIN quizzes q ON qa.quiz_id = q.id AND q.is_deleted = false
              WHERE qa.user_id = $1 AND q.unit_id = st.unit_id
            ),
            'exercise_submissions', (
              SELECT json_agg(
                json_build_object(
                  'exercise_id', es.exercise_id,
                  'score', es.score,
                  'is_passed', es.is_passed,
                  'submitted_at', es.submitted_at
                )
              )
              FROM exercise_submissions es
              INNER JOIN exercises e ON es.exercise_id = e.id AND e.is_deleted = false
              WHERE es.user_id = $1 AND e.subtopic_id = st.id
            )
          )
          ORDER BY st.order_index
        ) as subtopics
      FROM topics t
      INNER JOIN units u ON u.topic_id = t.id AND u.is_deleted = false
      INNER JOIN subtopics st ON st.unit_id = u.id AND st.is_deleted = false
      LEFT JOIN user_topic_progress utp ON utp.topic_id = t.id AND utp.user_id = $1
      LEFT JOIN user_subtopic_progress usp ON usp.subtopic_id = st.id AND usp.user_id = $1
      WHERE t.subject_id = $2 AND t.is_deleted = false
      GROUP BY t.id, t.title, t.order_index, utp.progress_percent, utp.is_completed
      ORDER BY t.order_index;
    `;

    const result = await pool.query(query, [userId, subjectId]);

    const progressData = await calculateSubjectProgress(userId, subjectId);
    const overallProgress = progressData.percent;
    const totalSubtopics = progressData.total;
    const completedSubtopics = progressData.completed;

    res.json({
      success: true,
      data: {
        overall_progress: overallProgress,
        total_subtopics: totalSubtopics,
        completed_subtopics: completedSubtopics,
        topics: result.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching student progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student progress',
    });
  }
};

/**
 * Get all students progress summary
 * GET /api/admin/students/progress-summary
 */
exports.getAllStudentsProgressSummary = async (req, res) => {
  try {
    const { subjectId } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(req.query.pageSize, 10) || 50),
    );
    const offset = (page - 1) * pageSize;

    let query = `
      SELECT
        u.id as user_id,
        u.full_name,
        u.email,
        c.name as college_name,
        COUNT(DISTINCT usp.subtopic_id) FILTER (WHERE usp.is_completed = true) as completed_subtopics,
        COUNT(DISTINCT usp.subtopic_id) as total_assigned_subtopics,
        COALESCE(SUM(pl.points), 0) as total_points,
        MAX(us.current_streak) as current_streak,
        COUNT(*) OVER ()::integer as total_count
      FROM users u
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN colleges c ON sp.college_id = c.id
      LEFT JOIN user_subtopic_progress usp ON u.id = usp.user_id
      LEFT JOIN points_log pl ON u.id = pl.user_id
      LEFT JOIN user_streaks us ON u.id = us.user_id
      WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')
        AND u.deleted_at IS NULL
    `;

    const params = [];

    if (subjectId) {
      query += ` AND usp.subtopic_id IN (
        SELECT st.id FROM subtopics st
        INNER JOIN topics t ON st.topic_id = t.id
        WHERE t.subject_id = $1 AND st.is_deleted = false AND t.is_deleted = false
      )`;
      params.push(subjectId);
    }

    query += `
      GROUP BY u.id, u.full_name, u.email, c.name
      ORDER BY total_points DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2};
    `;
    params.push(pageSize, offset);

    const result = await pool.query(query, params);
    const totalCount = result.rows[0]?.total_count ?? 0;
    const data = result.rows.map(({ total_count, ...row }) => row);

    res.json({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      },
    });
  } catch (error) {
    console.error('Error fetching students progress summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students progress summary',
    });
  }
};

// ============================================
// LOCK CONTROL (ADMIN)
// ============================================

/**
 * Get available batches (years) for lock control
 * GET /api/admin/lock-control/batches?collegeId=1
 */
exports.getLockControlBatches = async (req, res) => {
  try {
    const { collegeId } = req.query;
    const params = [];

    let query = `
      SELECT DISTINCT sp.year
      FROM public.users u
      INNER JOIN public.student_profiles sp ON u.id = sp.user_id
      WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')
    `;

    if (collegeId) {
      query += ` AND sp.college_id = $1`;
      params.push(collegeId);
    }

    query += ` ORDER BY sp.year ASC;`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows.map((row) => row.year).filter((year) => year !== null),
    });
  } catch (error) {
    console.error('Error fetching lock control batches:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch batches',
    });
  }
};

/**
 * Get lock control overview
 * GET /api/admin/lock-control/overview?subjectId=1&collegeId=2&batch=2024
 */
exports.getLockControlOverview = async (req, res) => {
  try {
    const { subjectId, collegeId, batch } = req.query;

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        message: 'subjectId is required',
      });
    }

    const collegeParam = collegeId || null;
    const batchParam = batch ? parseInt(batch, 10) : null;

    const query = `
      WITH cohort AS (
        SELECT u.id
        FROM users u
        INNER JOIN student_profiles sp ON u.id = sp.user_id
        WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')
          AND u.deleted_at IS NULL
          AND ($1::uuid IS NULL OR sp.college_id = $1)
          AND ($2::int IS NULL OR sp.year = $2)
      ),
      cohort_count AS (
        SELECT COUNT(*)::int AS total
        FROM cohort
      ),
      subtopic_rows AS (
        SELECT 
          t.id AS topic_id,
          t.title AS topic_title,
          t.order_index AS topic_order,
          u.id AS unit_id,
          u.title AS unit_title,
          u.order_index AS unit_order,
          st.id AS subtopic_id,
          st.title AS subtopic_title,
          st.slug AS subtopic_slug,
          st.order_index AS subtopic_order,
          MIN(lc.content_type) AS content_type
        FROM topics t
        INNER JOIN units u ON u.topic_id = t.id AND u.is_deleted = false
        INNER JOIN subtopics st ON st.unit_id = u.id AND st.is_deleted = false
        LEFT JOIN lesson_content lc
          ON lc.subtopic_id = st.id AND lc.is_published = true AND lc.is_deleted = false
        WHERE t.subject_id = $3::uuid AND t.is_deleted = false
        GROUP BY 
          t.id, t.title, t.order_index,
          u.id, u.title, u.order_index,
          st.id, st.title, st.slug, st.order_index
      )
      SELECT
        sr.*,
        cc.total AS cohort_size,
        COALESCE(
          COUNT(usp.user_id) FILTER (WHERE usp.is_unlocked = true),
          0
        )::int AS unlocked_count,
        COALESCE(
          COUNT(usp.user_id) FILTER (WHERE usp.is_completed = true),
          0
        )::int AS completed_count
      FROM subtopic_rows sr
      CROSS JOIN cohort_count cc
      LEFT JOIN cohort c ON true
      LEFT JOIN user_subtopic_progress usp
        ON usp.user_id = c.id AND usp.subtopic_id = sr.subtopic_id
      GROUP BY 
        sr.topic_id, sr.topic_title, sr.topic_order,
        sr.unit_id, sr.unit_title, sr.unit_order,
        sr.subtopic_id, sr.subtopic_title, sr.subtopic_slug, sr.subtopic_order,
        sr.content_type, cc.total
      ORDER BY sr.topic_order, sr.unit_order, sr.subtopic_order;
    `;

    const result = await pool.query(query, [
      collegeParam,
      batchParam,
      subjectId,
    ]);

    const topicsMap = new Map();
    let cohortSize = 0;
    let totalCompleted = 0;

    result.rows.forEach((row) => {
      cohortSize = row.cohort_size;
      totalCompleted += row.completed_count;

      if (!topicsMap.has(row.topic_id)) {
        topicsMap.set(row.topic_id, {
          id: row.topic_id,
          title: row.topic_title,
          order_index: row.topic_order,
          units: new Map(),
        });
      }

      const topic = topicsMap.get(row.topic_id);

      if (!topic.units.has(row.unit_id)) {
        topic.units.set(row.unit_id, {
          id: row.unit_id,
          title: row.unit_title,
          order_index: row.unit_order,
          subtopics: [],
        });
      }

      const unit = topic.units.get(row.unit_id);
      const isUnlocked =
        row.cohort_size > 0 && row.unlocked_count === row.cohort_size;

      unit.subtopics.push({
        id: row.subtopic_id,
        title: row.subtopic_title,
        slug: row.subtopic_slug,
        order_index: row.subtopic_order,
        content_type: row.content_type,
        unlocked_count: row.unlocked_count,
        completed_count: row.completed_count,
        is_unlocked: isUnlocked,
      });
    });

    const topics = Array.from(topicsMap.values()).map((topic) => ({
      ...topic,
      units: Array.from(topic.units.values()),
    }));

    const totalSubtopics = result.rows.length;
    const completionRate =
      cohortSize > 0 && totalSubtopics > 0
        ? Math.round((totalCompleted / (cohortSize * totalSubtopics)) * 100)
        : 0;

    res.json({
      success: true,
      data: {
        cohort_size: cohortSize,
        completion_rate: completionRate,
        total_subtopics: totalSubtopics,
        completed_subtopics: totalCompleted,
        topics,
      },
    });
  } catch (error) {
    console.error('Error fetching lock control overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lock control overview',
    });
  }
};

/**
 * Update lock status for a topic
 * POST /api/admin/lock-control/topics/:topicId/:action
 */
exports.setLockControlTopic = async (req, res) => {
  try {
    const { topicId, action } = req.params;
    const collegeId = req.query.collegeId || req.body.collegeId;
    const batch = req.query.batch || req.body.batch;

    let isUnlocked;
    if (action === 'unlock') {
      isUnlocked = true;
    } else if (action === 'lock') {
      isUnlocked = false;
    } else if (action === 'toggle' || action === 'set') {
      isUnlocked = req.body.unlock !== undefined ? !!req.body.unlock : !!req.body.is_unlocked;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action',
      });
    }

    const collegeParam = collegeId || null;
    const batchParam = batch ? parseInt(batch, 10) : null;
    const isLocked = !isUnlocked;

    // 1. Update existing students' progress rows
    await pool.query(
      `WITH cohort AS (
        SELECT u.id
        FROM users u
        INNER JOIN student_profiles sp ON u.id = sp.user_id
        WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')
          AND u.deleted_at IS NULL
          AND ($1::uuid IS NULL OR sp.college_id = $1)
          AND ($2::int IS NULL OR sp.year = $2)
      ),
      topic_subtopics AS (
        SELECT st.id
        FROM subtopics st
        INNER JOIN units u ON st.unit_id = u.id
        WHERE u.topic_id = $3 AND st.is_deleted = false AND u.is_deleted = false
      )
      INSERT INTO user_subtopic_progress (user_id, subtopic_id, is_unlocked)
      SELECT c.id, ts.id, $4
      FROM cohort c
      CROSS JOIN topic_subtopics ts
      ON CONFLICT (user_id, subtopic_id)
      DO UPDATE SET is_unlocked = EXCLUDED.is_unlocked`,
      [collegeParam, batchParam, topicId, isUnlocked],
    );

    // 2. Record admin intent so future enrollees inherit it (best-effort)
    try {
      await pool.query(
        `INSERT INTO cohort_admin_locks (subtopic_id, college_id, year, is_locked)
        SELECT st.id, sp.college_id, sp.year, $4
        FROM subtopics st
        INNER JOIN units u ON st.unit_id = u.id
        CROSS JOIN (
          SELECT DISTINCT sp2.college_id, sp2.year
          FROM student_profiles sp2
          WHERE ($1::uuid IS NULL OR sp2.college_id = $1)
            AND ($2::int IS NULL OR sp2.year = $2)
        ) sp
        WHERE u.topic_id = $3 AND st.is_deleted = false AND u.is_deleted = false
        ON CONFLICT (subtopic_id, college_id, year)
        DO UPDATE SET is_locked = EXCLUDED.is_locked, updated_at = NOW()`,
        [collegeParam, batchParam, topicId, isLocked],
      );
    } catch (intentErr) {
      console.warn('cohort_admin_locks upsert skipped:', intentErr.message);
    }

    logAction({
      req,
      action: isUnlocked ? 'UNLOCK' : 'LOCK',
      entityType: 'topic',
      entityId: topicId,
      details: { collegeId, batch },
    });
    res.json({
      success: true,
      message: `Topic ${isUnlocked ? 'unlocked' : 'locked'} successfully`,
    });
  } catch (error) {
    console.error('Error updating topic lock:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update topic lock',
    });
  }
};

/**
 * Update lock status for a subtopic
 * POST /api/admin/lock-control/subtopics/:subtopicId/:action
 */
exports.setLockControlSubtopic = async (req, res) => {
  try {
    const { subtopicId, action } = req.params;
    const collegeId = req.query.collegeId || req.body.collegeId;
    const batch = req.query.batch || req.body.batch;

    let isUnlocked;
    if (action === 'unlock') {
      isUnlocked = true;
    } else if (action === 'lock') {
      isUnlocked = false;
    } else if (action === 'toggle' || action === 'set') {
      isUnlocked = req.body.unlock !== undefined ? !!req.body.unlock : !!req.body.is_unlocked;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action',
      });
    }

    const collegeParam = collegeId || null;
    const batchParam = batch ? parseInt(batch, 10) : null;
    const isLocked = !isUnlocked;

    // 1. Update existing students' progress rows
    await pool.query(
      `WITH cohort AS (
        SELECT u.id
        FROM users u
        INNER JOIN student_profiles sp ON u.id = sp.user_id
        WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')
          AND u.deleted_at IS NULL
          AND ($1::uuid IS NULL OR sp.college_id = $1)
          AND ($2::int IS NULL OR sp.year = $2)
      )
      INSERT INTO user_subtopic_progress (user_id, subtopic_id, is_unlocked)
      SELECT c.id, $3, $4
      FROM cohort c
      ON CONFLICT (user_id, subtopic_id)
      DO UPDATE SET is_unlocked = EXCLUDED.is_unlocked`,
      [collegeParam, batchParam, subtopicId, isUnlocked],
    );

    // 2. Record admin intent so future enrollees inherit it (best-effort)
    try {
      await pool.query(
        `INSERT INTO cohort_admin_locks (subtopic_id, college_id, year, is_locked)
        SELECT $3, sp.college_id, sp.year, $4
        FROM (
          SELECT DISTINCT sp2.college_id, sp2.year
          FROM student_profiles sp2
          WHERE ($1::uuid IS NULL OR sp2.college_id = $1)
            AND ($2::int IS NULL OR sp2.year = $2)
        ) sp
        ON CONFLICT (subtopic_id, college_id, year)
        DO UPDATE SET is_locked = EXCLUDED.is_locked, updated_at = NOW()`,
        [collegeParam, batchParam, subtopicId, isLocked],
      );
    } catch (intentErr) {
      console.warn('cohort_admin_locks upsert skipped:', intentErr.message);
    }

    logAction({
      req,
      action: isUnlocked ? 'UNLOCK' : 'LOCK',
      entityType: 'subtopic',
      entityId: subtopicId,
      details: { collegeId, batch },
    });
    res.json({
      success: true,
      message: `Subtopic ${action}ed successfully`,
    });
  } catch (error) {
    console.error('Error updating subtopic lock:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update subtopic lock',
    });
  }
};

// ============================================
// LEADERBOARD MANAGEMENT
// ============================================

/**
 * Get overall leaderboard
 * GET /api/admin/leaderboard/overall
 */
exports.getOverallLeaderboard = async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const query = `
      SELECT * FROM leaderboard_overall
      LIMIT $1;
    `;

    const result = await pool.query(query, [limit]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching overall leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch overall leaderboard',
    });
  }
};

/**
 * Get weekly leaderboard
 * GET /api/admin/leaderboard/weekly
 */
exports.getWeeklyLeaderboard = async (req, res) => {
  try {
    const { weekStart, limit = 100 } = req.query;

    const targetWeek = weekStart || new Date().toISOString().split('T')[0];

    const query = `
      SELECT 
        lw.*,
        u.full_name,
        u.email,
        c.name as college_name
      FROM leaderboards_weekly lw
      INNER JOIN users u ON lw.user_id = u.id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN colleges c ON sp.college_id = c.id
      WHERE lw.week_start = $1
      ORDER BY lw.rank
      LIMIT $2;
    `;

    const result = await pool.query(query, [targetWeek, limit]);

    res.json({
      success: true,
      week_start: targetWeek,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching weekly leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch weekly leaderboard',
    });
  }
};

/**
 * Get topic-specific leaderboard
 * GET /api/admin/leaderboard/topic/:topicId
 */
exports.getTopicLeaderboard = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { limit = 100 } = req.query;

    const query = `
      SELECT 
        lt.*,
        u.full_name,
        u.email,
        c.name as college_name,
        t.title as topic_title
      FROM leaderboards_topic lt
      INNER JOIN users u ON lt.user_id = u.id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN colleges c ON sp.college_id = c.id
      INNER JOIN topics t ON lt.topic_id = t.id AND t.is_deleted = false
      WHERE lt.topic_id = $1
      ORDER BY lt.rank
      LIMIT $2;
    `;

    const result = await pool.query(query, [topicId, limit]);

    res.json({
      success: true,
      topic_id: topicId,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching topic leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch topic leaderboard',
    });
  }
};

/**
 * Get college-specific leaderboard
 * GET /api/admin/leaderboard/college/:collegeId
 */
exports.getCollegeLeaderboard = async (req, res) => {
  try {
    const { collegeId } = req.params;
    const { limit = 100 } = req.query;

    const query = `
      SELECT 
        lc.*,
        u.full_name,
        u.email,
        c.name as college_name
      FROM leaderboards_college lc
      INNER JOIN users u ON lc.user_id = u.id
      INNER JOIN colleges c ON lc.college_id = c.id
      WHERE lc.college_id = $1
      ORDER BY lc.rank
      LIMIT $2;
    `;

    const result = await pool.query(query, [collegeId, limit]);

    res.json({
      success: true,
      college_id: collegeId,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching college leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch college leaderboard',
    });
  }
};

/**
 * Manually trigger leaderboard updates
 * POST /api/admin/leaderboard/update
 */
exports.updateLeaderboards = async (req, res) => {
  try {
    const { type, id } = req.body || {}; // type: 'weekly', 'topic', 'college', 'all'

    if (type === 'weekly' || type === 'all') {
      await pool.query('SELECT update_weekly_leaderboard()');
    }

    if (type === 'topic' && id) {
      await pool.query('SELECT update_topic_leaderboard($1)', [id]);
    }

    if (type === 'college' && id) {
      await pool.query('SELECT update_college_leaderboard($1)', [id]);
    }

    if (type === 'all') {
      // Update all topic leaderboards
      const topics = await pool.query(
        'SELECT id FROM topics WHERE is_deleted = false',
      );
      for (const topic of topics.rows) {
        await pool.query('SELECT update_topic_leaderboard($1)', [topic.id]);
      }

      // Update all college leaderboards
      const colleges = await pool.query('SELECT id FROM colleges');
      for (const college of colleges.rows) {
        await pool.query('SELECT update_college_leaderboard($1)', [college.id]);
      }
    }

    logAction({
      req,
      action: 'UPDATE',
      entityType: 'leaderboard',
      entityId: null,
      details: { type, id },
    });
    res.json({
      success: true,
      message: 'Leaderboards updated successfully',
    });
  } catch (error) {
    console.error('Error updating leaderboards:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update leaderboards',
    });
  }
};

// Verify/Unverify user
exports.verifyUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_verified } = req.body;

    if (is_verified === undefined) {
      return res.status(400).json({
        success: false,
        message: 'is_verified status is required',
      });
    }

    const query = `
      WITH updated AS (
        UPDATE users
        SET is_verified = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, full_name, role_id, is_verified
      )
      SELECT updated.id, updated.full_name, LOWER(r.role_key) AS role, updated.is_verified
      FROM updated
      LEFT JOIN roles r ON r.id = updated.role_id;
    `;

    const result = await pool.query(query, [is_verified, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    logAction({
      req,
      action: 'UPDATE',
      entityType: 'user',
      entityId: id,
      details: { is_verified },
    });
    res.json({
      success: true,
      message: `User ${is_verified ? 'verified' : 'unverified'} successfully`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error verifying user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update verification status',
    });
  }
};

/**
 * Get a single student's full profile
 * GET /api/admin/students/:id
 */
exports.getStudentProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const [userRes, statsRes, subjectsRes] = await Promise.all([
      pool.query(
        `SELECT u.id, u.full_name, u.email, u.is_verified, u.created_at,
                sp.degree, sp.year AS batch,
                c.name AS college_name, c.short_code AS college_short_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN student_profiles sp ON u.id = sp.user_id
         LEFT JOIN colleges c ON sp.college_id = c.id
         WHERE u.id = $1 AND r.role_key = 'STUDENT' AND u.deleted_at IS NULL`,
        [id],
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT us.subject_id)::int AS enrolled_subjects,
           COALESCE((
             SELECT COUNT(DISTINCT lc.subtopic_id)::int 
             FROM public.user_lesson_progress ulp
             INNER JOIN public.lesson_content lc ON lc.id = ulp.lesson_content_id
             WHERE ulp.user_id = $1 AND ulp.is_completed = true AND lc.is_deleted = false
           ), 0) AS completed_subtopics,
           COALESCE((SELECT SUM(points)::int FROM points_log WHERE user_id = $1), 0) AS total_points,
           COALESCE(MAX(str.current_streak), 0)::int AS current_streak,
           COALESCE(MAX(str.longest_streak), 0)::int AS longest_streak
         FROM users u
         LEFT JOIN user_subjects us ON u.id = us.user_id
         LEFT JOIN user_streaks str ON u.id = str.user_id
         WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [id],
      ),
      pool.query(
        `SELECT s.id, s.name,
           (
             SELECT COUNT(lc.id)::int FROM lesson_content lc
             JOIN subtopics st ON lc.subtopic_id = st.id AND st.is_deleted = false
             JOIN units un ON st.unit_id = un.id AND un.is_deleted = false
             JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
             WHERE t.subject_id = s.id AND lc.is_published = true AND lc.is_deleted = false
           ) + 
           (
             SELECT COUNT(q.id)::int FROM quizzes q
             JOIN units un ON q.unit_id = un.id AND un.is_deleted = false
             JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
             WHERE t.subject_id = s.id AND q.is_deleted = false
           ) +
           (
             SELECT COUNT(e.id)::int FROM exercises e
             JOIN subtopics st ON e.subtopic_id = st.id AND st.is_deleted = false
             JOIN units un ON st.unit_id = un.id AND un.is_deleted = false
             JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
             WHERE t.subject_id = s.id AND e.is_deleted = false
           ) +
           (
             SELECT COUNT(a.id)::int FROM assignments a
             JOIN units un ON a.unit_id = un.id AND un.is_deleted = false
             JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
             WHERE t.subject_id = s.id AND a.is_deleted = false
           ) +
           (
             SELECT COUNT(p.id)::int FROM projects p
             JOIN topics t ON p.topic_id = t.id AND t.is_deleted = false
             WHERE t.subject_id = s.id AND p.is_deleted = false
           ) as total_subtopics,

           (
             SELECT COUNT(DISTINCT ulp.lesson_content_id)::int FROM user_lesson_progress ulp
             WHERE ulp.user_id = $1 AND ulp.is_completed = true 
               AND ulp.lesson_content_id IN (
                 SELECT lc.id FROM lesson_content lc
                 JOIN subtopics st ON lc.subtopic_id = st.id AND st.is_deleted = false
                 JOIN units un ON st.unit_id = un.id AND un.is_deleted = false
                 JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
                 WHERE t.subject_id = s.id AND lc.is_published = true AND lc.is_deleted = false
               )
           ) +
           (
             SELECT COUNT(DISTINCT qa.quiz_id)::int FROM quiz_attempts qa
             WHERE qa.user_id = $1 AND qa.is_passed = true
               AND qa.quiz_id IN (
                 SELECT q.id FROM quizzes q
                 JOIN units un ON q.unit_id = un.id AND un.is_deleted = false
                 JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
                 WHERE t.subject_id = s.id AND q.is_deleted = false
               )
           ) +
           (
             SELECT COUNT(DISTINCT es.exercise_id)::int FROM exercise_submissions es
             WHERE es.user_id = $1 AND es.is_passed = true
               AND es.exercise_id IN (
                 SELECT e.id FROM exercises e
                 JOIN subtopics st ON e.subtopic_id = st.id AND st.is_deleted = false
                 JOIN units un ON st.unit_id = un.id AND un.is_deleted = false
                 JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
                 WHERE t.subject_id = s.id AND e.is_deleted = false
               )
           ) +
           (
             SELECT COUNT(DISTINCT asub.assignment_id)::int FROM assignment_submissions asub
             WHERE asub.user_id = $1
               AND asub.assignment_id IN (
                 SELECT a.id FROM assignments a
                 JOIN units un ON a.unit_id = un.id AND un.is_deleted = false
                 JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
                 WHERE t.subject_id = s.id AND a.is_deleted = false
               )
           ) +
           (
             SELECT COUNT(DISTINCT ps.project_id)::int FROM project_submissions ps
             WHERE ps.user_id = $1
               AND ps.project_id IN (
                 SELECT p.id FROM projects p
                 JOIN topics t ON p.topic_id = t.id AND t.is_deleted = false
                 WHERE t.subject_id = s.id AND p.is_deleted = false
               )
           ) as completed_subtopics,
           us.progress_percent as progress_percent
         FROM user_subjects us
         JOIN subjects s ON us.subject_id = s.id
         WHERE us.user_id = $1
         ORDER BY us.started_at DESC`,
        [id],
      ),
    ]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const subjects = subjectsRes.rows;

    res.json({
      success: true,
      data: { ...userRes.rows[0], stats: statsRes.rows[0], subjects },
    });
  } catch (err) {
    console.error('Error fetching student profile:', err.message);
    serverError(res, err);
  }
};

exports.getFacilitatorProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const [userRes, collegesRes, subjectsRes] = await Promise.all([
      pool.query(
        `SELECT u.id, u.full_name, u.email, u.is_verified, u.created_at
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1 AND r.role_key = 'FACILITATOR' AND u.deleted_at IS NULL`,
        [id],
      ),
      pool.query(
        `SELECT c.id, c.name, c.short_code
         FROM facilitator_colleges fc
         JOIN colleges c ON fc.college_id = c.id
         WHERE fc.facilitator_id = $1 AND fc.is_deleted = false
         ORDER BY c.name`,
        [id],
      ),
      pool.query(
        `SELECT DISTINCT s.id, s.name
         FROM facilitator_subjects fs
         JOIN subjects s ON fs.subject_id = s.id
         WHERE fs.facilitator_id = $1 AND fs.is_deleted = false AND s.is_deleted = false
         ORDER BY s.name`,
        [id],
      ),
    ]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: 'Facilitator not found' });
    }

    res.json({
      success: true,
      data: {
        ...userRes.rows[0],
        colleges: collegesRes.rows,
        subjects: subjectsRes.rows,
      },
    });
  } catch (err) {
    console.error('Error fetching facilitator profile:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getCollegeDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const [collegeRes, studentsRes, facilitatorsRes] = await Promise.all([
      pool.query(
        `SELECT id, name, short_code, city, state, is_verified, created_at FROM colleges WHERE id = $1`,
        [id],
      ),
      pool.query(
        `SELECT u.id, u.full_name, u.email, u.is_verified, u.created_at,
                sp.degree, sp.current_academic_year, sp.year
         FROM users u
         JOIN roles r ON r.id = u.role_id
         JOIN student_profiles sp ON sp.user_id = u.id
         WHERE sp.college_id = $1 AND r.role_key = 'STUDENT' AND u.deleted_at IS NULL
         ORDER BY u.created_at DESC`,
        [id],
      ),
      pool.query(
        `SELECT u.id, u.full_name, u.email, u.is_verified, u.created_at
         FROM users u
         JOIN roles r ON r.id = u.role_id
         JOIN facilitator_colleges fc ON fc.facilitator_id = u.id AND fc.is_deleted = false
         WHERE fc.college_id = $1 AND r.role_key = 'FACILITATOR' AND u.deleted_at IS NULL
         ORDER BY u.created_at DESC`,
        [id],
      ),
    ]);

    if (!collegeRes.rowCount) {
      return res.status(404).json({ message: 'College not found' });
    }

    res.json({
      success: true,
      data: {
        ...collegeRes.rows[0],
        students: studentsRes.rows,
        facilitators: facilitatorsRes.rows,
      },
    });
  } catch (err) {
    console.error('getCollegeDetail error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
// ============================================
// CURRICULUM DEVELOPER MANAGEMENT
// ============================================

exports.createCurriculumDeveloper = async (req, res) => {
  const { full_name, email, password, domain, role_focus, role: typedRole } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ message: 'Full name, email, and password are required' });
  }

  const assignedRoleFocus = (role_focus || typedRole || '').trim();
  const assignedDomain = (domain || '').trim();

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // 1. Check for email collision
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [normalizedEmail]
    );

    if (existing.rowCount > 0) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // 2. Resolve CURRICULUM_DEVELOPER role ID
    const roleRes = await pool.query(
      'SELECT id FROM roles WHERE role_key = $1',
      ['CURRICULUM_DEVELOPER']
    );

    if (!roleRes.rowCount) {
      return res.status(500).json({ message: 'CURRICULUM_DEVELOPER role not found in database' });
    }
    const role_id = roleRes.rows[0].id;

    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Create user
    const insertRes = await pool.query(
      `
      INSERT INTO users (full_name, email, password_hash, role_id, domain, role_focus, onboarding_step, is_verified, is_email_verified, must_change_password)
      VALUES ($1, $2, $3, $4, $5, $6, 'done', true, true, true)
      RETURNING id, full_name, email, domain, role_focus
      `,
      [full_name.trim(), normalizedEmail, passwordHash, role_id, assignedDomain || null, assignedRoleFocus || null]
    );

    logAction({
      req,
      action: 'CREATE',
      entityType: 'user',
      entityId: insertRes.rows[0].id,
      details: { email: normalizedEmail, role: 'CURRICULUM_DEVELOPER', domain: assignedDomain, role_focus: assignedRoleFocus }
    });

    res.json({
      success: true,
      data: insertRes.rows[0],
      message: 'Curriculum Developer created successfully'
    });
  } catch (error) {
    console.error('Error creating curriculum developer:', error);
    res.status(500).json({ message: 'Server error creating user' });
  }
};

module.exports = exports;
