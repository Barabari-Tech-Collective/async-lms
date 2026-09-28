const jwt = require('jsonwebtoken');

const verifyToken = async (req, res, next) => {
  try {
    // 1. Get the token from the Authorization header (Format: Bearer <token>)
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({ message: 'Access Denied: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // 2. Verify the token
    const verified = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Quick DB check to revoke access immediately if user is soft-deleted or token version changed
    const pool = require('../config/pg');
    // email/full_name ride along on the check that already happens, so the
    // audit trail can name the actor without a second query — and without
    // depending on the JWT, which does not carry an email.
    const dbCheck = await pool.query('SELECT deleted_at, token_version, email, full_name FROM users WHERE id = $1', [verified.id]);
    if (dbCheck.rowCount === 0 || dbCheck.rows[0].deleted_at !== null) {
      return res.status(401).json({ message: 'Access Denied: Account is disabled, deleted, or not found' });
    }

    // Invalidate session if password was reset and token version has changed.
    // A token with no token_version claim predates this mechanism and can never
    // be revoked, so it is rejected outright rather than waved through — the
    // holder simply signs in again and gets a token that can be revoked.
    const userDb = dbCheck.rows[0];
    if (verified.token_version === undefined || userDb.token_version !== verified.token_version) {
      return res.status(401).json({ message: 'Access Denied: Session expired due to password change' });
    }

    // 4. For facilitators, always fetch live assigned college IDs and subject IDs from DB so changes take effect immediately
    let collegeIds = verified.college_ids || [];
    let subjectIds = [];
    if (verified.role === 'facilitator') {
      const [fcRes, fsRes] = await Promise.all([
        pool.query(
          'SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false',
          [verified.id],
        ),
        pool.query(
          'SELECT subject_id FROM facilitator_subjects WHERE facilitator_id = $1 AND is_deleted = false',
          [verified.id],
        ),
      ]);
      collegeIds = fcRes.rows.map((r) => r.college_id);
      subjectIds = fsRes.rows.map((r) => r.subject_id);
    }

    // Attach the user payload to the request object
    req.user = {
      ...verified,
      college_ids: collegeIds,
      subject_ids: subjectIds,
      email: userDb.email,
      full_name: userDb.full_name,
    };

    // 5. Check if the token is restricted to password reset
    if (verified.scope === 'password_reset_only') {
      const normalizedPath = (req.baseUrl ? req.baseUrl + req.path : req.path).split('?')[0];
      const isAllowedRoute = 
        normalizedPath === '/api/v1/auth/change-password' || 
        normalizedPath === '/api/v1/auth/me' ||
        req.path === '/change-password' ||
        req.path === '/me';

      if (!isAllowedRoute) {
        return res.status(403).json({ 
          message: 'Access Denied: You must change your password before accessing this resource.',
          requiresPasswordReset: true
        });
      }
    }

    const { markUserActive } = require('../services/presenceService');
    markUserActive(req.user.id);

    // 4. Move to the next middleware or controller
    next();
  } catch (error) {
    console.log('Error: ', error);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = verifyToken;
