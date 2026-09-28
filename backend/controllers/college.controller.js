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

// CREATE college
exports.createCollege = async (req, res) => {
  const { name, short_code, city, state } = req.body;
  try {
    const is_verfied = req.user.role === 'admin';
    const query = `
      INSERT INTO colleges (name, short_code, city, state, is_verified) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *`;
    const values = [name, short_code, city, state, is_verfied];
    const result = await pool.query(query, values);
    logAction({ req, action: 'CREATE', entityType: 'college', entityId: result.rows[0].id, details: { name } });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
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
  try {
    const query = `
      UPDATE colleges
      SET name = COALESCE($1, name),
          short_code = COALESCE($2, short_code),
          city = COALESCE($3, city),
          state = COALESCE($4, state),
          is_verified = COALESCE($5, is_verified),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *`;
    const values = [name, short_code, city, state, is_verified, id];
    const result = await pool.query(query, values);
    if (result.rowCount === 0)
      return res.status(404).json({ message: 'College not found' });
    logAction({ req, action: 'UPDATE', entityType: 'college', entityId: id, details: { name } });
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('updateCollege:', error);
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

