const serverError = require('../utils/serverError');
const pool = require('../config/pg');
const { logAction } = require('../utils/auditLogger');

// GET all colleges
exports.getAllColleges = async (req, res) => {
  try {
    const showVerified = req.query.is_verfied ? true : false;
    const query = showVerified
      ? 'SELECT * FROM colleges WHERE is_verified = true AND is_deleted = false ORDER BY name ASC'
      : 'SELECT * FROM colleges WHERE is_deleted = false ORDER BY name ASC';
    const result = await pool.query(query);
    // Standardized response to match frontend expectations
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.log(`Error || getAllColleges: `, error);
    serverError(res, error);
  }
};

// CREATE or REACTIVATE college
exports.createCollege = async (req, res) => {
  const { name, short_code, city, state } = req.body;
  const cleanName = name?.trim();
  if (!cleanName) {
    return res.status(400).json({
      success: false,
      message: 'College name is required',
    });
  }
  const cleanCity = city?.trim() || null;
  const cleanState = state?.trim() || null;
  const cleanShortCode = short_code?.trim() || null;
  const is_verified = req.user.role === 'admin';

  try {
    // 1. Check for existing college with case-insensitive and trimmed name
    const existingRes = await pool.query(
      `SELECT id, name, is_deleted 
       FROM colleges 
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
       ORDER BY is_deleted ASC, created_at DESC 
       LIMIT 1`,
      [cleanName],
    );

    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      // A. Active college with same name already exists
      if (!existing.is_deleted) {
        return res.status(409).json({
          success: false,
          message: 'College already exists',
        });
      }

      // B. Soft-deleted college exists -> Reactivate and update details
      const reactivateQuery = `
        UPDATE colleges
        SET name = $1,
            short_code = COALESCE($2, short_code),
            city = COALESCE($3, city),
            state = COALESCE($4, state),
            is_verified = $5,
            is_deleted = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *`;
      const reactivated = await pool.query(reactivateQuery, [
        cleanName,
        cleanShortCode,
        cleanCity,
        cleanState,
        is_verified,
        existing.id,
      ]);

      logAction({
        req,
        action: 'CREATE',
        entityType: 'college',
        entityId: existing.id,
        details: { name: cleanName, reactivated: true },
      });

      return res.status(201).json({
        success: true,
        data: reactivated.rows[0],
        message: 'College created',
      });
    }

    // 2. Fresh Insertion
    const insertQuery = `
      INSERT INTO colleges (name, short_code, city, state, is_verified) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *`;
    const result = await pool.query(insertQuery, [
      cleanName,
      cleanShortCode,
      cleanCity,
      cleanState,
      is_verified,
    ]);

    logAction({
      req,
      action: 'CREATE',
      entityType: 'college',
      entityId: result.rows[0].id,
      details: { name: cleanName },
    });

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('createCollege error:', error);
    // PostgreSQL Unique Constraint Violation fallback (code 23505)
    if (error.code === '23505') {
      const isShortCode = error.detail?.includes('short_code');
      return res.status(409).json({
        success: false,
        message: isShortCode
          ? 'A college with this short code already exists'
          : 'College already exists',
      });
    }
    res.status(400).json({
      success: false,
      message: 'Error creating college',
    });
  }
};

// UPDATE college
exports.updateCollege = async (req, res) => {
  const { id } = req.params;
  const { name, short_code, city, state, is_verified } = req.body;
  const cleanName = name ? name.trim() : null;
  const cleanCity = city !== undefined ? (city?.trim() || null) : undefined;
  const cleanState = state !== undefined ? (state?.trim() || null) : undefined;
  const cleanShortCode = short_code !== undefined ? (short_code?.trim() || null) : undefined;

  try {
    // Check if another college already uses this name
    if (cleanName) {
      const duplicateCheck = await pool.query(
        `SELECT id, is_deleted 
         FROM colleges 
         WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND id != $2
         LIMIT 1`,
        [cleanName, id],
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: duplicateCheck.rows[0].is_deleted
            ? 'A deleted college with this name already exists. Please choose a different name.'
            : 'A college with this name already exists',
        });
      }
    }

    const query = `
      UPDATE colleges
      SET name = COALESCE($1, name),
          short_code = COALESCE($2, short_code),
          city = COALESCE($3, city),
          state = COALESCE($4, state),
          is_verified = COALESCE($5, is_verified),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND is_deleted = false
      RETURNING *`;
    const values = [cleanName, cleanShortCode, cleanCity, cleanState, is_verified, id];
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    logAction({ req, action: 'UPDATE', entityType: 'college', entityId: id, details: { name: cleanName } });
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('updateCollege:', error);
    if (error.code === '23505') {
      const isShortCode = error.detail?.includes('short_code');
      return res.status(409).json({
        success: false,
        message: isShortCode
          ? 'A college with this short code already exists'
          : 'A college with this name already exists',
      });
    }
    res.status(400).json({
      success: false,
      message: 'Error updating college',
    });
  }
};

// DELETE college (soft delete; cascades to facilitator_colleges mappings)
exports.deleteCollege = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE colleges SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING *',
      [id],
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'College not found' });
    }
    await client.query(
      'UPDATE facilitator_colleges SET is_deleted = true WHERE college_id = $1 AND is_deleted = false',
      [id],
    );
    await client.query('COMMIT');
    logAction({ req, action: 'DELETE', entityType: 'college', entityId: id });
    res
      .status(200)
      .json({ success: true, message: 'College deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    serverError(res, error);
  } finally {
    client.release();
  }
};

