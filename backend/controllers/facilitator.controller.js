const serverError = require('../utils/serverError');
const pool = require('../config/pg');
const { logAction } = require('../utils/auditLogger');
const { calculateSubjectProgress } = require('../utils/progress');
const { presignS3Url } = require('../utils/s3');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Get Facilitator Scoped Stats
 */
exports.getFacilitatorStats = async (req, res) => {
  try {
    const facilitatorId = req.user.id;
    const isFacilitator = req.user.role === 'facilitator';
    const collegeIds = req.user.college_ids || [];
    const subjectIds = req.user.subject_ids || [];

    // Zero-subject or zero-college fast path
    if (collegeIds.length === 0 || (isFacilitator && subjectIds.length === 0)) {
      return res.json({
        stats: {
          totalStudents: 0,
          totalColleges: collegeIds.length,
          totalSubjects: 0,
        },
        recentActivity: [],
      });
    }

    const queries = [
      // Students in assigned colleges AND enrolled in facilitator's subjects
      pool.query(
        `SELECT COUNT(DISTINCT u.id) FROM public.users u 
         JOIN public.student_profiles sp ON u.id = sp.user_id 
         LEFT JOIN public.user_subjects us ON us.user_id = u.id
         WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT') 
           AND sp.college_id = ANY($1::uuid[]) 
           AND (NOT $3::boolean OR us.subject_id = ANY($2::uuid[]) OR us.subject_id IS NULL)
           AND u.deleted_at IS NULL`,
        [collegeIds, subjectIds, isFacilitator],
      ),
      // Subjects assigned to facilitator
      isFacilitator
        ? pool.query(
            `SELECT COUNT(DISTINCT s.id) FROM subjects s WHERE s.id = ANY($1::uuid[]) AND s.is_deleted = false`,
            [subjectIds],
          )
        : pool.query(
            `SELECT COUNT(DISTINCT subject_id) FROM public.user_subjects us
             JOIN public.student_profiles sp ON us.user_id = sp.user_id
             JOIN public.users u ON u.id = sp.user_id
             WHERE sp.college_id = ANY($1::uuid[]) AND u.deleted_at IS NULL`,
            [collegeIds],
          ),
      // Recent students joined in these colleges & enrolled in facilitator's subjects
      pool.query(
        `SELECT DISTINCT u.id, u.full_name, u.email, u.created_at FROM public.users u
         JOIN public.student_profiles sp ON u.id = sp.user_id
         LEFT JOIN public.user_subjects us ON us.user_id = u.id
         WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT') 
           AND sp.college_id = ANY($1::uuid[]) 
           AND (NOT $3::boolean OR us.subject_id = ANY($2::uuid[]) OR us.subject_id IS NULL)
           AND u.deleted_at IS NULL
         ORDER BY u.created_at DESC LIMIT 5`,
        [collegeIds, subjectIds, isFacilitator],
      ),
    ];

    const [students, subjects, recentUsers] = await Promise.all(queries);

    res.status(200).json({
      stats: {
        totalStudents: parseInt(students.rows[0].count),
        totalColleges: collegeIds.length,
        totalSubjects: parseInt(subjects.rows[0].count),
      },
      recentActivity: recentUsers.rows,
    });
  } catch (error) {
    console.error('Facilitator Stats Error:', error);
    res
      .status(500)
      .json({ message: 'Error fetching stats' });
  }
};

/**
 * Get Students for Facilitator's Colleges and Assigned Subjects
 */
