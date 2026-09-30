const serverError = require('../utils/serverError');
const pool = require('../config/pg');
const { logAction } = require('../utils/auditLogger');
const {
  generateCurriculum, regenerateLesson, extractSkillsFromJD,
  generateTopics, generateUnits, generateSubtopics,
  generateLessonContent, generateUnitQuiz, generateUnitAssignment,
  generateCapstone, generateExerciseTests, generateContentFromFile, generateExerciseFromFile,
} = require('../services/aiCurriculumService');
const pdfParse = require('pdf-parse');
const { notify } = require('../services/notificationService');
const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

// ─── S3 singleton (reused across requests) ───────────────────────────────────
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function presignS3Url(url) {
  if (!url || !url.includes('.amazonaws.com/')) return url;
  try {
    const { hostname, pathname } = new URL(url);
    const bucket = hostname.split('.')[0];
    const key = decodeURIComponent(pathname.slice(1)); // strip leading /
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return await getSignedUrl(s3, cmd, { expiresIn: 3600 });
  } catch {
    return url;
  }
}

const s3Configured = () =>
  !!(
    process.env.AWS_S3_BUCKET &&
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );

async function storeFile(file, { s3KeyPrefix, localSubPath }) {
  const safeName = file.originalname
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');
  const filename = `${Date.now()}-${safeName}`;

  if (s3Configured()) {
    try {
      const key = `${s3KeyPrefix}/${filename}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      return { url, name: file.originalname };
    } catch (s3Error) {
      console.error('S3 upload failed, using local fallback:', s3Error);
    }
  }

  // Local fallback
  const uploadDir = localSubPath
    ? path.join(__dirname, '..', 'public', 'uploads', localSubPath)
    : path.join(__dirname, '..', 'public', 'uploads');
  await mkdirAsync(uploadDir, { recursive: true });
  await writeFileAsync(path.join(uploadDir, filename), file.buffer);
  const base = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
  const urlPath = localSubPath ? `uploads/${localSubPath}/${filename}` : `uploads/${filename}`;
  const url = `${base}/${urlPath}`;
  return { url, name: file.originalname };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function uniqueSlug(base, suffix) {
  return `${slugify(base)}-${suffix}`.substring(0, 80);
}

// ─── Extract skills from JD ───────────────────────────────────────────────────

exports.extractSkills = async (req, res) => {
  try {
    const { jd_text } = req.body;
    if (!jd_text) return res.status(400).json({ success: false, message: 'jd_text is required' });

    const skills = await extractSkillsFromJD(jd_text);
    res.json({ success: true, data: skills });
  } catch (err) {
    console.error('extractSkills error:', err);
    serverError(res, err);
  }
};

// ─── Generate exercise tests via AI ──────────────────────────────────────────

exports.generateTaskTests = async (req, res) => {
  try {
    const { instructions, language, role_focus, level } = req.body;
    if (!instructions) return res.status(400).json({ success: false, message: 'instructions is required' });

    const testCases = await generateExerciseTests({
      instructions,
      language: language || 'javascript',
      roleFocus: role_focus || 'Software Engineer',
      level: level || 'Beginner',
    });

    res.json({ success: true, data: testCases });
  } catch (err) {
    console.error('generateTaskTests error:', err);
    serverError(res, err);
  }
};

// ─── Generate curriculum via AI ───────────────────────────────────────────────

exports.generate = async (req, res) => {
  try {
    const {
      title, domain, role_focus, jd_text, skills,
      audience, level, learning_goal,
      duration_weeks, daily_hours, content_preference,
    } = req.body;

    if (!title || !domain || !level || !learning_goal) {
      return res.status(400).json({ success: false, message: 'title, domain, level, learning_goal are required' });
    }

    const curriculum = await generateCurriculum({
      title, domain, roleFocus: role_focus, jdText: jd_text, skills,
      audience, level, learningGoal: learning_goal,
      durationWeeks: duration_weeks, dailyHours: daily_hours,
      contentPreference: content_preference,
      numModules: req.body.num_modules || null,
    });

    res.json({ success: true, data: curriculum });
  } catch (err) {
    console.error('generate error:', err);
    serverError(res, err);
  }
};

// ─── Save course (draft) ──────────────────────────────────────────────────────

exports.saveCourse = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      title, domain, role_focus, jd_text, skills,
      audience, level, learning_goal,
      duration_weeks, daily_hours, content_preference,
      modules, // full generated tree
      capstone_project, // course-level final capstone
    } = req.body;

    const userId = req.user.id;
    const audienceVal = Array.isArray(audience) ? audience : (audience ? [audience] : []);

    await client.query('BEGIN');

    // Insert course
    const courseRes = await client.query(
      `INSERT INTO ai_courses
         (title, domain, role_focus, jd_text, skills, audience, level,
          learning_goal, duration_weeks, daily_hours, content_preference, created_by, capstone_project)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [title, domain, role_focus, jd_text || null,
       JSON.stringify(skills || []), audienceVal, level, learning_goal,
       duration_weeks || null, daily_hours || null, content_preference || null, userId,
       capstone_project ? JSON.stringify(capstone_project) : null],
    );
    const course = courseRes.rows[0];

    // Insert modules → topics → lessons
    for (let mi = 0; mi < (modules || []).length; mi++) {
      const mod = modules[mi];
      const modRes = await client.query(
        `INSERT INTO ai_course_modules (course_id, title, description, order_index, practice_tasks, case_studies)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [course.id, mod.title, mod.description || null, mi,
         JSON.stringify(mod.practice_tasks || []), JSON.stringify(mod.case_studies || [])],
      );
      const moduleId = modRes.rows[0].id;

      for (let ti = 0; ti < (mod.topics || []).length; ti++) {
        const topic = mod.topics[ti];
        const topicRes = await client.query(
          `INSERT INTO ai_course_topics (module_id, title, description, order_index, assignment, quiz_questions)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [moduleId, topic.title, topic.description || null, ti,
           topic.assignment ? JSON.stringify(topic.assignment) : null,
           JSON.stringify(topic.quiz_questions || [])],
        );
        const topicId = topicRes.rows[0].id;

        for (let li = 0; li < (topic.lessons || []).length; li++) {
          const lesson = topic.lessons[li];
          await client.query(
            `INSERT INTO ai_course_lessons
               (topic_id, title, explanation, example, activity, interview_questions,
                lesson_type, duration_mins, video_url, quiz_questions, exercise_data, order_index)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [topicId, lesson.title, lesson.explanation || null, lesson.example || null,
             lesson.activity || null, JSON.stringify(lesson.interview_questions || []),
             lesson.lesson_type || 'video', lesson.duration_mins || 20,
             lesson.video_url || null,
             JSON.stringify(lesson.quiz_questions || []),
             lesson.exercise ? JSON.stringify(lesson.exercise) : null,
             li],
          );
        }
      }
    }

    await client.query('COMMIT');
    logAction({ req, action: 'CREATE', entityType: 'ai_course', entityId: course.id, details: { title } });
    res.status(201).json({ success: true, data: { id: course.id } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('saveCourse error:', err);
    serverError(res, err);
  } finally {
    client.release();
  }
};

// ─── List courses ─────────────────────────────────────────────────────────────

exports.listCourses = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { status } = req.query;

    let query = `
      SELECT c.*, u.full_name AS creator_name,
             (SELECT count(*)::int FROM ai_course_modules m WHERE m.course_id = c.id) as module_count,
             (SELECT count(*)::int FROM ai_course_topics t JOIN ai_course_modules m ON t.module_id = m.id WHERE m.course_id = c.id) as topic_count
      FROM ai_courses c
      JOIN users u ON c.created_by = u.id
    `;
    const params = [];

    if (role === 'admin') {
      query += ` WHERE c.is_deleted = false`;
      if (status) { params.push(status); query += ` AND c.status = $${params.length}`; }
    } else {
      // facilitators see only their own
      query += ` WHERE c.is_deleted = false AND c.created_by = $1`;
      params.push(userId);
      if (status) { query += ` AND c.status = $2`; params.push(status); }
    }

    query += ` ORDER BY c.created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('listCourses error:', err);
    serverError(res, err);
  }
};

// ─── Get single course with full tree ────────────────────────────────────────

exports.getCourse = async (req, res) => {
  try {
    const { id } = req.params;

    const courseRes = await pool.query(
      `SELECT c.*, u.full_name AS creator_name,
              r.full_name AS reviewer_name
       FROM ai_courses c
       JOIN users u ON c.created_by = u.id
       LEFT JOIN users r ON c.reviewed_by = r.id
       WHERE c.id = $1 AND c.is_deleted = false`,
      [id],
    );
    if (!courseRes.rows.length) return res.status(404).json({ success: false, message: 'Course not found' });

    const course = courseRes.rows[0];

    const modulesRes = await pool.query(
      `SELECT * FROM ai_course_modules WHERE course_id = $1 AND is_deleted = false ORDER BY order_index`,
      [id],
    );

    const modules = [];
    for (const mod of modulesRes.rows) {
      const topicsRes = await pool.query(
        `SELECT * FROM ai_course_topics WHERE module_id = $1 AND is_deleted = false ORDER BY order_index`,
        [mod.id],
      );
      const topics = [];
      for (const topic of topicsRes.rows) {
        const lessonsRes = await pool.query(
          `SELECT * FROM ai_course_lessons WHERE topic_id = $1 AND is_deleted = false ORDER BY order_index`,
          [topic.id],
        );

        // Presign S3 URLs for lessons
        const signedLessons = await Promise.all(lessonsRes.rows.map(async (lesson) => {
          const updatedLesson = { ...lesson };
          
          if (updatedLesson.video_url) {
            updatedLesson.video_url = await presignS3Url(updatedLesson.video_url);
          }
          
          if (updatedLesson.resource_links) {
            try {
              const parsedResourceLinks = typeof updatedLesson.resource_links === 'string' ? JSON.parse(updatedLesson.resource_links) : updatedLesson.resource_links;
              if (Array.isArray(parsedResourceLinks)) {
                updatedLesson.resource_links = await Promise.all(parsedResourceLinks.map(presignS3Url));
                if (typeof lesson.resource_links === 'string') {
                  updatedLesson.resource_links = JSON.stringify(updatedLesson.resource_links);
                }
              }
            } catch (parseError) {
              console.error('Failed to parse resource_links:', parseError);
            }
          }

          if (updatedLesson.exercise_data) {
            try {
              const parsedExerciseData = typeof updatedLesson.exercise_data === 'string' ? JSON.parse(updatedLesson.exercise_data) : updatedLesson.exercise_data;
              if (parsedExerciseData.reference_files && Array.isArray(parsedExerciseData.reference_files)) {
                parsedExerciseData.reference_files = await Promise.all(parsedExerciseData.reference_files.map(presignS3Url));
                updatedLesson.exercise_data = typeof lesson.exercise_data === 'string' ? JSON.stringify(parsedExerciseData) : parsedExerciseData;
              }
            } catch (parseError) {
              console.error('Failed to parse exercise_data:', parseError);
            }
          }
          
          return updatedLesson;
        }));

        topics.push({ ...topic, lessons: signedLessons });
      }
      modules.push({ ...mod, topics });
    }

    // Review history
    const reviewsRes = await pool.query(
      `SELECT r.*, u.full_name AS reviewer_name
       FROM ai_course_reviews r
       JOIN users u ON r.reviewer_id = u.id
       WHERE r.course_id = $1 ORDER BY r.created_at DESC`,
      [id],
    );

    res.json({ success: true, data: { ...course, modules, reviews: reviewsRes.rows } });
  } catch (err) {
    console.error('getCourse error:', err);
    serverError(res, err);
  }
};

// ─── Update course metadata ───────────────────────────────────────────────────

exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['title','domain','role_focus','jd_text','skills','audience','level',
                    'learning_goal','duration_weeks','daily_hours','content_preference'];
    const updates = [];
    const values = [];
    let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${i++}`);
        values.push(f === 'skills' ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }
    if (!updates.length) return res.status(400).json({ success: false, message: 'Nothing to update' });
    updates.push(`updated_at = NOW()`);
    values.push(id);
    await pool.query(`UPDATE ai_courses SET ${updates.join(', ')} WHERE id = $${i}`, values);
    logAction({ req, action: 'UPDATE', entityType: 'ai_course', entityId: id, details: { fields: Object.keys(req.body) } });
    res.json({ success: true });
  } catch (err) {
    console.error('updateCourse error:', err);
    serverError(res, err);
  }
};

// ─── Submit for review ────────────────────────────────────────────────────────

exports.submitForReview = async (req, res) => {
  try {
    const { id } = req.params;
    const courseRes = await pool.query(`SELECT * FROM ai_courses WHERE id = $1`, [id]);
    if (!courseRes.rows.length) return res.status(404).json({ success: false, message: 'Not found' });

    const course = courseRes.rows[0];
    const allowed = ['draft', 'changes_requested'];
    if (!allowed.includes(course.status)) {
      return res.status(400).json({ success: false, message: `Cannot submit from status: ${course.status}` });
    }

    await pool.query(
      `UPDATE ai_courses SET status = 'in_review', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    // Notify all admins
    const admins = await pool.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.role_key = 'ADMIN'`,
    );
    for (const admin of admins.rows) {
      notify({
        userId: admin.id,
        type: 'general',
        title: 'Course Submitted for Review',
        body: `"${course.title}" has been submitted for vetting.`,
        link: `/dashboard/admin/ai-curriculum/${id}/review`,
      });
    }

    logAction({ req, action: 'UPDATE', entityType: 'ai_course', entityId: id, details: { status: 'in_review' } });
    res.json({ success: true });
  } catch (err) {
    console.error('submitForReview error:', err);
    serverError(res, err);
  }
};

// ─── Review action (admin only) ───────────────────────────────────────────────

exports.reviewCourse = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action, feedback } = req.body; // action: approved | changes_requested | rejected
    const reviewerId = req.user.id;

    const validActions = { approved: 'approved', changes_requested: 'changes_requested', rejected: 'rejected' };
    if (!validActions[action]) {
      return res.status(400).json({ success: false, message: 'action must be: approved | changes_requested | rejected' });
    }

    const courseRes = await client.query(`SELECT * FROM ai_courses WHERE id = $1`, [id]);
    if (!courseRes.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    const course = courseRes.rows[0];

    if (course.status !== 'in_review') {
      return res.status(400).json({ success: false, message: 'Course is not in review' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE ai_courses SET status = $1, reviewed_by = $2, updated_at = NOW() WHERE id = $3`,
      [action, reviewerId, id],
    );

    await client.query(
      `INSERT INTO ai_course_reviews (course_id, reviewer_id, action, feedback) VALUES ($1,$2,$3,$4)`,
      [id, reviewerId, action, JSON.stringify(feedback || {})],
    );

    await client.query('COMMIT');

    logAction({ req, action: action === 'approved' ? 'APPROVE' : action === 'rejected' ? 'REJECT' : 'UPDATE', entityType: 'ai_course', entityId: id, details: { action, feedback } });

    // Notify the creator
    const notifMessages = {
      approved: { title: 'Course Approved', body: `"${course.title}" has been approved and is ready to publish.` },
      changes_requested: { title: 'Changes Requested', body: `"${course.title}" needs revisions before approval.` },
      rejected: { title: 'Course Rejected', body: `"${course.title}" has been rejected. See reviewer feedback.` },
    };
    notify({
      userId: course.created_by,
      type: action === 'approved' ? 'achievement' : 'general',
      title: notifMessages[action].title,
      body: notifMessages[action].body,
      link: `/dashboard/facilitator/ai-curriculum/${id}`,
    });

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('reviewCourse error:', err);
    serverError(res, err);
  } finally {
    client.release();
  }
};

