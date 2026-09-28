const pool = require('../config/pg');
const bcrypt = require('bcrypt');
const { logAction } = require('../utils/auditLogger');
const { calculateSubjectProgress } = require('../utils/progress');

// @desc    Get subjects for a specific student
exports.getUserSubjects = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT 
        s.id, 
        s.name, 
        s.slug, 
        s.description, 
        s.level, 
        -- Count total subtopics for this subject
        (SELECT COUNT(st.id) 
         FROM public.subtopics st 
         JOIN public.units u ON st.unit_id = u.id
         JOIN public.topics t ON u.topic_id = t.id 
         WHERE t.subject_id = s.id) as total_lessons,
        us.progress_percent as progress_percent
      FROM public.subjects s
      INNER JOIN public.user_subjects us ON s.id = us.subject_id 
      WHERE us.user_id = $1 AND s.is_published = true AND s.is_deleted = false
      ORDER BY us.progress_percent DESC, us.started_at DESC NULLS LAST, s.id ASC;
    `;

    const { rows } = await pool.query(query, [userId]);

    // Ensure progress is freshly accurate and synchronized
    const enriched = await Promise.all(
      rows.map(async (row) => {
        try {
          const { percent } = await calculateSubjectProgress(userId, row.id);
          if (row.progress_percent !== percent) {
            pool
              .query(
                'UPDATE public.user_subjects SET progress_percent = $1 WHERE user_id = $2 AND subject_id = $3',
                [percent, userId, row.id],
              )
              .catch(() => {});
            row.progress_percent = percent;
          }
        } catch {
          // Fallback to row.progress_percent
        }
        return row;
      }),
    );

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('Error fetching student subjects:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get authenticated user's profile (all roles)
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT
         u.id, u.full_name, u.email, LOWER(r.role_key) AS role, u.domain, u.role_focus, u.created_at,
         sp.degree, sp.year, sp.current_academic_year,
         COALESCE(c.id, fc_c.id) AS college_id,
         COALESCE(c.name, fc_c.name) AS college_name,
         COALESCE((SELECT SUM(points) FROM public.points_log WHERE user_id = u.id), 0)::integer AS total_points,
         COALESCE(us.current_streak, 0) AS current_streak,
         COALESCE(us.longest_streak, 0) AS longest_streak,
         (SELECT COUNT(*) FROM public.user_badges WHERE user_id = u.id)::integer AS badge_count
       FROM public.users u
       LEFT JOIN public.roles r ON r.id = u.role_id
       LEFT JOIN public.student_profiles sp ON sp.user_id = u.id
       LEFT JOIN public.colleges c ON c.id = sp.college_id
       LEFT JOIN public.facilitator_colleges fc ON fc.facilitator_id = u.id AND fc.is_deleted = false
       LEFT JOIN public.colleges fc_c ON fc_c.id = fc.college_id
       LEFT JOIN public.user_streaks us ON us.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id, u.full_name, u.email, r.role_key, u.domain, u.role_focus, u.created_at,
         sp.degree, sp.year, sp.current_academic_year, c.id, c.name, fc_c.id, fc_c.name,
         us.current_streak, us.longest_streak`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('getUserProfile error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get authenticated user's earned badges
exports.getUserBadges = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT b.id, b.title AS name, b.description, ub.earned_at AS awarded_at
       FROM public.user_badges ub
       JOIN public.badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1
       ORDER BY ub.earned_at DESC`,
      [userId],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getUserBadges error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get recent points activity for the authenticated user
exports.getUserActivity = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;

    const result = await pool.query(
      `SELECT source, points, created_at, COUNT(*) OVER ()::integer as total_count
       FROM public.points_log
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    );

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
  } catch (err) {
    console.error('getUserActivity error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Change authenticated user's password
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res
        .status(400)
        .json({
          success: false,
          message: 'Both current and new password are required',
        });
    }

    if (new_password.length < 6) {
      return res
        .status(400)
        .json({
          success: false,
          message: 'New password must be at least 6 characters',
        });
    }

    const { rows } = await pool.query(
      `SELECT password_hash FROM public.users WHERE id = $1`,
      [userId],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }

    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) {
      return res
        .status(400)
        .json({ success: false, message: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query(
      `UPDATE public.users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newHash, userId],
    );

    logAction({ req, action: 'UPDATE', entityType: 'user', entityId: userId, details: { field: 'password' } });
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('changePassword error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get all users (Admin only) - Enhanced with College Name
exports.getAllUsers = async (req, res) => {
  try {
    const query = `
      SELECT
        u.id,
        u.full_name,
        u.email,
        LOWER(r.role_key) AS role,
        u.domain,
        u.role_focus,
        u.is_verified,
        sp.degree,
        sp.year,
        sp.college_id,
        u.created_at,
        c.name as college_name,
        c.short_code as college_short_name,
        COALESCE(student_meta.enrolled_courses, 0) as enrolled_courses,
        COALESCE(student_meta.completed_subtopics, 0) as completed_subtopics,
        COALESCE(student_meta.total_subtopics, 0) as total_subtopics,
        COALESCE(student_meta.progress_percent, 0) as progress_percent,
        COALESCE(facilitator_meta.college_ids, '{}'::uuid[]) as facilitator_college_ids,
        COALESCE(facilitator_meta.college_names, '{}'::text[]) as facilitator_college_names,
        COALESCE(facilitator_subject_meta.subject_ids, '{}'::uuid[]) as facilitator_subject_ids,
        COALESCE(facilitator_subject_meta.subject_names, '{}'::text[]) as facilitator_subject_names
      FROM public.users u
      LEFT JOIN public.roles r ON r.id = u.role_id
      LEFT JOIN public.student_profiles sp ON u.id = sp.user_id
      LEFT JOIN public.colleges c ON sp.college_id = c.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT us.subject_id)::int as enrolled_courses,
          COALESCE(ROUND(AVG(us.progress_percent))::int, 0) as progress_percent,
          
          -- Calculate total items across enrolled courses
          COALESCE((
            SELECT COUNT(lc.id)::int FROM lesson_content lc
            JOIN subtopics st ON lc.subtopic_id = st.id AND st.is_deleted = false
            JOIN units un ON st.unit_id = un.id AND un.is_deleted = false
            JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
            JOIN user_subjects us2 ON t.subject_id = us2.subject_id
            WHERE us2.user_id = u.id AND lc.is_published = true AND lc.is_deleted = false
          ), 0) + 
          COALESCE((
            SELECT COUNT(q.id)::int FROM quizzes q
            JOIN units un ON q.unit_id = un.id AND un.is_deleted = false
            JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
            JOIN user_subjects us2 ON t.subject_id = us2.subject_id
            WHERE us2.user_id = u.id AND q.is_deleted = false
          ), 0) +
          COALESCE((
            SELECT COUNT(e.id)::int FROM exercises e
            JOIN subtopics st ON e.subtopic_id = st.id AND st.is_deleted = false
            JOIN units un ON st.unit_id = un.id AND un.is_deleted = false
            JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
            JOIN user_subjects us2 ON t.subject_id = us2.subject_id
            WHERE us2.user_id = u.id AND e.is_deleted = false
          ), 0) +
          COALESCE((
            SELECT COUNT(a.id)::int FROM assignments a
            JOIN units un ON a.unit_id = un.id AND un.is_deleted = false
            JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
            JOIN user_subjects us2 ON t.subject_id = us2.subject_id
            WHERE us2.user_id = u.id AND a.is_deleted = false
          ), 0) +
          COALESCE((
            SELECT COUNT(p.id)::int FROM projects p
            JOIN topics t ON p.topic_id = t.id AND t.is_deleted = false
            JOIN user_subjects us2 ON t.subject_id = us2.subject_id
            WHERE us2.user_id = u.id AND p.is_deleted = false
          ), 0) as total_subtopics,

          -- Calculate completed items
          COALESCE((
            SELECT COUNT(DISTINCT ulp.lesson_content_id)::int FROM user_lesson_progress ulp
            WHERE ulp.user_id = u.id AND ulp.is_completed = true 
              AND ulp.lesson_content_id IN (
                SELECT lc.id FROM lesson_content lc
                JOIN subtopics st ON lc.subtopic_id = st.id AND st.is_deleted = false
                JOIN units un ON st.unit_id = un.id AND un.is_deleted = false
                JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
                JOIN user_subjects us2 ON t.subject_id = us2.subject_id
                WHERE us2.user_id = u.id AND lc.is_published = true AND lc.is_deleted = false
              )
          ), 0) +
          COALESCE((
            SELECT COUNT(DISTINCT qa.quiz_id)::int FROM quiz_attempts qa
            WHERE qa.user_id = u.id AND qa.is_passed = true
              AND qa.quiz_id IN (
                SELECT q.id FROM quizzes q
                JOIN units un ON q.unit_id = un.id AND un.is_deleted = false
                JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
                JOIN user_subjects us2 ON t.subject_id = us2.subject_id
                WHERE us2.user_id = u.id AND q.is_deleted = false
              )
          ), 0) +
          COALESCE((
            SELECT COUNT(DISTINCT es.exercise_id)::int FROM exercise_submissions es
            WHERE es.user_id = u.id AND es.is_passed = true
              AND es.exercise_id IN (
                SELECT e.id FROM exercises e
                JOIN subtopics st ON e.subtopic_id = st.id AND st.is_deleted = false
                JOIN units un ON st.unit_id = un.id AND un.is_deleted = false
                JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
                JOIN user_subjects us2 ON t.subject_id = us2.subject_id
                WHERE us2.user_id = u.id AND e.is_deleted = false
              )
          ), 0) +
          COALESCE((
            SELECT COUNT(DISTINCT asub.assignment_id)::int FROM assignment_submissions asub
            WHERE asub.user_id = u.id
              AND asub.assignment_id IN (
                SELECT a.id FROM assignments a
                JOIN units un ON a.unit_id = un.id AND un.is_deleted = false
                JOIN topics t ON un.topic_id = t.id AND t.is_deleted = false
                JOIN user_subjects us2 ON t.subject_id = us2.subject_id
                WHERE us2.user_id = u.id AND a.is_deleted = false
              )
          ), 0) +
          COALESCE((
            SELECT COUNT(DISTINCT ps.project_id)::int FROM project_submissions ps
            WHERE ps.user_id = u.id
              AND ps.project_id IN (
                SELECT p.id FROM projects p
                JOIN topics t ON p.topic_id = t.id AND t.is_deleted = false
                JOIN user_subjects us2 ON t.subject_id = us2.subject_id
                WHERE us2.user_id = u.id AND p.is_deleted = false
              )
          ), 0) as completed_subtopics

        FROM public.user_subjects us
        WHERE us.user_id = u.id
      ) as student_meta ON r.role_key = 'STUDENT'
      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(fc.college_id ORDER BY c2.name) as college_ids,
          ARRAY_AGG(c2.name ORDER BY c2.name) as college_names
        FROM public.facilitator_colleges fc
        INNER JOIN public.colleges c2 ON c2.id = fc.college_id
        WHERE fc.facilitator_id = u.id AND fc.is_deleted = false
      ) as facilitator_meta ON r.role_key = 'FACILITATOR'
      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(fs.subject_id ORDER BY s2.name) as subject_ids,
          ARRAY_AGG(s2.name ORDER BY s2.name) as subject_names
        FROM public.facilitator_subjects fs
        INNER JOIN public.subjects s2 ON s2.id = fs.subject_id
        WHERE fs.facilitator_id = u.id AND fs.is_deleted = false AND s2.is_deleted = false
      ) as facilitator_subject_meta ON r.role_key = 'FACILITATOR'
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC
      LIMIT 1000
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Get All Users Error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single user by ID (Admin only)
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params; // Must be a valid UUID string
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, LOWER(r.role_key) AS role, u.domain, u.role_focus, u.is_verified, u.onboarding_step, u.created_at,
              sp.college_id, sp.degree, sp.year,
              c.name as college_name
       FROM public.users u
       LEFT JOIN public.roles r ON r.id = u.role_id
       LEFT JOIN public.student_profiles sp ON u.id = sp.user_id
       LEFT JOIN public.colleges c ON sp.college_id = c.id
       WHERE u.id = $1`,
      [id],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: 'User not found' });

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get User Error:', err.message);
    res
      .status(500)
      .json({ message: 'Server error (check if ID is valid UUID)' });
  }
};

// @desc    Update user profile details (Admin only)
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, degree, year, college_id, is_verified, facilitator_college_ids, facilitator_subject_ids, domain, role_focus } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Update User (Identity)
      const userUpdateQuery = `
        WITH updated AS (
          UPDATE public.users
          SET full_name = COALESCE($1, full_name),
              is_verified = COALESCE($2, is_verified),
              domain = COALESCE($3, domain),
              role_focus = COALESCE($4, role_focus),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $5
          RETURNING id, full_name, email, role_id, domain, role_focus, is_verified, updated_at
        )
        SELECT updated.id, updated.full_name, updated.email,
               LOWER(r.role_key) AS role, updated.domain, updated.role_focus, updated.is_verified, updated.updated_at
        FROM updated
        LEFT JOIN public.roles r ON r.id = updated.role_id
      `;
      const trimmedName = full_name !== undefined && full_name !== null && String(full_name).trim() !== '' ? String(full_name).trim() : null;
      const verifiedVal = typeof is_verified === 'boolean' ? is_verified : null;
      const domainVal = domain !== undefined && domain !== null && String(domain).trim() !== '' ? String(domain).trim() : null;
      const roleFocusVal = role_focus !== undefined && role_focus !== null && String(role_focus).trim() !== '' ? String(role_focus).trim() : null;
      const userResult = await client.query(userUpdateQuery, [trimmedName, verifiedVal, domainVal, roleFocusVal, id]);

      if (userResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'User not found' });
      }

      const user = userResult.rows[0];

      // 2. Update Student Profile if applicable
      if (user.role === 'student' && (degree !== undefined || year !== undefined || college_id !== undefined)) {
        const profileUpdateQuery = `
          INSERT INTO public.student_profiles (user_id, degree, year, college_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id) DO UPDATE
          SET degree = COALESCE(EXCLUDED.degree, public.student_profiles.degree),
              year = COALESCE(EXCLUDED.year, public.student_profiles.year),
              college_id = COALESCE(EXCLUDED.college_id, public.student_profiles.college_id)
        `;
        await client.query(profileUpdateQuery, [
          id,
          degree !== undefined ? (degree || null) : null,
          year !== undefined ? (year || null) : null,
          college_id !== undefined ? (college_id || null) : null,
        ]);
      }

      // 3. Update Facilitator Colleges if applicable
      if (user.role === 'facilitator' && Array.isArray(facilitator_college_ids)) {
        const uniqueCollegeIds = [...new Set(facilitator_college_ids)];
        await client.query(
          'UPDATE public.facilitator_colleges SET is_deleted = true WHERE facilitator_id = $1 AND is_deleted = false',
          [id]
        );
        if (uniqueCollegeIds.length > 0) {
          await client.query(
            `INSERT INTO public.facilitator_colleges (facilitator_id, college_id)
             SELECT $1, unnest($2::uuid[])
             ON CONFLICT (facilitator_id, college_id) DO UPDATE SET is_deleted = false`,
            [id, uniqueCollegeIds]
          );
        }
      }

      // 4. Update Facilitator Subjects if applicable (Add & Remove with Deduplication)
      if (user.role === 'facilitator' && Array.isArray(facilitator_subject_ids)) {
        const uniqueSubjectIds = [...new Set(facilitator_subject_ids)];
        await client.query(
          'UPDATE public.facilitator_subjects SET is_deleted = true WHERE facilitator_id = $1 AND is_deleted = false',
          [id]
        );
        if (uniqueSubjectIds.length > 0) {
          await client.query(
            `INSERT INTO public.facilitator_subjects (facilitator_id, subject_id)
             SELECT $1, unnest($2::uuid[])
             ON CONFLICT (facilitator_id, subject_id) DO UPDATE SET is_deleted = false`,
            [id, uniqueSubjectIds]
          );
        }
      }

      await client.query('COMMIT');
      logAction({ req, action: 'UPDATE', entityType: 'user', entityId: id, details: { full_name, degree, year, college_id, is_verified, facilitator_college_ids, facilitator_subject_ids, domain, role_focus } });
      res.json(user);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Update User Error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Verify or unverify user (Admin only)
exports.verifyUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_verified } = req.body;

    if (is_verified === undefined) {
      return res.status(400).json({ success: false, message: 'is_verified status is required' });
    }

    const query = `
      WITH updated AS (
        UPDATE public.users
        SET is_verified = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, full_name, role_id, is_verified
      )
      SELECT updated.id, updated.full_name, LOWER(r.role_key) AS role, updated.is_verified
      FROM updated
      LEFT JOIN public.roles r ON r.id = updated.role_id;
    `;

    const result = await pool.query(query, [Boolean(is_verified), id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logAction({ req, action: 'UPDATE', entityType: 'user', entityId: id, details: { is_verified } });
    res.json({
      success: true,
      message: `User ${is_verified ? 'verified' : 'unverified'} successfully`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error verifying user:', error);
    res.status(500).json({ success: false, message: 'Failed to update user verification status' });
  }
};

// @desc    Change user role (Admin only)
exports.changeUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const roleRes = await pool.query(
      'SELECT id FROM public.roles WHERE role_key = $1',
      [(role || '').toUpperCase()],
    );

    if (!roleRes.rowCount) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const result = await pool.query(
      `UPDATE public.users
       SET role_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, updated_at`,
      [roleRes.rows[0].id, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    logAction({ req, action: 'UPDATE', entityType: 'user', entityId: id, details: { new_role: role } });
    res.json({
      message: 'Role updated successfully',
      user: { ...result.rows[0], role: (role || '').toLowerCase() },
    });
  } catch (err) {
    console.error('Change Role Error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * SOFT DELETE USER (Move to Recycle Bin)
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
        
    const result = await pool.query(
      `UPDATE users SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE id = $2 RETURNING id`,
      [adminId, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Soft delete any facilitator subject mappings
    await pool.query(
      `UPDATE facilitator_subjects SET is_deleted = true WHERE facilitator_id = $1`,
      [id]
    ).catch((err) => {
      console.error('Failed to soft-delete facilitator_subjects on user delete:', err.message);
    });

    res.json({ success: true, message: 'User moved to recycle bin' });
  } catch (err) {
    console.error('Delete User Error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * RESTORE USER
 */
exports.restoreUser = async (req, res) => {
  try {
    const { id } = req.params;

    const userCheck = await pool.query(
      `SELECT id, email, full_name, deleted_at FROM users WHERE id = $1`,
      [id]
    );

    if (userCheck.rowCount === 0) {
      return res.status(404).json({ message: 'User not found in recycle bin' });
    }

    const user = userCheck.rows[0];

    if (!user.deleted_at) {
      return res.status(400).json({ message: 'User is already active and not in the recycle bin' });
    }

    // Check if another active user is currently using the same email address
    if (user.email) {
      const conflict = await pool.query(
        `SELECT id, full_name, email FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND deleted_at IS NULL AND id != $2`,
        [user.email, id]
      );
      if (conflict.rowCount > 0) {
        const existing = conflict.rows[0];
        return res.status(400).json({
          message: `Cannot restore "${user.full_name || user.email}" because another active account (${existing.full_name || existing.email}) is already using this email address.`
        });
      }
    }

    const result = await pool.query(
      `UPDATE users SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found in recycle bin' });
    }

    // Reactivate any facilitator college & subject mappings if applicable
    await pool.query(
      `UPDATE facilitator_colleges SET is_deleted = false WHERE facilitator_id = $1`,
      [id]
    ).catch((err) => {
      console.error('Failed to reactivate facilitator_colleges on user restore:', err.message);
    });
    await pool.query(
      `UPDATE facilitator_subjects SET is_deleted = false WHERE facilitator_id = $1`,
      [id]
    ).catch((err) => {
      console.error('Failed to reactivate facilitator_subjects on user restore:', err.message);
    });

    res.json({ success: true, message: 'User restored successfully' });
  } catch (err) {
    console.error('Restore User Error:', err);
    if (err.code === '23505') {
      return res.status(400).json({
        message: 'Cannot restore this user because another active account is already using this email address.'
      });
    }
    res.status(500).json({ message: err.message || 'Server error' });
  }
};

/**
 * PERMANENT DELETE USER
 */
exports.permanentDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;
        
    // Ensure user is actually in the bin before hard deleting
    const check = await pool.query(`SELECT id FROM users WHERE id = $1 AND deleted_at IS NOT NULL`, [id]);
    if (check.rowCount === 0) {
      return res.status(404).json({ message: 'User must be in recycle bin to be permanently deleted' });
    }
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ success: true, message: 'User permanently deleted' });
  } catch (err) {
    console.error('Permanent Delete Error:', err.message);
    res.status(500).json({ message: 'Server error. This user may have active dependencies.' });
  }
};

/**
 * GET RECYCLE BIN (Admin)
 */
exports.getRecycleBin = async (req, res) => {
  try {
    // Admin sees all deleted users
    const query = `
      SELECT u.id, u.full_name, u.email, r.role_key as role, u.deleted_at, db.full_name AS deleted_by_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN users db ON db.id = u.deleted_by
      WHERE u.deleted_at IS NOT NULL
      ORDER BY u.deleted_at DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Get Bin Error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};
