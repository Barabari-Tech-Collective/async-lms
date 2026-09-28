const serverError = require('../utils/serverError');
const pool = require('../config/pg');
const { logAction } = require('../utils/auditLogger');
const { notifyCollege } = require('../services/notificationService');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { withS3Prefix } = require('../utils/s3');
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

const s3Configured = () =>
  !!(
    process.env.AWS_S3_BUCKET &&
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );

// Converts a raw S3 URL to a 1-hour presigned URL; returns original if not S3
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

async function presignRow(row) {
  if (!row) return row;
  const copy = { ...row };
  if (copy.instruction_file_url)
    copy.instruction_file_url = await presignS3Url(copy.instruction_file_url);
  if (copy.submission_file_url)
    copy.submission_file_url = await presignS3Url(copy.submission_file_url);
  return copy;
}

// ─── Shared file upload helper (S3 → local fallback) ─────────────────────────
// s3KeyPrefix  : e.g. 'assignment-instructions'
// localSubPath : subfolder under public/uploads, e.g. '' or 'submissions'
async function storeFile(file, { s3KeyPrefix, localSubPath }) {
  const safeName = file.originalname
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');
  const filename = `${Date.now()}-${safeName}`;

  if (s3Configured()) {
    try {
      const key = withS3Prefix(`${s3KeyPrefix}/${filename}`);
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      console.log('S3 upload success:', url);
      return { url, name: file.originalname };
    } catch (s3Error) {
      console.error('S3 upload failed, using local fallback:', s3Error);
    }
  } else {
    console.log('S3 not configured, using local storage fallback');
  }

  // Local fallback
  const uploadDir = localSubPath
    ? path.join(__dirname, '..', 'public', 'uploads', localSubPath)
    : path.join(__dirname, '..', 'public', 'uploads');
  await mkdirAsync(uploadDir, { recursive: true });
  await writeFileAsync(path.join(uploadDir, filename), file.buffer);
  const base =
    process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
  const urlPath = localSubPath
    ? `uploads/${localSubPath}/${filename}`
    : `uploads/${filename}`;
  const url = `${base}/${urlPath}`;
  console.log('Local upload success:', url);
  return { url, name: file.originalname };
}

// ─── Get Dynamic Courses for Assignment Creation ─────────────────────────────
// GET /api/v1/college-assignments/courses
exports.getCoursesForAssignment = async (req, res) => {
  try {
    const role = req.user.role;
    let query = '';
    let params = [];

    if (role === 'admin') {
      // Admin sees all subjects
      query = `
        SELECT id as value, name as label, slug
        FROM subjects
        WHERE is_published = true AND is_deleted = false
        ORDER BY name ASC
      `;
    } else {
      // Facilitator sees only their assigned subjects
      const subjectIds = req.user.subject_ids || [];
      if (subjectIds.length === 0) {
        return res.json({ success: true, data: [] });
      }
      query = `
        SELECT id as value, name as label, slug
        FROM subjects
        WHERE id = ANY($1::uuid[]) AND is_published = true AND is_deleted = false
        ORDER BY name ASC
      `;
      params = [subjectIds];
    }

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('getCoursesForAssignment error:', error);
    serverError(res, error);
  }
};

// GET /api/v1/college-assignments/courses/:courseId/topics
exports.getTopicsForCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const query = `
      SELECT id as value, title as label
      FROM topics
      WHERE subject_id = $1 AND is_deleted = false
      ORDER BY order_index ASC
    `;
    const result = await pool.query(query, [courseId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('getTopicsForCourse error:', error);
    serverError(res, error);
  }
};

// ─── Upload Instruction Document ─────────────────────────────────────────────

// POST /api/v1/college-assignments/upload-instruction
exports.uploadInstructionDoc = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'No file uploaded' });
    }

    const { url, name } = await storeFile(req.file, {
      s3KeyPrefix: 'assignment-instructions',
      localSubPath: '',
    });

    logAction({
      req,
      action: 'CREATE',
      entityType: 'assignment_instruction_doc',
      entityId: null,
      details: { url, name },
    });
    res.json({ success: true, url, filename: name });
  } catch (error) {
    console.error('uploadInstructionDoc error:', error);
    serverError(res, error);
  }
};

