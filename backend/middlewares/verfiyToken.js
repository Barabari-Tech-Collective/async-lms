const jwt = require('jsonwebtoken');
const pool = require('../config/pg');

// In-memory cache to prevent flooding the database with duplicate queries
// when multiple dashboard widgets make concurrent requests on page load.
const userAuthCache = new Map(); // userId -> { data, cachedAt }
const CACHE_TTL_MS = 5000; // 5 seconds burst cache to reject revoked/banned users promptly

// Self-cleaning timer to ensure zero memory leaks in long-running production environments
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of userAuthCache.entries()) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      userAuthCache.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

const verifyToken = async (req, res, next) => {
  // 1. Get the token from the Authorization header (Format: Bearer <token>)
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ message: 'Access Denied: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  // 2. Cryptographic JWT verification — only JWT failures should return 401
  let verified;
  try {
    verified = jwt.verify(token, process.env.JWT_SECRET);
  } catch (jwtErr) {
    return res.status(401).json({ message: 'Access Denied: Invalid or expired token' });
  }

  try {
    // 3. Check user status (cached for 5s to prevent connection pool exhaustion on dashboard load)
    let userDb = null;
    const now = Date.now();
    const cached = userAuthCache.get(verified.id);

    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      userDb = cached.data;
    } else {
      try {
        const dbCheck = await pool.query(
          'SELECT deleted_at, token_version, email, full_name FROM users WHERE id = $1',
          [verified.id]
        );
        if (dbCheck.rowCount > 0) {
          userDb = dbCheck.rows[0];
          userAuthCache.set(verified.id, { data: userDb, cachedAt: now });
        } else {
          // User was deleted or purged from the database
          userAuthCache.delete(verified.id);
          return res.status(401).json({ message: 'Access Denied: Account is disabled, deleted, or not found' });
        }
      } catch (dbErr) {
        // If DB has a momentary connection timeout, only allow fallback if cached data is very fresh (<10s)
        console.warn(`[verifyToken] DB verification transient issue: ${dbErr.message}`);
        if (cached && (now - cached.cachedAt < 10000)) {
          userDb = cached.data;
        } else {
          return res.status(503).json({ message: 'Service Temporarily Unavailable: Authentication service offline' });
        }
      }
    }

    if (userDb) {
      if (userDb.deleted_at !== null) {
        userAuthCache.delete(verified.id);
        return res.status(401).json({ message: 'Access Denied: Account is disabled, deleted, or not found' });
      }

      if (verified.token_version !== undefined && userDb.token_version !== verified.token_version) {
        userAuthCache.delete(verified.id);
        return res.status(401).json({ message: 'Access Denied: Session expired due to password change' });
      }
    }

    // 4. For facilitators, fetch assigned college IDs and subject IDs (gracefully fallback if DB stalls)
    let collegeIds = verified.college_ids || [];
    let subjectIds = [];
    if (verified.role === 'facilitator') {
      try {
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
      } catch (facErr) {
        console.warn(`[verifyToken] Facilitator scope DB warning: ${facErr.message}`);
      }
    }

    // Attach the user payload to the request object
    req.user = {
      ...verified,
      college_ids: collegeIds,
      subject_ids: subjectIds,
      email: userDb?.email || verified.email || '',
      full_name: userDb?.full_name || verified.full_name || '',
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

    try {
      const { markUserActive } = require('../services/presenceService');
      markUserActive(req.user.id);
    } catch {}

    // Move to the next middleware or controller
    next();
  } catch (error) {
    console.error('[verifyToken] Unexpected middleware error:', error);
    res.status(500).json({ message: 'Internal server error during authentication' });
  }
};

module.exports = verifyToken;