exports.getFacilitatorStudents = async (req, res) => {
  try {
    const facilitatorId = req.user.id;
    const isFacilitator = req.user.role === 'facilitator';
    const collegeIds = req.user.college_ids || [];
    const subjectIds = req.user.subject_ids || [];

    if (collegeIds.length === 0 || (isFacilitator && subjectIds.length === 0)) {
      return res.json([]);
    }

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
        c.short_code as college_short_name,
        COALESCE(sm.enrolled_courses, 0) as enrolled_courses,
        COALESCE(sm.progress_percent, 0) as progress_percent
      FROM public.users u
      JOIN public.roles r ON r.id = u.role_id
      JOIN public.student_profiles sp ON u.id = sp.user_id
      LEFT JOIN public.colleges c ON sp.college_id = c.id
      LEFT JOIN public.user_subjects us ON us.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT 
          COUNT(DISTINCT us2.subject_id)::int as enrolled_courses,
          COALESCE(ROUND(AVG(us2.progress_percent))::int, 0) as progress_percent
        FROM public.user_subjects us2
        WHERE us2.user_id = u.id AND (NOT $3::boolean OR us2.subject_id = ANY($2::uuid[]))
      ) sm ON true
      WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT') 
        AND sp.college_id = ANY($1::uuid[]) 
        AND (NOT $3::boolean OR us.subject_id = ANY($2::uuid[]) OR us.subject_id IS NULL)
        AND u.deleted_at IS NULL
      GROUP BY u.id, u.full_name, u.email, sp.degree, sp.year, u.created_at, r.role_key, u.is_verified, c.name, c.short_code, sm.enrolled_courses, sm.progress_percent
      ORDER BY u.created_at DESC
      LIMIT 1000
    `;

    const result = await pool.query(query, [collegeIds, subjectIds, isFacilitator]);
    res.json(result.rows);
  } catch (err) {
    console.error('Facilitator Students Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get a single student's full profile (scoped to facilitator's colleges and subjects)
 * GET /api/facilitator/students/:id
 */
exports.getFacilitatorStudentProfile = async (req, res) => {
  try {
    const facilitatorId = req.user.id;
    const isFacilitator = req.user.role === 'facilitator';
    const collegeIds = req.user.college_ids || [];
    const subjectIds = req.user.subject_ids || [];
    const { id } = req.params;

    if (collegeIds.length === 0 || (isFacilitator && subjectIds.length === 0)) {
      return res.status(403).json({ message: 'Access denied: No assigned colleges or subjects' });
    }

    const accessCheck = isFacilitator
      ? await pool.query(
          `SELECT 1 FROM student_profiles sp 
           JOIN user_subjects us ON us.user_id = sp.user_id
           WHERE sp.user_id = $1 AND sp.college_id = ANY($2::uuid[]) AND us.subject_id = ANY($3::uuid[])`,
          [id, collegeIds, subjectIds],
        )
      : await pool.query(
          'SELECT 1 FROM student_profiles WHERE user_id = $1 AND college_id = ANY($2::uuid[])',
          [id, collegeIds],
        );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [userRes, statsRes, subjectsRes] = await Promise.all([
      pool.query(
        `SELECT u.id, u.full_name, u.email, u.is_verified, u.created_at,
                sp.degree, sp.year AS batch,
                c.name AS college_name, c.short_code AS college_short_name
         FROM users u
         LEFT JOIN student_profiles sp ON u.id = sp.user_id
         LEFT JOIN colleges c ON sp.college_id = c.id
         WHERE u.id = $1 AND u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT') AND u.deleted_at IS NULL`,
        [id],
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT us.subject_id)::int AS enrolled_subjects,
           COALESCE((SELECT COUNT(*)::int FROM user_subtopic_progress WHERE user_id = $1 AND is_completed = true), 0) AS completed_subtopics,
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
         WHERE us.user_id = $1 AND (NOT $2::boolean OR us.subject_id = ANY($3::uuid[]))
         ORDER BY us.started_at DESC`,
        [id, isFacilitator, subjectIds],
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
    console.error('Facilitator Student Profile Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Facilitator access to student per-module analytics breakdown
 * GET /api/facilitator/students/:id/modules
 */
exports.getFacilitatorStudentModuleAnalytics = async (req, res) => {
  const facilitatorId = req.user.id;
  const isFacilitator = req.user.role === 'facilitator';
  const collegeIds = req.user.college_ids || [];
  const subjectIds = req.user.subject_ids || [];
  const studentId = req.params.id;

  try {
    if (isFacilitator && (collegeIds.length === 0 || subjectIds.length === 0)) {
      return res.json({ success: true, overall_progress: 0, data: [] });
    }

    // 1. Verify access
    let accessCheck;
    if (req.user.role === 'admin') {
      accessCheck = { rows: [{}] }; // Admins have full access
    } else {
      accessCheck = await pool.query(
        `SELECT 1 FROM student_profiles sp
         JOIN user_subjects us ON us.user_id = sp.user_id
         WHERE sp.user_id = $1 AND sp.college_id = ANY($2::uuid[]) AND us.subject_id = ANY($3::uuid[])`,
        [studentId, collegeIds, subjectIds],
      );
    }
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // 2. Fetch basic topics scoped to facilitator's subjects
    const result = await pool.query(
      `SELECT
         t.id AS topic_id,
         t.title AS topic_title,
         s.id AS subject_id,
         s.name AS subject_name
       FROM topics t
       JOIN subjects s ON s.id = t.subject_id
       JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
       WHERE (NOT $2::boolean OR s.id = ANY($3::uuid[]))
       ORDER BY s.name, t.order_index`,
      [studentId, isFacilitator, subjectIds]
    );

    const topicIds = result.rows.map(r => r.topic_id);

    let assignmentsData = { rows: [] };
    let projectsData = { rows: [] };
    let quizzesData = { rows: [] };
    let lessonsData = { rows: [] };

    if (topicIds.length > 0) {
      // Fetch assignments
      assignmentsData = await pool.query(
        `SELECT a.id, a.title, u.topic_id, 
                CASE WHEN EXISTS(SELECT 1 FROM assignment_submissions WHERE assignment_id = a.id AND user_id = $1) 
                     THEN 'Submitted' ELSE 'Pending' END as status
         FROM assignments a
         JOIN units u ON a.unit_id = u.id
         WHERE u.topic_id = ANY($2::uuid[])`,
        [studentId, topicIds]
      );

      // Fetch projects
      projectsData = await pool.query(
        `SELECT p.id, p.title, p.topic_id, 
                CASE WHEN EXISTS(SELECT 1 FROM project_submissions WHERE project_id = p.id AND user_id = $1 AND is_approved = true) THEN 'Approved'
                     WHEN EXISTS(SELECT 1 FROM project_submissions WHERE project_id = p.id AND user_id = $1) THEN 'Submitted'
                     ELSE 'Not Started' END as status
         FROM projects p
         WHERE p.topic_id = ANY($2::uuid[])`,
        [studentId, topicIds]
      );

      // Fetch quizzes
      quizzesData = await pool.query(
        `SELECT q.id, u.title, 
                COALESCE(
                  NULLIF((SELECT SUM(qq.points) FROM quiz_questions qq WHERE qq.quiz_id = q.id AND qq.is_deleted = false), 0),
                  q.max_score,
                  100
                )::int as max_score,
                u.topic_id, 
                COALESCE((SELECT MAX(score) FROM quiz_attempts WHERE quiz_id = q.id AND user_id = $1), 0)::int as score,
                COALESCE((SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = q.id AND user_id = $1), 0)::int as attempts_count,
                COALESCE((SELECT BOOL_OR(is_passed) FROM quiz_attempts WHERE quiz_id = q.id AND user_id = $1), false) as is_passed,
                COALESCE(q.passing_score, 60)::int as passing_score
         FROM quizzes q
         JOIN units u ON q.unit_id = u.id
         WHERE u.topic_id = ANY($2::uuid[])`,
        [studentId, topicIds]
      );

      // Fetch lessons
      lessonsData = await pool.query(
        `SELECT 
           un.topic_id,
           COUNT(lc.id)::int AS lessons_total,
           COUNT(CASE WHEN EXISTS(
               SELECT 1 FROM user_lesson_progress ulp 
               WHERE ulp.lesson_content_id = lc.id AND ulp.user_id = $1 AND ulp.is_completed = true
           ) THEN 1 END)::int AS lessons_completed
         FROM lesson_content lc
         JOIN subtopics st ON st.id = lc.subtopic_id
         JOIN units un ON un.id = st.unit_id
         WHERE un.topic_id = ANY($2::uuid[])
         GROUP BY un.topic_id`,
        [studentId, topicIds]
      );
    }

    // Map data by topic_id
    const assignmentsByTopic = {};
    const projectsByTopic = {};
    const quizzesByTopic = {};
    const lessonsByTopic = {};

    topicIds.forEach(id => {
      assignmentsByTopic[id] = [];
      projectsByTopic[id] = [];
      quizzesByTopic[id] = [];
      lessonsByTopic[id] = { completed: 0, total: 0 };
    });

    assignmentsData.rows.forEach(r => assignmentsByTopic[r.topic_id].push(r));
    projectsData.rows.forEach(r => projectsByTopic[r.topic_id].push(r));
    quizzesData.rows.forEach(r => {
      const max = r.max_score > 0 ? r.max_score : 100;
      const pct = Math.round((r.score / max) * 100);
      const isAttempted = r.attempts_count > 0;
      // Strict 60% criteria: Individual quiz must have score percentage >= 60% to pass
      const isPassed = isAttempted && pct >= 60;
      const status = !isAttempted ? 'Pending' : (isPassed ? 'Passed' : 'Failed');

      quizzesByTopic[r.topic_id].push({
        ...r,
        score_pct: pct,
        status,
      });
    });
    lessonsData.rows.forEach(r => {
      lessonsByTopic[r.topic_id] = { completed: r.lessons_completed, total: r.lessons_total };
    });

    const subjectMap = new Map();
    let totalProgressSum = 0;
    let totalTopics = 0;

    for (const row of result.rows) {
      if (!subjectMap.has(row.subject_id)) {
        subjectMap.set(row.subject_id, { subject_id: row.subject_id, subject_name: row.subject_name, topics: [] });
      }

      const tid = row.topic_id;
      const asgs = assignmentsByTopic[tid];
      const projs = projectsByTopic[tid];
      const qzs = quizzesByTopic[tid];
      const less = lessonsByTopic[tid];

      const asg_total = asgs.length;
      const asg_submitted = asgs.filter(a => a.status === 'Submitted').length;
      const assignment_status = asg_total === 0 ? 'Pending' : (asg_submitted > 0 ? 'Submitted' : 'Pending');

      const proj_total = projs.length;
      const proj_submitted = projs.filter(p => p.status === 'Submitted' || p.status === 'Approved').length;
      const proj_approved = projs.filter(p => p.status === 'Approved').length;
      let project_status = null;
      if (proj_approved > 0) project_status = 'Approved';
      else if (proj_submitted > 0) project_status = 'Submitted';
      else if (proj_total > 0) project_status = 'Not Started';

      const quizzes_total = qzs.length;
      const quizzes_passed = qzs.filter(q => q.status === 'Passed').length;
      const quiz_score = qzs.reduce((acc, q) => acc + parseInt(q.score || 0), 0);
      const quiz_max = qzs.reduce((acc, q) => acc + parseInt(q.max_score || 0), 0);

      const lessons_total = less.total;
      const lessons_completed = less.completed;

      const calcPct = (completed, total) => total > 0 ? Math.round((completed / total) * 100) : null;
      const lessonPct = calcPct(lessons_completed, lessons_total);
      const quizPct = calcPct(quizzes_passed, quizzes_total);
      const asgPct = calcPct(asg_submitted, asg_total);
      const projPct = calcPct(proj_submitted, proj_total);
      
      const pcts = [lessonPct, quizPct, asgPct, projPct].filter(p => p !== null);
      const progress = pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;

      totalProgressSum += progress;
      totalTopics++;

      subjectMap.get(row.subject_id).topics.push({
        topic_id: row.topic_id,
        topic_title: row.topic_title,
        quiz_score,
        quiz_max,
        assignment_status,
        project_status,
        progress,
        assignments_list: asgs,
        projects_list: projs,
        quizzes_list: qzs,
      });
    }

    const overall_progress = totalTopics > 0 ? Math.round(totalProgressSum / totalTopics) : 0;

    res.json({ success: true, overall_progress, data: Array.from(subjectMap.values()) });
  } catch (err) {
    console.error('getFacilitatorStudentModuleAnalytics error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch module analytics' });
  }
};

/**
 * Get detailed submissions and evaluations breakdown for a student (Assignments or Projects)
 */
exports.getFacilitatorStudentSubmissions = async (req, res) => {
  try {
    const { id: facilitatorId, role } = req.user;
    const studentId = req.params.id;
    const type = req.query.type === 'projects' ? 'projects' : 'assignments';
    const { subject_id, topic_id } = req.query;

    if (!studentId || !UUID_RE.test(studentId.trim())) {
      return res.status(400).json({ success: false, message: 'Invalid student ID' });
    }

    const isFacilitator = role !== 'admin';
    const collegeIds = req.user.college_ids || [];
    const subjectIds = (req.user.subject_ids || []).filter(id => id && UUID_RE.test(id));

    // Verify student exists & get profile
    const studentRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, sp.college_id, sp.year AS batch, sp.degree, c.name AS college_name
       FROM users u
       LEFT JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN colleges c ON c.id = sp.college_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [studentId.trim()]
    );

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const student = studentRes.rows[0];

    // Authorization check for facilitators
    if (isFacilitator && collegeIds.length > 0 && student.college_id) {
      if (!collegeIds.includes(student.college_id)) {
        return res.status(403).json({ success: false, message: 'Access denied: student belongs to another institution' });
      }
    }

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

    if (type === 'projects') {
      const projParams = [studentId.trim()];
      let projFilters = '';

      if (topic_id && UUID_RE.test(topic_id.trim())) {
        projParams.push(topic_id.trim());
        projFilters += ` AND p.topic_id = $${projParams.length}::uuid`;
      } else if (subject_id && UUID_RE.test(subject_id.trim())) {
        projParams.push(subject_id.trim());
        projFilters += ` AND t.subject_id = $${projParams.length}::uuid`;
      } else if (isFacilitator && subjectIds.length > 0) {
        projParams.push(subjectIds);
        projFilters += ` AND t.subject_id = ANY($${projParams.length}::uuid[])`;
      }

      const query = `
        SELECT 
          p.id,
          p.title,
          'PROJECT' AS item_type,
          s.name AS subject_name,
          s.slug AS subject_slug,
          t.title AS topic_title,
          COALESCE(p.max_score, 100)::int AS max_score,
          p.created_at,
          ps.id AS submission_id,
          ps.submission_link,
          ps.submitted_at,
          ps.score AS ps_score,
          ps.is_approved,
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
          WHERE er_inner.submission_id = ps.id
          ORDER BY er_inner.created_at DESC
          LIMIT 1
        ) er ON true
        WHERE (p.is_deleted = false OR p.is_deleted IS NULL)
          ${projFilters}
        ORDER BY s.name, t.order_index, p.id
      `;

      const result = await pool.query(query, projParams);

      const items = [];
      for (const row of result.rows) {
        const isSubmitted = Boolean(row.submission_link || row.submitted_at);
        const maxScore = Number(row.max_score) || 100;
        let score = null;
        if (row.er_marks !== null && row.er_marks !== undefined) {
          score = Number(row.er_marks);
        } else if (row.ps_score !== null && row.ps_score !== undefined) {
          score = Number(row.ps_score);
        }

        let status = 'not_started';
        if (isSubmitted) {
          if (score !== null) {
            const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
            status = pct >= 60 ? 'passed' : 'failed';
          } else {
            status = 'submitted';
          }
        }

        let submissionLink = row.submission_link;
        if (submissionLink) {
          try {
            submissionLink = await presignS3Url(submissionLink);
          } catch {}
        }

        const rawFeedback = row.er_feedback || row.ps_rubric_breakdown;

        items.push({
          id: row.id,
          title: row.title,
          item_type: 'project',
          subject_name: row.subject_name,
          topic_title: row.topic_title,
          max_score: maxScore,
          score,
          status,
          is_approved: Boolean(row.is_approved),
          submitted_at: row.submitted_at,
          submission_link: submissionLink,
          evaluation_status: row.evaluation_status,
          feedback: parseFeedback(rawFeedback)
        });
      }

      const total = items.length;
      const attemptedItems = items.filter(i => i.status !== 'not_started');
      const attempted = attemptedItems.length;
      const passed = items.filter(i => i.status === 'passed').length;
      const failed = items.filter(i => i.status === 'failed').length;
      const scoredItems = items.filter(i => i.score !== null);
      const avgScorePct = scoredItems.length > 0
        ? Math.round(scoredItems.reduce((sum, i) => sum + ((i.score / i.max_score) * 100), 0) / scoredItems.length)
        : 0;

      return res.json({
        success: true,
        student: {
          id: student.id,
          name: student.full_name,
          email: student.email,
          college_name: student.college_name,
          batch: student.batch,
          degree: student.degree
        },
        metrics: {
          total,
          attempted,
          passed,
          failed,
          avg_score_pct: avgScorePct
        },
        items
      });
    }

    // Otherwise: type === 'assignments'
    // 1. Curriculum assignments
    const currParams = [studentId.trim()];
    let currFilters = '';
    if (topic_id && UUID_RE.test(topic_id.trim())) {
      currParams.push(topic_id.trim());
      currFilters += ` AND t.id = $${currParams.length}::uuid`;
    } else if (subject_id && UUID_RE.test(subject_id.trim())) {
      currParams.push(subject_id.trim());
      currFilters += ` AND t.subject_id = $${currParams.length}::uuid`;
    } else if (isFacilitator && subjectIds.length > 0) {
      currParams.push(subjectIds);
      currFilters += ` AND t.subject_id = ANY($${currParams.length}::uuid[])`;
    }

    const currQuery = `
      SELECT 
        a.id,
        a.title,
        'CURRICULUM' AS assignment_type,
        s.name AS subject_name,
        s.slug AS subject_slug,
        t.title AS topic_title,
        u.title AS unit_title,
        COALESCE(a.max_score, 100)::int AS max_score,
        a.created_at,
        sub.id AS submission_id,
        sub.submission_link,
        sub.submitted_at,
        sub.score AS sub_score,
        er.id AS evaluation_result_id,
        er.status AS evaluation_status,
        er.marks AS er_marks,
        er.feedback AS er_feedback
      FROM assignments a
      INNER JOIN units u ON a.unit_id = u.id
      INNER JOIN topics t ON u.topic_id = t.id
      INNER JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN user_subjects us ON us.subject_id = s.id AND us.user_id = $1
      LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.user_id = $1
      LEFT JOIN LATERAL (
        SELECT er_inner.id, er_inner.status, er_inner.marks, er_inner.feedback
        FROM evaluation_results er_inner
        WHERE er_inner.submission_id = sub.id
        ORDER BY er_inner.created_at DESC
        LIMIT 1
      ) er ON true
      WHERE (a.is_deleted = false OR a.is_deleted IS NULL)
        ${currFilters}
      ORDER BY s.name, t.order_index, u.order_index, a.id
    `;

    // 2. College assignments
    const collegeParams = [studentId.trim()];
    let collegeFilters = '';
    if (student.college_id) {
      collegeParams.push(student.college_id);
      collegeFilters += ` AND ca.college_id = $${collegeParams.length}::uuid`;
    }
    if (topic_id && UUID_RE.test(topic_id.trim())) {
      collegeParams.push(topic_id.trim());
      collegeFilters += ` AND ca.topic_id = $${collegeParams.length}::uuid`;
    } else if (subject_id && UUID_RE.test(subject_id.trim())) {
      collegeParams.push(subject_id.trim());
      collegeFilters += ` AND (
        ca.course = $${collegeParams.length} 
        OR ca.course IN (SELECT slug FROM subjects WHERE id = $${collegeParams.length}::uuid)
        OR ca.course IN (SELECT name FROM subjects WHERE id = $${collegeParams.length}::uuid)
      )`;
    } else if (isFacilitator && subjectIds.length > 0) {
      collegeParams.push(facilitatorId, subjectIds);
      collegeFilters += ` AND (
        ca.created_by = $${collegeParams.length - 1} 
        OR ca.course IN (SELECT id::text FROM subjects WHERE id = ANY($${collegeParams.length}::uuid[]))
        OR ca.course IN (SELECT slug FROM subjects WHERE id = ANY($${collegeParams.length}::uuid[]))
        OR ca.course IN (SELECT name FROM subjects WHERE id = ANY($${collegeParams.length}::uuid[]))
      )`;
    }

    const collegeQuery = `
      SELECT
        ca.id,
        ca.title,
        'COLLEGE' AS assignment_type,
        COALESCE(s.name, ca.course, 'College Assignment') AS subject_name,
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
        er.marks AS er_marks,
        er.feedback AS er_feedback
      FROM college_assignments ca
      LEFT JOIN subjects s ON (s.id::text = ca.course OR s.slug = ca.course OR s.name = ca.course)
      LEFT JOIN topics t ON ca.topic_id = t.id
      LEFT JOIN college_assignment_submissions cas ON cas.assignment_id = ca.id AND cas.student_id = $1
      LEFT JOIN LATERAL (
        SELECT er_inner.id, er_inner.status, er_inner.marks, er_inner.feedback
        FROM evaluation_results er_inner
        WHERE er_inner.submission_id = cas.id
        ORDER BY er_inner.created_at DESC
        LIMIT 1
      ) er ON true
      WHERE ca.is_deleted = false
        ${collegeFilters}
      ORDER BY ca.due_date ASC NULLS LAST, ca.created_at DESC
    `;

    const [currRes, collegeRes] = await Promise.all([
      pool.query(currQuery, currParams),
      pool.query(collegeQuery, collegeParams)
    ]);

    const items = [];

    for (const row of currRes.rows) {
      const isSubmitted = Boolean(row.submission_link || row.submitted_at);
      const maxScore = Number(row.max_score) || 100;
      let score = null;
      if (row.er_marks !== null && row.er_marks !== undefined) {
        score = Number(row.er_marks);
      } else if (row.sub_score !== null && row.sub_score !== undefined) {
        score = Number(row.sub_score);
      }

      let status = 'not_started';
      if (isSubmitted) {
        if (score !== null) {
          const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
          status = pct >= 60 ? 'passed' : 'failed';
        } else {
          status = 'submitted';
        }
      }

      let submissionLink = row.submission_link;
      if (submissionLink) {
        try {
          submissionLink = await presignS3Url(submissionLink);
        } catch {}
      }

      items.push({
        id: row.id,
        title: row.title,
        item_type: 'curriculum',
        subject_name: row.subject_name,
        topic_title: row.topic_title,
        unit_title: row.unit_title,
        max_score: maxScore,
        score,
        status,
        submitted_at: row.submitted_at,
        submission_link: submissionLink,
        evaluation_status: row.evaluation_status,
        feedback: parseFeedback(row.er_feedback)
      });
    }

    for (const row of collegeRes.rows) {
      const isSubmitted = Boolean(row.submission_link || row.submission_file_url || row.submitted_at);
      const maxScore = 100;
      let score = null;
      if (row.er_marks !== null && row.er_marks !== undefined) {
        score = Number(row.er_marks);
      }

      let status = 'not_started';
      if (isSubmitted) {
        if (score !== null) {
          const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
          status = pct >= 60 ? 'passed' : 'failed';
        } else {
          status = 'submitted';
        }
      }

      let submissionLink = row.submission_link || row.submission_file_url;
      if (submissionLink) {
        try {
          submissionLink = await presignS3Url(submissionLink);
        } catch {}
      }

      items.push({
        id: row.id,
        title: row.title,
        item_type: 'college',
        subject_name: row.subject_name,
        topic_title: row.topic_title,
        unit_title: row.unit_title,
        max_score: maxScore,
        score,
        status,
        submitted_at: row.submitted_at,
        submission_link: submissionLink,
        evaluation_status: row.evaluation_status,
        feedback: parseFeedback(row.er_feedback)
      });
    }

    const total = items.length;
    const attemptedItems = items.filter(i => i.status !== 'not_started');
    const attempted = attemptedItems.length;
    const passed = items.filter(i => i.status === 'passed').length;
    const failed = items.filter(i => i.status === 'failed').length;
    const scoredItems = items.filter(i => i.score !== null);
    const avgScorePct = scoredItems.length > 0
      ? Math.round(scoredItems.reduce((sum, i) => sum + ((i.score / i.max_score) * 100), 0) / scoredItems.length)
      : 0;

    return res.json({
      success: true,
      student: {
        id: student.id,
        name: student.full_name,
        email: student.email,
        college_name: student.college_name,
        batch: student.batch,
        degree: student.degree
      },
      metrics: {
        total,
        attempted,
        passed,
        failed,
        avg_score_pct: avgScorePct
      },
      items
    });
  } catch (err) {
    console.error('getFacilitatorStudentSubmissions error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch student submissions' });
  }
};


exports.getBatches = async (req, res) => {
  try {
    const { id: facilitatorId, role } = req.user;
    const { college_id } = req.query;

    let collegeClause = '';
    const params = [];

    const isSpecificCollege = college_id && college_id !== 'all' && college_id.trim() !== '' && UUID_RE.test(college_id.trim());

    if (isSpecificCollege) {
      const collegeIds = await getFacilitatorCollegeIds(facilitatorId, college_id, role);
      if (!collegeIds.length) return res.json({ success: true, data: [] });
      params.push(collegeIds);
      collegeClause = `AND sp.college_id = ANY($${params.length}::uuid[])`;
    } else if (role !== 'admin') {
      const collegeIds = await getFacilitatorCollegeIds(facilitatorId, null, role);
      if (!collegeIds.length) return res.json({ success: true, data: [] });
      params.push(collegeIds);
      collegeClause = `AND sp.college_id = ANY($${params.length}::uuid[])`;
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT COALESCE(sp.expected_graduation_year::text, sp.year::text) AS id,
                       COALESCE(sp.expected_graduation_year::text, sp.year::text) AS name
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')
         AND u.deleted_at IS NULL
         ${collegeClause}
         AND (sp.expected_graduation_year IS NOT NULL OR sp.year IS NOT NULL)
       ORDER BY name DESC`,
      params,
    );

    const unknownRes = await pool.query(
      `SELECT 1
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')
         AND u.deleted_at IS NULL
         ${collegeClause}
         AND sp.expected_graduation_year IS NULL
         AND sp.year IS NULL
       LIMIT 1`,
      params,
    );
    if (unknownRes.rowCount > 0) {
      rows.push({ id: 'unknown', name: 'Unknown Batch' });
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getBatches error:', err);
    serverError(res, err, 'getBatches');
  }
};

/**
 * Verify or unverify a student — scoped to facilitator's assigned colleges
 */