// ─── Publish (approved → published, creates Subject tree) ────────────────────

exports.publishCourse = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const courseRes = await client.query(
      `SELECT c.*, u.full_name AS creator_name FROM ai_courses c JOIN users u ON c.created_by = u.id WHERE c.id = $1`,
      [id],
    );
    if (!courseRes.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    const course = courseRes.rows[0];

    if (course.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Only approved courses can be published' });
    }

    await client.query('BEGIN');

    // 1. Create Subject
    const subjectSlug = uniqueSlug(course.title, Date.now());
    const subjectRes = await client.query(
      `INSERT INTO subjects (name, slug, description, is_published, order_index)
       VALUES ($1, $2, $3, true, (SELECT COALESCE(MAX(order_index),0)+1 FROM subjects))
       RETURNING id`,
      [course.title, subjectSlug, `${course.role_focus} — ${course.domain} course`],
    );
    const subjectId = subjectRes.rows[0].id;

    // 2. Fetch modules
    const modulesRes = await client.query(
      `SELECT * FROM ai_course_modules WHERE course_id = $1 ORDER BY order_index`, [id],
    );

    for (let mi = 0; mi < modulesRes.rows.length; mi++) {
      const mod = modulesRes.rows[mi];

      // 3. Create Topic (= module)
      const topicRes = await client.query(
        `INSERT INTO topics (subject_id, title, description, order_index) VALUES ($1,$2,$3,$4) RETURNING id`,
        [subjectId, mod.title, mod.description || null, mi],
      );
      const topicId = topicRes.rows[0].id;

      const aiTopics = await client.query(
        `SELECT * FROM ai_course_topics WHERE module_id = $1 ORDER BY order_index`, [mod.id],
      );

      for (let ti = 0; ti < aiTopics.rows.length; ti++) {
        const aiTopic = aiTopics.rows[ti];

        // 4. Create Unit (= ai topic)
        const unitSlug = uniqueSlug(aiTopic.title, `${Date.now()}-${ti}`);
        const unitRes = await client.query(
          `INSERT INTO units (topic_id, title, description, slug, order_index) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [topicId, aiTopic.title, aiTopic.description || null, unitSlug, ti],
        );
        const unitId = unitRes.rows[0].id;

        // Assignment per unit (= ai topic)
        if (aiTopic.assignment) {
          const asgn = typeof aiTopic.assignment === 'string' ? JSON.parse(aiTopic.assignment) : aiTopic.assignment;
          const allowedTypes = Array.isArray(asgn.allowed_submission_types) && asgn.allowed_submission_types.length > 0
            ? asgn.allowed_submission_types
            : ['file', 'github', 'docs', 'figma', 'excel', 'url'];
          await client.query(
            `INSERT INTO assignments (unit_id, title, instructions, max_score, allowed_submission_types) VALUES ($1,$2,$3,$4,$5)`,
            [unitId, asgn.title || `${aiTopic.title} Assignment`, asgn.instructions || null, asgn.max_score || 100, JSON.stringify(allowedTypes)],
          );
        }

        const aiLessons = await client.query(
          `SELECT * FROM ai_course_lessons WHERE topic_id = $1 ORDER BY order_index`, [aiTopic.id],
        );

        // 4a. Create one Quiz per Unit — use quiz_questions stored at the topic level
        const rawTopicQuiz = Array.isArray(aiTopic.quiz_questions) ? aiTopic.quiz_questions : [];
        const allQuizQuestions = rawTopicQuiz;

        let quizId = null;
        if (allQuizQuestions.length > 0) {
          const totalPoints = allQuizQuestions.length * 10;
          const quizRes = await client.query(
            `INSERT INTO quizzes (unit_id, passing_score, max_score) VALUES ($1, $2, $3) RETURNING id`,
            [unitId, Math.ceil(totalPoints * 0.7), totalPoints],
          );
          quizId = quizRes.rows[0].id;

          for (let qi = 0; qi < allQuizQuestions.length; qi++) {
            const q = allQuizQuestions[qi];
            const qqRes = await client.query(
              `INSERT INTO quiz_questions (quiz_id, question_text, question_type, points, explanation, order_index)
               VALUES ($1, $2, 'multiple_choice', 10, $3, $4) RETURNING id`,
              [quizId, q.question, q.explanation || null, qi],
            );
            const questionId = qqRes.rows[0].id;

            const options = Array.isArray(q.options) ? q.options : [];
            for (let oi = 0; oi < options.length; oi++) {
              await client.query(
                `INSERT INTO quiz_question_options (question_id, option_text, is_correct, order_index)
                 VALUES ($1, $2, $3, $4)`,
                [questionId, options[oi], oi === (q.correct_index ?? 0), oi],
              );
            }
          }
        }

        for (let li = 0; li < aiLessons.rows.length; li++) {
          const aiLesson = aiLessons.rows[li];

          // 5. Create Subtopic (= ai lesson)
          const subtopicSlug = uniqueSlug(aiLesson.title, `${Date.now()}-${li}`);
          const subtopicRes = await client.query(
            `INSERT INTO subtopics (unit_id, title, description, slug, order_index) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [unitId, aiLesson.title, aiLesson.explanation?.substring(0, 200) || null, subtopicSlug, li],
          );
          const subtopicId = subtopicRes.rows[0].id;

          // 6. Create Lesson Content (rich markdown from AI)
          const markdown = [
            aiLesson.explanation || '',
            aiLesson.example ? `\n## Example\n\n${aiLesson.example}` : '',
            aiLesson.activity ? `\n## Activity\n\n${aiLesson.activity}` : '',
            aiLesson.interview_questions?.length
              ? `\n## Interview Questions\n\n${aiLesson.interview_questions.map((q) => `- ${q}`).join('\n')}`
              : '',
          ].filter(Boolean).join('\n');

          // Store markdown inline with prefix (subject controller reads it back directly).
          // Store video_url in its own column so the student lesson view can embed the video.
          await client.query(
            `INSERT INTO lesson_content (subtopic_id, content_type, markdown_path, video_url, is_published, version)
             VALUES ($1, 'markdown', $2, $3, true, 1)
             ON CONFLICT (subtopic_id, version) DO UPDATE SET
               markdown_path = EXCLUDED.markdown_path,
               video_url = EXCLUDED.video_url`,
            [subtopicId, `ai-generated:${markdown}`, aiLesson.video_url || null],
          );

          // 7. Create Exercise per subtopic (if AI generated one)
          const exerciseData = aiLesson.exercise_data;
          if (exerciseData) {
            const ex = typeof exerciseData === 'string' ? JSON.parse(exerciseData) : exerciseData;
            // Use empty tasks array → ExerciseEditor runs in single-task mode using initial_files.
            await client.query(
              `INSERT INTO exercises (subtopic_id, title, instructions, max_score, language, tasks, initial_files)
               VALUES ($1, $2, $3, 100, 'javascript', $4, $5)`,
              [
                subtopicId,
                ex.title || aiLesson.title,
                ex.description || null,
                JSON.stringify([]),
                JSON.stringify([{ name: 'index.js', content: ex.starter_code || '// Write your code here\n' }]),
              ],
            );
          }
        }
      }
    }

    // 7. Create final capstone project (course-level) — attached to last topic
    if (course.capstone_project) {
      const cp = typeof course.capstone_project === 'string' ? JSON.parse(course.capstone_project) : course.capstone_project;
      // Find the last topic created (last module's topic_id)
      const lastTopicRes = await client.query(
        `SELECT t.id FROM topics t WHERE t.subject_id = $1 ORDER BY t.order_index DESC LIMIT 1`,
        [subjectId],
      );
      if (lastTopicRes.rows.length) {
        await client.query(
          `INSERT INTO projects (topic_id, title, instructions, max_score) VALUES ($1,$2,$3,$4)`,
          [lastTopicRes.rows[0].id, cp.title || `${course.title} — Final Capstone`, cp.instructions || cp.description || null, 100],
        );
      }
    }

    // 8. Update ai_course
    await client.query(
      `UPDATE ai_courses SET status = 'published', subject_id = $1, updated_at = NOW() WHERE id = $2`,
      [subjectId, id],
    );

    await client.query('COMMIT');

    logAction({ req, action: 'PUBLISH', entityType: 'ai_course', entityId: id, details: { title: course.title, subject_id: subjectId } });

    // Notify creator
    notify({
      userId: course.created_by,
      type: 'achievement',
      title: 'Course Published!',
      body: `"${course.title}" is now live as a subject for students.`,
      link: `/dashboard/admin/subjects`,
    });

    res.json({ success: true, data: { subject_id: subjectId } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('publishCourse error:', err);
    serverError(res, err);
  } finally {
    client.release();
  }
};