exports.getCollegesBySubject = async (req, res) => {
  const { subjectId } = req.params;
  try {
    const query = `
      SELECT
        c.id, c.name, c.short_code,
        EXISTS (
          SELECT 1 FROM facilitator_colleges fc
          JOIN facilitator_subjects fs ON fc.facilitator_id = fs.facilitator_id
          WHERE fc.college_id = c.id AND fs.subject_id = $1 AND fc.is_deleted = false AND fs.is_deleted = false
        ) as assigned
      FROM public.colleges c
      WHERE c.is_deleted = false
      ORDER BY c.name ASC;
    `;
    const { rows } = await pool.query(query, [subjectId]);
    res.json({ success: true, data: rows });
  } catch (error) {
    serverError(res, error);
  }
};

// Toggle college access via facilitator mapping
exports.toggleSubjectAccess = async (req, res) => {
  const { courseId, collegeId } = req.body;
  const isAdmin = req.user.role === 'admin';

  try {
    let targetFacilitatorIds = [];
    if (req.body.facilitatorId) {
      targetFacilitatorIds = [req.body.facilitatorId];
    } else if (!isAdmin) {
      targetFacilitatorIds = [req.user.id];
    } else {
      // Admin toggling institutional access: apply to all active facilitators in this college
      const facRes = await pool.query(
        'SELECT DISTINCT facilitator_id FROM facilitator_colleges WHERE college_id = $1 AND is_deleted = false',
        [collegeId],
      );
      targetFacilitatorIds = facRes.rows.map((r) => r.facilitator_id);
    }

    if (targetFacilitatorIds.length === 0) {
      return res.json({ success: true, message: 'No active facilitators found for this college' });
    }

    const existing = await pool.query(
      `SELECT id, facilitator_id FROM facilitator_subjects 
       WHERE facilitator_id = ANY($1::uuid[]) AND subject_id = $2 AND is_deleted = false`,
      [targetFacilitatorIds, courseId],
    );

    if (existing.rowCount > 0) {
      // Revoke access
      await pool.query(
        `UPDATE facilitator_subjects SET is_deleted = true, updated_at = CURRENT_TIMESTAMP 
         WHERE facilitator_id = ANY($1::uuid[]) AND subject_id = $2 AND is_deleted = false`,
        [targetFacilitatorIds, courseId],
      );
      logAction({ req, action: 'DELETE', entityType: 'facilitator_subject', entityId: null, details: { targetFacilitatorIds, courseId, collegeId } });
      res.json({ success: true, message: 'Subject unassigned!' });
    } else {
      // Grant access: link facilitators to subject
      for (const fId of targetFacilitatorIds) {
        await pool.query(
          `INSERT INTO facilitator_subjects (facilitator_id, subject_id)
           VALUES ($1, $2)
           ON CONFLICT (facilitator_id, subject_id)
           DO UPDATE SET is_deleted = false, updated_at = CURRENT_TIMESTAMP`,
          [fId, courseId],
        );
      }
      logAction({ req, action: 'CREATE', entityType: 'facilitator_subject', entityId: null, details: { targetFacilitatorIds, courseId, collegeId } });
      res.json({ success: true, message: 'Subject assigned!' });
    }
  } catch (error) {
    serverError(res, error);
  }
};

// ASSIGN colleges to facilitator (Batch)
exports.assignFacilitator = async (req, res) => {
  const { facilitator_id, college_ids } = req.body;

  // Input validation
  if (!facilitator_id) {
    return res.status(400).json({ success: false, message: 'facilitator_id is required' });
  }
  if (!Array.isArray(college_ids)) {
    return res.status(400).json({ success: false, message: 'college_ids must be an array' });
  }
  // Deduplicate: ON CONFLICT DO UPDATE cannot affect the same row twice in one statement
  const uniqueCollegeIds = [...new Set(college_ids)];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Soft-delete all current assignments for this facilitator
    await client.query(
      'UPDATE facilitator_colleges SET is_deleted = true WHERE facilitator_id = $1 AND is_deleted = false',
      [facilitator_id],
    );

    if (uniqueCollegeIds.length > 0) {
      // Upsert: if the (facilitator_id, college_id) pair already exists (soft-deleted),
      // reactivate it instead of inserting a duplicate — avoids unique constraint violation.
      await client.query(
        `INSERT INTO facilitator_colleges (facilitator_id, college_id)
         SELECT $1, unnest($2::uuid[])
         ON CONFLICT (facilitator_id, college_id)
         DO UPDATE SET is_deleted = false, updated_at = NOW()`,
        [facilitator_id, uniqueCollegeIds],
      );
    }

    await client.query('COMMIT');
    logAction({
      req,
      action: 'UPDATE',
      entityType: 'facilitator_college',
      entityId: facilitator_id,
      details: { college_ids },
    });
    res.status(200).json({ success: true, message: 'Colleges assigned successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[assignFacilitator] Error assigning colleges to facilitator:', error);
    serverError(res, error);
  } finally {
    client.release();
  }
};