exports.verifyStudent = async (req, res) => {
  try {
    const facilitatorId = req.user.id;
    const { id } = req.params;
    const { is_verified } = req.body;

    if (is_verified === undefined) {
      return res.status(400).json({ message: 'is_verified is required' });
    }

    const colRes = await pool.query(
      'SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false',
      [facilitatorId],
    );
    const collegeIds = colRes.rows.map((r) => r.college_id);

    if (collegeIds.length === 0) {
      return res.status(403).json({ message: 'No colleges assigned to you' });
    }

    const studentRes = await pool.query(
      `SELECT u.id FROM users u
       JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1 AND u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT') AND sp.college_id = ANY($2::uuid[]) AND u.deleted_at IS NULL`,
      [id, collegeIds],
    );

    if (!studentRes.rowCount) {
      return res
        .status(404)
        .json({ message: 'Student not found in your colleges' });
    }

    const result = await pool.query(
      `WITH updated AS (
         UPDATE users SET is_verified = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, full_name, role_id, is_verified
       )
       SELECT updated.id, updated.full_name, LOWER(r.role_key) AS role, updated.is_verified
       FROM updated
       LEFT JOIN roles r ON r.id = updated.role_id`,
      [is_verified, id],
    );

    logAction({ req, action: 'UPDATE', entityType: 'user', entityId: id, details: { is_verified } });
    res.json({
      success: true,
      message: `Student ${is_verified ? 'verified' : 'unverified'} successfully`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('verifyStudent error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Edit limited student profile fields — scoped to facilitator's colleges
 */
exports.editStudent = async (req, res) => {
  try {
    const facilitatorId = req.user.id;
    const { id } = req.params;
    const { degree, current_academic_year, expected_graduation_year } =
      req.body;

    const colRes = await pool.query(
      'SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false',
      [facilitatorId],
    );
    const collegeIds = colRes.rows.map((r) => r.college_id);
    if (collegeIds.length === 0) {
      return res.status(403).json({ message: 'No colleges assigned to you' });
    }

    const studentRes = await pool.query(
      `SELECT u.id FROM users u
       JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1 AND u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT') AND sp.college_id = ANY($2::uuid[]) AND u.deleted_at IS NULL`,
      [id, collegeIds],
    );
    if (!studentRes.rowCount) {
      return res
        .status(404)
        .json({ message: 'Student not found in your colleges' });
    }

    const fields = [];
    const values = [];
    let i = 1;
    if (degree !== undefined) {
      fields.push(`degree = $${i++}`);
      values.push(degree);
    }
    if (current_academic_year !== undefined) {
      fields.push(`current_academic_year = $${i++}`);
      values.push(current_academic_year);
    }
    if (expected_graduation_year !== undefined) {
      fields.push(`expected_graduation_year = $${i++}`);
      values.push(expected_graduation_year);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    values.push(id);
    await pool.query(
      `UPDATE student_profiles SET ${fields.join(', ')} WHERE user_id = $${i}`,
      values,
    );

    logAction({ req, action: 'UPDATE', entityType: 'student_profile', entityId: id, details: { degree, current_academic_year, expected_graduation_year } });
    res.json({ success: true, message: 'Student profile updated' });
  } catch (err) {
    console.error('editStudent error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getFacilitatorColleges = async (req, res) => {
  try {
    const { id: facilitatorId, role } = req.user;
    let result;
    if (role === 'admin') {
      result = await pool.query(`SELECT id, name, is_verified FROM colleges ORDER BY name`);
    } else {
      result = await pool.query(
        `SELECT c.id, c.name, c.is_verified
         FROM colleges c
         JOIN facilitator_colleges fc ON c.id = fc.college_id
         WHERE fc.facilitator_id = $1 AND fc.is_deleted = false
         ORDER BY c.name`,
        [facilitatorId],
      );
    }
    res.json({ success: true, data: result.rows });
  } catch (err) {
    serverError(res, err, 'getFacilitatorColleges');
  }
};

// ─── Analytics helpers ────────────────────────────────────────────────────────

async function getFacilitatorCollegeIds(facilitatorId, requestedCollegeId, role) {
  const isSpecificCollege = requestedCollegeId && requestedCollegeId !== 'all' && requestedCollegeId.trim() !== '' && UUID_RE.test(requestedCollegeId.trim());
  if (role === 'admin') {
    if (isSpecificCollege) return [requestedCollegeId.trim()];
    const allRes = await pool.query('SELECT id AS college_id FROM colleges');
    return allRes.rows.map((r) => r.college_id);
  }
  const colRes = await pool.query(
    'SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false',
    [facilitatorId],
  );
  const allowed = colRes.rows.map((r) => r.college_id);
  if (isSpecificCollege) {
    return allowed.includes(requestedCollegeId.trim()) ? [requestedCollegeId.trim()] : [];
  }
  return allowed;
}

async function getEnrolledStudentIds(collegeIds, batch, subjectId, facilitatorSubjectIds = null) {
  if (facilitatorSubjectIds !== null && facilitatorSubjectIds.length === 0) {
    return [];
  }
  const params = [collegeIds];
  let batchClause = '';
  let subjectJoin = '';
  let subjectClause = '';

  const hasSpecificBatch = batch && batch !== 'all' && batch.trim() !== '';
  const hasSpecificSubject = subjectId && subjectId !== 'all' && subjectId.trim() !== '' && UUID_RE.test(subjectId.trim());

  if (hasSpecificBatch) {
    if (batch === 'unknown') {
      batchClause = `AND (sp.expected_graduation_year IS NULL AND sp.year IS NULL)`;
    } else {
      params.push(batch.trim());
      batchClause = `AND (sp.expected_graduation_year::text = $${params.length} OR sp.year::text = $${params.length})`;
    }
  }
  if (hasSpecificSubject) {
    subjectJoin = 'JOIN user_subjects us ON us.user_id = sp.user_id';
    params.push(subjectId.trim());
    subjectClause = `AND us.subject_id = $${params.length}::uuid`;
  } else if (facilitatorSubjectIds && facilitatorSubjectIds.length > 0) {
    subjectJoin = 'JOIN user_subjects us ON us.user_id = sp.user_id';
    params.push(facilitatorSubjectIds);
    subjectClause = `AND us.subject_id = ANY($${params.length}::uuid[])`;
  }

  const res = await pool.query(
    `SELECT DISTINCT sp.user_id
     FROM student_profiles sp
     JOIN users u ON u.id = sp.user_id
     ${subjectJoin}
     WHERE sp.college_id = ANY($1::uuid[]) AND u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT') AND u.deleted_at IS NULL
     ${batchClause} ${subjectClause}`,
    params,
  );
  return res.rows.map((r) => r.user_id);
}

// ─── Analytics: subjects for a college/batch ─────────────────────────────────

exports.getAnalyticsSubjects = async (req, res) => {
  try {
    const { id: facilitatorId, role } = req.user;
    const isFacilitator = role === 'facilitator';
    const subjectIds = req.user.subject_ids || [];

    if (isFacilitator && subjectIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const { college_id, batch } = req.query;
    const colleges = await getFacilitatorCollegeIds(facilitatorId, college_id, role);
    if (!colleges.length) return res.json({ success: true, data: [] });

    const params = [colleges];
    let batchClause = '';
    if (batch && batch !== 'all') { 
      if (batch === 'unknown') {
        batchClause = `AND (sp.expected_graduation_year IS NULL AND sp.year IS NULL)`;
      } else {
        params.push(batch.trim()); 
        batchClause = `AND (sp.expected_graduation_year::text = $${params.length} OR sp.year::text = $${params.length})`; 
      }
    }

    let facilitatorSubjectClause = '';
    if (isFacilitator) {
      params.push(subjectIds);
      facilitatorSubjectClause = `AND s.id = ANY($${params.length}::uuid[])`;
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT s.id, s.name
       FROM subjects s
       JOIN user_subjects us ON us.subject_id = s.id
       JOIN student_profiles sp ON sp.user_id = us.user_id
       WHERE sp.college_id = ANY($1::uuid[]) ${batchClause} ${facilitatorSubjectClause}
       ORDER BY s.name`,
      params,
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    serverError(res, err, 'getAnalyticsSubjects');
  }
};

exports.getAnalyticsTopics = async (req, res) => {
  try {
    const { subject_id } = req.query;
    if (!subject_id || subject_id === 'all' || !UUID_RE.test(subject_id.trim())) return res.json({ success: true, data: [] });

    const { rows } = await pool.query(
      `SELECT id, title as name FROM topics WHERE subject_id = $1::uuid ORDER BY order_index, title`,
      [subject_id.trim()]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    serverError(res, err, 'getAnalyticsTopics');
  }
};

exports.getAnalyticsQuizzes = async (req, res) => {
  try {
    const { topic_id } = req.query;
    if (!topic_id || topic_id === 'all' || topic_id.trim() === '' || !UUID_RE.test(topic_id.trim())) return res.json({ success: true, data: [] });

    const isFacilitator = req.user.role === 'facilitator';
    const subjectIds = req.user.subject_ids || [];

    let subjectFilter = '';
    const params = [topic_id.trim()];
    if (isFacilitator) {
      if (subjectIds.length === 0) return res.json({ success: true, data: [] });
      params.push(subjectIds);
      subjectFilter = `AND t.subject_id = ANY($${params.length}::uuid[])`;
    }

    const { rows } = await pool.query(
      `SELECT q.id, un.title as name
       FROM quizzes q
       JOIN units un ON q.unit_id = un.id
       JOIN topics t ON t.id = un.topic_id
       WHERE un.topic_id = $1::uuid ${subjectFilter}
       ORDER BY un.order_index`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    serverError(res, err, 'getAnalyticsQuizzes');
  }
};

exports.getCourseAssignments = async (req, res) => {
  try {
    const { topic_id } = req.query;
    if (!topic_id || topic_id === 'all' || topic_id.trim() === '' || !UUID_RE.test(topic_id.trim())) return res.json({ success: true, data: [] });

    const isFacilitator = req.user.role === 'facilitator';
    const subjectIds = req.user.subject_ids || [];

    let subjectFilter = '';
    const params = [topic_id.trim()];
    if (isFacilitator) {
      if (subjectIds.length === 0) return res.json({ success: true, data: [] });
      params.push(subjectIds);
      subjectFilter = `AND t.subject_id = ANY($${params.length}::uuid[])`;
    }

    const { rows } = await pool.query(
      `SELECT a.id, a.title as name
       FROM assignments a
       JOIN units un ON a.unit_id = un.id
       JOIN topics t ON t.id = un.topic_id
       WHERE un.topic_id = $1::uuid ${subjectFilter}
       ORDER BY un.order_index, a.title`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    serverError(res, err, 'getCourseAssignments');
  }
};

exports.getAnalyticsModuleProjects = async (req, res) => {
  try {
    const { topic_id } = req.query;
    if (!topic_id || topic_id === 'all' || topic_id.trim() === '' || !UUID_RE.test(topic_id.trim())) return res.json({ success: true, data: [] });

    const isFacilitator = req.user.role === 'facilitator';
    const subjectIds = req.user.subject_ids || [];

    let subjectFilter = '';
    const params = [topic_id.trim()];
    if (isFacilitator) {
      if (subjectIds.length === 0) return res.json({ success: true, data: [] });
      params.push(subjectIds);
      subjectFilter = `AND t.subject_id = ANY($${params.length}::uuid[])`;
    }

    const { rows } = await pool.query(
      `SELECT p.id, p.title as name
       FROM projects p
       JOIN topics t ON t.id = p.topic_id
       WHERE p.topic_id = $1::uuid ${subjectFilter}
       ORDER BY p.title`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    serverError(res, err, 'getAnalyticsModuleProjects');
  }
};

// ─── Analytics: Quiz ─────────────────────────────────────────────────────────

exports.getQuizAnalytics = async (req, res) => {
  try {
    const { id: facilitatorId, role } = req.user;
    const isFacilitator = role === 'facilitator';
    const subjectIds = req.user.subject_ids || [];

    if (isFacilitator && subjectIds.length === 0) {
      return res.json({ success: true, data: emptyQuizData() });
    }

    const { college_id, batch, subject_id, topic_id, quiz_id, page, limit } = req.query;

    const hasSpecificSubject = subject_id && subject_id !== 'all' && subject_id.trim() !== '' && UUID_RE.test(subject_id.trim());
    const hasSpecificTopic = topic_id && topic_id !== 'all' && topic_id.trim() !== '' && UUID_RE.test(topic_id.trim());
    const hasSpecificQuiz = quiz_id && quiz_id !== 'all' && quiz_id.trim() !== '' && UUID_RE.test(quiz_id.trim());

    if (isFacilitator && hasSpecificSubject && !subjectIds.includes(subject_id.trim())) {
      return res.json({ success: true, data: emptyQuizData() });
    }

    const qLimit = Math.min(parseInt(limit, 10) || 10, 100);
    const qOffset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * qLimit;
    const colleges = await getFacilitatorCollegeIds(facilitatorId, college_id, role);
    if (!colleges.length) return res.json({ success: true, data: emptyQuizData() });

    const enrolledIds = await getEnrolledStudentIds(colleges, batch, hasSpecificSubject ? subject_id.trim() : null, isFacilitator ? subjectIds : null);
    if (!enrolledIds.length) return res.json({ success: true, data: emptyQuizData() });

    const attParams = [enrolledIds];
    let subjectClause = '';
    
    // 1. Specific filter (if provided and not 'all')
    if (hasSpecificQuiz) {
      attParams.push(quiz_id.trim());
      subjectClause += ` AND q.id = $${attParams.length}::uuid`;
    } else if (hasSpecificTopic) {
      attParams.push(topic_id.trim());
      subjectClause += ` AND t.id = $${attParams.length}::uuid`;
    } else if (hasSpecificSubject) {
      attParams.push(subject_id.trim());
      subjectClause += ` AND t.subject_id = $${attParams.length}::uuid`;
    }

    // 2. CRITICAL BOLA/IDOR FIX: Enforce facilitator subject scoping
    if (isFacilitator) {
      attParams.push(subjectIds);
      subjectClause += ` AND t.subject_id = ANY($${attParams.length}::uuid[])`;
    }

    const qParamsWithPaging = [...attParams, qLimit, qOffset];
    const [attRes, questionRes, questionCountRes, usersRes, totalQuizzesRes] = await Promise.all([
      pool.query(
        `SELECT qa.user_id, qa.quiz_id, 
                MAX(qa.score)::float AS score, 
                BOOL_OR(qa.is_passed) AS is_passed,
                COALESCE(
                  NULLIF((SELECT SUM(qq.points) FROM quiz_questions qq WHERE qq.quiz_id = q.id AND qq.is_deleted = false), 0),
                  q.max_score,
                  100
                )::float AS max_score
         FROM quiz_attempts qa
         JOIN quizzes q ON q.id = qa.quiz_id
         JOIN units un ON un.id = q.unit_id
         JOIN topics t ON t.id = un.topic_id
         WHERE qa.user_id = ANY($1::uuid[]) ${subjectClause}
         GROUP BY qa.user_id, qa.quiz_id, q.id`,
        attParams,
      ),
      pool.query(
        `SELECT qq.id AS question_id, qq.question_text,
                COALESCE(
                  ROUND(
                    100.0 * COUNT(qqa.id) FILTER (WHERE qqa.is_correct = true)
                    / NULLIF(COUNT(qa.id), 0)
                  ), 0
                )::int AS correct_pct
         FROM quiz_questions qq
         JOIN quizzes q ON q.id = qq.quiz_id
         JOIN units un ON un.id = q.unit_id
         JOIN topics t ON t.id = un.topic_id
         LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.user_id = ANY($1::uuid[])
         LEFT JOIN quiz_question_answers qqa ON qqa.quiz_attempt_id = qa.id AND qqa.question_id = qq.id
         WHERE TRUE ${subjectClause}
         GROUP BY qq.id, qq.question_text, qq.order_index
         ORDER BY qq.order_index
         LIMIT $${qParamsWithPaging.length - 1} OFFSET $${qParamsWithPaging.length}`,
        qParamsWithPaging,
      ),
      pool.query(
        `SELECT COUNT(DISTINCT qq.id)::int AS total
         FROM quiz_questions qq
         JOIN quizzes q ON q.id = qq.quiz_id
         JOIN units un ON un.id = q.unit_id
         JOIN topics t ON t.id = un.topic_id
         WHERE $1::uuid[] IS NOT NULL ${subjectClause}`,
        attParams,
      ),
      pool.query(
        `SELECT u.id, u.full_name, u.email, c.name AS college_name, sp.year AS batch
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN colleges c ON c.id = sp.college_id
         WHERE u.id = ANY($1::uuid[])
         ORDER BY u.full_name`,
        [enrolledIds],
      ),
      pool.query(
        `SELECT COUNT(DISTINCT q.id)::int AS total
         FROM quizzes q
         JOIN units un ON un.id = q.unit_id
         JOIN topics t ON t.id = un.topic_id
         WHERE q.is_deleted = false AND un.is_deleted = false AND t.is_deleted = false
           AND $1::uuid[] IS NOT NULL ${subjectClause}`,
        attParams,
      ),
    ]);

    const rows = attRes.rows;
    const attemptedSet = new Set(rows.map((r) => r.user_id));
    const passedAttemptsSet = new Set(
      rows.filter((r) => {
        if (r.max_score && r.max_score > 0) {
          return ((r.score / r.max_score) * 100) >= 60;
        }
        return r.is_passed;
      }).map((r) => r.user_id)
    );
    
    // Group scores, distinct quizzes attempted, and passed quizzes per student
    const studentScores = new Map();
    const studentDistinctQuizzes = new Map();
    const studentPassedQuizzes = new Map();

    rows.forEach(r => {
      if (!studentDistinctQuizzes.has(r.user_id)) {
        studentDistinctQuizzes.set(r.user_id, new Set());
      }
      if (!studentPassedQuizzes.has(r.user_id)) {
        studentPassedQuizzes.set(r.user_id, new Set());
      }
      if (r.quiz_id) {
        studentDistinctQuizzes.get(r.user_id).add(r.quiz_id);
      }

      if (r.max_score && r.max_score > 0) {
        if (!studentScores.has(r.user_id)) studentScores.set(r.user_id, []);
        const pct = Math.min(100, Math.max(0, Math.round((r.score / r.max_score) * 100)));
        studentScores.get(r.user_id).push(pct);
        if (pct >= 60) {
          studentPassedQuizzes.get(r.user_id).add(r.quiz_id);
        }
      }
    });

    const isSpecificQuiz = Boolean(quiz_id && quiz_id !== 'all');

    const studentsList = usersRes.rows.map((u) => {
      const isAttempted = attemptedSet.has(u.id);
      const scores = studentScores.get(u.id);
      const avgStudentScore = scores && scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

      let status = 'Not Attempted';
      if (isAttempted) {
        if (isSpecificQuiz) {
          // Specific single quiz selected: use quiz attempt is_passed directly
          status = passedAttemptsSet.has(u.id) ? 'Passed' : 'Failed';
        } else {
          // Overall / Aggregate view: Passed if average score >= 60%, else Failed
          status = (avgStudentScore !== null && avgStudentScore >= 60) ? 'Passed' : 'Failed';
        }
      }

      const distinctQuizzesCount = studentDistinctQuizzes.has(u.id)
        ? studentDistinctQuizzes.get(u.id).size
        : 0;

      const passedQuizzesCount = studentPassedQuizzes.has(u.id)
        ? studentPassedQuizzes.get(u.id).size
        : 0;

      return {
        id: u.id,
        name: u.full_name,
        email: u.email,
        college: u.college_name || '',
        batch: u.batch || '',
        status,
        score_pct: avgStudentScore,
        quizzes_attempted: distinctQuizzesCount,
        quizzes_passed: passedQuizzesCount,
        attempts_count: distinctQuizzesCount,
      };
    });

    const passedCount = studentsList.filter((s) => s.status === 'Passed').length;
    const failedCount = studentsList.filter((s) => s.status === 'Failed').length;
    const attemptedCount = passedCount + failedCount;
    const notAttemptedCount = enrolledIds.length - attemptedCount;

    const pctScores = Array.from(studentScores.values()).map(
      scores => scores.reduce((a, b) => a + b, 0) / scores.length
    );

    const avgScore = pctScores.length
      ? Math.round(pctScores.reduce((a, b) => a + b, 0) / pctScores.length)
      : 0;

    const dist = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    pctScores.forEach((s) => {
      if (s <= 20) dist['0-20']++;
      else if (s <= 40) dist['21-40']++;
      else if (s <= 60) dist['41-60']++;
      else if (s <= 80) dist['61-80']++;
      else dist['81-100']++;
    });

    res.json({
      success: true,
      data: {
        enrolled: enrolledIds.length,
        attempted: attemptedCount,
        not_attempted: notAttemptedCount,
        passed: passedCount,
        failed: failedCount,
        avg_score_pct: avgScore,
        score_distribution: Object.entries(dist).map(([range, count]) => ({ range, count })),
        question_analytics: questionRes.rows,
        question_analytics_total: questionCountRes.rows[0]?.total ?? 0,
        total_quizzes: totalQuizzesRes.rows[0]?.total ?? 0,
        students: studentsList,
      },
    });
  } catch (err) {
    serverError(res, err, 'getQuizAnalytics');
  }
};

function emptyQuizData() {
  return {
    enrolled: 0, attempted: 0, not_attempted: 0,
    passed: 0, failed: 0, avg_score_pct: 0,
    score_distribution: ['0-20', '21-40', '41-60', '61-80', '81-100'].map((range) => ({ range, count: 0 })),
    question_analytics: [],
    question_analytics_total: 0,
    total_quizzes: 0,
    students: [],
  };
}

function emptyAssignmentData() {
  return {
    enrolled: 0,
    attempted: 0,
    not_attempted: 0,
    passed: 0,
    failed: 0,
    avg_score_pct: 0,
    score_distribution: ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'].map((range) => ({ range, count: 0 })),
    students: [],
    total_assignments: 0,
    total: 0,
    submitted: 0,
    not_submitted: 0,
    rate: 0,
  };
}

function emptyProjectData() {
  return {
    enrolled: 0,
    attempted: 0,
    not_attempted: 0,
    passed: 0,
    failed: 0,
    avg_score_pct: 0,
    score_distribution: ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'].map((range) => ({ range, count: 0 })),
    students: [],
    total_projects: 0,
    total: 0,
    not_started: 0,
    submitted: 0,
    approved: 0,
  };
}

// ─── Analytics: Assignments ───────────────────────────────────────────────────

exports.getAssignmentAnalytics = async (req, res) => {
  try {
    const { id: facilitatorId, role } = req.user;
    const isFacilitator = role === 'facilitator';
    const subjectIds = req.user.subject_ids || [];

    if (isFacilitator && subjectIds.length === 0) {
      return res.json({ success: true, data: emptyAssignmentData() });
    }

    const { college_id, batch, subject_id, topic_id, assignment_id, assignment_type, page, limit } = req.query;

    const hasSpecificSubject = subject_id && subject_id !== 'all' && subject_id.trim() !== '' && UUID_RE.test(subject_id.trim());
    const hasSpecificTopic = topic_id && topic_id !== 'all' && topic_id.trim() !== '' && UUID_RE.test(topic_id.trim());
    const hasSpecificAssignment = assignment_id && assignment_id !== 'all' && assignment_id.trim() !== '' && UUID_RE.test(assignment_id.trim());

    if (isFacilitator && hasSpecificSubject && !subjectIds.includes(subject_id.trim())) {
      return res.json({ success: true, data: emptyAssignmentData() });
    }

    const sLimit = Math.min(parseInt(limit, 10) || 20, 100);
    const sOffset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * sLimit;
    const colleges = await getFacilitatorCollegeIds(facilitatorId, college_id, role);
    if (!colleges.length) return res.json({ success: true, data: emptyAssignmentData() });

    const enrolledIds = await getEnrolledStudentIds(colleges, batch, hasSpecificSubject ? subject_id.trim() : null, isFacilitator ? subjectIds : null);
    if (!enrolledIds.length) return res.json({ success: true, data: emptyAssignmentData() });

    const namesRes = await pool.query(
      `SELECT u.id, u.full_name, u.email FROM users u WHERE u.id = ANY($1::uuid[]) ORDER BY u.full_name`,
      [enrolledIds],
    );
    const students = namesRes.rows;
    const studentIds = enrolledIds;
    const studentSubMap = new Map();

    if (hasSpecificAssignment) {
      if (assignment_type === 'course') {
        const [subRes, assignInfo] = await Promise.all([
          pool.query(
            `SELECT 
               asub.user_id as student_id,
               COALESCE(MAX(er.marks), MAX(asub.score)) as resolved_score
             FROM assignment_submissions asub
             LEFT JOIN evaluation_results er ON er.submission_id = asub.id AND er.status = 'completed'
             WHERE asub.assignment_id = $1::uuid AND asub.user_id = ANY($2::uuid[])
             GROUP BY asub.user_id`,
            [assignment_id.trim(), studentIds]
          ),
          pool.query(
            `SELECT COALESCE(max_score, 100)::int as max_score FROM assignments WHERE id = $1::uuid`,
            [assignment_id.trim()]
          ),
        ]);
        const maxScore = assignInfo.rows[0]?.max_score || 100;
        subRes.rows.forEach((r) => {
          studentSubMap.set(r.student_id, {
            submitted: true,
            resolvedScore: r.resolved_score !== null ? Number(r.resolved_score) : null,
            maxScore,
          });
        });
      } else {
        const subRes = await pool.query(
          `SELECT 
             cas.student_id,
             MAX(er.marks) as resolved_score
           FROM college_assignment_submissions cas
           LEFT JOIN evaluation_results er ON er.submission_id = cas.id AND er.status = 'completed'
           WHERE cas.assignment_id = $1::uuid AND cas.student_id = ANY($2::uuid[])
           GROUP BY cas.student_id`,
          [assignment_id.trim(), studentIds]
        );
        const maxScore = 100;
        subRes.rows.forEach((r) => {
          studentSubMap.set(r.student_id, {
            submitted: true,
            resolvedScore: r.resolved_score !== null ? Number(r.resolved_score) : null,
            maxScore,
          });
        });
      }
    } else {
      // Aggregate across course and college assignments
      const courseParams = [studentIds];
      let courseSubjectClause = '';
      if (hasSpecificTopic) {
        courseParams.push(topic_id.trim());
        courseSubjectClause = `AND t.id = $${courseParams.length}::uuid`;
      } else if (hasSpecificSubject) {
        courseParams.push(subject_id.trim());
        courseSubjectClause = `AND t.subject_id = $${courseParams.length}::uuid`;
      } else if (isFacilitator) {
        courseParams.push(subjectIds);
        courseSubjectClause = `AND t.subject_id = ANY($${courseParams.length}::uuid[])`;
      }

      const collegeParams = [studentIds, colleges];
      let collegeFacilitatorClause = '';
      if (hasSpecificTopic) {
        collegeParams.push(topic_id.trim());
        collegeFacilitatorClause += ` AND ca.topic_id = $${collegeParams.length}::uuid`;
      } else if (hasSpecificSubject) {
        collegeParams.push(subject_id.trim());
        collegeFacilitatorClause += ` AND (
          ca.course = $${collegeParams.length} 
          OR ca.course IN (SELECT slug FROM subjects WHERE id = $${collegeParams.length}::uuid)
          OR ca.course IN (SELECT name FROM subjects WHERE id = $${collegeParams.length}::uuid)
        )`;
      } else if (isFacilitator) {
        collegeParams.push(facilitatorId, subjectIds);
        collegeFacilitatorClause += ` AND (
          ca.created_by = $${collegeParams.length - 1} 
          OR ca.course IN (SELECT id::text FROM subjects WHERE id = ANY($${collegeParams.length}::uuid[]))
          OR ca.course IN (SELECT slug FROM subjects WHERE id = ANY($${collegeParams.length}::uuid[]))
          OR ca.course IN (SELECT name FROM subjects WHERE id = ANY($${collegeParams.length}::uuid[]))
        )`;
      }

      const [courseSubRes, collegeSubRes] = await Promise.all([
        pool.query(
          `SELECT 
             asub.user_id as student_id,
             asub.assignment_id,
             COALESCE(MAX(er.marks), MAX(asub.score)) as resolved_score,
             COALESCE(MAX(a.max_score), 100)::int as max_score
           FROM assignment_submissions asub
           JOIN assignments a ON a.id = asub.assignment_id
           JOIN units un ON un.id = a.unit_id
           JOIN topics t ON t.id = un.topic_id
           LEFT JOIN evaluation_results er ON er.submission_id = asub.id AND er.status = 'completed'
           WHERE asub.user_id = ANY($1::uuid[]) ${courseSubjectClause}
           GROUP BY asub.user_id, asub.assignment_id`,
          courseParams,
        ),
        pool.query(
          `SELECT 
             cas.student_id,
             cas.assignment_id,
             MAX(er.marks) as resolved_score,
             100::int as max_score
           FROM college_assignment_submissions cas
           JOIN college_assignments ca ON ca.id = cas.assignment_id AND ca.is_deleted = false
           LEFT JOIN evaluation_results er ON er.submission_id = cas.id AND er.status = 'completed'
           WHERE cas.student_id = ANY($1::uuid[]) AND ca.college_id = ANY($2::uuid[]) ${collegeFacilitatorClause}
           GROUP BY cas.student_id, cas.assignment_id`,
          collegeParams,
        ),
      ]);

      const combinedRows = [...courseSubRes.rows, ...collegeSubRes.rows];
      combinedRows.forEach((r) => {
        if (!studentSubMap.has(r.student_id)) {
          studentSubMap.set(r.student_id, { submitted: true, items: [] });
        }
        studentSubMap.get(r.student_id).items.push({
          resolvedScore: r.resolved_score !== null ? Number(r.resolved_score) : null,
          maxScore: r.max_score > 0 ? r.max_score : 100,
        });
      });
    }

    // Calculate total available assignments in current scope
    let totalAssignments = 1;
    if (!hasSpecificAssignment) {
      const courseCountParams = [];
      let courseCountClause = '';
      if (hasSpecificTopic) {
        courseCountParams.push(topic_id.trim());
        courseCountClause = `AND t.id = $${courseCountParams.length}::uuid`;
      } else if (hasSpecificSubject) {
        courseCountParams.push(subject_id.trim());
        courseCountClause = `AND t.subject_id = $${courseCountParams.length}::uuid`;
      } else if (isFacilitator) {
        courseCountParams.push(subjectIds);
        courseCountClause = `AND t.subject_id = ANY($${courseCountParams.length}::uuid[])`;
      }

      const collegeCountParams = [colleges];
      let collegeCountClause = '';
      if (hasSpecificTopic) {
        collegeCountParams.push(topic_id.trim());
        collegeCountClause += ` AND ca.topic_id = $${collegeCountParams.length}::uuid`;
      } else if (hasSpecificSubject) {
        collegeCountParams.push(subject_id.trim());
        collegeCountClause += ` AND (
          ca.course = $${collegeCountParams.length} 
          OR ca.course IN (SELECT slug FROM subjects WHERE id = $${collegeCountParams.length}::uuid)
          OR ca.course IN (SELECT name FROM subjects WHERE id = $${collegeCountParams.length}::uuid)
        )`;
      } else if (isFacilitator) {
        collegeCountParams.push(facilitatorId, subjectIds);
        collegeCountClause += ` AND (
          ca.created_by = $${collegeCountParams.length - 1} 
          OR ca.course IN (SELECT id::text FROM subjects WHERE id = ANY($${collegeCountParams.length}::uuid[]))
          OR ca.course IN (SELECT slug FROM subjects WHERE id = ANY($${collegeCountParams.length}::uuid[]))
          OR ca.course IN (SELECT name FROM subjects WHERE id = ANY($${collegeCountParams.length}::uuid[]))
        )`;
      }

      const [courseCountRes, collegeCountRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(DISTINCT a.id)::int as total
           FROM assignments a
           JOIN units un ON un.id = a.unit_id
           JOIN topics t ON t.id = un.topic_id
           WHERE a.is_deleted = false ${courseCountClause}`,
          courseCountParams,
        ),
        pool.query(
          `SELECT COUNT(DISTINCT ca.id)::int as total
           FROM college_assignments ca
           WHERE ca.college_id = ANY($1::uuid[]) AND ca.is_deleted = false ${collegeCountClause}`,
          collegeCountParams,
        ),
      ]);

      const foundTotal = (courseCountRes.rows[0]?.total || 0) + (collegeCountRes.rows[0]?.total || 0);
      let maxStudentAttempted = 0;
      studentSubMap.forEach((val) => {
        if (val.items && val.items.length > maxStudentAttempted) {
          maxStudentAttempted = val.items.length;
        }
      });
      totalAssignments = Math.max(foundTotal, maxStudentAttempted, 1);
    }

    const studentList = students.map((s) => {
      let status = 'Not Started';
      let score_pct = null;
      let assignments_attempted = 0;

      if (studentSubMap.has(s.id)) {
        const subData = studentSubMap.get(s.id);
        assignments_attempted = hasSpecificAssignment ? 1 : (subData.items?.length || 0);

        if (hasSpecificAssignment) {
          if (subData.resolvedScore !== null && subData.resolvedScore !== undefined) {
            score_pct = Math.min(100, Math.max(0, Math.round((subData.resolvedScore / subData.maxScore) * 100)));
            status = score_pct >= 60 ? 'Passed' : 'Failed';
          } else {
            status = 'Submitted / Pending Review';
          }
        } else {
          const items = subData.items || [];
          const evaluatedItems = items.filter((it) => it.resolvedScore !== null && it.resolvedScore !== undefined);
          if (evaluatedItems.length > 0) {
            const pcts = evaluatedItems.map((it) => Math.min(100, Math.max(0, Math.round((it.resolvedScore / it.maxScore) * 100))));
            score_pct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
            status = score_pct >= 60 ? 'Passed' : 'Failed';
          } else {
            status = 'Submitted / Pending Review';
          }
        }
      }

      return {
        id: s.id,
        name: s.full_name,
        email: s.email,
        status,
        score_pct,
        assignments_attempted,
      };
    });

    const enrolled = studentList.length;
    const passed = studentList.filter((s) => s.status === 'Passed').length;
    const failed = studentList.filter((s) => s.status === 'Failed').length;
    const pending = studentList.filter((s) => s.status === 'Submitted / Pending Review').length;
    const notAttempted = studentList.filter((s) => s.status === 'Not Started').length;
    const attempted = passed + failed + pending;

    const dist = { '0-20%': 0, '21-40%': 0, '41-60%': 0, '61-80%': 0, '81-100%': 0 };
    const evaluatedScores = [];

    studentList.forEach((s) => {
      if (s.score_pct !== null && s.score_pct !== undefined) {
        evaluatedScores.push(s.score_pct);
        if (s.score_pct <= 20) dist['0-20%']++;
        else if (s.score_pct <= 40) dist['21-40%']++;
        else if (s.score_pct <= 60) dist['41-60%']++;
        else if (s.score_pct <= 80) dist['61-80%']++;
        else dist['81-100%']++;
      }
    });

    const avgScore = evaluatedScores.length
      ? Math.round(evaluatedScores.reduce((a, b) => a + b, 0) / evaluatedScores.length)
      : 0;

    res.json({
      success: true,
      data: {
        enrolled,
        attempted,
        not_attempted: notAttempted,
        passed,
        failed,
        avg_score_pct: avgScore,
        score_distribution: Object.entries(dist).map(([range, count]) => ({ range, count })),
        students: studentList,
        total_assignments: totalAssignments,
        // Legacy backwards compatibility:
        total: enrolled,
        submitted: attempted,
        not_submitted: notAttempted,
        rate: enrolled > 0 ? Math.round((attempted / enrolled) * 100) : 0,
      },
    });
  } catch (err) {
    serverError(res, err, 'getAssignmentAnalytics');
  }
};

// ─── Analytics: Projects ─────────────────────────────────────────────────────

exports.getProjectAnalytics = async (req, res) => {
  try {
    const { id: facilitatorId, role } = req.user;
    const isFacilitator = role === 'facilitator';
    const subjectIds = req.user.subject_ids || [];

    if (isFacilitator && subjectIds.length === 0) {
      return res.json({ success: true, data: emptyProjectData() });
    }

    const { college_id, batch, subject_id, topic_id, project_id, page, limit } = req.query;

    const hasSpecificSubject = subject_id && subject_id !== 'all' && subject_id.trim() !== '' && UUID_RE.test(subject_id.trim());
    const hasSpecificTopic = topic_id && topic_id !== 'all' && topic_id.trim() !== '' && UUID_RE.test(topic_id.trim());
    const hasSpecificProject = project_id && project_id !== 'all' && project_id.trim() !== '' && UUID_RE.test(project_id.trim());

    if (isFacilitator && hasSpecificSubject && !subjectIds.includes(subject_id.trim())) {
      return res.json({ success: true, data: emptyProjectData() });
    }
    
    const sLimit = Math.min(parseInt(limit, 10) || 10, 100);
    const sOffset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * sLimit;

    const colleges = await getFacilitatorCollegeIds(facilitatorId, college_id, role);
    if (!colleges.length) return res.json({ success: true, data: emptyProjectData() });

    const enrolledIds = await getEnrolledStudentIds(colleges, batch, hasSpecificSubject ? subject_id.trim() : null, isFacilitator ? subjectIds : null);
    if (!enrolledIds.length) return res.json({ success: true, data: emptyProjectData() });

    // Get student names
    const namesRes = await pool.query(
      `SELECT u.id, u.full_name, u.email FROM users u WHERE u.id = ANY($1::uuid[]) ORDER BY u.full_name`,
      [enrolledIds],
    );

    // Get project submissions scoped to subject (if provided)
    const psParams = [enrolledIds];
    let topicJoin = '';
    let psClause = '';
    
    if (hasSpecificProject) {
      psParams.push(project_id.trim());
      psClause = `AND ps.project_id = $${psParams.length}::uuid`;
    } else if (hasSpecificTopic) {
      psParams.push(topic_id.trim());
      psClause = `AND p.topic_id = $${psParams.length}::uuid`;
    } else if (hasSpecificSubject) {
      topicJoin = 'JOIN topics t ON t.id = p.topic_id';
      psParams.push(subject_id.trim());
      psClause = `AND t.subject_id = $${psParams.length}::uuid`;
    } else if (isFacilitator) {
      topicJoin = 'JOIN topics t ON t.id = p.topic_id';
      psParams.push(subjectIds);
      psClause = `AND t.subject_id = ANY($${psParams.length}::uuid[])`;
    }

    const psRes = await pool.query(
      `SELECT 
         ps.user_id,
         COUNT(DISTINCT ps.project_id)::int as projects_attempted,
         COALESCE(MAX(er.marks), MAX(ps.score)) as resolved_score,
         BOOL_OR(ps.is_approved) as is_approved,
         COALESCE(MAX(p.max_score), 100)::int as max_score
       FROM project_submissions ps
       JOIN projects p ON p.id = ps.project_id
       ${topicJoin}
       LEFT JOIN evaluation_results er ON er.submission_id = ps.id AND er.status = 'completed'
       WHERE ps.user_id = ANY($1::uuid[]) ${psClause}
       GROUP BY ps.user_id`,
      psParams,
    );

    const psMap = new Map();
    psRes.rows.forEach((r) => {
      psMap.set(r.user_id, {
        projectsAttempted: r.projects_attempted ? Number(r.projects_attempted) : 1,
        resolvedScore: r.resolved_score !== null ? Number(r.resolved_score) : null,
        isApproved: Boolean(r.is_approved),
        maxScore: r.max_score > 0 ? r.max_score : 100,
      });
    });

    // Calculate total available projects in scope
    let totalProjects = 1;
    if (hasSpecificProject) {
      totalProjects = 1;
    } else {
      const pCountParams = [];
      let pCountTopicJoin = '';
      let pCountClause = '';
      if (hasSpecificTopic) {
        pCountParams.push(topic_id.trim());
        pCountClause = `AND p.topic_id = $${pCountParams.length}::uuid`;
      } else if (hasSpecificSubject) {
        pCountTopicJoin = 'JOIN topics t ON t.id = p.topic_id';
        pCountParams.push(subject_id.trim());
        pCountClause = `AND t.subject_id = $${pCountParams.length}::uuid`;
      } else if (isFacilitator) {
        pCountTopicJoin = 'JOIN topics t ON t.id = p.topic_id';
        pCountParams.push(subjectIds);
        pCountClause = `AND t.subject_id = ANY($${pCountParams.length}::uuid[])`;
      }

      const pCountRes = await pool.query(
        `SELECT COUNT(DISTINCT p.id)::int as total
         FROM projects p
         ${pCountTopicJoin}
         WHERE p.is_deleted = false ${pCountClause}`,
        pCountParams,
      );

      const foundTotal = pCountRes.rows[0]?.total || 0;
      let maxAttempted = 0;
      psMap.forEach((val) => {
        if (val.projectsAttempted > maxAttempted) {
          maxAttempted = val.projectsAttempted;
        }
      });
      totalProjects = Math.max(foundTotal, maxAttempted, 1);
    }

    const students = namesRes.rows.map((s) => {
      let status = 'Not Started';
      let score_pct = null;
      let projects_attempted = 0;

      if (psMap.has(s.id)) {
        const info = psMap.get(s.id);
        projects_attempted = info.projectsAttempted || 1;
        if (info.resolvedScore !== null && info.resolvedScore !== undefined) {
          score_pct = Math.min(100, Math.max(0, Math.round((info.resolvedScore / info.maxScore) * 100)));
          status = score_pct >= 60 || info.isApproved ? 'Passed' : 'Failed';
        } else if (info.isApproved) {
          score_pct = 100;
          status = 'Passed';
        } else {
          status = 'Submitted / Pending Review';
        }
      }

      return { id: s.id, name: s.full_name, email: s.email, status, score_pct, projects_attempted };
    });

    const enrolled = students.length;
    const passed = students.filter((s) => s.status === 'Passed').length;
    const failed = students.filter((s) => s.status === 'Failed').length;
    const pending = students.filter((s) => s.status === 'Submitted / Pending Review').length;
    const notStarted = students.filter((s) => s.status === 'Not Started').length;
    const attempted = passed + failed + pending;

    const dist = { '0-20%': 0, '21-40%': 0, '41-60%': 0, '61-80%': 0, '81-100%': 0 };
    const evaluatedScores = [];

    students.forEach((s) => {
      if (s.score_pct !== null && s.score_pct !== undefined) {
        evaluatedScores.push(s.score_pct);
        if (s.score_pct <= 20) dist['0-20%']++;
        else if (s.score_pct <= 40) dist['21-40%']++;
        else if (s.score_pct <= 60) dist['41-60%']++;
        else if (s.score_pct <= 80) dist['61-80%']++;
        else dist['81-100%']++;
      }
    });

    const avgScore = evaluatedScores.length
      ? Math.round(evaluatedScores.reduce((a, b) => a + b, 0) / evaluatedScores.length)
      : 0;

    res.json({
      success: true,
      data: {
        enrolled,
        attempted,
        not_attempted: notStarted,
        passed,
        failed,
        avg_score_pct: avgScore,
        score_distribution: Object.entries(dist).map(([range, count]) => ({ range, count })),
        students: students,
        total_projects: totalProjects,
        // Legacy backwards compatibility:
        total: enrolled,
        not_started: notStarted,
        submitted: attempted,
        approved: passed,
      },
    });
  } catch (err) {
    serverError(res, err, 'getProjectAnalytics');
  }
};

// ─── Analytics: Batch Dashboard ───────────────────────────────────────────────

const { isUserOnline } = require('../services/presenceService');

exports.getBatchDashboard = async (req, res) => {
  try {
    const { id: facilitatorId, role } = req.user;
    const isFacilitator = role === 'facilitator';
    const subjectIds = req.user.subject_ids || [];

    if (isFacilitator && subjectIds.length === 0) {
      return res.json({ success: true, data: { enrolled: 0, quiz_completion_rate: 0, quiz_pass_rate: 0, assignment_completion_rate: 0, project_completion_rate: 0, subjects: [] } });
    }

    const { college_id, batch, subject_id, topic_id } = req.query;

    if (isFacilitator && subject_id && !subjectIds.includes(subject_id)) {
      return res.json({ success: true, data: { enrolled: 0, quiz_completion_rate: 0, quiz_pass_rate: 0, assignment_completion_rate: 0, project_completion_rate: 0, subjects: [] } });
    }

    const colleges = await getFacilitatorCollegeIds(facilitatorId, college_id, role);
    if (!colleges.length) return res.json({ success: true, data: { enrolled: 0, quiz_completion_rate: 0, quiz_pass_rate: 0, assignment_completion_rate: 0, project_completion_rate: 0, subjects: [] } });

    const enrolledIds = await getEnrolledStudentIds(colleges, batch, subject_id, isFacilitator ? subjectIds : null);
    if (!enrolledIds.length) return res.json({ success: true, data: { enrolled: 0, quiz_completion_rate: 0, quiz_pass_rate: 0, assignment_completion_rate: 0, project_completion_rate: 0, subjects: [] } });

    // Subjects enrolled by these students (scoped for facilitators)
    const subjectsParams = [enrolledIds];
    let subjScopeClause = '';
    if (isFacilitator) {
      subjectsParams.push(subjectIds);
      subjScopeClause = `AND s.id = ANY($${subjectsParams.length}::uuid[])`;
    }

    const subjectsRes = await pool.query(
      `SELECT DISTINCT s.id, s.name
       FROM subjects s
       JOIN user_subjects us ON us.subject_id = s.id
       WHERE us.user_id = ANY($1::uuid[]) ${subjScopeClause}
       ORDER BY s.name`,
      subjectsParams,
    );

    // For each subject: quiz completion, pass rate, assignment completion
    const subjectRows = await Promise.all(
      subjectsRes.rows.map(async (subj) => {
        const subjEnrolled = await getEnrolledStudentIds(colleges, batch, subj.id, isFacilitator ? subjectIds : null);
        if (!subjEnrolled.length) return { ...subj, quiz_completion: 0, pass_rate: 0, assignment_completion: 0 };

        const qParams = [subjEnrolled, subj.id];
        let topicClause = '';
        if (topic_id) {
          qParams.push(topic_id);
          topicClause = `AND t.id = $${qParams.length}::uuid`;
        }

        const quizRes = await pool.query(
          `SELECT qa.user_id, qa.is_passed
           FROM quiz_attempts qa
           JOIN quizzes q ON q.id = qa.quiz_id
           JOIN units un ON un.id = q.unit_id
           JOIN topics t ON t.id = un.topic_id
           WHERE qa.user_id = ANY($1::uuid[]) AND t.subject_id = $2::uuid ${topicClause}`,
          qParams,
        );
        const attempted = new Set(quizRes.rows.map((r) => r.user_id));
        const passed = new Set(quizRes.rows.filter((r) => r.is_passed).map((r) => r.user_id));

        // Assignment completion: Curriculum assignments for this subject/topic
        const aParams = [subjEnrolled, subj.id];
        let aTopicClause = '';
        if (topic_id) {
          aParams.push(topic_id);
          aTopicClause = `AND t.id = $${aParams.length}::uuid`;
        }

        const asgRes = await pool.query(
          `SELECT cas.user_id as student_id
           FROM assignment_submissions cas
           JOIN assignments a ON a.id = cas.assignment_id
           JOIN units un ON un.id = a.unit_id
           JOIN topics t ON t.id = un.topic_id
           WHERE cas.user_id = ANY($1::uuid[]) AND t.subject_id = $2::uuid ${aTopicClause}`,
          aParams,
        );
        const asgComplete = new Set(asgRes.rows.map((r) => r.student_id)).size;

        // Project completion
        const projRes = await pool.query(
          `SELECT ps.user_id
           FROM project_submissions ps
           JOIN projects p ON p.id = ps.project_id
           JOIN topics t ON t.id = p.topic_id
           WHERE ps.user_id = ANY($1::uuid[]) AND t.subject_id = $2::uuid ${topicClause}`,
          qParams,
        );
        const projComplete = new Set(projRes.rows.map((r) => r.user_id)).size;

        // Lesson completion
        const lessonRes = await pool.query(
          `SELECT ulp.user_id
           FROM user_lesson_progress ulp
           JOIN lesson_content lc ON lc.id = ulp.lesson_content_id
           JOIN subtopics st ON st.id = lc.subtopic_id
           JOIN units un ON un.id = st.unit_id
           JOIN topics t ON t.id = un.topic_id
           WHERE ulp.is_completed = true AND ulp.user_id = ANY($1::uuid[]) AND t.subject_id = $2::uuid ${topicClause}`,
          qParams,
        );
        const lessonComplete = new Set(lessonRes.rows.map((r) => r.user_id)).size;

        const quizPct = subjEnrolled.length > 0 ? Math.round((attempted.size / subjEnrolled.length) * 100) : 0;
        const passPct = attempted.size > 0 ? Math.round((passed.size / attempted.size) * 100) : 0;
        const asgPct = subjEnrolled.length > 0 ? Math.round((asgComplete / subjEnrolled.length) * 100) : 0;
        const projPct = subjEnrolled.length > 0 ? Math.round((projComplete / subjEnrolled.length) * 100) : 0;
        const lessonPct = subjEnrolled.length > 0 ? Math.round((lessonComplete / subjEnrolled.length) * 100) : 0;
        
        const avgModuleProgress = Math.round((quizPct + asgPct + projPct + lessonPct) / 4);

        return {
          id: subj.id,
          name: subj.name,
          quiz_completion: quizPct,
          pass_rate: passPct,
          assignment_completion: asgPct,
          project_completion: projPct,
          lesson_completion: lessonPct,
          module_progress: avgModuleProgress
        };
      }),
    );

    // Overall assignment completion (course + college assignments, at least one submitted)
    const collegeAsgParams = [colleges, enrolledIds];
    let caFacilitatorClause = '';
    if (isFacilitator) {
      collegeAsgParams.push(facilitatorId, subjectIds);
      caFacilitatorClause = `AND (
        ca.created_by = $3 
        OR ca.course IN (SELECT id::text FROM subjects WHERE id = ANY($4::uuid[]))
        OR ca.course IN (SELECT slug FROM subjects WHERE id = ANY($4::uuid[]))
        OR ca.course IN (SELECT name FROM subjects WHERE id = ANY($4::uuid[]))
      )`;
    }
    const asgRes = await pool.query(
      `SELECT COUNT(DISTINCT student_id) as submitted FROM (
         SELECT cas.student_id
         FROM college_assignment_submissions cas
         JOIN college_assignments ca ON ca.id = cas.assignment_id AND ca.is_deleted = false
         WHERE ca.college_id = ANY($1::uuid[]) AND cas.student_id = ANY($2::uuid[]) ${caFacilitatorClause}
         UNION
         SELECT asub.user_id as student_id
         FROM assignment_submissions asub
         JOIN assignments a ON a.id = asub.assignment_id
         JOIN units un ON un.id = a.unit_id
         JOIN topics t ON t.id = un.topic_id
         WHERE asub.user_id = ANY($2::uuid[]) ${isFacilitator ? `AND t.subject_id = ANY($4::uuid[])` : ''}
       ) combined`,
      collegeAsgParams,
    );
    const asgSubmitted = parseInt(asgRes.rows[0]?.submitted || 0);

    // Overall project completion
    const projParams = [enrolledIds];
    let projSubjJoin = '';
    let projSubjClause = '';
    if (isFacilitator) {
      projParams.push(subjectIds);
      projSubjJoin = 'JOIN projects p ON p.id = ps.project_id JOIN topics t ON t.id = p.topic_id';
      projSubjClause = `AND t.subject_id = ANY($${projParams.length}::uuid[])`;
    }
    const projRes = await pool.query(
      `SELECT COUNT(DISTINCT ps.user_id) as submitted
       FROM project_submissions ps
       ${projSubjJoin}
       WHERE ps.user_id = ANY($1::uuid[]) ${projSubjClause}`,
      projParams,
    );
    const projSubmitted = parseInt(projRes.rows[0]?.submitted || 0);

    // Overall quiz stats
    const allQuizParams = [enrolledIds];
    let allQuizTopicClause = '';
    if (topic_id) {
      allQuizParams.push(topic_id);
      allQuizTopicClause = `JOIN quizzes q ON q.id = qa.quiz_id JOIN units un ON un.id = q.unit_id JOIN topics t ON t.id = un.topic_id WHERE t.id = $${allQuizParams.length}::uuid AND `;
    } else if (subject_id) {
      allQuizParams.push(subject_id);
      allQuizTopicClause = `JOIN quizzes q ON q.id = qa.quiz_id JOIN units un ON un.id = q.unit_id JOIN topics t ON t.id = un.topic_id WHERE t.subject_id = $${allQuizParams.length}::uuid AND `;
    } else if (isFacilitator) {
      allQuizParams.push(subjectIds);
      allQuizTopicClause = `JOIN quizzes q ON q.id = qa.quiz_id JOIN units un ON un.id = q.unit_id JOIN topics t ON t.id = un.topic_id WHERE t.subject_id = ANY($${allQuizParams.length}::uuid[]) AND `;
    } else {
      allQuizTopicClause = 'WHERE ';
    }

    const allQuizRes = await pool.query(
      `SELECT qa.user_id, qa.is_passed
       FROM quiz_attempts qa
       ${allQuizTopicClause} qa.user_id = ANY($1::uuid[])`,
      allQuizParams,
    );
    const allAttempted = new Set(allQuizRes.rows.map((r) => r.user_id));
    const allPassed = new Set(allQuizRes.rows.filter((r) => r.is_passed).map((r) => r.user_id));

    // Active students based on presence
    const activeStudents = enrolledIds.filter(id => isUserOnline(id)).length;

    // Average batch streak
    const streakRes = await pool.query(
      `SELECT COALESCE(AVG(current_streak), 0) as avg_streak FROM user_streaks WHERE user_id = ANY($1::uuid[])`,
      [enrolledIds]
    );
    const avgBatchStreak = Math.round(parseFloat(streakRes.rows[0]?.avg_streak || 0));

    // Overall module progress average
    const totalModuleProgress = subjectRows.reduce((sum, subj) => sum + subj.module_progress, 0);
    const avgModuleProgress = subjectRows.length > 0 ? Math.round(totalModuleProgress / subjectRows.length) : 0;

    res.json({
      success: true,
      data: {
        enrolled: enrolledIds.length,
        active_students: activeStudents,
        avg_batch_streak: avgBatchStreak,
        avg_module_progress: avgModuleProgress,
        quiz_completion_rate: enrolledIds.length > 0 ? Math.round((allAttempted.size / enrolledIds.length) * 100) : 0,
        quiz_pass_rate: allAttempted.size > 0 ? Math.round((allPassed.size / allAttempted.size) * 100) : 0,
        assignment_completion_rate: enrolledIds.length > 0 ? Math.round((asgSubmitted / enrolledIds.length) * 100) : 0,
        project_completion_rate: enrolledIds.length > 0 ? Math.round((projSubmitted / enrolledIds.length) * 100) : 0,
        subjects: subjectRows,
      },
    });
  } catch (err) {
    serverError(res, err, 'getBatchDashboard');
  }
};

// ─── Analytics: Batch Date-Filtered Activity Report & Excel Export ──────────

async function fetchBatchActivityReportData(req) {
  const { id: facilitatorId, role } = req.user;
  const isFacilitator = role === 'facilitator';
  const subjectIds = req.user.subject_ids || [];
  const { college_id, batch, subject_id, time_range = '7d', start_date, end_date, search } = req.query;

  const emptyResult = {
    period: { time_range, start_date: new Date().toISOString(), end_date: new Date().toISOString() },
    meta: { subject_name: 'All Subjects', college_name: 'All Colleges', batch: 'All Batches' },
    summary: { total_enrolled: 0, active_count: 0, inactive_count: 0, lessons_completed: 0, exercises_passed: 0, quizzes_attempted: 0, assignments_submitted: 0, projects_submitted: 0, total_xp_earned: 0, cohort_avg_progress: 0 },
    students: [],
  };

  if (isFacilitator && subjectIds.length === 0) {
    return emptyResult;
  }

  if (isFacilitator && subject_id && !subjectIds.includes(subject_id)) {
    return emptyResult;
  }

  const colleges = await getFacilitatorCollegeIds(facilitatorId, college_id, role);
  if (!colleges.length) {
    return emptyResult;
  }

  const enrolledIds = await getEnrolledStudentIds(colleges, batch, subject_id, isFacilitator ? subjectIds : null);
  if (!enrolledIds.length) {
    return emptyResult;
  }

  // Calculate start and end date
  const now = new Date();
  let startDate;
  let endDate = now;

  switch (time_range) {
    case '1d':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '10d':
      startDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      break;
    case '15d':
      startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'custom': {
      const parsedStart = start_date ? new Date(start_date) : null;
      const parsedEnd = end_date ? new Date(end_date) : null;
      startDate = (parsedStart && !Number.isNaN(parsedStart.getTime()))
        ? parsedStart
        : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      endDate = (parsedEnd && !Number.isNaN(parsedEnd.getTime()))
        ? new Date(new Date(parsedEnd).setHours(23, 59, 59, 999))
        : now;
      break;
    }
    case '7d':
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
  }

  // Fetch subject metadata if valid subject_id passed
  let subjectName = 'All Subjects';
  if (subject_id && subject_id !== 'all' && UUID_RE.test(String(subject_id).trim())) {
    const sNameRes = await pool.query('SELECT name FROM subjects WHERE id = $1::uuid', [String(subject_id).trim()]);
    if (sNameRes.rows.length) subjectName = sNameRes.rows[0].name;
  }

  // Fetch college name if valid college_id passed
  let collegeName = 'All Colleges';
  if (college_id && college_id !== 'all' && UUID_RE.test(String(college_id).trim())) {
    const cNameRes = await pool.query('SELECT name FROM colleges WHERE id = $1::uuid', [String(college_id).trim()]);
    if (cNameRes.rows.length) collegeName = cNameRes.rows[0].name;
  }

  // Build subject scoping clauses for activity queries
  let sClause = '';
  const sParams = [enrolledIds, startDate, endDate];
  if (subject_id && subject_id !== 'all' && UUID_RE.test(String(subject_id).trim())) {
    sParams.push(String(subject_id).trim());
    sClause = `AND t.subject_id = $${sParams.length}::uuid`;
  } else if (isFacilitator && subjectIds.length > 0) {
    sParams.push(subjectIds);
    sClause = `AND t.subject_id = ANY($${sParams.length}::uuid[])`;
  }

  // 1. Lessons / Subtopics completed in period
  const lessonsRes = await pool.query(
    `SELECT usp.user_id, COUNT(DISTINCT usp.subtopic_id)::int AS count
     FROM user_subtopic_progress usp
     JOIN subtopics st ON st.id = usp.subtopic_id AND st.is_deleted = false
     JOIN units un ON st.unit_id = un.id AND un.is_deleted = false
     JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
     WHERE usp.user_id = ANY($1::uuid[]) AND usp.is_completed = true
       AND usp.completed_at >= $2::timestamptz AND usp.completed_at <= $3::timestamptz
       ${sClause}
     GROUP BY usp.user_id`,
    sParams,
  );
  const lessonsMap = new Map(lessonsRes.rows.map((r) => [r.user_id, r.count]));

  // 2. Exercises passed in period
  const exercisesRes = await pool.query(
    `SELECT es.user_id, COUNT(DISTINCT es.exercise_id)::int AS count
     FROM exercise_submissions es
     JOIN exercises e ON e.id = es.exercise_id AND e.is_deleted = false
     JOIN subtopics st ON e.subtopic_id = st.id AND st.is_deleted = false
     JOIN units un ON st.unit_id = un.id AND un.is_deleted = false
     JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
     WHERE es.user_id = ANY($1::uuid[]) AND es.is_passed = true
       AND es.submitted_at >= $2::timestamptz AND es.submitted_at <= $3::timestamptz
       ${sClause}
     GROUP BY es.user_id`,
    sParams,
  );
  const exercisesMap = new Map(exercisesRes.rows.map((r) => [r.user_id, r.count]));

  // 3. Quizzes attempted and average score % in period
  const quizzesRes = await pool.query(
    `SELECT 
       qa.user_id,
       COUNT(DISTINCT qa.quiz_id)::int AS quizzes_attempted,
       ROUND(AVG(LEAST(100.0, qa.score * 100.0 / NULLIF(q.max_score, 0)))::numeric, 1) AS avg_quiz_score_pct
     FROM quiz_attempts qa
     JOIN quizzes q ON q.id = qa.quiz_id AND q.is_deleted = false
     JOIN units un ON q.unit_id = un.id AND un.is_deleted = false
     JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
     WHERE qa.user_id = ANY($1::uuid[])
       AND COALESCE(qa.attempted_at, qa.created_at) >= $2::timestamptz 
       AND COALESCE(qa.attempted_at, qa.created_at) <= $3::timestamptz
       ${sClause}
     GROUP BY qa.user_id`,
    sParams,
  );
  const quizAttemptMap = new Map(quizzesRes.rows.map((r) => [r.user_id, r.quizzes_attempted]));
  const quizScoreMap = new Map(quizzesRes.rows.map((r) => [r.user_id, parseFloat(r.avg_quiz_score_pct)]));

  // 4. Assignments submitted (curriculum + college assignments)
  let caSubjClause = '';
  const asgParams = [...sParams];
  if (subject_id && subject_id !== 'all' && UUID_RE.test(String(subject_id).trim())) {
    asgParams.push(String(subject_id).trim());
    const paramIdx = asgParams.length;
    caSubjClause = `AND (ca.course = $${paramIdx} OR ca.course IN (SELECT slug FROM subjects WHERE id = $${paramIdx}::uuid))`;
  } else if (isFacilitator && subjectIds.length > 0) {
    asgParams.push(subjectIds);
    const paramIdx = asgParams.length;
    caSubjClause = `AND (ca.course = ANY($${paramIdx}::text[]) OR ca.course IN (SELECT slug FROM subjects WHERE id = ANY($${paramIdx}::uuid[])))`;
  }
  const asgRes = await pool.query(
    `SELECT user_id, COUNT(DISTINCT assignment_id)::int AS assignments_submitted
     FROM (
       SELECT asub.user_id, asub.assignment_id
       FROM assignment_submissions asub
       JOIN assignments a ON a.id = asub.assignment_id AND a.is_deleted = false
       JOIN units un ON a.unit_id = un.id AND un.is_deleted = false
       JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
       WHERE asub.user_id = ANY($1::uuid[])
         AND asub.submitted_at >= $2::timestamptz AND asub.submitted_at <= $3::timestamptz
         ${sClause}
       UNION ALL
       SELECT cas.student_id AS user_id, cas.assignment_id
       FROM college_assignment_submissions cas
       JOIN college_assignments ca ON ca.id = cas.assignment_id AND ca.is_deleted = false
       WHERE cas.student_id = ANY($1::uuid[])
         AND (
           (cas.submitted_at IS NOT NULL AND cas.submitted_at >= $2::timestamptz AND cas.submitted_at <= $3::timestamptz)
           OR (cas.updated_at IS NOT NULL AND cas.updated_at >= $2::timestamptz AND cas.updated_at <= $3::timestamptz)
         )
         ${caSubjClause}
     ) combined_asg
     GROUP BY user_id`,
    asgParams,
  );
  const asgMap = new Map(asgRes.rows.map((r) => [r.user_id, r.assignments_submitted]));

  // 5. Projects submitted and approved
  const projRes = await pool.query(
    `SELECT 
       ps.user_id,
       COUNT(DISTINCT ps.project_id)::int AS projects_submitted,
       COUNT(DISTINCT ps.project_id) FILTER (WHERE ps.is_approved = true OR ps.score >= 60)::int AS projects_approved
     FROM project_submissions ps
     JOIN projects p ON p.id = ps.project_id AND p.is_deleted = false
     JOIN topics t ON p.topic_id = t.id AND t.is_deleted = false
     WHERE ps.user_id = ANY($1::uuid[])
       AND ps.submitted_at >= $2::timestamptz AND ps.submitted_at <= $3::timestamptz
       ${sClause}
     GROUP BY ps.user_id`,
    sParams,
  );
  const projMap = new Map(projRes.rows.map((r) => [r.user_id, r.projects_submitted]));
  const projApprMap = new Map(projRes.rows.map((r) => [r.user_id, r.projects_approved]));

  // 6. Points / XP earned in period - Detailed Breakdown by Source
  const xpBySourceRes = await pool.query(
    `SELECT pl.user_id, pl.source, COALESCE(SUM(pl.points), 0)::int AS xp, COUNT(*)::int AS count
     FROM points_log pl
     WHERE pl.user_id = ANY($1::uuid[])
       AND pl.created_at >= $2::timestamptz AND pl.created_at <= $3::timestamptz
     GROUP BY pl.user_id, pl.source`,
    [enrolledIds, startDate, endDate],
  );

  const xpBreakdownMap = new Map();
  xpBySourceRes.rows.forEach((r) => {
    const current = xpBreakdownMap.get(r.user_id) || {
      lessons_xp: 0,
      lessons_count: 0,
      exercises_xp: 0,
      exercises_count: 0,
      quizzes_xp: 0,
      quizzes_count: 0,
      assignments_xp: 0,
      assignments_count: 0,
      projects_xp: 0,
      projects_count: 0,
      other_xp: 0,
      total_xp: 0,
    };
    const src = (r.source || '').toLowerCase();
    const pts = parseInt(r.xp, 10) || 0;
    const cnt = parseInt(r.count, 10) || 0;
    current.total_xp += pts;

    if (src.includes('lesson')) {
      current.lessons_xp += pts;
      current.lessons_count += cnt;
    } else if (src.includes('exercise')) {
      current.exercises_xp += pts;
      current.exercises_count += cnt;
    } else if (src.includes('quiz')) {
      current.quizzes_xp += pts;
      current.quizzes_count += cnt;
    } else if (src.includes('capstone') || src.includes('project')) {
      current.projects_xp += pts;
      current.projects_count += cnt;
    } else if (src.includes('assignment')) {
      current.assignments_xp += pts;
      current.assignments_count += cnt;
    } else {
      current.other_xp += pts;
    }
    xpBreakdownMap.set(r.user_id, current);
  });

  // 7. Unified Last Active Timestamp across all 7 action surfaces
  const activityRes = await pool.query(
    `SELECT active_actions.user_id, MAX(active_actions.activity_date) AS last_active_at
     FROM (
       SELECT user_id, completed_at AS activity_date FROM public.user_subtopic_progress WHERE user_id = ANY($1::uuid[]) AND completed_at IS NOT NULL
       UNION ALL
       SELECT user_id, COALESCE(attempted_at, created_at) AS activity_date FROM public.quiz_attempts WHERE user_id = ANY($1::uuid[]) AND (attempted_at IS NOT NULL OR created_at IS NOT NULL)
       UNION ALL
       SELECT user_id, submitted_at AS activity_date FROM public.exercise_submissions WHERE user_id = ANY($1::uuid[]) AND submitted_at IS NOT NULL
       UNION ALL
       SELECT user_id, submitted_at AS activity_date FROM public.assignment_submissions WHERE user_id = ANY($1::uuid[]) AND submitted_at IS NOT NULL
       UNION ALL
       SELECT user_id, submitted_at AS activity_date FROM public.project_submissions WHERE user_id = ANY($1::uuid[]) AND submitted_at IS NOT NULL
       UNION ALL
       SELECT student_id AS user_id, COALESCE(submitted_at, updated_at) AS activity_date FROM public.college_assignment_submissions WHERE student_id = ANY($1::uuid[]) AND (submitted_at IS NOT NULL OR updated_at IS NOT NULL)
       UNION ALL
       SELECT user_id, last_activity::timestamptz AS activity_date FROM public.user_streaks WHERE user_id = ANY($1::uuid[]) AND last_activity IS NOT NULL
       UNION ALL
       SELECT user_id, created_at AS activity_date FROM public.points_log WHERE user_id = ANY($1::uuid[]) AND created_at IS NOT NULL
     ) active_actions
     GROUP BY active_actions.user_id`,
    [enrolledIds],
  );
  const lastActiveMap = new Map(activityRes.rows.map((r) => [r.user_id, r.last_active_at]));

  // 8. Fetch student base details
  const targetSubjId = subject_id && subject_id !== 'all' && UUID_RE.test(String(subject_id).trim())
    ? String(subject_id).trim()
    : null;
  const progressSelect = targetSubjId
    ? `COALESCE((SELECT progress_percent FROM user_subjects WHERE user_id = u.id AND subject_id = $2::uuid LIMIT 1), 0)`
    : `COALESCE((SELECT ROUND(AVG(progress_percent))::int FROM user_subjects WHERE user_id = u.id), 0)`;
  const sBaseParams = targetSubjId ? [enrolledIds, targetSubjId] : [enrolledIds];

  const studentsRes = await pool.query(
    `SELECT 
       u.id AS student_id,
       u.full_name,
       u.email,
       c.name AS college_name,
       c.short_code AS college_code,
       COALESCE(sp.expected_graduation_year::text, sp.year::text, 'General') AS batch,
       sp.degree,
       ${progressSelect} AS overall_subject_progress
     FROM users u
     JOIN student_profiles sp ON sp.user_id = u.id
     LEFT JOIN colleges c ON c.id = sp.college_id
     WHERE u.id = ANY($1::uuid[]) AND u.deleted_at IS NULL
     ORDER BY u.full_name ASC`,
    sBaseParams,
  );

  let students = studentsRes.rows.map((s) => {
    const xpInfo = xpBreakdownMap.get(s.student_id) || {
      lessons_xp: 0,
      lessons_count: 0,
      exercises_xp: 0,
      exercises_count: 0,
      quizzes_xp: 0,
      quizzes_count: 0,
      assignments_xp: 0,
      assignments_count: 0,
      projects_xp: 0,
      projects_count: 0,
      other_xp: 0,
      total_xp: 0,
    };

    const lessonsCompleted = Math.max(lessonsMap.get(s.student_id) || 0, xpInfo.lessons_count);
    const exercisesPassed = Math.max(exercisesMap.get(s.student_id) || 0, xpInfo.exercises_count);
    const quizzesAttempted = Math.max(quizAttemptMap.get(s.student_id) || 0, xpInfo.quizzes_count);
    const rawAvgQuizScore = quizScoreMap.get(s.student_id);
    const avgQuizScore = (rawAvgQuizScore !== undefined && rawAvgQuizScore !== null)
      ? Math.min(100, Math.max(0, rawAvgQuizScore))
      : null;
    const assignmentsSubmitted = Math.max(asgMap.get(s.student_id) || 0, xpInfo.assignments_count);
    const projectsSubmitted = Math.max(projMap.get(s.student_id) || 0, xpInfo.projects_count);
    const projectsApproved = projApprMap.get(s.student_id) || 0;
    const totalXp = xpInfo.total_xp;
    const lastActiveAt = lastActiveMap.get(s.student_id) || null;

    const isActive = (
      totalXp > 0 ||
      lessonsCompleted > 0 ||
      exercisesPassed > 0 ||
      quizzesAttempted > 0 ||
      assignmentsSubmitted > 0 ||
      projectsSubmitted > 0 ||
      (lastActiveAt && new Date(lastActiveAt) >= startDate)
    );

    return {
      student_id: s.student_id,
      full_name: s.full_name,
      email: s.email,
      college_name: s.college_name || 'N/A',
      college_code: s.college_code || 'N/A',
      batch: s.batch,
      degree: s.degree || 'N/A',
      overall_subject_progress: s.overall_subject_progress,
      weekly_lessons_completed: lessonsCompleted,
      weekly_lessons_xp: xpInfo.lessons_xp,
      weekly_exercises_passed: exercisesPassed,
      weekly_exercises_xp: xpInfo.exercises_xp,
      weekly_quizzes_attempted: quizzesAttempted,
      weekly_quizzes_xp: xpInfo.quizzes_xp,
      weekly_avg_quiz_score: avgQuizScore,
      weekly_assignments_submitted: assignmentsSubmitted,
      weekly_assignments_xp: xpInfo.assignments_xp,
      weekly_projects_submitted: projectsSubmitted,
      weekly_projects_approved: projectsApproved,
      weekly_projects_xp: xpInfo.projects_xp,
      weekly_xp_earned: totalXp,
      last_active_at: lastActiveAt,
      engagement_status: isActive ? 'Active' : 'Inactive',
    };
  });

  // Apply search query filter if provided (with null safety)
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    students = students.filter((s) =>
      (s.full_name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.batch || '').toLowerCase().includes(q),
    );
  }

  // Compute KPI summary
  const totalEnrolled = students.length;
  const activeCount = students.filter((s) => s.engagement_status === 'Active').length;
  const inactiveCount = totalEnrolled - activeCount;
  const lessonsCompletedTotal = students.reduce((acc, s) => acc + s.weekly_lessons_completed, 0);
  const lessonsXpTotal = students.reduce((acc, s) => acc + s.weekly_lessons_xp, 0);
  const exercisesPassedTotal = students.reduce((acc, s) => acc + s.weekly_exercises_passed, 0);
  const exercisesXpTotal = students.reduce((acc, s) => acc + s.weekly_exercises_xp, 0);
  const quizzesAttemptedTotal = students.reduce((acc, s) => acc + s.weekly_quizzes_attempted, 0);
  const quizzesXpTotal = students.reduce((acc, s) => acc + s.weekly_quizzes_xp, 0);
  const assignmentsSubmittedTotal = students.reduce((acc, s) => acc + s.weekly_assignments_submitted, 0);
  const assignmentsXpTotal = students.reduce((acc, s) => acc + s.weekly_assignments_xp, 0);
  const projectsSubmittedTotal = students.reduce((acc, s) => acc + s.weekly_projects_submitted, 0);
  const projectsXpTotal = students.reduce((acc, s) => acc + s.weekly_projects_xp, 0);
  const totalXpTotal = students.reduce((acc, s) => acc + s.weekly_xp_earned, 0);
  const avgProgress = totalEnrolled > 0
    ? Math.round(students.reduce((acc, s) => acc + s.overall_subject_progress, 0) / totalEnrolled)
    : 0;

  return {
    period: {
      time_range,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    },
    meta: {
      subject_name: subjectName,
      college_name: collegeName,
      batch: batch && batch !== 'all' ? batch : 'All Batches',
    },
    summary: {
      total_enrolled: totalEnrolled,
      active_count: activeCount,
      inactive_count: inactiveCount,
      lessons_completed: lessonsCompletedTotal,
      lessons_xp: lessonsXpTotal,
      exercises_passed: exercisesPassedTotal,
      exercises_xp: exercisesXpTotal,
      quizzes_attempted: quizzesAttemptedTotal,
      quizzes_xp: quizzesXpTotal,
      assignments_submitted: assignmentsSubmittedTotal,
      assignments_xp: assignmentsXpTotal,
      projects_submitted: projectsSubmittedTotal,
      projects_xp: projectsXpTotal,
      total_xp_earned: totalXpTotal,
      cohort_avg_progress: avgProgress,
    },
    students,
  };
}

exports.getBatchActivityReport = async (req, res) => {
  try {
    const data = await fetchBatchActivityReportData(req);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[getBatchActivityReport] error:', err);
    serverError(res, err, 'getBatchActivityReport');
  }
};

exports.exportBatchActivityReport = async (req, res) => {
  try {
    const data = await fetchBatchActivityReportData(req);
    const { students, meta, period } = data;

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      // Neutralize spreadsheet formula execution (=, +, -, @, tabs, carriage returns)
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'Student Name',
      'Email',
      'Batch',
      'Degree',
      'College',
      'Lessons XP (Period)',
      'Lessons Completed (Period)',
      'Exercises XP (Period)',
      'Exercises Passed (Period)',
      'Quizzes XP (Period)',
      'Quizzes Attempted (Period)',
      'Avg Quiz Score % (Period)',
      'Assignments XP (Period)',
      'Assignments Submitted (Period)',
      'Projects XP (Period)',
      'Projects Submitted (Period)',
      'Projects Approved (Period)',
      'Total XP Earned (Period)',
      'Overall Course Progress %',
      'Last Active Date',
      'Engagement Status',
    ];

    const rows = students.map((s) => [
      escapeCsv(s.full_name),
      escapeCsv(s.email),
      escapeCsv(s.batch),
      escapeCsv(s.degree),
      escapeCsv(s.college_name),
      s.weekly_lessons_xp,
      s.weekly_lessons_completed,
      s.weekly_exercises_xp,
      s.weekly_exercises_passed,
      s.weekly_quizzes_xp,
      s.weekly_quizzes_attempted,
      s.weekly_avg_quiz_score !== null ? `${s.weekly_avg_quiz_score}%` : 'N/A',
      s.weekly_assignments_xp,
      s.weekly_assignments_submitted,
      s.weekly_projects_xp,
      s.weekly_projects_submitted,
      s.weekly_projects_approved,
      s.weekly_xp_earned,
      `${s.overall_subject_progress}%`,
      s.last_active_at ? new Date(s.last_active_at).toLocaleString('en-IN') : 'Never',
      s.engagement_status,
    ]);

    const rangeStr = `${new Date(period.start_date).toLocaleDateString()} to ${new Date(period.end_date).toLocaleDateString()}`;
    const csvContent = '\uFEFF' + [
      `# BATCH ACTIVITY REPORT - ${meta.subject_name || 'All Subjects'}`,
      `# College: ${meta.college_name || 'All'} | Batch: ${meta.batch || 'All'} | Timeframe: ${period.time_range} (${rangeStr})`,
      `# Generated: ${new Date().toLocaleString('en-IN')}`,
      '',
      headers.join(','),
      ...rows.map((r) => r.join(',')),
    ].join('\r\n');

    const cleanSubject = (meta.subject_name || 'Cohort').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Batch_Report_${cleanSubject}_${period.time_range}.csv"`);
    res.send(csvContent);
  } catch (err) {
    serverError(res, err, 'exportBatchActivityReport');
  }
};

// ─── Analytics: Student Performance ──────────────────────────────────────────

exports.getStudentAnalytics = async (req, res) => {
  try {
    const { id: facilitatorId, role } = req.user;
    const isFacilitator = role === 'facilitator';
    const subjectIds = req.user.subject_ids || [];

    if (isFacilitator && subjectIds.length === 0) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const { college_id, batch, subject_id, topic_id, page, limit, search, active_filter, inactive_filter } = req.query;

    if (isFacilitator && subject_id && !subjectIds.includes(subject_id)) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const sLimit = Math.min(parseInt(limit, 10) || 20, 100);
    const sOffset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * sLimit;
    const colleges = await getFacilitatorCollegeIds(facilitatorId, college_id, role);
    if (!colleges.length) return res.json({ success: true, data: [], total: 0 });

    const enrolledIds = await getEnrolledStudentIds(colleges, batch, subject_id, isFacilitator ? subjectIds : null);
    if (!enrolledIds.length) return res.json({ success: true, data: [], total: 0 });

    let nameParams = [enrolledIds];
    let searchClause = '';
    
    if (search) {
      nameParams.push(`%${search}%`);
      searchClause = `AND u.full_name ILIKE $${nameParams.length}`;
    }

    const namesRes = await pool.query(
      `SELECT u.id, u.full_name, u.email FROM users u WHERE u.id = ANY($1::uuid[]) ${searchClause} ORDER BY u.full_name`,
      nameParams,
    );

    // Expected Total Quizzes Count per student
    let expectedQuizMap = new Map();
    let qParams = [enrolledIds];
    let qTopicClause = '';
    
    if (topic_id) {
      qParams.push(topic_id);
      qTopicClause = `AND t.id = $${qParams.length}::uuid`;
      const totalRes = await pool.query(`
        SELECT COUNT(DISTINCT q.id)::int as total 
        FROM quizzes q
        JOIN units un ON un.id = q.unit_id
        WHERE un.topic_id = $1::uuid
      `, [topic_id]);
      const total = totalRes.rows[0].total || 0;
      enrolledIds.forEach(id => expectedQuizMap.set(id, total));
    } else if (subject_id) {
      qParams.push(subject_id);
      qTopicClause = `AND t.subject_id = $${qParams.length}::uuid`;
      const totalRes = await pool.query(`
        SELECT COUNT(DISTINCT q.id)::int as total 
        FROM quizzes q
        JOIN units un ON un.id = q.unit_id
        JOIN topics t ON t.id = un.topic_id
        WHERE t.subject_id = $1::uuid
      `, [subject_id]);
      const total = totalRes.rows[0].total || 0;
      enrolledIds.forEach(id => expectedQuizMap.set(id, total));
    } else {
      const persParams = [enrolledIds];
      let persSubjectClause = '';
      if (isFacilitator) {
        persParams.push(subjectIds);
        persSubjectClause = `AND s.id = ANY($2::uuid[])`;
      }
      const personalizedRes = await pool.query(`
        SELECT us.user_id as student_id, COUNT(DISTINCT q.id)::int as expected_total
        FROM user_subjects us
        JOIN subjects s ON s.id = us.subject_id
        JOIN topics t ON t.subject_id = s.id
        JOIN units un ON un.topic_id = t.id
        JOIN quizzes q ON q.unit_id = un.id
        WHERE us.user_id = ANY($1::uuid[]) ${persSubjectClause}
        GROUP BY us.user_id
      `, persParams);
      personalizedRes.rows.forEach(r => expectedQuizMap.set(r.student_id, r.expected_total));
    }

    // Quiz attempts per student
    const quizRes = await pool.query(`
        SELECT qa.user_id as student_id, COUNT(DISTINCT qa.quiz_id)::int as submitted_count
        FROM quiz_attempts qa
        JOIN quizzes q ON q.id = qa.quiz_id
        JOIN units un ON un.id = q.unit_id
        JOIN topics t ON t.id = un.topic_id
        WHERE qa.user_id = ANY($1::uuid[]) ${qTopicClause}
        GROUP BY qa.user_id
      `, qParams);
    const quizSubmittedMap = new Map(quizRes.rows.map((r) => [r.student_id, r.submitted_count]));

    // Expected Total Assignments Count per student (Curriculum Assignments)
    let expectedMap = new Map();
    let asgParams = [enrolledIds];
    let aTopicClause = '';
    
    if (topic_id) {
      asgParams.push(topic_id);
      aTopicClause = `AND t.id = $${asgParams.length}::uuid`;
      // Expected total is just the count of assignments for this topic.
      const totalRes = await pool.query(`
        SELECT COUNT(DISTINCT a.id)::int as total 
        FROM assignments a
        JOIN units un ON un.id = a.unit_id
        WHERE un.topic_id = $1::uuid
      `, [topic_id]);
      const total = totalRes.rows[0].total || 0;
      enrolledIds.forEach(id => expectedMap.set(id, total));
    } else if (subject_id) {
      asgParams.push(subject_id);
      aTopicClause = `AND t.subject_id = $${asgParams.length}::uuid`;
      // Expected total is just the count of assignments for this subject.
      const totalRes = await pool.query(`
        SELECT COUNT(DISTINCT a.id)::int as total 
        FROM assignments a
        JOIN units un ON un.id = a.unit_id
        JOIN topics t ON t.id = un.topic_id
        WHERE t.subject_id = $1::uuid
      `, [subject_id]);
      const total = totalRes.rows[0].total || 0;
      enrolledIds.forEach(id => expectedMap.set(id, total));
    } else {
      // "All Subjects" selected. Calculate personalized expected total per student based on their enrollments.
      const persParams = [enrolledIds];
      let persSubjectClause = '';
      if (isFacilitator) {
        persParams.push(subjectIds);
        persSubjectClause = `AND s.id = ANY($2::uuid[])`;
      }
      const personalizedRes = await pool.query(`
        SELECT us.user_id as student_id, COUNT(DISTINCT a.id)::int as expected_total
        FROM user_subjects us
        JOIN subjects s ON s.id = us.subject_id
        JOIN topics t ON t.subject_id = s.id
        JOIN units un ON un.topic_id = t.id
        JOIN assignments a ON a.unit_id = un.id
        WHERE us.user_id = ANY($1::uuid[]) ${persSubjectClause}
        GROUP BY us.user_id
      `, persParams);
      personalizedRes.rows.forEach(r => expectedMap.set(r.student_id, r.expected_total));
    }

    // Assignment submissions per student
    let asgQuery = `
      SELECT cas.user_id as student_id, COUNT(DISTINCT cas.assignment_id)::int as submitted_count
      FROM assignment_submissions cas
      JOIN assignments a ON a.id = cas.assignment_id
      JOIN units un ON un.id = a.unit_id
      JOIN topics t ON t.id = un.topic_id
      WHERE cas.user_id = ANY($1::uuid[]) ${aTopicClause}
      GROUP BY cas.user_id
    `;
    const asgRes = await pool.query(asgQuery, asgParams);
    const asgSubmittedMap = new Map(asgRes.rows.map(r => [r.student_id, r.submitted_count]));

    // College assignments (ad-hoc, not tied to a subject/topic)
    const collegeAsgTotalParams = [colleges];
    let caFacilitatorClause = '';
    if (isFacilitator) {
      collegeAsgTotalParams.push(facilitatorId, subjectIds);
      caFacilitatorClause = `AND (
        created_by = $2 
        OR course IN (SELECT id::text FROM subjects WHERE id = ANY($3::uuid[]))
        OR course IN (SELECT slug FROM subjects WHERE id = ANY($3::uuid[]))
        OR course IN (SELECT name FROM subjects WHERE id = ANY($3::uuid[]))
      )`;
    }
    const collegeAsgTotalRes = await pool.query(
      `SELECT COUNT(*)::int as total FROM college_assignments WHERE college_id = ANY($1::uuid[]) AND is_deleted = false ${caFacilitatorClause}`,
      collegeAsgTotalParams,
    );
    const collegeAsgTotal = collegeAsgTotalRes.rows[0]?.total || 0;

    const collegeAsgParams = [enrolledIds, colleges];
    let caSubFacilitatorClause = '';
    if (isFacilitator) {
      collegeAsgParams.push(facilitatorId, subjectIds);
      caSubFacilitatorClause = `AND (
        ca.created_by = $3 
        OR ca.course IN (SELECT id::text FROM subjects WHERE id = ANY($4::uuid[]))
        OR ca.course IN (SELECT slug FROM subjects WHERE id = ANY($4::uuid[]))
        OR ca.course IN (SELECT name FROM subjects WHERE id = ANY($4::uuid[]))
      )`;
    }
    const collegeAsgRes = await pool.query(
      `SELECT cas.student_id, COUNT(DISTINCT cas.assignment_id)::int as submitted_count
       FROM college_assignment_submissions cas
       JOIN college_assignments ca ON ca.id = cas.assignment_id AND ca.is_deleted = false
       WHERE cas.student_id = ANY($1::uuid[]) AND ca.college_id = ANY($2::uuid[]) ${caSubFacilitatorClause}
       GROUP BY cas.student_id`,
      collegeAsgParams,
    );
    const collegeAsgSubmittedMap = new Map(collegeAsgRes.rows.map((r) => [r.student_id, r.submitted_count]));

    // Expected Total Projects Count per student
    let expectedProjMap = new Map();
    let pParams = [enrolledIds];
    let pTopicClause = '';
    
    const hasSpecificTopic = topic_id && topic_id !== 'all' && topic_id.trim() !== '' && UUID_RE.test(topic_id.trim());
    const hasSpecificSubject = subject_id && subject_id !== 'all' && subject_id.trim() !== '' && UUID_RE.test(subject_id.trim());

    if (hasSpecificTopic) {
      pParams.push(topic_id.trim());
      pTopicClause = `AND t.id = $${pParams.length}::uuid`;
      const totalRes = await pool.query(`
        SELECT COUNT(DISTINCT p.id)::int as total 
        FROM projects p
        WHERE p.topic_id = $1::uuid
      `, [topic_id.trim()]);
      const total = totalRes.rows[0].total || 0;
      enrolledIds.forEach(id => expectedProjMap.set(id, total));
    } else if (hasSpecificSubject) {
      pParams.push(subject_id.trim());
      pTopicClause = `AND t.subject_id = $${pParams.length}::uuid`;
      const totalRes = await pool.query(`
        SELECT COUNT(DISTINCT p.id)::int as total 
        FROM projects p
        JOIN topics t ON t.id = p.topic_id
        WHERE t.subject_id = $1::uuid
      `, [subject_id.trim()]);
      const total = totalRes.rows[0].total || 0;
      enrolledIds.forEach(id => expectedProjMap.set(id, total));
    } else {
      const persParams = [enrolledIds];
      let persSubjectClause = '';
      if (isFacilitator) {
        persParams.push(subjectIds);
        persSubjectClause = `AND s.id = ANY($2::uuid[])`;
      }
      const personalizedRes = await pool.query(`
        SELECT us.user_id as student_id, COUNT(DISTINCT p.id)::int as expected_total
        FROM user_subjects us
        JOIN subjects s ON s.id = us.subject_id
        JOIN topics t ON t.subject_id = s.id
        JOIN projects p ON p.topic_id = t.id
        WHERE us.user_id = ANY($1::uuid[]) ${persSubjectClause}
        GROUP BY us.user_id
      `, persParams);
      personalizedRes.rows.forEach(r => expectedProjMap.set(r.student_id, r.expected_total));
    }

    // Project submissions per student
    let pQuery = `
      SELECT ps.user_id as student_id, COUNT(DISTINCT ps.project_id)::int as submitted_count
      FROM project_submissions ps
      JOIN projects p ON p.id = ps.project_id
      JOIN topics t ON t.id = p.topic_id
      WHERE ps.user_id = ANY($1::uuid[]) ${pTopicClause}
      GROUP BY ps.user_id
    `;
    const projRes = await pool.query(pQuery, pParams);
    const projSubmittedMap = new Map(projRes.rows.map(r => [r.student_id, r.submitted_count]));

    // Fetch Unified Last Activity Timestamps across all 7 action surfaces
    const activityRes = await pool.query(
      `SELECT active_actions.user_id, MAX(active_actions.activity_date) AS last_active_at
       FROM (
         SELECT user_id, completed_at AS activity_date FROM public.user_subtopic_progress WHERE user_id = ANY($1::uuid[]) AND completed_at IS NOT NULL
         UNION ALL
         SELECT user_id, COALESCE(attempted_at, created_at) AS activity_date FROM public.quiz_attempts WHERE user_id = ANY($1::uuid[]) AND (attempted_at IS NOT NULL OR created_at IS NOT NULL)
         UNION ALL
         SELECT user_id, submitted_at AS activity_date FROM public.exercise_submissions WHERE user_id = ANY($1::uuid[]) AND submitted_at IS NOT NULL
         UNION ALL
         SELECT user_id, submitted_at AS activity_date FROM public.assignment_submissions WHERE user_id = ANY($1::uuid[]) AND submitted_at IS NOT NULL
         UNION ALL
         SELECT user_id, submitted_at AS activity_date FROM public.project_submissions WHERE user_id = ANY($1::uuid[]) AND submitted_at IS NOT NULL
         UNION ALL
         SELECT student_id AS user_id, COALESCE(submitted_at, updated_at) AS activity_date FROM public.college_assignment_submissions WHERE student_id = ANY($1::uuid[]) AND (submitted_at IS NOT NULL OR updated_at IS NOT NULL)
         UNION ALL
         SELECT user_id, last_activity::timestamptz AS activity_date FROM public.user_streaks WHERE user_id = ANY($1::uuid[]) AND last_activity IS NOT NULL
       ) active_actions
       GROUP BY active_actions.user_id`,
      [enrolledIds],
    );
    const lastActiveMap = new Map(activityRes.rows.map((r) => [r.user_id, r.last_active_at]));

    let data = namesRes.rows.map((s) => {
      const lastActive = lastActiveMap.get(s.id) || null;
      return {
        id: s.id,
        name: s.full_name,
        email: s.email,
        last_active_at: lastActive,
        quiz_submitted_count: quizSubmittedMap.get(s.id) || 0,
        quiz_total_count: expectedQuizMap.get(s.id) || 0,
        assignment_submitted_count: (asgSubmittedMap.get(s.id) || 0) + (collegeAsgSubmittedMap.get(s.id) || 0),
        assignment_total_count: (expectedMap.get(s.id) || 0) + collegeAsgTotal,
        project_submitted_count: projSubmittedMap.get(s.id) || 0,
        project_total_count: expectedProjMap.get(s.id) || 0,
      };
    });

    // Apply Active / Inactive Filtering (In-Memory on Full Cohort)
    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    if (active_filter && active_filter !== 'all') {
      if (active_filter === 'overall') {
        data = data.filter((s) => s.last_active_at !== null || s.quiz_submitted_count > 0 || s.assignment_submitted_count > 0 || s.project_submitted_count > 0);
      } else {
        const days = parseInt(active_filter, 10);
        if (!isNaN(days) && days > 0) {
          const threshold = now - days * MS_PER_DAY;
          data = data.filter((s) => s.last_active_at && new Date(s.last_active_at).getTime() >= threshold);
        }
      }
    } else if (inactive_filter && inactive_filter !== 'all') {
      if (inactive_filter === 'never') {
        data = data.filter((s) => s.last_active_at === null && s.quiz_submitted_count === 0 && s.assignment_submitted_count === 0 && s.project_submitted_count === 0);
      } else {
        const days = parseInt(inactive_filter, 10);
        if (!isNaN(days) && days > 0) {
          const threshold = now - days * MS_PER_DAY;
          data = data.filter((s) => !s.last_active_at || new Date(s.last_active_at).getTime() < threshold);
        }
      }
    }

    const aggregates = {
      quizzes_attempted: data.filter((s) => s.quiz_submitted_count > 0).length,
      assignments_submitted: data.filter((s) => s.assignment_submitted_count > 0).length,
      projects_completed: data.filter((s) => s.project_submitted_count > 0).length,
    };

    res.json({ 
      success: true, 
      data: data.slice(sOffset, sOffset + sLimit), 
      total: data.length, 
      aggregates 
    });
  } catch (err) {
    serverError(res, err, 'getStudentAnalytics');
  }
};

/**
 * SOFT DELETE STUDENT (Move to Recycle Bin)
 */
exports.deleteStudent = async (req, res) => {
  try {
    const facilitatorId = req.user.id;
    const { id } = req.params;
    
    // Verify access
    const colRes = await pool.query('SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false', [facilitatorId]);
    const collegeIds = colRes.rows.map(r => r.college_id);
    const accessCheck = await pool.query(
      `SELECT 1 FROM student_profiles sp
        JOIN users u ON u.id = sp.user_id
       WHERE sp.user_id = $1 AND sp.college_id = ANY($2::uuid[]) AND u.role_id = (SELECT id FROM roles WHERE role_key = 'STUDENT')`,
      [id, collegeIds]
    );
    if (accessCheck.rowCount === 0) {
      return res.status(403).json({ message: 'Access denied. You can only delete your students.' });
    }
    await pool.query(`UPDATE users SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE id = $2`, [facilitatorId, id]);
    res.json({ success: true, message: 'Student moved to recycle bin' });
  } catch (err) {
    serverError(res, err, 'deleteStudent');
  }
};

/**
 * RESTORE STUDENT
 */
exports.restoreStudent = async (req, res) => {
  try {
    const facilitatorId = req.user.id;
    const { id } = req.params;
    
    const colRes = await pool.query('SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false', [facilitatorId]);
    const collegeIds = colRes.rows.map(r => r.college_id);
    const accessCheck = await pool.query(
      `SELECT u.email, u.full_name FROM users u
       JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1 AND sp.college_id = ANY($2::uuid[])`,
      [id, collegeIds]
    );
    if (accessCheck.rowCount === 0) {
      return res.status(403).json({ message: 'Access denied or student not found in your assigned colleges' });
    }

    const student = accessCheck.rows[0];
    if (student.email) {
      const conflict = await pool.query(
        `SELECT id, full_name, email FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND deleted_at IS NULL AND id != $2`,
        [student.email, id]
      );
      if (conflict.rowCount > 0) {
        const existing = conflict.rows[0];
        return res.status(400).json({
          message: `Cannot restore "${student.full_name || student.email}" because another active account (${existing.full_name || existing.email}) is already using this email address.`
        });
      }
    }

    await pool.query(`UPDATE users SET deleted_at = NULL, deleted_by = NULL WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Student restored successfully' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ 
        message: 'Cannot restore this student because another active account is already using this email address.' 
      });
    }
    serverError(res, err, 'restoreStudent');
  }
};

/**
 * PERMANENT DELETE STUDENT
 */
exports.permanentDeleteStudent = async (req, res) => {
  try {
    const facilitatorId = req.user.id;
    const { id } = req.params;
    
    const colRes = await pool.query('SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false', [facilitatorId]);
    const collegeIds = colRes.rows.map(r => r.college_id);
    const accessCheck = await pool.query(
      `SELECT 1 FROM student_profiles sp WHERE sp.user_id = $1 AND sp.college_id = ANY($2::uuid[])`,
      [id, collegeIds]
    );
    if (accessCheck.rowCount === 0) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const check = await pool.query(`SELECT id FROM users WHERE id = $1 AND deleted_at IS NOT NULL`, [id]);
    if (check.rowCount === 0) {
      return res.status(404).json({ message: 'Student must be in recycle bin to be permanently deleted' });
    }
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Student permanently deleted' });
  } catch (err) {
    serverError(res, err, 'permanentDeleteStudent');
  }
};

/**
 * GET RECYCLE BIN (Facilitator)
 */
exports.getRecycleBin = async (req, res) => {
  try {
    const facilitatorId = req.user.id;
    const colRes = await pool.query('SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false', [facilitatorId]);
    const collegeIds = colRes.rows.map(r => r.college_id);
    
    if (collegeIds.length === 0) return res.json({ success: true, data: [] });
    
    const query = `
      SELECT u.id, u.full_name, u.email, 'student' as role, u.deleted_at, db.full_name AS deleted_by_name
      FROM users u
      JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN users db ON db.id = u.deleted_by
      WHERE u.deleted_at IS NOT NULL AND sp.college_id = ANY($1::uuid[])
      ORDER BY u.deleted_at DESC
    `;
    const result = await pool.query(query, [collegeIds]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    serverError(res, err, 'getRecycleBin');
  }
};