// ─── Inline edit module / topic / lesson ─────────────────────────────────────

exports.updateModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, practice_tasks, case_studies } = req.body;
    await pool.query(
      `UPDATE ai_course_modules SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         practice_tasks = COALESCE($3, practice_tasks),
         case_studies = COALESCE($4, case_studies)
       WHERE id = $5`,
      [title || null, description || null,
       practice_tasks ? JSON.stringify(practice_tasks) : null,
       case_studies ? JSON.stringify(case_studies) : null, id],
    );
    logAction({ req, action: 'UPDATE', entityType: 'ai_course_module', entityId: id, details: { title } });
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
};

exports.updateTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, quiz_questions, assignment } = req.body;
    const sets = [];
    const vals = [];
    let i = 1;
    if (title !== undefined)         { sets.push(`title = $${i++}`);          vals.push(title); }
    if (description !== undefined)   { sets.push(`description = $${i++}`);    vals.push(description); }
    if (quiz_questions !== undefined) { sets.push(`quiz_questions = $${i++}`); vals.push(JSON.stringify(quiz_questions)); }
    if (assignment !== undefined)    { sets.push(`assignment = $${i++}`);     vals.push(assignment ? JSON.stringify(assignment) : null); }
    if (!sets.length) return res.status(400).json({ success: false, message: 'Nothing to update' });
    vals.push(id);
    await pool.query(`UPDATE ai_course_topics SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    logAction({ req, action: 'UPDATE', entityType: 'ai_course_topic', entityId: id, details: { title } });
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
};

exports.updateLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, explanation, example, activity, interview_questions, lesson_type, duration_mins, video_url, resource_links, exercise_data } = req.body;
    const sets = [];
    const vals = [];
    let i = 1;
    const add = (col, val) => { sets.push(`${col} = $${i++}`); vals.push(val); };
    if (title !== undefined)               add('title', title);
    if (explanation !== undefined)         add('explanation', explanation);
    if (example !== undefined)             add('example', example);
    if (activity !== undefined)            add('activity', activity);
    if (interview_questions !== undefined) add('interview_questions', JSON.stringify(interview_questions));
    if (lesson_type !== undefined)         add('lesson_type', lesson_type);
    if (duration_mins !== undefined)       add('duration_mins', duration_mins);
    if (video_url !== undefined)           add('video_url', video_url);
    if (resource_links !== undefined)      add('resource_links', JSON.stringify(resource_links));
    if (exercise_data !== undefined)       add('exercise_data', exercise_data);
    if (!sets.length) return res.status(400).json({ success: false, message: 'Nothing to update' });
    vals.push(id);
    await pool.query(`UPDATE ai_course_lessons SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    logAction({ req, action: 'UPDATE', entityType: 'ai_course_lesson', entityId: id, details: { title } });
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
};