// ─── Student ─────────────────────────────────────────────────────────────────

// GET /api/v1/college-assignments
// Returns assignments for the student's own college (college_id comes from JWT).
exports.getMyCollegeAssignments = async (req, res) => {
  const college_id = req.user.college_id;

  if (!college_id) {
    return res
      .status(400)
      .json({ success: false, message: 'No college linked to your account' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT ca.id, ca.title, ca.description, ca.due_date, ca.created_at, ca.course,
              ca.instruction_file_url, ca.instruction_file_name,
              ca.test_cases, ca.rubric, ca.evaluator_type, ca.assignment_description,
              u.full_name AS created_by_name,
              cas.submission_link, cas.submission_file_url, cas.submitted_at
       FROM college_assignments ca
       LEFT JOIN users u ON u.id = ca.created_by
       LEFT JOIN college_assignment_submissions cas ON cas.assignment_id = ca.id AND cas.student_id = $2
       WHERE ca.college_id = $1 AND ca.is_deleted = false
       ORDER BY ca.due_date ASC NULLS LAST, ca.created_at DESC`,
      [college_id, req.user.id],
    );
    const data = await Promise.all(rows.map(presignRow));
    res.json({ success: true, data });
  } catch (error) {
    console.error('getMyCollegeAssignments:', error);
    serverError(res, error);
  }
};

// ─── Admin / Facilitator ──────────────────────────────────────────────────────

// GET /api/v1/college-assignments/manage
// Admin → all assignments across all colleges.
// Facilitator → only assignments they created.
exports.manageAssignments = async (req, res) => {
  try {
    let query, values;

    if (req.user.role === 'admin') {
      query = `
        SELECT ca.id, ca.title, ca.description, ca.due_date, ca.course, ca.created_at, ca.updated_at,
               ca.instruction_file_url, ca.instruction_file_name,
               ca.college_id, c.name AS college_name,
               u.full_name AS created_by_name,
               (
                 SELECT COUNT(*)::int 
                 FROM college_assignment_submissions cas 
                 WHERE cas.assignment_id = ca.id
               ) as submissions_count,
               (
                 SELECT COUNT(*)::int 
                 FROM student_profiles sp 
                 WHERE sp.college_id = ca.college_id
               ) as submissions_total,
               e.status as evaluation_status
        FROM college_assignments ca
        LEFT JOIN colleges c ON c.id = ca.college_id
        LEFT JOIN users u ON u.id = ca.created_by
        LEFT JOIN evaluations e ON e.assignment_id = ca.id
        WHERE ca.is_deleted = false
        ORDER BY c.name ASC, ca.due_date ASC NULLS LAST`;
      values = [];
    } else {
      // Facilitator: only assignments they created
      query = `
        SELECT ca.id, ca.title, ca.description, ca.due_date, ca.course, ca.created_at, ca.updated_at,
               ca.instruction_file_url, ca.instruction_file_name,
               ca.college_id, c.name AS college_name,
               u.full_name AS created_by_name,
               (
                 SELECT COUNT(*)::int 
                 FROM college_assignment_submissions cas 
                 WHERE cas.assignment_id = ca.id
               ) as submissions_count,
               (
                 SELECT COUNT(*)::int 
                 FROM student_profiles sp 
                 WHERE sp.college_id = ca.college_id
               ) as submissions_total,
               e.status as evaluation_status
        FROM college_assignments ca
        LEFT JOIN colleges c ON c.id = ca.college_id
        LEFT JOIN users u ON u.id = ca.created_by
        LEFT JOIN evaluations e ON e.assignment_id = ca.id
        WHERE ca.created_by = $1 AND ca.is_deleted = false
        ORDER BY c.name ASC, ca.due_date ASC NULLS LAST`;
      values = [req.user.id];
    }

    const { rows } = await pool.query(query, values);
    const data = await Promise.all(rows.map(presignRow));
    res.json({ success: true, data });
  } catch (error) {
    console.error('manageAssignments:', error);
    serverError(res, error);
  }
};

// POST /api/v1/college-assignments
// Body: { college_id, college_ids, title, description?, due_date? }
exports.createAssignment = async (req, res) => {
  const {
    college_id,
    college_ids,
    title,
    description,
    due_date,
    course,
    test_cases,
    rubric,
    evaluator_type,
    assignment_description,
  } = req.body;

  const targetCollegeIds = Array.isArray(college_ids)
    ? college_ids
    : college_id
      ? [college_id]
      : [];

  if (targetCollegeIds.length === 0 || !title) {
    return res
      .status(400)
      .json({
        success: false,
        message: 'college_id/college_ids and title are required',
      });
  }

  // Facilitators may only create assignments for their own colleges and assigned subjects
  if (req.user.role === 'facilitator') {
    const allowed = req.user.college_ids || [];
    for (const cid of targetCollegeIds) {
      if (!allowed.includes(cid)) {
        return res.status(403).json({
          success: false,
          message: `You are not assigned to college: ${cid}`,
        });
      }
    }

    const allowedSubjects = req.user.subject_ids || [];
    if (allowedSubjects.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You have no assigned subjects to create assignments for',
      });
    }

    if (course && course !== 'General') {
      const validSubj = await pool.query(
        'SELECT 1 FROM subjects WHERE (id::text = $1 OR slug = $1 OR name = $1) AND id = ANY($2::uuid[])',
        [course, allowedSubjects],
      );
      if (validSubj.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'You are not assigned to this subject/course',
        });
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const createdAssignments = [];

    for (const cid of targetCollegeIds) {
      const { rows } = await client.query(
        `INSERT INTO college_assignments (college_id, created_by, title, description, due_date, course, topic_id, instruction_file_url, instruction_file_name, test_cases, rubric, evaluator_type, assignment_description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          cid,
          req.user.id,
          title,
          description || null,
          due_date || null,
          course || 'General',
          req.body.topic_id || null,
          req.body.instruction_file_url || null,
          req.body.instruction_file_name || null,
          test_cases ? JSON.stringify(test_cases) : '[]',
          rubric ? JSON.stringify(rubric) : null,
          evaluator_type || null,
          assignment_description || null,
        ],
      );
      const assignment = rows[0];
      createdAssignments.push(assignment);
      logAction({
        req,
        action: 'CREATE',
        entityType: 'college_assignment',
        entityId: assignment.id,
        details: { title, college_id: cid },
      });

      // Notify all students in the college about the new assignment
      notifyCollege({
        collegeId: cid,
        type: 'new_assignment',
        title: `New Assignment: ${title}`,
        body: due_date
          ? `Due ${new Date(due_date).toLocaleDateString()}: ${description || title}`
          : description || title,
        link: '/dashboard/student/assignments',
      });
    }

    await client.query('COMMIT');
    res
      .status(201)
      .json({
        success: true,
        data: createdAssignments[0],
        all_data: createdAssignments,
      });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('createAssignment ERROR:', error);
    serverError(res, error);
  } finally {
    client.release();
  }
};

