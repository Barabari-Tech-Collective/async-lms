const serverError = require('../utils/serverError');
const pool = require('../config/pg');
const { logAction } = require('../utils/auditLogger');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');
const http = require('http');
const slugify = require('../utils/slugify');
const { presignS3Url } = require('../utils/s3');

/**
 * Strip executable test code before sending an exercise to a student.
 * `test_code` contains the expected answers, and hidden tests must not be
 * readable at all. Tests run server-side, so the client never needs the code.
 */
const publicTestCases = (testCases) =>
  Array.isArray(testCases)
    ? testCases.map((tc) => ({
        id: tc.id,
        description: tc.is_hidden ? 'Hidden test' : tc.description,
        is_hidden: !!tc.is_hidden,
      }))
    : testCases;

const publicTasks = (tasks) =>
  Array.isArray(tasks)
    ? tasks.map(({ reference_solution, ...t }) => ({
        // reference_solution is the author's worked answer, kept only for
        // authoring-time test verification — never send it to a student.
        ...t,
        test_cases: publicTestCases(t.test_cases),
      }))
    : tasks;

const fetchTextFromUrl = (url) =>
  new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Failed to fetch markdown: ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString('utf8');
        });
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });

// Minimum number of attempts a student must make on a quiz before answer
// explanations are revealed — prevents leaking answers to a struggling student.
const MIN_ATTEMPTS_FOR_EXPLANATION = 3;

// Attaches each quiz's most recent attempt (if any) by this user as `last_attempt`,
// and strips question explanations for students who haven't attempted the quiz
// MIN_ATTEMPTS_FOR_EXPLANATION times yet.
async function attachLastAttempts(quizzes, userId, userRole) {
  if (quizzes.length === 0) return quizzes;
  if (!userId) {
    // No authenticated user — never reveal explanations.
    return quizzes.map((q) => ({
      ...q,
      last_attempt: null,
      questions: q.questions?.map((qu) => ({ ...qu, explanation: null })),
    }));
  }

  const quizIds = quizzes.map((q) => q.id);
  const { rows } = await pool.query(
    `SELECT quiz_id,
            COUNT(*) AS attempt_count,
            (ARRAY_AGG(score ORDER BY attempted_at DESC))[1] AS score,
            (ARRAY_AGG(is_passed ORDER BY attempted_at DESC))[1] AS is_passed,
            (ARRAY_AGG(attempted_at ORDER BY attempted_at DESC))[1] AS attempted_at
     FROM quiz_attempts
     WHERE user_id = $1 AND quiz_id = ANY($2::uuid[])
     GROUP BY quiz_id`,
    [userId, quizIds],
  );

  const attemptsByQuiz = new Map(rows.map((r) => [r.quiz_id, r]));
  return quizzes.map((q) => {
    const attempt = attemptsByQuiz.get(q.id);
    const attemptCount = attempt ? parseInt(attempt.attempt_count, 10) : 0;
    // Non-students (facilitators/admins previewing content) always see explanations.
    const canSeeExplanation =
      userRole !== 'student' || attemptCount >= MIN_ATTEMPTS_FOR_EXPLANATION;

    return {
      ...q,
      last_attempt: attempt
        ? {
            score: attempt.score,
            is_passed: attempt.is_passed,
            attempted_at: attempt.attempted_at,
          }
        : null,
      questions: q.questions?.map((qu) => ({
        ...qu,
        explanation: canSeeExplanation ? qu.explanation : null,
      })),
    };
  });
}