// ─── Add module / topic / lesson ─────────────────────────────────────────────

exports.addModule = async (req, res) => {
  try {
    const { course_id, title } = req.body;
    if (!course_id || !title) return res.status(400).json({ success: false, message: 'course_id and title required' });
    const orderRes = await pool.query(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM ai_course_modules WHERE course_id = $1`,
      [course_id],
    );
    const orderIndex = orderRes.rows[0].next;
    const result = await pool.query(
      `INSERT INTO ai_course_modules (course_id, title, description, order_index, practice_tasks, case_studies)
       VALUES ($1,$2,'',${orderIndex},'[]','[]') RETURNING *`,
      [course_id, title],
    );
    logAction({ req, action: 'CREATE', entityType: 'ai_course_module', entityId: result.rows[0].id, details: { title } });
    res.status(201).json({ success: true, data: { ...result.rows[0], topics: [] } });
  } catch (err) {
    serverError(res, err);
  }
};

exports.addTopic = async (req, res) => {
  try {
    const { module_id, title } = req.body;
    if (!module_id || !title) return res.status(400).json({ success: false, message: 'module_id and title required' });
    const orderRes = await pool.query(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM ai_course_topics WHERE module_id = $1`,
      [module_id],
    );
    const orderIndex = orderRes.rows[0].next;
    const result = await pool.query(
      `INSERT INTO ai_course_topics (module_id, title, description, order_index)
       VALUES ($1,$2,'',$3) RETURNING *`,
      [module_id, title, orderIndex],
    );
    logAction({ req, action: 'CREATE', entityType: 'ai_course_topic', entityId: result.rows[0].id, details: { title } });
    res.status(201).json({ success: true, data: { ...result.rows[0], lessons: [] } });
  } catch (err) {
    serverError(res, err);
  }
};

