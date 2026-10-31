const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/pg');
const {
  createGoogleIdentityClient,
  createGoogleIdentityConfig,
  createPkceChallenge,
  createPkceVerifier,
} = require('../config/googleIdentity');
const { logAction } = require('../utils/auditLogger');
const { normalizeMeetUserId } = require('../utils/meetIdentity');

const STATE_TTL_SECONDS = 10 * 60;
const FRONTEND_URL = (
  process.env.FRONTEND_URL || 'http://localhost:5173'
).replace(/\/+$/, '');

function createState(userId, verifier, nonce) {
  const config = createGoogleIdentityConfig();
  if (!config.stateSecret) {
    throw new Error('GOOGLE_IDENTITY_STATE_SECRET or JWT_SECRET is required');
  }
  return jwt.sign(
    { sub: userId, purpose: 'meet_identity_link', nonce, verifier },
    config.stateSecret,
    { expiresIn: STATE_TTL_SECONDS },
  );
}

function getAuthenticatedStudent(req, res) {
  if (req.user?.role !== 'student') {
    res.status(403).json({ message: 'Only students can link a Meet account' });
    return null;
  }
  return req.user;
}

exports.getIdentity = async (req, res) => {
  const student = getAuthenticatedStudent(req, res);
  if (!student) return;

  try {
    const result = await pool.query(
      `SELECT google_email, status, verification_method, verified_at, review_reason
         FROM student_google_identities
        WHERE student_id = $1
          AND status <> 'revoked'
        ORDER BY created_at DESC
        LIMIT 1`,
      [student.id],
    );
    const identity = result.rows[0] || null;
    return res.json({
      success: true,
      data: identity
        ? {
            linked: true,
            email: identity.google_email,
            status: identity.status,
            verificationMethod: identity.verification_method,
            verifiedAt: identity.verified_at,
            reviewReason: identity.review_reason,
          }
        : { linked: false, email: null, status: null },
    });
  } catch (error) {
    console.error('[google-identity] Failed to load identity:', error);
    return res.status(500).json({ message: 'Unable to load Meet account status' });
  }
};

exports.startLink = async (req, res) => {
  const student = getAuthenticatedStudent(req, res);
  if (!student) return;

  try {
    const config = createGoogleIdentityConfig();
    const client = createGoogleIdentityClient(config);
    const verifier = createPkceVerifier();
    const nonce = crypto.randomBytes(24).toString('hex');
    const state = createState(student.id, verifier, nonce);
    return res.json({
      success: true,
      authorizationUrl: client.generateAuthUrl({
        access_type: 'online',
        prompt: 'select_account',
        scope: ['openid', 'email', 'profile'],
        state,
        code_challenge: createPkceChallenge(verifier),
        code_challenge_method: 'S256',
      }),
    });
  } catch (error) {
    console.error('[google-identity] Failed to start linking:', error);
    return res.status(503).json({ message: 'Google account linking is not configured' });
  }
};

exports.callback = async (req, res) => {
  const frontendError = (reason) =>
    res.redirect(
      `${FRONTEND_URL}/dashboard/student/settings?meet_link=${encodeURIComponent(reason)}`,
    );

  if (req.query.error === 'access_denied') {
    return frontendError('cancelled');
  }
  if (!req.query.code || !req.query.state) {
    return frontendError('failed');
  }

  try {
    const config = createGoogleIdentityConfig();
    const client = createGoogleIdentityClient(config);
    const statePayload = jwt.verify(req.query.state, config.stateSecret);
    if (
      statePayload.purpose !== 'meet_identity_link' ||
      typeof statePayload.verifier !== 'string' ||
      !statePayload.verifier
    ) {
      return frontendError('state_mismatch');
    }

    const { tokens } = await client.getToken({
      code: req.query.code,
      codeVerifier: statePayload.verifier,
    });
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.clientId,
    });
    const payload = ticket.getPayload();
    const meetUserId = normalizeMeetUserId(payload?.sub);
    const email = payload?.email?.trim().toLowerCase();
    if (
      !meetUserId ||
      !email ||
      payload.email_verified !== true
    ) {
      return frontendError('invalid_identity');
    }

    const conflict = await pool.query(
      `SELECT student_id
         FROM student_google_identities
        WHERE meet_user_id = $1
          AND status <> 'revoked'
        LIMIT 1`,
      [meetUserId],
    );
    if (conflict.rowCount && conflict.rows[0].student_id !== statePayload.sub) {
      logAction({
        req,
        action: 'GOOGLE_IDENTITY_CONFLICT',
        entityType: 'student_google_identity',
        entityId: statePayload.sub,
        details: { reason: 'meet_user_id_already_linked', google_email: email },
      });
      return frontendError('conflict');
    }

    await pool.query(
      `INSERT INTO student_google_identities
         (student_id, meet_user_id, google_email, status,
          verification_method, verified_at, updated_at)
       VALUES ($1, $2, $3, 'verified', 'google_identity_mapping', NOW(), NOW())
       ON CONFLICT (student_id) WHERE status <> 'revoked'
       DO UPDATE SET
         meet_user_id = EXCLUDED.meet_user_id,
         google_email = EXCLUDED.google_email,
         status = 'verified',
         verification_method = EXCLUDED.verification_method,
         verified_at = NOW(),
         review_reason = NULL,
         updated_at = NOW()`,
      [statePayload.sub, meetUserId, email],
    );

    logAction({
      req,
      action: 'GOOGLE_IDENTITY_LINKED',
      entityType: 'student_google_identity',
      entityId: statePayload.sub,
      details: { google_email: email, verification_method: 'google_identity_mapping' },
    });
    return res.redirect(`${FRONTEND_URL}/dashboard/student/settings?meet_link=success`);
  } catch (error) {
    console.error('[google-identity] Callback failed:', error);
    return frontendError('failed');
  }
};