// PUT /api/v1/college-assignments/:id
// Body: { title?, description?, due_date? }
exports.updateAssignment = async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    due_date,
    course,
    test_cases,
    rubric,
    evaluator_type,
    assignment_description,
  } = req.body;

  try {
    // Fetch existing to check ownership scope for facilitators
    const existing = await pool.query(
      'SELECT * FROM college_assignments WHERE id = $1 AND is_deleted = false',
      [id],
    );
    if (!existing.rowCount) {
      return res
        .status(404)
        .json({ success: false, message: 'Assignment not found' });
    }

    if (req.user.role === 'facilitator') {
      const allowedColleges = req.user.college_ids || [];
      const allowedSubjects = req.user.subject_ids || [];
      const assignment = existing.rows[0];

      if (!allowedColleges.includes(assignment.college_id)) {
        return res.status(403).json({
          success: false,
          message: 'You are not assigned to this college',
        });
      }

      const isAuthor = assignment.created_by === req.user.id;
      let isSubjectAssigned = assignment.course === 'General';
      if (!isSubjectAssigned && assignment.course && allowedSubjects.length > 0) {
        const check = await pool.query(
          `SELECT 1 FROM subjects 
           WHERE (id::text = $1 OR slug = $1 OR name = $1) 
             AND id = ANY($2::uuid[]) AND is_deleted = false`,
          [assignment.course, allowedSubjects],
        );
        isSubjectAssigned = check.rows.length > 0;
      }

      if (!isAuthor && !isSubjectAssigned) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not authorized to modify this assignment',
        });
      }

      // If course is being changed, verify new course is allowed
      if (course && course !== 'General') {
        if (allowedSubjects.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Cannot reassign to an unauthorized subject',
          });
        }
        const newCourseCheck = await pool.query(
          `SELECT 1 FROM subjects 
           WHERE (id::text = $1 OR slug = $1 OR name = $1) 
             AND id = ANY($2::uuid[]) AND is_deleted = false`,
          [course, allowedSubjects],
        );
        if (newCourseCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Cannot reassign to an unauthorized subject',
          });
        }
      }
    }

    const { rows } = await pool.query(
      `UPDATE college_assignments
       SET title                 = COALESCE($1, title),
           description           = COALESCE($2, description),
           due_date              = COALESCE($3, due_date),
           course                = COALESCE($4, course),
           topic_id              = COALESCE($5, topic_id),
           instruction_file_url  = COALESCE($6, instruction_file_url),
           instruction_file_name = COALESCE($7, instruction_file_name),
           test_cases            = COALESCE($8, test_cases),
           rubric                = COALESCE($9, rubric),
           evaluator_type        = COALESCE($10, evaluator_type),
           assignment_description= COALESCE($11, assignment_description),
           updated_at  = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        title || null,
        description || null,
        due_date || null,
        course || null,
        req.body.topic_id || null,
        req.body.instruction_file_url || null,
        req.body.instruction_file_name || null,
        test_cases ? JSON.stringify(test_cases) : null,
        rubric ? JSON.stringify(rubric) : null,
        evaluator_type || null,
        assignment_description || null,
        id,
      ],
    );
    logAction({
      req,
      action: 'UPDATE',
      entityType: 'college_assignment',
      entityId: id,
      details: { title },
    });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('updateAssignment:', error);
    serverError(res, error);
  }
};

// DELETE /api/v1/college-assignments/:id
exports.deleteAssignment = async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await pool.query(
      'SELECT id, college_id, course, created_by FROM college_assignments WHERE id = $1 AND is_deleted = false',
      [id],
    );
    if (!existing.rowCount) {
      return res
        .status(404)
        .json({ success: false, message: 'Assignment not found' });
    }

    if (req.user.role === 'facilitator') {
      const allowedColleges = req.user.college_ids || [];
      const allowedSubjects = req.user.subject_ids || [];
      const assignment = existing.rows[0];

      if (!allowedColleges.includes(assignment.college_id)) {
        return res.status(403).json({
          success: false,
          message: 'You are not assigned to this college',
        });
      }

      const isAuthor = assignment.created_by === req.user.id;
      let isSubjectAssigned = assignment.course === 'General';
      if (!isSubjectAssigned && assignment.course && allowedSubjects.length > 0) {
        const check = await pool.query(
          `SELECT 1 FROM subjects 
           WHERE (id::text = $1 OR slug = $1 OR name = $1) 
             AND id = ANY($2::uuid[]) AND is_deleted = false`,
          [assignment.course, allowedSubjects],
        );
        isSubjectAssigned = check.rows.length > 0;
      }

      if (!isAuthor && !isSubjectAssigned) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not authorized to delete this assignment',
        });
      }
    }

    const result = await pool.query(
      'UPDATE college_assignments SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *',
      [id],
    );
    if (!result.rowCount) {
      return res
        .status(404)
        .json({ success: false, message: 'Assignment not found' });
    }
    logAction({
      req,
      action: 'DELETE',
      entityType: 'college_assignment',
      entityId: id,
    });
    res.json({ success: true, message: 'Assignment deleted' });
  } catch (error) {
    console.error('deleteAssignment:', error);
    serverError(res, error);
  }
};

// GET /api/v1/college-assignments/:id
// Returns a single assignment with student's specific submission
exports.getCollegeAssignmentById = async (req, res) => {
  const { id } = req.params;
  const student_id = req.user.id;

  try {
    const { rows } = await pool.query(
      `SELECT ca.id, ca.title, ca.description, ca.due_date, ca.created_at, ca.course,
              ca.instruction_file_url, ca.instruction_file_name,
              ca.test_cases, ca.rubric, ca.evaluator_type, ca.assignment_description,
              u.full_name AS created_by_name,
              cas.submission_link, cas.submission_file_url, cas.submission_file_name, cas.submitted_at
       FROM college_assignments ca
       LEFT JOIN users u ON u.id = ca.created_by
       LEFT JOIN college_assignment_submissions cas ON cas.assignment_id = ca.id AND cas.student_id = $2
       WHERE ca.id = $1 AND ca.is_deleted = false`,
      [id, student_id],
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: 'Assignment not found' });
    }

    res.json({ success: true, data: await presignRow(rows[0]) });
  } catch (error) {
    console.error('getCollegeAssignmentById:', error);
    serverError(res, error);
  }
};

// ─── Submission ─────────────────────────────────────────────────────────────

// POST /api/v1/college-assignments/:id/submit
exports.submitCollegeAssignment = async (req, res) => {
  const { id } = req.params;
  const { submission_link } = req.body || {};
  const student_id = req.user.id;

  try {
    // 1. Verify existence
    const assignment = await pool.query(
      'SELECT id FROM college_assignments WHERE id = $1 AND is_deleted = false',
      [id],
    );
    if (!assignment.rowCount) {
      return res
        .status(404)
        .json({ success: false, message: 'Assignment not found' });
    }

    if (!req.file && !submission_link) {
      return res.status(400).json({
        success: false,
        message: 'A submission_link or a file is required',
      });
    }

    let file_url = null;
    let file_name = null;

    // 2. Handle file upload if present
    if (req.file) {
      const { url, name } = await storeFile(req.file, {
        s3KeyPrefix: 'college-submissions',
        localSubPath: 'submissions',
      });
      file_url = url;
      file_name = name;
    }

    // 3. Upsert submission
    const { rows } = await pool.query(
      `INSERT INTO college_assignment_submissions
       (assignment_id, student_id, submission_link, submission_file_url, submission_file_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (assignment_id, student_id)
       DO UPDATE SET
         submission_link = COALESCE(EXCLUDED.submission_link, college_assignment_submissions.submission_link),
         submission_file_url = COALESCE(EXCLUDED.submission_file_url, college_assignment_submissions.submission_file_url),
         submission_file_name = COALESCE(EXCLUDED.submission_file_name, college_assignment_submissions.submission_file_name),
         updated_at = NOW()
       RETURNING *`,
      [id, student_id, submission_link || null, file_url, file_name],
    );

    logAction({
      req,
      action: 'CREATE',
      entityType: 'college_assignment_submission',
      entityId: id,
      details: { submission_link },
    });
    res.json({
      success: true,
      data: rows[0],
      message: 'Assignment submitted successfully',
    });
  } catch (error) {
    console.error('submitCollegeAssignment ERROR:', error);
    serverError(res, error);
  }
};

// GET /api/v1/college-assignments/:id
// Returns a single assignment with student's specific submission
exports.getCollegeAssignmentById = async (req, res) => {
  const { id } = req.params;
  const student_id = req.user.id;

  try {
    const { rows } = await pool.query(
      `SELECT ca.id, ca.title, ca.description, ca.due_date, ca.created_at, ca.course,
              ca.instruction_file_url, ca.instruction_file_name,
              ca.test_cases, ca.rubric, ca.evaluator_type, ca.assignment_description,
              u.full_name AS created_by_name,
              cas.submission_link, cas.submission_file_url, cas.submission_file_name, cas.submitted_at
       FROM college_assignments ca
       LEFT JOIN users u ON u.id = ca.created_by
       LEFT JOIN college_assignment_submissions cas ON cas.assignment_id = ca.id AND cas.student_id = $2
       WHERE ca.id = $1 AND ca.is_deleted = false`,
      [id, student_id],
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: 'Assignment not found' });
    }

    res.json({ success: true, data: await presignRow(rows[0]) });
  } catch (error) {
    console.error('getCollegeAssignmentById:', error);
    serverError(res, error);
  }
};

// GET /api/v1/college-assignments/submissions/:assignmentId
// Returns all student submissions for either a unit assignment or a college assignment.
// Facilitators only see submissions from students in their assigned colleges.
exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const isFacilitator = req.user.role === 'facilitator';
    const facilitatorCollegeIds = req.user.college_ids || [];
    const facilitatorSubjectIds = req.user.subject_ids || [];

    // Determine assignment type
    const unitCheck = await pool.query(
      `SELECT id FROM assignments WHERE id = $1`,
      [assignmentId],
    );
    const isUnitAssignment = unitCheck.rowCount > 0;

    let rows;

    if (isUnitAssignment) {
      if (isFacilitator) {
        const subjCheck = await pool.query(
          `SELECT t.subject_id FROM assignments a
           JOIN units u ON a.unit_id = u.id
           JOIN topics t ON u.topic_id = t.id
           WHERE a.id = $1`,
          [assignmentId],
        );
        if (!subjCheck.rowCount || !facilitatorSubjectIds.includes(subjCheck.rows[0].subject_id)) {
          return res.status(403).json({ success: false, message: 'Access denied: Assignment does not belong to your assigned subjects' });
        }
      }

      const collegeFilter = isFacilitator ? 'AND sp.college_id = ANY($2)' : '';
      const values = isFacilitator
        ? [assignmentId, facilitatorCollegeIds]
        : [assignmentId];

      const result = await pool.query(
        `SELECT
           asub.id,
           asub.submission_link,
           asub.submitted_at,
           u.full_name  AS student_name,
           u.email      AS student_email,
           c.name       AS college_name
         FROM assignment_submissions asub
         JOIN users u            ON u.id  = asub.user_id
         LEFT JOIN student_profiles sp ON sp.user_id = asub.user_id
         LEFT JOIN colleges c    ON c.id  = sp.college_id
         WHERE asub.assignment_id = $1
         ${collegeFilter}
         ORDER BY asub.submitted_at DESC`,
        values,
      );
      rows = result.rows;
    } else {
      // College assignment — check facilitator owns this college and subject
      if (isFacilitator) {
        const ownerCheck = await pool.query(
          `SELECT ca.college_id, ca.course, ca.created_by FROM college_assignments ca WHERE ca.id = $1 AND ca.is_deleted = false`,
          [assignmentId],
        );
        if (!ownerCheck.rowCount) {
          return res
            .status(404)
            .json({ success: false, message: 'Assignment not found' });
        }
        const ca = ownerCheck.rows[0];
        if (!facilitatorCollegeIds.includes(ca.college_id)) {
          return res
            .status(403)
            .json({ success: false, message: 'Access denied: College not assigned to you' });
        }
        if (ca.course && ca.course !== 'General') {
          const validSubj = await pool.query(
            'SELECT 1 FROM subjects WHERE (id::text = $1 OR slug = $1 OR name = $1) AND id = ANY($2::uuid[])',
            [ca.course, facilitatorSubjectIds],
          );
          if (validSubj.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied: Assignment does not belong to your assigned subjects' });
          }
        }
      }

      const collegeFilter = isFacilitator ? 'AND sp.college_id = ANY($2)' : '';
      const values = isFacilitator ? [assignmentId, facilitatorCollegeIds] : [assignmentId];

      const result = await pool.query(
        `SELECT
           cas.id,
           cas.submission_link,
           cas.submission_file_url,
           cas.submission_file_name,
           cas.submitted_at,
           u.full_name  AS student_name,
           u.email      AS student_email,
           c.name       AS college_name
         FROM college_assignment_submissions cas
         JOIN users u            ON u.id  = cas.student_id
         LEFT JOIN student_profiles sp ON sp.user_id = cas.student_id
         LEFT JOIN colleges c    ON c.id  = sp.college_id
         WHERE cas.assignment_id = $1
         ${collegeFilter}
         ORDER BY cas.submitted_at DESC`,
        values,
      );
      rows = result.rows;
    }

    res.json({
      success: true,
      data: rows,
      type: isUnitAssignment ? 'unit' : 'college',
    });
  } catch (error) {
    console.error('getAssignmentSubmissions error:', error);
    serverError(res, error);
  }
};

// GET /api/v1/college-assignments/evaluation-filters
exports.getFilteredAssignments = async (req, res) => {
  try {
    const { collegeId, domain, search, batch } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.pageSize, 10) || 10),
    );
    const isFacilitator = req.user.role === 'facilitator';
    const facilitatorCollegeIds = req.user.college_ids || [];
    const facilitatorSubjectIds = req.user.subject_ids || [];

    if (isFacilitator && (!facilitatorCollegeIds.length || !facilitatorSubjectIds.length)) {
      return res.json({
        success: true,
        data: [],
        pagination: { page, pageSize, total: 0, totalPages: 1 },
      });
    }

    const values = [];
    const getNextIndex = (val) => {
      values.push(val);
      return values.length;
    };

    let facCollegesIdx = null;
    let facSubjectsIdx = null;
    let facUserIdx = null;
    if (isFacilitator) {
      facCollegesIdx = getNextIndex(facilitatorCollegeIds);
      facSubjectsIdx = getNextIndex(facilitatorSubjectIds);
      facUserIdx = getNextIndex(req.user.id);
    }

    let collegeParamIdx = null;
    if (collegeId) {
      collegeParamIdx = getNextIndex(collegeId);
    }

    let batchParamIdx = null;
    if (batch) {
      batchParamIdx = getNextIndex(batch);
    }

    let submissionFilterUnit = '';
    let submissionFilterCollege = '';

    if (facCollegesIdx) {
      submissionFilterUnit += ` AND sp.college_id = ANY($${facCollegesIdx})`;
      submissionFilterCollege += ` AND sp.college_id = ANY($${facCollegesIdx})`;
    }
    if (collegeParamIdx) {
      submissionFilterUnit += ` AND sp.college_id = $${collegeParamIdx}`;
      submissionFilterCollege += ` AND sp.college_id = $${collegeParamIdx}`;
    }
    if (batchParamIdx) {
      submissionFilterUnit += ` AND sp.expected_graduation_year = $${batchParamIdx}`;
      submissionFilterCollege += ` AND sp.expected_graduation_year = $${batchParamIdx}`;
    }

    let caWhere = 'WHERE ca.is_deleted = false';
    if (isFacilitator) {
      caWhere += `
        AND ca.college_id = ANY($${facCollegesIdx})
        AND (
          EXISTS (
            SELECT 1 FROM public.subjects s_chk
            WHERE s_chk.id = ANY($${facSubjectsIdx})
              AND (s_chk.id::text = ca.course OR s_chk.slug = ca.course OR s_chk.name = ca.course)
          )
          OR (ca.course = 'General' AND ca.created_by = $${facUserIdx})
        )
      `;
    }

    let aWhere = 'WHERE a.is_deleted = false';
    if (isFacilitator) {
      aWhere += ` AND t.subject_id = ANY($${facSubjectsIdx})`;
    }

    let query = `
      WITH all_assignments AS (
        -- 1. Facilitator-Created College Assignments
        SELECT 
          ca.id, 
          ca.title, 
          ca.course, 
          'college' as type,
          ca.college_id, 
          c.name AS college_name,
          ca.created_at,
          ca.due_date,
          (
            SELECT COUNT(*)::int 
            FROM public.college_assignment_submissions cas 
            JOIN public.student_profiles sp ON sp.user_id = cas.student_id
            WHERE cas.assignment_id = ca.id
            ${submissionFilterCollege}
          ) as submissions_count,
          CASE WHEN e.status = 'completed' THEN 'evaluated' ELSE 'pending' END as status,
          e.id as evaluation_id
        FROM public.college_assignments ca
        JOIN public.colleges c ON c.id = ca.college_id
        LEFT JOIN LATERAL (
          SELECT * FROM public.evaluations
          WHERE college_assignment_id = ca.id
          ORDER BY created_at DESC
          LIMIT 1
        ) e ON true
        ${caWhere}

        UNION ALL

        -- 2. Curriculum-level Unit Assignments
        SELECT 
          a.id, 
          a.title, 
          s.name as course, 
          'unit' as type,
          NULL as college_id, 
          'Curriculum' as college_name,
          NULL as created_at,
          NULL as due_date,
          (
            SELECT COUNT(DISTINCT asub.user_id)::int 
            FROM public.assignment_submissions asub
            JOIN public.student_profiles sp ON asub.user_id = sp.user_id
            WHERE asub.assignment_id = a.id
            ${submissionFilterUnit}
          ) as submissions_count,
          CASE WHEN e.status = 'completed' THEN 'evaluated' ELSE 'pending' END as status,
          e.id as evaluation_id
        FROM public.assignments a
        JOIN public.units u ON a.unit_id = u.id
        JOIN public.topics t ON u.topic_id = t.id
        JOIN public.subjects s ON t.subject_id = s.id
        LEFT JOIN LATERAL (
          SELECT * FROM public.evaluations
          WHERE assignment_id = a.id
          ORDER BY created_at DESC
          LIMIT 1
        ) e ON true
        ${aWhere}
      )
      SELECT * FROM all_assignments
      WHERE 1=1
    `;

    // 🎯 College filter on outer query
    if (collegeParamIdx) {
      query += ` AND (college_id = $${collegeParamIdx} OR type = 'unit')`;
    }

    // 🎯 Domain filter
    if (domain) {
      const domainIdx = getNextIndex(domain);
      query += ` AND (LOWER(course) LIKE LOWER('%' || $${domainIdx} || '%') OR LOWER($${domainIdx}) LIKE '%' || LOWER(course) || '%')`;
    }

    // 🔍 Search filter
    if (search) {
      const searchIdx = getNextIndex(`%${search}%`);
      query += ` AND LOWER(title) LIKE LOWER($${searchIdx})`;
    }

    // Only show assignments that have at least one submission matching the criteria
    query += ` AND submissions_count > 0`;

    query += ` ORDER BY created_at DESC NULLS LAST, title ASC`;

    const limitIdx = getNextIndex(pageSize);
    const offsetIdx = getNextIndex((page - 1) * pageSize);
    query = `SELECT *, COUNT(*) OVER()::int AS total_count FROM (${query}) paged LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const { rows } = await pool.query(query, values);
    const total = rows[0]?.total_count ?? 0;
    const data = rows.map(({ total_count, ...rest }) => rest);
    res.json({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error('getFilteredAssignments Error:', error);
    serverError(res, error);
  }
};