exports.addLesson = async (req, res) => {
  try {
    const { topic_id, title, lesson_type } = req.body;
    if (!topic_id || !title) return res.status(400).json({ success: false, message: 'topic_id and title required' });
    const orderRes = await pool.query(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM ai_course_lessons WHERE topic_id = $1`,
      [topic_id],
    );
    const orderIndex = orderRes.rows[0].next;
    const result = await pool.query(
      `INSERT INTO ai_course_lessons
         (topic_id, title, explanation, example, activity, interview_questions,
          lesson_type, duration_mins, video_url, quiz_questions, exercise_data, order_index)
       VALUES ($1,$2,'','','','[]',$3,15,NULL,'[]',NULL,$4) RETURNING *`,
      [topic_id, title, lesson_type || 'video', orderIndex],
    );
    logAction({ req, action: 'CREATE', entityType: 'ai_course_lesson', entityId: result.rows[0].id, details: { title } });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    serverError(res, err);
  }
};

// ─── Delete module / topic / lesson ──────────────────────────────────────────

exports.deleteModule = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    const modRes = await client.query(
      `UPDATE ai_course_modules SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *`,
      [id],
    );
    if (!modRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    await client.query(
      `UPDATE ai_course_topics SET is_deleted = true WHERE module_id = $1`,
      [id],
    );
    await client.query(
      `UPDATE ai_course_lessons SET is_deleted = true WHERE topic_id IN (SELECT id FROM ai_course_topics WHERE module_id = $1)`,
      [id],
    );
    await client.query('COMMIT');
    logAction({ req, action: 'DELETE', entityType: 'ai_course_module', entityId: id, details: { title: modRes.rows[0].title } });
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
};

exports.deleteTopic = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    const topicRes = await client.query(
      `UPDATE ai_course_topics SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *`,
      [id],
    );
    if (!topicRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    await client.query(
      `UPDATE ai_course_lessons SET is_deleted = true WHERE topic_id = $1`,
      [id],
    );
    await client.query('COMMIT');
    logAction({ req, action: 'DELETE', entityType: 'ai_course_topic', entityId: id, details: { title: topicRes.rows[0].title } });
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
};

exports.deleteLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE ai_course_lessons SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *`,
      [id],
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    logAction({ req, action: 'DELETE', entityType: 'ai_course_lesson', entityId: id, details: { title: result.rows[0].title } });
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
};

// ─── Reorder modules ──────────────────────────────────────────────────────────

exports.reorderModules = async (req, res) => {
  const client = await pool.connect();
  try {
    // orderedIds: [{ id, order_index }]
    const { ordered_ids } = req.body;
    await client.query('BEGIN');
    for (const { id, order_index } of ordered_ids) {
      await client.query(`UPDATE ai_course_modules SET order_index = $1 WHERE id = $2`, [order_index, id]);
    }
    await client.query('COMMIT');
    logAction({ req, action: 'UPDATE', entityType: 'ai_course_module', entityId: null, details: { reordered: ordered_ids.length } });
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
};

// ─── Reorder topics within a module ──────────────────────────────────────────

exports.reorderTopics = async (req, res) => {
  const client = await pool.connect();
  try {
    const { ordered_ids } = req.body;
    await client.query('BEGIN');
    for (const { id, order_index } of ordered_ids) {
      await client.query(`UPDATE ai_course_topics SET order_index = $1 WHERE id = $2`, [order_index, id]);
    }
    await client.query('COMMIT');
    logAction({ req, action: 'UPDATE', entityType: 'ai_course_topic', entityId: null, details: { reordered: ordered_ids.length } });
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
};

// ─── Duplicate module / topic / lesson ───────────────────────────────────────

exports.duplicateModule = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const modRes = await pool.query(`SELECT * FROM ai_course_modules WHERE id = $1`, [id]);
    if (!modRes.rows.length) return res.status(404).json({ success: false });
    const m = modRes.rows[0];
    const orderRes = await pool.query(`SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM ai_course_modules WHERE course_id = $1`, [m.course_id]);
    await client.query('BEGIN');
    const newMod = await client.query(
      `INSERT INTO ai_course_modules (course_id, title, description, order_index, practice_tasks, case_studies)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [m.course_id, `${m.title} (Copy)`, m.description, orderRes.rows[0].next, m.practice_tasks, m.case_studies],
    );
    const newModId = newMod.rows[0].id;
    const topics = await client.query(`SELECT * FROM ai_course_topics WHERE module_id = $1 ORDER BY order_index`, [id]);
    const newTopics = [];
    for (const t of topics.rows) {
      const newTopic = await client.query(
        `INSERT INTO ai_course_topics (module_id, title, description, order_index, assignment)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [newModId, t.title, t.description, t.order_index, t.assignment],
      );
      const newTopicId = newTopic.rows[0].id;
      const lessons = await client.query(`SELECT * FROM ai_course_lessons WHERE topic_id = $1 ORDER BY order_index`, [t.id]);
      const newLessons = [];
      for (const l of lessons.rows) {
        const newLesson = await client.query(
          `INSERT INTO ai_course_lessons (topic_id, title, explanation, example, activity, interview_questions, lesson_type, duration_mins, video_url, quiz_questions, exercise_data, order_index)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [newTopicId, l.title, l.explanation, l.example, l.activity, l.interview_questions, l.lesson_type, l.duration_mins, l.video_url, l.quiz_questions, l.exercise_data, l.order_index],
        );
        newLessons.push(newLesson.rows[0]);
      }
      newTopics.push({ ...newTopic.rows[0], lessons: newLessons });
    }
    await client.query('COMMIT');
    logAction({ req, action: 'CREATE', entityType: 'ai_course_module', entityId: newModId, details: { duplicated_from: id } });
    res.status(201).json({ success: true, data: { ...newMod.rows[0], topics: newTopics } });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
};

exports.duplicateTopic = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    // Read inside transaction to prevent race conditions on order_index
    const topicRes = await client.query(`SELECT * FROM ai_course_topics WHERE id = $1`, [id]);
    if (!topicRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false });
    }
    const t = topicRes.rows[0];
    const orderRes = await client.query(`SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM ai_course_topics WHERE module_id = $1`, [t.module_id]);

    const newTopic = await client.query(
      `INSERT INTO ai_course_topics (module_id, title, description, order_index, assignment)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [t.module_id, `${t.title} (Copy)`, t.description, orderRes.rows[0].next, t.assignment],
    );
    const newTopicId = newTopic.rows[0].id;
    const lessons = await client.query(`SELECT * FROM ai_course_lessons WHERE topic_id = $1 ORDER BY order_index`, [id]);
    const newLessons = [];
    for (const l of lessons.rows) {
      const newLesson = await client.query(
        `INSERT INTO ai_course_lessons (topic_id, title, explanation, example, activity, interview_questions, lesson_type, duration_mins, video_url, quiz_questions, exercise_data, order_index)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [newTopicId, l.title, l.explanation, l.example, l.activity, l.interview_questions, l.lesson_type, l.duration_mins, l.video_url, l.quiz_questions, l.exercise_data, l.order_index],
      );
      newLessons.push(newLesson.rows[0]);
    }
    await client.query('COMMIT');
    logAction({ req, action: 'CREATE', entityType: 'ai_course_topic', entityId: newTopicId, details: { duplicated_from: id } });
    res.status(201).json({ success: true, data: { ...newTopic.rows[0], lessons: newLessons } });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
};

exports.duplicateLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const lessonRes = await pool.query(`SELECT * FROM ai_course_lessons WHERE id = $1`, [id]);
    if (!lessonRes.rows.length) return res.status(404).json({ success: false });
    const l = lessonRes.rows[0];
    const orderRes = await pool.query(`SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM ai_course_lessons WHERE topic_id = $1`, [l.topic_id]);
    const result = await pool.query(
      `INSERT INTO ai_course_lessons (topic_id, title, explanation, example, activity, interview_questions, lesson_type, duration_mins, video_url, quiz_questions, exercise_data, order_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [l.topic_id, `${l.title} (Copy)`, l.explanation, l.example, l.activity, l.interview_questions, l.lesson_type, l.duration_mins, l.video_url, l.quiz_questions, l.exercise_data, orderRes.rows[0].next],
    );
    logAction({ req, action: 'CREATE', entityType: 'ai_course_lesson', entityId: result.rows[0].id, details: { duplicated_from: id } });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    serverError(res, err);
  }
};

// ─── Regenerate a single lesson via AI ───────────────────────────────────────

exports.regenerateLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const { instruction } = req.body;

    const lessonRes = await pool.query(
      `SELECT l.*, t.module_id,
              c.role_focus, c.level
       FROM ai_course_lessons l
       JOIN ai_course_topics t ON l.topic_id = t.id
       JOIN ai_course_modules m ON t.module_id = m.id
       JOIN ai_courses c ON m.course_id = c.id
       WHERE l.id = $1`,
      [id],
    );
    if (!lessonRes.rows.length) return res.status(404).json({ success: false, message: 'Lesson not found' });

    const row = lessonRes.rows[0];
    const updated = await regenerateLesson({
      lesson: row,
      instruction: instruction || 'Improve clarity and add a better example',
      roleFocus: row.role_focus,
      level: row.level,
    });

    await pool.query(
      `UPDATE ai_course_lessons SET
         title = $1, explanation = $2, example = $3,
         activity = $4, interview_questions = $5
       WHERE id = $6`,
      [updated.title, updated.explanation, updated.example,
       updated.activity, JSON.stringify(updated.interview_questions || []), id],
    );

    logAction({ req, action: 'UPDATE', entityType: 'ai_course_lesson', entityId: id, details: { instruction } });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('regenerateLesson error:', err);
    serverError(res, err);
  }
};

// ─── Incremental AI generation ───────────────────────────────────────────────

exports.generateTopics = async (req, res) => {
  try {
    const { title, domain, role_focus, level, learning_goal, num_topics } = req.body;
    if (!title || !level || !learning_goal) {
      return res.status(400).json({ success: false, message: 'title, level, learning_goal are required' });
    }
    const result = await generateTopics({
      title, domain, roleFocus: role_focus, level, learningGoal: learning_goal, numTopics: num_topics || null,
    });
    res.json({ success: true, data: result.topics });
  } catch (err) {
    console.error('generateTopics error:', err);
    serverError(res, err);
  }
};

// Generate units for a module and save them to DB — returns created topics with IDs
exports.generateAndSaveUnits = async (req, res) => {
  const client = await pool.connect();
  try {
    const { module_id } = req.body;
    if (!module_id) return res.status(400).json({ success: false, message: 'module_id is required' });

    // Fetch context from DB
    const ctxRes = await client.query(
      `SELECT m.title AS topic_title, c.title AS course_title, c.role_focus, c.level
       FROM ai_course_modules m
       JOIN ai_courses c ON m.course_id = c.id
       WHERE m.id = $1`,
      [module_id],
    );
    if (!ctxRes.rows.length) return res.status(404).json({ success: false, message: 'Module not found' });
    const { topic_title, course_title, role_focus, level } = ctxRes.rows[0];

    // Check for existing topics to prevent duplication
    const existingRes = await client.query(
      `SELECT LOWER(title) as title FROM ai_course_topics WHERE module_id = $1`,
      [module_id],
    );
    const existingTitles = new Set(existingRes.rows.map((r) => r.title));

    const result = await generateUnits({ courseTitle: course_title, roleFocus: role_focus, level, topicTitle: topic_title });

    // Filter out duplicates (case-insensitive)
    const newUnits = result.units.filter(
      (unit) => !existingTitles.has(unit.title.toLowerCase())
    );

    if (newUnits.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'All units already exist. No new units generated.',
      });
    }

    // Get current max order_index
    const orderRes = await client.query(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM ai_course_topics WHERE module_id = $1`,
      [module_id],
    );
    let orderIndex = orderRes.rows[0].next;

    await client.query('BEGIN');
    const created = [];
    for (const unit of newUnits) {
      const r = await client.query(
        `INSERT INTO ai_course_topics (module_id, title, description, order_index)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [module_id, unit.title, unit.description || '', orderIndex++],
      );
      created.push({ ...r.rows[0], lessons: [] });
    }
    await client.query('COMMIT');
    logAction({ req, action: 'CREATE', entityType: 'ai_course_topic', entityId: module_id, details: { created: created.length } });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('generateAndSaveUnits error:', err);
    serverError(res, err);
  } finally {
    client.release();
  }
};