// Get subjects for the dropdown switcher — drafts included only for admin/facilitator,
// Get subjects for the dropdown switcher — drafts included only for admin/facilitator,
// students only ever see published subjects. Facilitators only see assigned subjects.
exports.getSubjectsDropdown = async (req, res) => {
  try {
    const isFacilitator = req.user?.role === 'facilitator';
    const isAdmin = req.user?.role === 'admin';
    const canSeeDrafts = isAdmin || isFacilitator;
    const facilitatorSubjectIds = req.user?.subject_ids || [];

    if (isFacilitator && facilitatorSubjectIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const params = [];
    let facilitatorClause = '';
    if (isFacilitator) {
      params.push(facilitatorSubjectIds);
      facilitatorClause = `AND s.id = ANY($${params.length}::uuid[])`;
    }

    const { rows } = await pool.query(`
      SELECT s.*,
             COUNT(DISTINCT t.id)::int as topics_count,
             COUNT(DISTINCT st.id)::int as units_count
      FROM subjects s
      LEFT JOIN topics t ON s.id = t.subject_id
      LEFT JOIN units u ON t.id = u.topic_id
      LEFT JOIN subtopics st ON u.id = st.unit_id
      WHERE s.is_deleted = false ${facilitatorClause} ${canSeeDrafts ? '' : 'AND s.is_published = true'}
      GROUP BY s.id
      ORDER BY s.order_index ASC
    `, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error | getSubjectsDropdown:', err);
    res.status(500).json({ message: 'Error fetching subjects' });
  }
};

// 1. Get all published subjects
exports.getAllSubjects = async (req, res) => {
  try {
    // Note: We use order_index to keep your curated order
    const { rows } = await pool.query(`
      SELECT s.*,
             COUNT(DISTINCT t.id)::int as topics_count,
             COUNT(DISTINCT st.id)::int as units_count
      FROM subjects s
      LEFT JOIN topics t ON s.id = t.subject_id
      LEFT JOIN units u ON t.id = u.topic_id
      LEFT JOIN subtopics st ON u.id = st.unit_id
      WHERE s.is_deleted = false
      GROUP BY s.id
      ORDER BY s.order_index ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error | getAllSubjects:', err);
    res.status(500).json({ message: 'Error fetching subjects' });
  }
};

// 2. Get all published subjects
exports.getAllPublishedSubjects = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.id, s.name, s.slug, s.description, s.level,
        (
          SELECT COUNT(st.id)
          FROM subtopics st
          JOIN units u ON st.unit_id = u.id
          JOIN topics t ON u.topic_id = t.id
          WHERE t.subject_id = s.id
        ) AS total_lessons
      FROM subjects s
      WHERE s.is_published = true AND s.is_deleted = false
      ORDER BY s.order_index ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error | getAllPublishedSubjects:', err);
    res.status(500).json({ message: 'Error fetching subjects' });
  }
};

// 2. Get a course with its nested topics, units, subtopics, and all related content
exports.getCourseStructure = async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.user?.id;

    // 1. Fetch subject
    const subjectResult = await pool.query(
      `SELECT id, name, description
       FROM subjects
       WHERE slug = $1 AND is_published = true AND is_deleted = false`,
      [slug],
    );

    if (subjectResult.rows.length === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const subject = subjectResult.rows[0];

    // Facilitator isolation: Facilitator can only access subjects assigned to them
    if (req.user?.role === 'facilitator') {
      const subjectIds = req.user.subject_ids || [];
      if (!subjectIds.includes(subject.id)) {
        return res.status(403).json({ message: 'Access denied: You are not assigned to this subject' });
      }
    }

    // 2. Fetch full structure
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
        CASE WHEN
          -- Fast path: user_subtopic_progress explicitly marks it done
          COALESCE(usp.is_completed, false) = true
          OR (
            -- Fallback: all published lessons in this subtopic are completed by the user
            EXISTS (
              SELECT 1 FROM lesson_content lc2
              WHERE lc2.subtopic_id = st.id
                AND lc2.is_published = true
                AND lc2.is_deleted = false
            )
            AND NOT EXISTS (
              SELECT 1 FROM lesson_content lc2
              WHERE lc2.subtopic_id = st.id
                AND lc2.is_published = true
                AND lc2.is_deleted = false
                AND NOT EXISTS (
                  SELECT 1 FROM user_lesson_progress ulp2
                  WHERE ulp2.lesson_content_id = lc2.id
                    AND ulp2.user_id = $2
                    AND ulp2.is_completed = true
                )
            )
          )
        THEN true ELSE false END AS subtopic_is_completed,

        -- Lesson Content (published only)
        lc.id AS lesson_id,
        lc.content_type AS lesson_type,
        lc.markdown_path AS lesson_path,
        lc.estimated_read_time AS lesson_read_time,
        lc.version AS lesson_version,
        lc.video_url AS lesson_video_url,
        COALESCE(ulp.is_completed, false) AS lesson_is_completed,

        -- Quiz (presence only — questions/options fetched on demand via /subjects/quiz/:id)
        q.id AS quiz_id,
        q.passing_score AS quiz_passing_score,
        q.max_score AS quiz_max_score,
        (
          SELECT EXISTS(
            SELECT 1 FROM quiz_attempts qa
            WHERE qa.quiz_id = q.id AND qa.user_id = $2 AND qa.is_passed = true
          )
        ) AS quiz_is_passed,

        -- Exercise (subtopic-level)
        e.id AS exercise_id,
        e.title AS exercise_title,
        e.instructions AS exercise_instructions,
        e.max_score AS exercise_max_score,

        -- Assignment (unit-level)
        a.id AS assignment_id,
        a.title AS assignment_title,
        a.instructions AS assignment_instructions,
        a.max_score AS assignment_max_score,
        (
          SELECT EXISTS(
            SELECT 1 FROM assignment_submissions asub
            WHERE asub.assignment_id = a.id AND asub.user_id = $2
          )
        ) AS assignment_is_submitted,

        -- Capstone (topic-level)
        p.id AS capstone_id,
        p.title AS capstone_title,
        p.instructions AS capstone_instructions,
        p.max_score AS capstone_max_score

      FROM topics t
      LEFT JOIN projects p ON t.id = p.topic_id AND p.is_deleted = false
      LEFT JOIN units u ON t.id = u.topic_id AND u.is_deleted = false
      LEFT JOIN subtopics st ON u.id = st.unit_id AND st.is_deleted = false
      LEFT JOIN user_subtopic_progress usp ON usp.subtopic_id = st.id AND usp.user_id = $2
      LEFT JOIN lesson_content lc
        ON st.id = lc.subtopic_id AND lc.is_published = true AND lc.is_deleted = false
      LEFT JOIN user_lesson_progress ulp
        ON ulp.lesson_content_id = lc.id AND ulp.user_id = $2
      LEFT JOIN quizzes q ON u.id = q.unit_id AND q.is_deleted = false
      LEFT JOIN exercises e ON st.id = e.subtopic_id AND e.is_deleted = false
      LEFT JOIN assignments a ON u.id = a.unit_id AND a.is_deleted = false

      WHERE t.subject_id = $1 AND t.is_deleted = false
      ORDER BY
        t.order_index,
        u.order_index,
        st.order_index;
    `;

    const { rows } = await pool.query(query, [subject.id, userId ?? null]);

    // 3. Build hierarchy safely
    const topicsMap = new Map();

    rows.forEach((row) => {
      // Topic
      if (!topicsMap.has(row.topic_id)) {
        topicsMap.set(row.topic_id, {
          id: row.topic_id,
          title: row.topic_title,
          description: row.topic_description,
          order_index: row.topic_order,
          capstone: row.capstone_id
            ? { id: row.capstone_id, title: row.capstone_title, instructions: row.capstone_instructions, max_score: row.capstone_max_score }
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
          is_completed: !!row.subtopic_is_completed,
          lesson_content: [],
          exercises: [],
        });
      }

      const subtopic = unit ? unit.subtopics.get(row.subtopic_id) : null;

      // Lesson Content
      if (row.lesson_id && subtopic) {
        if (!subtopic.lesson_content.some((l) => l.id === row.lesson_id)) {
          subtopic.lesson_content.push({
            id: row.lesson_id,
            content_type: row.lesson_type,
            markdown_path: row.lesson_path,
            estimated_read_time: row.lesson_read_time,
            version: row.lesson_version,
            video_url: row.lesson_video_url,
          });
        }
      }

      // Quiz (presence only)
      if (row.quiz_id && unit) {
        if (!unit.quizzes.has(row.quiz_id)) {
          unit.quizzes.set(row.quiz_id, {
            id: row.quiz_id,
            passing_score: row.quiz_passing_score,
            max_score: row.quiz_max_score,
            is_passed: row.quiz_is_passed || false,
          });
        }
      }

      // Exercise (subtopic-level)
      if (row.exercise_id && subtopic) {
        if (!subtopic.exercises.some((e) => e.id === row.exercise_id)) {
          subtopic.exercises.push({
            id: row.exercise_id,
            title: row.exercise_title,
            instructions: row.exercise_instructions,
            max_score: row.exercise_max_score,
          });
        }
      }

      // Assignment (unit-level)
      if (row.assignment_id && unit) {
        if (!unit.assignments.some((a) => a.id === row.assignment_id)) {
          unit.assignments.push({
            id: row.assignment_id,
            title: row.assignment_title,
            instructions: row.assignment_instructions,
            max_score: row.assignment_max_score,
            is_submitted: row.assignment_is_submitted || false,
          });
        }
      }
    });

    // 4. Convert Maps → Arrays
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
        assignments: unit.assignments || [],
        quizzes: Array.from(unit.quizzes.values()),
        subtopics: Array.from(unit.subtopics.values()).map((sub) => ({
          ...sub,
        })),
      })),
    }));

    res.json({
      success: true,
      id: subject.id,
      name: subject.name,
      description: subject.description,
      data: structure,
    });
  } catch (err) {
    console.error('Error | getCourseStructure:', err);
    res.status(500).json({ message: 'Error fetching course structure' });
  }
};