// Generate subtopics for a unit and save them to DB — returns created lessons with IDs
exports.generateAndSaveSubtopics = async (req, res) => {
  const client = await pool.connect();
  try {
    const { topic_id } = req.body;
    if (!topic_id) return res.status(400).json({ success: false, message: 'topic_id is required' });

    const ctxRes = await client.query(
      `SELECT t.title AS unit_title, m.title AS topic_title, c.title AS course_title, c.role_focus, c.level
       FROM ai_course_topics t
       JOIN ai_course_modules m ON t.module_id = m.id
       JOIN ai_courses c ON m.course_id = c.id
       WHERE t.id = $1`,
      [topic_id],
    );
    if (!ctxRes.rows.length) return res.status(404).json({ success: false, message: 'Unit not found' });
    const { unit_title, topic_title, course_title, role_focus, level } = ctxRes.rows[0];

    // Check for existing subtopics to prevent duplication
    const existingRes = await client.query(
      `SELECT LOWER(title) as title FROM ai_course_lessons WHERE topic_id = $1`,
      [topic_id],
    );
    const existingTitles = new Set(existingRes.rows.map((r) => r.title));

    const result = await generateSubtopics({
      courseTitle: course_title, roleFocus: role_focus, level, topicTitle: topic_title, unitTitle: unit_title,
    });

    // Filter out duplicates (case-insensitive)
    const newSubtopics = result.subtopics.filter(
      (sub) => !existingTitles.has(sub.title.toLowerCase())
    );

    if (newSubtopics.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'All subtopics already exist. No new subtopics generated.',
      });
    }

    const orderRes = await client.query(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM ai_course_lessons WHERE topic_id = $1`,
      [topic_id],
    );
    let orderIndex = orderRes.rows[0].next;

    await client.query('BEGIN');
    const created = [];
    for (const sub of newSubtopics) {
      const r = await client.query(
        `INSERT INTO ai_course_lessons
           (topic_id, title, explanation, example, activity, interview_questions,
            lesson_type, duration_mins, video_url, quiz_questions, exercise_data, order_index)
         VALUES ($1,$2,'','','','[]','video',$3,NULL,'[]',NULL,$4) RETURNING *`,
        [topic_id, sub.title, sub.duration_mins || 20, orderIndex++],
      );
      created.push(r.rows[0]);
    }
    await client.query('COMMIT');
    logAction({ req, action: 'CREATE', entityType: 'ai_course_lesson', entityId: topic_id, details: { created: created.length } });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('generateAndSaveSubtopics error:', err);
    serverError(res, err);
  } finally {
    client.release();
  }
};

// Generate and save a specific content type for a lesson (video | markdown | exercise)
exports.generateAndSaveLessonContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;
    if (!['video', 'markdown', 'exercise'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be: video | markdown | exercise' });
    }

    const ctxRes = await pool.query(
      `SELECT l.title AS lesson_title, t.title AS unit_title, m.title AS topic_title,
              c.title AS course_title, c.role_focus, c.level, c.id AS course_id
       FROM ai_course_lessons l
       JOIN ai_course_topics t ON l.topic_id = t.id
       JOIN ai_course_modules m ON t.module_id = m.id
       JOIN ai_courses c ON m.course_id = c.id
       WHERE l.id = $1`,
      [id],
    );
    if (!ctxRes.rows.length) return res.status(404).json({ success: false, message: 'Lesson not found' });
    const { lesson_title, unit_title, topic_title, course_title, role_focus, level, course_id } = ctxRes.rows[0];

    // Fetch existing videos in this course to avoid duplicates
    const existingVideosRes = await pool.query(
      `SELECT l.video_url 
       FROM ai_course_lessons l
       JOIN ai_course_topics t ON l.topic_id = t.id
       JOIN ai_course_modules m ON t.module_id = m.id
       WHERE m.course_id = $1 AND l.id != $2 AND l.video_url IS NOT NULL`,
      [course_id, id]
    );
    const excludeUrls = existingVideosRes.rows.map(r => r.video_url);

    const result = await generateLessonContent({
      type, courseTitle: course_title, roleFocus: role_focus, level,
      topicTitle: topic_title, unitTitle: unit_title, lessonTitle: lesson_title, lessonId: id, excludeUrls
    });

    let updateFields, updateVals;
    if (type === 'video') {
      updateFields = 'video_url = $1';
      updateVals = [result.video_url, id];
    } else if (type === 'markdown') {
      updateFields = 'explanation = $1, example = $2, activity = $3, interview_questions = $4, duration_mins = $5';
      updateVals = [
        result.explanation, result.example, result.activity,
        JSON.stringify(result.interview_questions || []),
        result.duration_mins || 25, id,
      ];
    } else {
      updateFields = 'exercise_data = $1';
      updateVals = [JSON.stringify(result.exercise), id];
    }

    await pool.query(
      `UPDATE ai_course_lessons SET ${updateFields} WHERE id = $${updateVals.length}`,
      updateVals,
    );

    logAction({ req, action: 'UPDATE', entityType: 'ai_course_lesson', entityId: id, details: { type } });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('generateAndSaveLessonContent error:', err);
    serverError(res, err);
  }
};

// Generate and save quiz questions for a unit
exports.generateAndSaveUnitQuiz = async (req, res) => {
  try {
    const { id } = req.params; // topic id

    const ctxRes = await pool.query(
      `SELECT t.title AS unit_title, m.title AS topic_title,
              c.title AS course_title, c.role_focus, c.level
       FROM ai_course_topics t
       JOIN ai_course_modules m ON t.module_id = m.id
       JOIN ai_courses c ON m.course_id = c.id
       WHERE t.id = $1`,
      [id],
    );
    if (!ctxRes.rows.length) return res.status(404).json({ success: false, message: 'Unit not found' });
    const { unit_title, topic_title, course_title, role_focus, level } = ctxRes.rows[0];

    // Collect subtopic titles for better quiz coverage
    const lessonsRes = await pool.query(
      `SELECT title FROM ai_course_lessons WHERE topic_id = $1 ORDER BY order_index`,
      [id],
    );
    const subtopics = lessonsRes.rows.map((r) => r.title);

    const result = await generateUnitQuiz({
      courseTitle: course_title, roleFocus: role_focus, level,
      topicTitle: topic_title, unitTitle: unit_title, subtopics,
    });

    await pool.query(
      `UPDATE ai_course_topics SET quiz_questions = $1 WHERE id = $2`,
      [JSON.stringify(result.quiz_questions), id],
    );

    logAction({ req, action: 'UPDATE', entityType: 'ai_course_topic', entityId: id, details: { quiz_questions: true } });
    res.json({ success: true, data: result.quiz_questions });
  } catch (err) {
    console.error('generateAndSaveUnitQuiz error:', err);
    serverError(res, err);
  }
};

// Generate and save assignment for a unit
exports.generateAndSaveUnitAssignment = async (req, res) => {
  try {
    const { id } = req.params; // topic id

    const ctxRes = await pool.query(
      `SELECT t.title AS unit_title, m.title AS topic_title,
              c.title AS course_title, c.role_focus, c.level
       FROM ai_course_topics t
       JOIN ai_course_modules m ON t.module_id = m.id
       JOIN ai_courses c ON m.course_id = c.id
       WHERE t.id = $1`,
      [id],
    );
    if (!ctxRes.rows.length) return res.status(404).json({ success: false, message: 'Unit not found' });
    const { unit_title, topic_title, course_title, role_focus, level } = ctxRes.rows[0];

    const result = await generateUnitAssignment({
      courseTitle: course_title, roleFocus: role_focus, level,
      topicTitle: topic_title, unitTitle: unit_title,
    });

    await pool.query(
      `UPDATE ai_course_topics SET assignment = $1 WHERE id = $2`,
      [JSON.stringify(result.assignment), id],
    );

    logAction({ req, action: 'UPDATE', entityType: 'ai_course_topic', entityId: id, details: { assignment: true } });
    res.json({ success: true, data: result.assignment });
  } catch (err) {
    console.error('generateAndSaveUnitAssignment error:', err);
    serverError(res, err);
  }
};

// Generate and save capstone project for a module (topic)
exports.generateAndSaveCapstone = async (req, res) => {
  try {
    const { id } = req.params; // module id

    const ctxRes = await pool.query(
      `SELECT m.title AS module_title, c.title AS course_title, c.role_focus, c.level,
              ARRAY_AGG(t.title ORDER BY t.order_index) AS unit_titles
       FROM ai_course_modules m
       JOIN ai_courses c ON m.course_id = c.id
       LEFT JOIN ai_course_topics t ON t.module_id = m.id
       WHERE m.id = $1
       GROUP BY m.id, m.title, c.title, c.role_focus, c.level`,
      [id],
    );
    if (!ctxRes.rows.length) return res.status(404).json({ success: false, message: 'Module not found' });

    const { module_title, course_title, role_focus, level, unit_titles } = ctxRes.rows[0];

    const result = await generateCapstone({
      courseTitle: course_title,
      roleFocus: role_focus,
      level,
      moduleTitle: module_title,
      unitTitles: (unit_titles || []).filter(Boolean),
    });

    await pool.query(
      `UPDATE ai_course_modules SET capstone_project = $1 WHERE id = $2`,
      [JSON.stringify(result.capstone_project), id],
    );

    logAction({ req, action: 'UPDATE', entityType: 'ai_course_module', entityId: id, details: { capstone_project: true } });
    res.json({ success: true, data: result.capstone_project });
  } catch (err) {
    console.error('generateAndSaveCapstone error:', err);
    serverError(res, err);
  }
};

// ─── Delete course ────────────────────────────────────────────────────────────

exports.deleteCourse = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    const courseRes = await client.query(`SELECT * FROM ai_courses WHERE id = $1 AND is_deleted = false`, [id]);
    if (!courseRes.rows.length) return res.status(404).json({ success: false, message: 'Not found' });

    const course = courseRes.rows[0];
    if (role !== 'admin' && course.created_by !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (course.status === 'published') {
      return res.status(400).json({ success: false, message: 'Cannot delete a published course' });
    }

    await client.query('BEGIN');
    await client.query(`UPDATE ai_courses SET is_deleted = true WHERE id = $1`, [id]);
    await client.query(
      `UPDATE ai_course_modules SET is_deleted = true WHERE course_id = $1`,
      [id],
    );
    await client.query(
      `UPDATE ai_course_topics SET is_deleted = true WHERE module_id IN (SELECT id FROM ai_course_modules WHERE course_id = $1)`,
      [id],
    );
    await client.query(
      `UPDATE ai_course_lessons SET is_deleted = true WHERE topic_id IN (
         SELECT t.id FROM ai_course_topics t JOIN ai_course_modules m ON t.module_id = m.id WHERE m.course_id = $1
       )`,
      [id],
    );
    await client.query('COMMIT');
    logAction({ req, action: 'DELETE', entityType: 'ai_course', entityId: id, details: { title: course.title } });
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, err);
  } finally {
    client.release();
  }
};

// ─── Upload / Delete Resources ────────────────────────────────────────────────

exports.uploadResource = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const { url, name } = await storeFile(req.file, {
      s3KeyPrefix: 'ai-curriculum-resources',
      localSubPath: 'ai-curriculum-resources',
    });
    
    // Presign the URL immediately so the frontend can preview it without refreshing
    const presignedUrl = await presignS3Url(url);

    logAction({ req, action: 'CREATE', entityType: 'ai_curriculum_resource', entityId: null, details: { url, name } });
    res.json({ success: true, url: presignedUrl, filename: name });
  } catch (error) {
    console.error('uploadResource error:', error);
    serverError(res, error);
  }
};

exports.deleteResource = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.includes('.amazonaws.com/')) {
      return res.json({ success: true, message: 'Not an S3 URL or ignored' });
    }
    
    const { hostname, pathname } = new URL(url);
    const bucket = hostname.split('.')[0];
    const key = decodeURIComponent(pathname.slice(1));
    
    if (s3Configured() && bucket === process.env.AWS_S3_BUCKET) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
    logAction({ req, action: 'DELETE', entityType: 'ai_curriculum_resource', entityId: null, details: { url } });
    res.json({ success: true });
  } catch (error) {
    console.error('deleteResource error:', error);
    serverError(res, error);
  }
};

exports.generateContentFromResource = async (req, res) => {
  try {
    const { url, title } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }
    let fileText = '';
    
    if (url.includes('.amazonaws.com/')) {
      const { hostname, pathname } = new URL(url);
      const bucket = hostname.split('.')[0];
      // When S3 URLs are signed they contain query params, but pathname is just the path
      const key = decodeURIComponent(pathname.slice(1));
      
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      const response = await s3.send(cmd);
      
      const streamToBuffer = (stream) =>
        new Promise((resolve, reject) => {
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => resolve(Buffer.concat(chunks)));
        });
        
      const buffer = await streamToBuffer(response.Body);
      
      if (key.toLowerCase().endsWith('.pdf')) {
        const pdfData = await pdfParse(buffer);
        fileText = pdfData.text;
      } else {
        fileText = buffer.toString('utf-8');
      }
    } else {
      return res.status(400).json({ success: false, message: 'Only uploaded files are supported for AI generation currently' });
    }
    
    if (!fileText || !fileText.trim()) {
      return res.status(400).json({ success: false, message: 'Could not extract text from file' });
    }
    
    const aiContent = await generateContentFromFile(fileText, title);
    res.json({ success: true, content: aiContent });
  } catch (error) {
    console.error('generateContentFromResource error:', error);
    serverError(res, error);
  }
};

exports.generateExerciseFromResource = async (req, res) => {
  try {
    const { url, title } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }
    let fileText = '';
    
    if (url.includes('.amazonaws.com/')) {
      const { hostname, pathname } = new URL(url);
      const bucket = hostname.split('.')[0];
      const key = decodeURIComponent(pathname.slice(1));
      
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      const response = await s3.send(cmd);
      
      const streamToBuffer = (stream) =>
        new Promise((resolve, reject) => {
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => resolve(Buffer.concat(chunks)));
        });
        
      const buffer = await streamToBuffer(response.Body);
      
      if (key.toLowerCase().endsWith('.pdf')) {
        const pdfData = await pdfParse(buffer);
        fileText = pdfData.text;
      } else {
        fileText = buffer.toString('utf-8');
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid S3 URL' });
    }

    const aiContent = await generateExerciseFromFile(fileText, title);
    res.json({ success: true, content: aiContent });
  } catch (error) {
    console.error('generateExerciseFromResource error:', error);
    serverError(res, error);
  }
};