// 3. Get content for a specific subtopic
exports.getSubtopicContent = async (req, res) => {
  try {
    const { subtopicSlug } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    let lessonCompleted = false;

    const subtopicResult = await pool.query(
      `SELECT id FROM subtopics WHERE slug = $1 AND is_deleted = false LIMIT 1`,
      [subtopicSlug],
    );

    if (subtopicResult.rows.length === 0) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    const subtopicId = subtopicResult.rows[0].id;

    if (userRole === 'facilitator') {
      const subjectIds = req.user.subject_ids || [];
      const subCheck = await pool.query(
        `SELECT t.subject_id FROM subtopics st
         JOIN units u ON st.unit_id = u.id
         JOIN topics t ON u.topic_id = t.id
         WHERE st.id = $1`,
        [subtopicId],
      );
      if (subCheck.rows.length === 0 || !subjectIds.includes(subCheck.rows[0].subject_id)) {
        return res.status(403).json({ message: 'Access denied: You are not assigned to this subject' });
      }
    }

    if (userRole === 'student') {
      const lockCheck = await pool.query(
        `
          SELECT is_unlocked
          FROM user_subtopic_progress
          WHERE user_id = $1 AND subtopic_id = $2
          LIMIT 1;
        `,
        [userId, subtopicId],
      );

      if (lockCheck.rows[0]?.is_unlocked === false) {
        return res.status(403).json({
          success: false,
          message: 'This subtopic is locked by your admin.',
        });
      }
    }

    if (userRole === 'student') {
      const completionResult = await pool.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM user_lesson_progress ulp
            INNER JOIN lesson_content lc ON lc.id = ulp.lesson_content_id
            WHERE ulp.user_id = $1
              AND lc.subtopic_id = $2
              AND ulp.is_completed = true
              AND lc.is_published = true
          ) AS lesson_completed
        `,
        [userId, subtopicId],
      );
      lessonCompleted = completionResult.rows[0]?.lesson_completed || false;
    }

    const query = `
      SELECT
        st.id AS subtopic_id,
        st.slug AS subtopic_slug,
        st.title AS subtopic_title,
        st.description AS subtopic_description,

        lc.id AS lesson_id,
        lc.content_type,
        lc.markdown_path,
        lc.estimated_read_time,
        lc.version AS lesson_version,
        lc.video_url,

        q.id AS quiz_id,
        q.passing_score,
        q.max_score,

        qq.id AS question_id,
        qq.question_text,
        qq.question_type,
        qq.points,
        qq.order_index AS question_order,
        qq.explanation,

        qo.id AS option_id,
        qo.option_text,
        qo.order_index AS option_order,

        e.id AS exercise_id,
        e.title AS exercise_title,
        e.instructions,
        e.max_score AS exercise_max_score,
        e.language AS exercise_language,
        e.initial_files AS exercise_initial_files,
        e.test_cases AS exercise_test_cases,
        e.tasks AS exercise_tasks

      FROM subtopics st
      LEFT JOIN lesson_content lc
        ON lc.subtopic_id = st.id AND lc.is_published = true AND lc.is_deleted = false
      LEFT JOIN quizzes q ON q.unit_id = (SELECT unit_id FROM subtopics WHERE slug = $1) AND q.is_deleted = false
      LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id AND qq.is_deleted = false
      LEFT JOIN quiz_question_options qo ON qo.question_id = qq.id AND qo.is_deleted = false
      LEFT JOIN exercises e ON e.subtopic_id = st.id AND e.is_deleted = false

      WHERE st.slug = $1 AND st.is_deleted = false
      ORDER BY qq.order_index, qo.order_index
    `;

    const { rows } = await pool.query(query, [subtopicSlug]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    // ---- Build response ----
    const base = rows[0];
    const lessonRows = rows.filter((r) => r.lesson_id);
    const markdownRow = lessonRows
      .filter((r) => r.content_type === 'markdown')
      .sort((a, b) => (b.lesson_version || 0) - (a.lesson_version || 0))[0];
    const videoRow =
      lessonRows.find((r) => r.video_url) ||
      lessonRows.find((r) => r.content_type === 'video');

    // Read markdown — three sources: inline AI content, remote URL, or local file
    let markdownContent = '';
    if (markdownRow?.markdown_path) {
      try {
        if (markdownRow.markdown_path.startsWith('ai-generated:')) {
          markdownContent = markdownRow.markdown_path.slice('ai-generated:'.length);
        } else if (markdownRow.markdown_path.startsWith('http')) {
          const fetchUrl = await presignS3Url(markdownRow.markdown_path);
          markdownContent = await fetchTextFromUrl(fetchUrl);
        } else {
          const relativePath = markdownRow.markdown_path.replace(/^\/+/, '');
          const filePath = path.join(__dirname, '..', 'data', relativePath);
          markdownContent = await fs.readFile(filePath, 'utf8');
        }
      } catch (err) {
        console.error('[lesson-content] Failed to load markdown');
        console.error('  subtopic_id :', base?.subtopic_id ?? 'unknown');
        console.error('  lesson_id   :', markdownRow?.lesson_id ?? 'unknown');
        console.error('  path        :', markdownRow?.markdown_path);
        console.error('  error       :', err.message);
        markdownContent = markdownRow.markdown_path.startsWith('http')
          ? '_Lesson content is temporarily unavailable. Please try again later._'
          : '';
      }
    }

    const quizzesMap = new Map();
    const exercisesMap = new Map();

    rows.forEach((row) => {
      // Quiz
      if (row.quiz_id) {
        if (!quizzesMap.has(row.quiz_id)) {
          quizzesMap.set(row.quiz_id, {
            id: row.quiz_id,
            passing_score: row.passing_score,
            max_score: row.max_score,
            questions: new Map(),
          });
        }

        const quiz = quizzesMap.get(row.quiz_id);

        // Question
        if (row.question_id) {
          if (!quiz.questions.has(row.question_id)) {
            quiz.questions.set(row.question_id, {
              id: row.question_id,
              question_text: row.question_text,
              question_type: row.question_type,
              points: row.points,
              explanation: row.explanation,
              options: [],
            });
          }

          const question = quiz.questions.get(row.question_id);

          if (row.option_id) {
            question.options.push({
              id: row.option_id,
              option_text: row.option_text,
            });
          }
        }
      }

      // Exercise
      if (row.exercise_id && !exercisesMap.has(row.exercise_id)) {
        exercisesMap.set(row.exercise_id, {
          id: row.exercise_id,
          title: row.exercise_title,
          instructions: row.instructions,
          max_score: row.exercise_max_score,
          language: row.exercise_language,
          initial_files: row.exercise_initial_files,
          test_cases: publicTestCases(row.exercise_test_cases),
          tasks: publicTasks(row.exercise_tasks),
        });
      }
    });

    res.json({
      success: true,
      data: {
        subtopic: {
          id: base.subtopic_id,
          slug: base.subtopic_slug,
          title: base.subtopic_title,
          description: base.subtopic_description,
        },
        lesson: {
          id: markdownRow?.lesson_id || videoRow?.lesson_id || null,
          content_type: base.content_type,
          markdown_content: markdownContent,
          read_time:
            markdownRow?.estimated_read_time ??
            videoRow?.estimated_read_time ??
            null,
          video_url: videoRow?.video_url || null,
        },
        lesson_completed: lessonCompleted,
        quizzes: await attachLastAttempts(
          Array.from(quizzesMap.values()).map((q) => ({
            ...q,
            questions: Array.from(q.questions.values()),
          })),
          userId,
          userRole,
        ),
        exercises: Array.from(exercisesMap.values()),
      },
    });
  } catch (err) {
    console.error('Error | getLessonContent:', err);
    res.status(500).json({ message: 'Failed to load lesson' });
  }
};

// 4. Create a new subject
exports.createSubject = async (req, res) => {
  const { name, slug: manualSlug, description } = req.body;
  const slug = manualSlug || slugify(name);

  // Basic validation
  if (!name || !slug) {
    return res.status(400).json({
      success: false,
      message: 'Name is required.',
    });
  }

  try {
    const query = `
      INSERT INTO public.subjects (name, slug, description, is_published, order_index)
      VALUES ($1, $2, $3, true, (SELECT COALESCE(MAX(order_index), 0) + 1 FROM subjects))
      RETURNING id, name, slug, description, created_at;
    `;

    const values = [name, slug, description];
    const { rows } = await pool.query(query, values);

    logAction({ req, action: 'CREATE', entityType: 'subject', entityId: rows[0].id, details: { name, slug } });

    res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      data: rows[0],
    });
  } catch (err) {
    console.error('Error | createSubject:', err);

    // Handle unique constraint violation for the slug
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A subject with this slug already exists.',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating subject',
    });
  }
};

// Update existing subject (Edit & Publish)
exports.updateSubject = async (req, res) => {
  const { id } = req.params;
  const { name, slug: manualSlug, description, is_published } = req.body;
  const slug = manualSlug || (name ? slugify(name) : undefined);
  try {
    const query = `
      UPDATE public.subjects
      SET name = COALESCE($1, name),
          slug = COALESCE($2, slug),
          description = COALESCE($3, description),
          is_published = COALESCE($4, is_published),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *`;
    const values = [name, slug, description, is_published, id];
    const result = await pool.query(query, values);

    if (result.rowCount === 0)
      return res.status(404).json({ message: 'Subject not found' });
    logAction({ req, action: 'UPDATE', entityType: 'subject', entityId: id, details: { name, slug, is_published } });
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    serverError(res, error);
  }
};

// Delete subject (soft delete; cascades to topics/units/subtopics/lesson content/
// quizzes/exercises/assignments/projects since the schema previously relied on
// ON DELETE CASCADE for a hard delete)
exports.deleteSubject = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE public.subjects SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *',
      [id],
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Subject not found' });
    }

    await client.query(
      `UPDATE topics SET is_deleted = true WHERE subject_id = $1 AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE units SET is_deleted = true
       WHERE topic_id IN (SELECT id FROM topics WHERE subject_id = $1) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE subtopics SET is_deleted = true
       WHERE unit_id IN (
         SELECT u.id FROM units u JOIN topics t ON u.topic_id = t.id WHERE t.subject_id = $1
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE lesson_content SET is_deleted = true
       WHERE subtopic_id IN (
         SELECT st.id FROM subtopics st
         JOIN units u ON st.unit_id = u.id
         JOIN topics t ON u.topic_id = t.id
         WHERE t.subject_id = $1
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE quizzes SET is_deleted = true
       WHERE unit_id IN (
         SELECT u.id FROM units u JOIN topics t ON u.topic_id = t.id WHERE t.subject_id = $1
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE quiz_questions SET is_deleted = true
       WHERE quiz_id IN (
         SELECT q.id FROM quizzes q
         JOIN units u ON q.unit_id = u.id
         JOIN topics t ON u.topic_id = t.id
         WHERE t.subject_id = $1
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE quiz_question_options SET is_deleted = true
       WHERE question_id IN (
         SELECT qq.id FROM quiz_questions qq
         JOIN quizzes q ON qq.quiz_id = q.id
         JOIN units u ON q.unit_id = u.id
         JOIN topics t ON u.topic_id = t.id
         WHERE t.subject_id = $1
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE exercises SET is_deleted = true
       WHERE (
         subtopic_id IN (
           SELECT st.id FROM subtopics st
           JOIN units u ON st.unit_id = u.id
           JOIN topics t ON u.topic_id = t.id
           WHERE t.subject_id = $1
         )
         OR unit_id IN (
           SELECT u.id FROM units u JOIN topics t ON u.topic_id = t.id WHERE t.subject_id = $1
         )
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE assignments SET is_deleted = true
       WHERE unit_id IN (
         SELECT u.id FROM units u JOIN topics t ON u.topic_id = t.id WHERE t.subject_id = $1
       ) AND is_deleted = false`,
      [id],
    );
    await client.query(
      `UPDATE projects SET is_deleted = true WHERE topic_id IN (SELECT id FROM topics WHERE subject_id = $1) AND is_deleted = false`,
      [id],
    );

    await client.query('COMMIT');
    logAction({ req, action: 'DELETE', entityType: 'subject', entityId: id });
    res
      .status(200)
      .json({ success: true, message: 'Subject deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    serverError(res, error);
  } finally {
    client.release();
  }
};
// 5. Get a specific exercise content
exports.getExerciseContent = async (req, res) => {
  try {
    const { exerciseId } = req.params;

    const query = `
      SELECT
        e.id AS exercise_id,
        e.title AS exercise_title,
        e.instructions,
        e.max_score AS exercise_max_score,
        e.language AS exercise_language,
        e.initial_files AS exercise_initial_files,
        e.test_cases AS exercise_test_cases,
        e.tasks AS exercise_tasks,
        e.subtopic_id,
        e.unit_id,
        st.title AS subtopic_title,
        u.title AS unit_title
      FROM exercises e
      LEFT JOIN subtopics st ON e.subtopic_id = st.id
      LEFT JOIN units u ON e.unit_id = u.id
      WHERE e.id = $1 AND e.is_deleted = false
    `;

    const { rows } = await pool.query(query, [exerciseId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    const row = rows[0];

    if (req.user?.role === 'facilitator') {
      const subjectIds = req.user.subject_ids || [];
      const exCheck = await pool.query(
        `SELECT t.subject_id FROM exercises e
         LEFT JOIN subtopics st ON e.subtopic_id = st.id
         LEFT JOIN units u ON (e.unit_id = u.id OR st.unit_id = u.id)
         LEFT JOIN topics t ON u.topic_id = t.id
         WHERE e.id = $1`,
        [exerciseId],
      );
      if (exCheck.rows.length === 0 || !subjectIds.includes(exCheck.rows[0].subject_id)) {
        return res.status(403).json({ message: 'Access denied: You are not assigned to this subject' });
      }
    }

    res.json({
      success: true,
      data: {
        subtopic: {
          id: row.subtopic_id || row.unit_id,
          title: row.subtopic_title || row.unit_title,
          description: row.instructions,
        },
        lesson: {
          id: null,
          content_type: 'exercise',
          markdown_content: row.instructions,
        },
        quizzes: [],
        exercises: [
          {
            id: row.exercise_id,
            title: row.exercise_title,
            instructions: row.instructions,
            max_score: row.exercise_max_score,
            language: row.exercise_language,
            initial_files: row.exercise_initial_files,
            test_cases: publicTestCases(row.exercise_test_cases),
            tasks: publicTasks(row.exercise_tasks),
          },
        ],
      },
    });
  } catch (err) {
    console.error('Error | getExerciseContent:', err);
    res.status(500).json({ message: 'Failed to load exercise' });
  }
};
// 6. Get a specific quiz content
exports.getQuizContent = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    const query = `
      SELECT
        q.id AS quiz_id,
        q.passing_score,
        q.max_score,
        q.unit_id,
        u.title AS unit_title,
        u.description AS unit_description,
        qq.id AS question_id,
        qq.question_text,
        qq.question_type,
        qq.points,
        qq.explanation,
        qo.id AS option_id,
        qo.option_text
      FROM quizzes q
      LEFT JOIN units u ON q.unit_id = u.id
      LEFT JOIN quiz_questions qq ON q.id = qq.quiz_id AND qq.is_deleted = false
      LEFT JOIN quiz_question_options qo ON qq.id = qo.question_id AND qo.is_deleted = false
      WHERE q.id = $1 AND q.is_deleted = false
      ORDER BY qq.order_index, qo.order_index
    `;

    const { rows } = await pool.query(query, [quizId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    if (userRole === 'facilitator') {
      const subjectIds = req.user?.subject_ids || [];
      const quizCheck = await pool.query(
        `SELECT t.subject_id FROM quizzes q
         JOIN units u ON q.unit_id = u.id
         JOIN topics t ON u.topic_id = t.id
         WHERE q.id = $1`,
        [quizId],
      );
      if (quizCheck.rows.length === 0 || !subjectIds.includes(quizCheck.rows[0].subject_id)) {
        return res.status(403).json({ message: 'Access denied: You are not assigned to this subject' });
      }
    }

    const base = rows[0];
    const questionsMap = new Map();

    rows.forEach((row) => {
      if (row.question_id) {
        if (!questionsMap.has(row.question_id)) {
          questionsMap.set(row.question_id, {
            id: row.question_id,
            question_text: row.question_text,
            question_type: row.question_type,
            points: row.points,
            explanation: row.explanation,
            options: [],
          });
        }
        const question = questionsMap.get(row.question_id);
        if (row.option_id) {
          question.options.push({
            id: row.option_id,
            option_text: row.option_text,
          });
        }
      }
    });

    res.json({
      success: true,
      data: {
        subtopic: {
          id: base.unit_id,
          title: `Quiz: ${base.unit_title}`,
          description: base.unit_description,
        },
        lesson: {
          id: null,
          content_type: 'quiz',
          markdown_content: 'Please complete the quiz to proceed.',
        },
        quizzes: await attachLastAttempts(
          [
            {
              id: base.quiz_id,
              passing_score: base.passing_score,
              max_score: base.max_score,
              questions: Array.from(questionsMap.values()),
            },
          ],
          userId,
          userRole,
        ),
        exercises: [],
      },
    });
  } catch (err) {
    console.error('Error | getQuizContent:', err);
    res.status(500).json({ message: 'Failed to load quiz' });
  }
};

exports.getMarkdownContent = async (req, res) => {
  try {
    const { markdownPathURL } = req.body;
    if (!markdownPathURL) {
      return res.status(400).json({ success: false, message: 'No markdown path provided' });
    }

    let content = '';
    if (markdownPathURL.startsWith('ai-generated:')) {
      content = markdownPathURL.slice('ai-generated:'.length);
    } else if (markdownPathURL.startsWith('http://') || markdownPathURL.startsWith('https://')) {
      try {
        const fetchUrl = await presignS3Url(markdownPathURL);
        content = await fetchTextFromUrl(fetchUrl);
      } catch (fetchErr) {
        console.warn('Could not fetch remote markdown from URL:', markdownPathURL, fetchErr.message);
        content = `# Lesson Content\n\n> **Note:** The remote content file at \`${markdownPathURL.split('/').pop()}\` could not be fetched from remote storage (${fetchErr.message}).\n\nPlease check that AWS S3 credentials or internet connectivity are properly configured.`;
      }
    } else {
      const relativePath = markdownPathURL.replace(/^\/+/, '');
      const allowedBaseDirs = [
        path.resolve(__dirname, '..', 'data'),
        path.resolve(__dirname, '..', 'uploads'),
      ];
      let found = false;
      for (const baseDir of allowedBaseDirs) {
        const resolvedPath = path.resolve(baseDir, relativePath);
        // Ensure the path is strictly within the allowed base directory
        if (resolvedPath === baseDir || resolvedPath.startsWith(baseDir + path.sep)) {
          try {
            content = await fs.readFile(resolvedPath, 'utf8');
            found = true;
            break;
          } catch {
            // continue searching other allowed dirs
          }
        }
      }
      if (!found) {
        if (markdownPathURL.includes('\n') || !markdownPathURL.endsWith('.md')) {
          content = markdownPathURL;
        } else {
          content = `# Lesson Content\n\n> Local file \`${markdownPathURL}\` was not found on the server.`;
        }
      }
    }

    res.json({ success: true, data: content });
  } catch (err) {
    console.error('Error | getMarkdownContent:', err);
    res
      .status(500)
      .json({ success: false, message: 'Failed to load markdown content' });
  }
};
