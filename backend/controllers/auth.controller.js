const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/pg');
const { OAuth2Client } = require('google-auth-library');
const { logAction } = require('../utils/auditLogger');
const crypto = require('crypto');
const { sendMail } = require('../utils/mailer');

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_AUTH_CLIENT_ID,
  process.env.GOOGLE_AUTH_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL,
);

const normalizeEmail = (email) => {
  if (!email) return '';
  return email.trim().toLowerCase();

  // Previous behaviour, kept for reference:
  // let [localPart, domain] = email.trim().toLowerCase().split('@');
  // if (!domain) return email.trim().toLowerCase();
  // if (domain === 'gmail.com' || domain === 'googlemail.com') {
  //   localPart = localPart.split('+')[0].replace(/\./g, '');
  //   domain = 'gmail.com';
  // }
  // return `${localPart}@${domain}`;
};

/**
 * Generates a random 6-digit numeric OTP and its SHA-256 hash.
 */
function generateOtp() {
  // randomInt is drawn from the CSPRNG. Math.random() is a predictable PRNG —
  // not a safe source for a credential someone can guess their way into.
  const otpVal = crypto.randomInt(100000, 1000000).toString();
  const hash = crypto.createHash('sha256').update(otpVal).digest('hex');
  return { otp: otpVal, hash };
}

/**
 * Throttle OTP issuance per email+purpose: a 60s cooldown and 5 per hour.
 *
 * Counted straight from otp_codes. That only works because issuance no longer
 * wipes the previous rows — it prunes rows older than the rate-limit window
 * instead (see pruneExpiredOtps). Verification always reads the newest row, so
 * the older ones are inert history; they exist purely to be counted here, and
 * the hourly cap bounds them to five per address.
 *
 * Returns a message to send back, or null when issuing is allowed.
 */
async function otpThrottleError(email, purpose) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '60 seconds')::int AS recent,
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int     AS hourly
     FROM otp_codes WHERE email = $1 AND purpose = $2`,
    [email, purpose],
  );
  if (rows[0].recent > 0) {
    return 'Please wait 60 seconds before requesting another code.';
  }
  if (rows[0].hourly >= 5) {
    return 'Maximum verification requests exceeded. Please try again in an hour.';
  }
  return null;
}

/**
 * Drop codes past the rate-limit window. Replaces the old "delete every prior
 * code" step: that left at most one row, which is why the per-hour limit could
 * never fire. Keeping one hour bounds growth to the five rows the cap allows.
 */
const pruneExpiredOtps = (email, purpose) =>
  pool.query(
    `DELETE FROM otp_codes
      WHERE email = $1 AND purpose = $2
        AND created_at < NOW() - INTERVAL '1 hour'`,
    [email, purpose],
  );

/**
 * One-time hand-off code for the Google flow.
 *
 * The callback used to redirect with `?token=<7-day JWT>`. A session token in a
 * URL lands in browser history, proxy and server access logs, and the Referer
 * header of anything the landing page loads. This issues a single-use code
 * instead: worthless on its own, exchanged over POST for the real token, and
 * dead after 2 minutes or one use.
 *
 * Stored in otp_codes — the code is a 32-byte secret, so the hash column is
 * doing the same job it does for an OTP.
 */
const AUTH_CODE_PURPOSE = 'google_auth_code';

async function issueAuthCode(email) {
  const code = crypto.randomBytes(32).toString('hex');
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  await pool.query(
    `INSERT INTO otp_codes (email, otp_hash, purpose, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '2 minutes')`,
    [email, codeHash, AUTH_CODE_PURPOSE],
  );
  return code;
}

/**
 * Build the 7-day session JWT for a user row. Facilitator college scope is
 * resolved here so every issuing path stays consistent — and so the
 * is_deleted filter can never be forgotten in one of them.
 */
async function issueSessionToken(user) {
  /** @type {Record<string, any>} */
  const payload = {
    id: user.id,
    role: user.role,
    token_version: user.token_version,
    college_id: user.role === 'student' ? user.college_id : undefined,
  };

  if (user.role === 'facilitator') {
    const [colRes, subRes] = await Promise.all([
      pool.query(
        'SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false',
        [user.id],
      ),
      pool.query(
        'SELECT subject_id FROM facilitator_subjects WHERE facilitator_id = $1 AND is_deleted = false',
        [user.id],
      ),
    ]);
    payload.college_ids = colRes.rows.map((r) => r.college_id);
    payload.subject_ids = subRes.rows.map((r) => r.subject_id);
  }

  return {
    token: jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }),
    collegeIds: payload.college_ids ?? [],
    subjectIds: payload.subject_ids ?? [],
  };
}

/** Constant-time compare for OTP / reset-token hashes. */
function hashesMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * SIGNUP (STUDENT & FACILITATOR)
 */
exports.signup = async (req, res) => {
  const logID = Date.now();
  const { full_name, email, password, role } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!full_name || !normalizedEmail || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // 1. Check if user exists (only active accounts block new registration)
    const exists = await pool.query(
      'SELECT id, is_email_verified FROM users WHERE email = $1 AND deleted_at IS NULL',
      [normalizedEmail],
    );

    if (exists.rowCount) {
      const existingUser = exists.rows[0];
      if (existingUser.is_email_verified) {
        return res.status(400).json({ message: 'Email already registered' });
      }

      // User registered but hasn't verified email yet. Send a new OTP and redirect them to verify!
      // Throttled: this path had no cooldown at all, so re-posting /signup for
      // an unverified address sent an unlimited stream of mail to that inbox.
      const resendThrottled = await otpThrottleError(
        normalizedEmail,
        'signup_verification',
      );
      if (resendThrottled) {
        return res.status(429).json({ message: resendThrottled });
      }

      const { otp, hash } = generateOtp();
      const expiresAt = new Date(Date.now() + 15 * 60000);

      await pruneExpiredOtps(normalizedEmail, 'signup_verification');

      await pool.query(
        `INSERT INTO otp_codes (email, otp_hash, purpose, expires_at)
         VALUES ($1, $2, 'signup_verification', $3)`,
        [normalizedEmail, hash, expiresAt],
      );

      await sendMail({
        to: normalizedEmail,
        subject: 'Verify your CodeGuru Account',
        text: `Your CodeGuru email verification code is: ${otp}. It expires in 15 minutes.`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2>Verify your CodeGuru Account</h2>
            <p>Please use the following verification code to complete your registration:</p>
            <div style="font-size: 24px; font-weight: bold; padding: 15px; background-color: #f3f4f6; border-radius: 8px; display: inline-block; letter-spacing: 2px; color: #4f46e5; margin: 10px 0;">
              ${otp}
            </div>
            <p style="color: #6b7280; font-size: 14px;">This code is valid for 15 minutes.</p>
          </div>
        `,
      });

      return res.json({
        success: true,
        email: normalizedEmail,
        message: 'A new verification code has been sent to your email.',
      });
    }

    // 2. Hash Password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Resolve role_id from the roles table.
    // The allowlist is enforced here as well as in validateSignup: this handler
    // otherwise accepts any role_key that exists in `roles`, so dropping the
    // validator from the route would turn public signup into an admin factory.
    const SELF_SIGNUP_ROLES = ['student', 'facilitator'];
    const requestedRole = (role || 'student').toLowerCase();
    if (!SELF_SIGNUP_ROLES.includes(requestedRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const roleKey = requestedRole.toUpperCase();
    const roleRes = await pool.query(
      'SELECT id FROM roles WHERE role_key = $1',
      [roleKey],
    );

    if (!roleRes.rowCount) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const role_id = roleRes.rows[0].id;
    const resolvedRole = roleKey.toLowerCase();

    // 4. Insert User (Identity) with is_email_verified = false
    const result = await pool.query(
      `
      INSERT INTO users (full_name, email, password_hash, role_id, onboarding_step, is_verified, is_email_verified)
      VALUES ($1, $2, $3, $4, 'college', false, false)
      RETURNING id, full_name, email, onboarding_step, is_verified, is_email_verified
      `,
      [full_name, normalizedEmail, passwordHash, role_id],
    );

    const newUser = { ...result.rows[0], role: resolvedRole };

    // 5. If student, create initial profile
    if (newUser.role === 'student') {
      await pool.query('INSERT INTO student_profiles (user_id) VALUES ($1)', [
        newUser.id,
      ]);
    }

    logAction({
      req,
      action: 'CREATE',
      entityType: 'user',
      entityId: newUser.id,
      details: { email: normalizedEmail, role: newUser.role },
    });

    // 6. Generate and send signup verification OTP
    const { otp, hash } = generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60000); // 15 minutes from now

    // Drop codes past the rate-limit window. Newer ones stay so the per-hour
    // limit has something to count; verification always reads the newest.
    await pruneExpiredOtps(normalizedEmail, 'signup_verification');

    // Store OTP hash
    await pool.query(
      `INSERT INTO otp_codes (email, otp_hash, purpose, expires_at)
       VALUES ($1, $2, 'signup_verification', $3)`,
      [normalizedEmail, hash, expiresAt],
    );

    // Send verification email
    await sendMail({
      to: normalizedEmail,
      subject: 'Verify your CodeGuru Account',
      text: `Your CodeGuru email verification code is: ${otp}. It expires in 15 minutes.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Welcome to CodeGuru!</h2>
          <p>Please use the following verification code to complete your registration:</p>
          <div style="font-size: 24px; font-weight: bold; padding: 15px; background-color: #f3f4f6; border-radius: 8px; display: inline-block; letter-spacing: 2px; color: #4f46e5; margin: 10px 0;">
            ${otp}
          </div>
          <p style="color: #6b7280; font-size: 14px;">This code is valid for 15 minutes. If you did not sign up for this account, please ignore this email.</p>
        </div>
      `,
    });

    res.json({
      success: true,
      email: newUser.email,
      message:
        'Signup successful. A verification code has been sent to your email.',
    });
  } catch (err) {
    console.error(`[${logID}] SIGNUP ERROR:`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * LOGIN
 */
exports.login = async (req, res) => {
  const logID = Date.now();
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }

    try {
    const userRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.password_hash, u.google_id, LOWER(r.role_key) AS role, u.domain, u.role_focus, u.onboarding_step, u.is_verified,
              u.is_email_verified, u.token_version, u.must_change_password,
              sp.college_id, sp.degree, sp.year,
              c.is_verified AS college_is_verified
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN colleges c ON c.id = sp.college_id
       WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [normalizedEmail],
    );


    // Failed sign-ins are audited with the reason and the source IP. Without
    // these, the trail cannot answer "was this account attacked?" or "who was
    // trying to get in" — the questions asked most often after an incident.
    const logLoginFailure = (reason, userId = null) =>
      logAction({
        req,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: userId,
        actor: { id: userId, email: normalizedEmail, role: null },
        details: { reason },
      });

    if (!userRes.rowCount) {
      logLoginFailure('no_such_user');
      return res
        .status(401)
        .json({ message: 'Invalid email or password, or account is disabled' });
    }

    const user = userRes.rows[0];

    // A Google-linked account signs in with Google, full stop — even if a
    // password_hash exists (one can be set through the password-reset flow).
    // Google owns the identity for these accounts, so there is exactly one way
    // in and no second credential to keep in sync or attack.
    if (user.google_id) {
      logLoginFailure('google_account_password_login_blocked', user.id);
      return res.status(401).json({
        message:
          'This account uses Google Sign-In. Please click "Continue with Google".',
        useGoogle: true,
      });
    }

    if (!user.password_hash) {
      logLoginFailure('no_password_set', user.id);
      return res.status(401).json({
        message:
          'This account has no password set. Try signing in with Google, or reset your password.',
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    delete user.password_hash;

    if (!valid) {
      logLoginFailure('bad_password', user.id);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Enforce email verification check
    if (!user.is_email_verified) {
      logLoginFailure('email_not_verified', user.id);
      return res.status(400).json({
        message: 'Please verify your email address before logging in.',
        needsVerification: true,
        email: user.email,
      });
    }

    // Fetch facilitator college & subject scope if applicable
    let collegeIds = [];
    let subjectIds = [];
    if (user.role === 'facilitator') {
      const [colRes, subRes] = await Promise.all([
        pool.query(
          'SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false',
          [user.id],
        ),
        pool.query(
          'SELECT subject_id FROM facilitator_subjects WHERE facilitator_id = $1 AND is_deleted = false',
          [user.id],
        ),
      ]);
      collegeIds = colRes.rows.map((r) => r.college_id);
      subjectIds = subRes.rows.map((r) => r.subject_id);
    }

    const token = jwt.sign(
      {
        id: user.id, // UUID string
        role: user.role,
        token_version: user.token_version,
        scope: user.must_change_password ? 'password_reset_only' : undefined,
        college_id: user.role === 'student' ? user.college_id : undefined,
        college_ids: user.role === 'facilitator' ? collegeIds : undefined,
        subject_ids: user.role === 'facilitator' ? subjectIds : undefined,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
    );

    logAction({
      req,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      actor: { id: user.id, email: user.email, role: user.role },
      details: { method: 'password' },
    });

    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        onboarding_step: user.onboarding_step,
        is_verified: user.is_verified,
        is_email_verified: user.is_email_verified,
        must_change_password: user.must_change_password,
        domain: user.domain,
        role_focus: user.role_focus,
        college_id: user.college_id,
        college_ids: collegeIds,
        college_is_verified: user.college_is_verified,
        degree: user.degree,
        year: user.year,
      },
    });
  } catch (error) {
    console.error(`[${logID}] LOGIN ERROR:`, error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GOOGLE OAUTH STEP 1 — redirect browser to Google consent screen
 */
// ── OAuth CSRF state ────────────────────────────────────────────────────────
// Without a state parameter the callback accepts any `code` from anyone. An
// attacker can start their own Google flow, keep the code, and get a victim to
// load the callback URL — the victim is then silently signed in as the
// attacker, and everything they do lands in the attacker's account. The state
// is minted at redirect time, stored in an httpOnly cookie, and must come back
// unchanged. SameSite=Lax still travels on Google's top-level GET redirect.
const OAUTH_STATE_COOKIE = 'cg_oauth_state';

const stateCookie = (value, maxAgeSeconds) =>
  `${OAUTH_STATE_COOKIE}=${value}; Max-Age=${maxAgeSeconds}; Path=/api/v1/auth; HttpOnly; SameSite=Lax` +
  (process.env.NODE_ENV === 'production' ? '; Secure' : '');

function readStateCookie(req) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === OAUTH_STATE_COOKIE) return rest.join('=');
  }
  return null;
}

function statesMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

exports.googleRedirect = (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  res.setHeader('Set-Cookie', stateCookie(state, 600));

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    state,
  });
  res.redirect(url);
};

/**
 * GOOGLE OAUTH STEP 2 — exchange code, upsert user, redirect to frontend with JWT
 */
exports.googleCallback = async (req, res) => {
  const { code, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // The state cookie is single-use: clear it before doing anything else, so a
  // replayed or failed callback cannot reuse it.
  const expectedState = readStateCookie(req);
  res.setHeader('Set-Cookie', stateCookie('', 0));

  if (!code) {
    return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
  }

  if (!statesMatch(state, expectedState)) {
    logAction({
      req,
      action: 'LOGIN_FAILED',
      entityType: 'user',
      actor: { id: null, email: null, role: null },
      details: {
        reason: 'oauth_state_mismatch',
        hadCookie: Boolean(expectedState),
        hadState: Boolean(state),
      },
    });
    return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_AUTH_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, email_verified } = payload;

    if (!email || !email_verified) {
      return res.redirect(`${frontendUrl}/login?error=email_not_verified`);
    }

    const normalizedEmail = normalizeEmail(email);

    // Match on google_id first, then email. The Google id is stable and immune
    // to how the email column is formatted; matching on email alone missed
    // accounts whose stored address differs from what Google returns, treated
    // the user as new, and ended in a duplicate-key 500 on users_google_id_key.
    const existingRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, LOWER(r.role_key) AS role, u.onboarding_step, u.is_verified, u.google_id, u.token_version,
              u.is_email_verified,
              (u.password_hash IS NOT NULL) AS has_password,
              sp.college_id, sp.degree, sp.year,
              c.is_verified AS college_is_verified
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN colleges c ON c.id = sp.college_id
       WHERE (u.google_id = $1 OR u.email = $2) AND u.deleted_at IS NULL
       ORDER BY (u.google_id = $1) DESC
       LIMIT 1`,
      [googleId, normalizedEmail],
    );

    let user;

    if (existingRes.rowCount) {
      user = existingRes.rows[0];

      if (user.google_id && user.google_id !== googleId) {
        // The address belongs to an account already tied to a different Google
        // identity. Refuse rather than pick one.
        logAction({
          req,
          action: 'LOGIN_FAILED',
          entityType: 'user',
          entityId: user.id,
          actor: { id: user.id, email: normalizedEmail, role: user.role },
          details: { reason: 'google_id_conflict' },
        });
        return res.redirect(`${frontendUrl}/login?error=account_conflict`);
      }

      if (!user.google_id) {
        // An account exists for this address but was never linked to Google.
        // Auto-linking here used to be silent, which meant whoever registered
        // an address first could be adopted by the real owner's Google login —
        // and, now that a linked account is Google-only, one click would
        // permanently disable a working password with no way to reset it.
        // Only link when there is no password to lose.
        if (user.has_password) {
          logAction({
            req,
            action: 'LOGIN_FAILED',
            entityType: 'user',
            entityId: user.id,
            actor: { id: user.id, email: normalizedEmail, role: user.role },
            details: { reason: 'google_link_requires_password_login' },
          });
          return res.redirect(
            `${frontendUrl}/login?error=use_password_signin`,
          );
        }

        await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [
          googleId,
          user.id,
        ]);
        logAction({
          req,
          action: 'UPDATE',
          entityType: 'user',
          entityId: user.id,
          actor: { id: user.id, email: normalizedEmail, role: user.role },
          details: { reason: 'google_linked_passwordless_account' },
        });
      }

      // Google asserted email_verified above, which is the same proof of inbox
      // control our own OTP gives. Record it, rather than letting the account
      // sign in successfully while the column still claims it is unverified —
      // that flag gates password login and is returned to the client, so a
      // stale `false` is a live inconsistency, not a cosmetic one.
      if (!user.is_email_verified) {
        await pool.query(
          'UPDATE users SET is_email_verified = true WHERE id = $1',
          [user.id],
        );
        user.is_email_verified = true;
        logAction({
          req,
          action: 'UPDATE',
          entityType: 'user',
          entityId: user.id,
          actor: { id: user.id, email: normalizedEmail, role: user.role },
          details: { reason: 'email_verified_by_google' },
          before: { is_email_verified: false },
          after: { is_email_verified: true },
        });
      }
    } else {
      // New Google sign-in with no existing account: don't guess a role.
      // Send the user to a role-selection screen with a short-lived signed
      // token carrying their verified Google identity; the account is only
      // created once they pick student/facilitator in completeGoogleSignup.
      const roleSelectToken = jwt.sign(
        {
          purpose: 'google_role_select',
          googleId,
          email: normalizedEmail,
          name,
        },
        process.env.JWT_SECRET,
        { expiresIn: '10m' },
      );
      return res.redirect(
        `${frontendUrl}/auth/select-role?token=${roleSelectToken}`,
      );
    }

    // Hand back a single-use code, not the session token. The token itself is
    // issued only over POST at /auth/google/exchange, so it never enters the
    // URL, browser history, access logs, or a Referer header.
    const authCode = await issueAuthCode(user.email);
    res.redirect(`${frontendUrl}/auth/callback?code=${authCode}`);
  } catch (err) {
    console.error('GOOGLE CALLBACK ERROR:', err);
    res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
  }
};

/**
 * GOOGLE OAUTH — exchange a single-use code for the session token.
 * POST /api/v1/auth/google/exchange  { code }
 *
 * The code arrives in the URL; the token only ever travels in this response
 * body. The code row is deleted before the token is issued, so a replay — from
 * a shared link, browser history, or a log — gets nothing.
 */
exports.exchangeGoogleAuthCode = async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ message: 'Sign-in code is required.' });
  }

  try {
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    // DELETE ... RETURNING consumes the code atomically: two concurrent
    // exchanges cannot both succeed.
    const consumed = await pool.query(
      `DELETE FROM otp_codes
        WHERE otp_hash = $1 AND purpose = $2 AND expires_at > NOW()
        RETURNING email`,
      [codeHash, AUTH_CODE_PURPOSE],
    );

    if (consumed.rowCount === 0) {
      return res.status(400).json({
        message: 'This sign-in link has expired. Please sign in again.',
      });
    }

    const userRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, LOWER(r.role_key) AS role, u.onboarding_step,
              u.is_verified, u.is_email_verified, u.token_version,
              sp.college_id, sp.degree, sp.year,
              c.is_verified AS college_is_verified
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN colleges c ON c.id = sp.college_id
       WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [consumed.rows[0].email],
    );

    if (!userRes.rowCount) {
      return res.status(410).json({ message: 'This account is no longer available.' });
    }

    const user = userRes.rows[0];
    const { token, collegeIds } = await issueSessionToken(user);

    logAction({
      req,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      actor: { id: user.id, email: user.email, role: user.role },
      details: { method: 'google' },
    });

    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        onboarding_step: user.onboarding_step,
        is_verified: user.is_verified,
        is_email_verified: user.is_email_verified,
        college_id: user.college_id,
        college_ids: collegeIds,
        college_is_verified: user.college_is_verified,
        degree: user.degree,
        year: user.year,
      },
    });
  } catch (err) {
    console.error('GOOGLE CODE EXCHANGE ERROR:', err);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

/**
 * GOOGLE OAUTH STEP 3 — new user picked a role on /auth/select-role; create the account
 */
exports.completeGoogleSignup = async (req, res) => {
  const { token, role } = req.body;

  if (!token || !['student', 'facilitator'].includes(role)) {
    return res.status(400).json({ message: 'Invalid request' });
  }

  let selection;
  try {
    selection = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res
      .status(400)
      .json({ message: 'This sign-in link has expired. Please try again.' });
  }
  if (selection.purpose !== 'google_role_select') {
    return res.status(400).json({ message: 'Invalid request' });
  }
  const { googleId, email, name } = selection;
  const normalizedEmail = normalizeEmail(email);

  try {
    // Someone may have signed up (password or another Google attempt) with this
    // email while the role-selection screen was open — don't create a duplicate.
    // Checked on google_id too: matching on email alone let a user whose stored
    // address differed from their Google address reach the INSERT and fail on
    // users_google_id_key with a 500.
    const exists = await pool.query(
      `SELECT id, google_id FROM users
        WHERE (google_id = $1 OR email = $2) AND deleted_at IS NULL
        ORDER BY (google_id = $1) DESC
        LIMIT 1`,
      [googleId, normalizedEmail],
    );
    if (exists.rowCount) {
      // A google_id hit is proof this is the same Google account, so the user
      // simply already has an account — send them back to sign in rather than
      // showing "email already registered" for an account that is their own.
      if (exists.rows[0].google_id === googleId) {
        return res.status(409).json({
          message: 'You already have an account. Please sign in with Google.',
          alreadyRegistered: true,
        });
      }
      return res.status(400).json({ message: 'Email already registered' });
    }

    const roleRes = await pool.query(
      'SELECT id FROM roles WHERE role_key = $1',
      [role.toUpperCase()],
    );
    if (!roleRes.rowCount) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const insertRes = await pool.query(
      `INSERT INTO users (full_name, email, google_id, role_id, onboarding_step, is_verified, is_email_verified)
       VALUES ($1, $2, $3, $4, 'college', false, true)
       RETURNING id, full_name, email, onboarding_step, is_verified, token_version`,
      [name, normalizedEmail, googleId, roleRes.rows[0].id],
    );
    const user = { ...insertRes.rows[0], role };

    if (role === 'student') {
      await pool.query('INSERT INTO student_profiles (user_id) VALUES ($1)', [
        user.id,
      ]);
    }
    logAction({
      req,
      action: 'CREATE',
      entityType: 'user',
      entityId: user.id,
      details: { email: normalizedEmail, role },
    });

    // Return a single-use code, matching the sign-in path — the client hands it
    // to /auth/google/exchange rather than carrying a session token through a
    // client-side redirect and back into the URL bar.
    const code = await issueAuthCode(user.email);
    res.json({ code });
  } catch (err) {
    console.error('COMPLETE GOOGLE SIGNUP ERROR:', err);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

/**
 * GET CURRENT USER (Profile Check)
 */
exports.getMe = async (req, res) => {
  const userID = req.user?.id; // Extracted from JWT by middleware

  try {
    const userRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, LOWER(r.role_key) AS role, u.domain, u.role_focus, u.onboarding_step, u.is_verified, u.must_change_password,
              sp.college_id, sp.degree, sp.year,
              c.is_verified AS college_is_verified,
              c.name AS college_name,
              COALESCE(us.current_streak, 0) AS current_streak,
              COALESCE(SUM(pl.points), 0)::integer AS total_points
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN colleges c ON c.id = sp.college_id
       LEFT JOIN user_streaks us ON us.user_id = u.id
       LEFT JOIN points_log pl ON pl.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id, u.full_name, u.email, r.role_key, u.domain, u.role_focus, u.onboarding_step, u.is_verified, u.must_change_password,
                sp.college_id, sp.degree, sp.year, c.is_verified, c.name, us.current_streak`,
      [userID],
    );

    if (!userRes.rowCount) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userRes.rows[0];
    let collegeIds = [];
    let subjectIds = [];

    if (user.role === 'facilitator') {
      const [colRes, subRes] = await Promise.all([
        pool.query(
          'SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false',
          [userID],
        ),
        pool.query(
          'SELECT subject_id FROM facilitator_subjects WHERE facilitator_id = $1 AND is_deleted = false',
          [userID],
        ),
      ]);
      collegeIds = colRes.rows.map((r) => r.college_id);
      subjectIds = subRes.rows.map((r) => r.subject_id);
    }

    res.json({ ...user, college_ids: collegeIds, subject_ids: subjectIds });
  } catch (error) {
    // getMe is the session-bootstrap call on every app load; a silent failure
    // here looks like a broken login with nothing in the logs to explain it.
    console.error('getMe Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * VERIFY EMAIL (OTP Validation after Signup)
 */
exports.verifyEmail = async (req, res) => {
  const { email, otp_code } = req.body;
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !otp_code) {
    return res
      .status(400)
      .json({ message: 'Email and verification code are required.' });
  }

  try {
    const purpose = 'signup_verification';
    const submittedHash = crypto
      .createHash('sha256')
      .update(otp_code)
      .digest('hex');

    // Retrieve active OTPs
    const otpRes = await pool.query(
      `SELECT id, otp_hash, attempts, expires_at FROM otp_codes
       WHERE email = $1 AND purpose = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedEmail, purpose],
    );

    if (otpRes.rowCount === 0) {
      return res
        .status(400)
        .json({ message: 'Verification code is invalid or has expired.' });
    }

    const otpRecord = otpRes.rows[0];

    // Check expiration using the same local clock that generated it (timezone-agnostic)
    if (new Date(otpRecord.expires_at) < new Date()) {
      await pool.query('DELETE FROM otp_codes WHERE id = $1', [otpRecord.id]);
      return res
        .status(400)
        .json({ message: 'Verification code is invalid or has expired.' });
    }

    // Verify hash match
    if (!hashesMatch(otpRecord.otp_hash, submittedHash)) {
      const newAttempts = otpRecord.attempts + 1;
      if (newAttempts >= 5) {
        await pool.query('DELETE FROM otp_codes WHERE id = $1', [otpRecord.id]);
        return res.status(400).json({
          message:
            'Too many incorrect attempts. This verification code is now invalid. Please request a new code.',
        });
      } else {
        await pool.query('UPDATE otp_codes SET attempts = $1 WHERE id = $2', [
          newAttempts,
          otpRecord.id,
        ]);
        return res.status(400).json({
          message: `Incorrect verification code. Attempts remaining: ${5 - newAttempts}`,
        });
      }
    }

    // Email is verified! Update users table
    await pool.query(
      'UPDATE users SET is_email_verified = true WHERE email = $1 AND deleted_at IS NULL',
      [normalizedEmail],
    );
    await pool.query(
      'DELETE FROM otp_codes WHERE email = $1 AND purpose = $2',
      [normalizedEmail, purpose],
    );

    // Fetch user details to generate JWT
    const userRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, LOWER(r.role_key) AS role, u.onboarding_step, u.is_verified, u.is_email_verified, u.token_version,
              sp.college_id, sp.degree, sp.year,
              c.is_verified AS college_is_verified
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN colleges c ON c.id = sp.college_id
       WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [normalizedEmail],
    );

    // The OTP is already consumed at this point, so a missing user row must not
    // become a TypeError — the caller would get a 500 with no way to retry.
    if (!userRes.rowCount) {
      return res.status(410).json({
        message:
          'This account is no longer available. Please sign up again.',
      });
    }

    const user = userRes.rows[0];

    // Fetch facilitator college & subject scope if applicable
    let collegeIds = [];
    let subjectIds = [];
    if (user.role === 'facilitator') {
      const [colRes, subRes] = await Promise.all([
        pool.query(
          'SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false',
          [user.id],
        ),
        pool.query(
          'SELECT subject_id FROM facilitator_subjects WHERE facilitator_id = $1 AND is_deleted = false',
          [user.id],
        ),
      ]);
      collegeIds = colRes.rows.map((r) => r.college_id);
      subjectIds = subRes.rows.map((r) => r.subject_id);
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        token_version: user.token_version,
        college_id: user.role === 'student' ? user.college_id : undefined,
        college_ids: user.role === 'facilitator' ? collegeIds : undefined,
        subject_ids: user.role === 'facilitator' ? subjectIds : undefined,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        onboarding_step: user.onboarding_step,
        is_verified: user.is_verified,
        is_email_verified: user.is_email_verified,
        college_id: user.college_id,
        college_ids: collegeIds,
        college_is_verified: user.college_is_verified,
        degree: user.degree,
        year: user.year,
      },
    });
  } catch (error) {
    console.error('Verify Email Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * FORGOT PASSWORD (Generate OTP)
 */
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  // Define generic message response to avoid user enumeration
  const genericResponse = {
    success: true,
    message:
      'If an account exists for this email, a verification code has been sent.',
  };

  try {
    const purpose = 'password_reset';

    // Check if active user exists
    const userRes = await pool.query(
      'SELECT id, google_id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [normalizedEmail],
    );

    if (userRes.rowCount === 0) {
      // User not found: fail silently to prevent account discovery
      return res.json(genericResponse);
    }

    // Google-linked accounts cannot sign in with a password, so issuing a reset
    // would walk the user through setting one and then still refuse them at
    // login. We explicitly return a 400 error here to prevent the user from
    // waiting for an OTP that will never arrive.
    if (userRes.rows[0].google_id) {
      logAction({
        req,
        action: 'PASSWORD_RESET_BLOCKED',
        entityType: 'user',
        entityId: userRes.rows[0].id,
        actor: { id: userRes.rows[0].id, email: normalizedEmail, role: null },
        details: { reason: 'google_account' },
      });
      return res.status(400).json({
        message: 'This email is associated with a Google account. Please return to the login page and sign in using Google.'
      });
    }

    const throttled = await otpThrottleError(normalizedEmail, purpose);
    if (throttled) {
      return res.status(429).json({ message: throttled });
    }

    // Drop codes past the rate-limit window. Anything newer stays so the
    // per-hour limit has rows to count — the previous code is superseded
    // regardless, because verification reads only the newest row.
    await pruneExpiredOtps(normalizedEmail, purpose);

    // Generate new OTP
    const { otp, hash } = generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60000); // 15 minutes

    await pool.query(
      `INSERT INTO otp_codes (email, otp_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [normalizedEmail, hash, purpose, expiresAt],
    );

    try {
      // Dispatch email
      await sendMail({
        to: normalizedEmail,
        subject: 'Reset your CodeGuru Password',
        text: `Your CodeGuru password reset code is: ${otp}. It is valid for 15 minutes.`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2>CodeGuru Password Reset</h2>
            <p>We received a request to reset your password. Use the verification code below to proceed:</p>
            <div style="font-size: 24px; font-weight: bold; padding: 15px; background-color: #f3f4f6; border-radius: 8px; display: inline-block; letter-spacing: 2px; color: #4f46e5; margin: 10px 0;">
              ${otp}
            </div>
            <p>If you did not request a password reset, you can safely ignore this email.</p>
            <p style="color: #6b7280; font-size: 14px;">This code is valid for 15 minutes.</p>
          </div>
        `,
      });
    } catch (mailError) {
      // If email delivery fails, remove the inserted OTP so the user is not rate-limited on retry
      await pool.query(
        `DELETE FROM otp_codes WHERE email = $1 AND purpose = $2`,
        [normalizedEmail, purpose],
      );
      throw mailError;
    }

    return res.json(genericResponse);
  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * VERIFY RESET OTP (Validates OTP and issues a short-lived reset token)
 */
exports.verifyResetOtp = async (req, res) => {
  const { email, otp_code } = req.body;
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !otp_code) {
    return res
      .status(400)
      .json({ message: 'Email and verification code are required.' });
  }

  try {
    const purpose = 'password_reset';
    const submittedHash = crypto
      .createHash('sha256')
      .update(otp_code)
      .digest('hex');

    const otpRes = await pool.query(
      `SELECT id, otp_hash, attempts, expires_at FROM otp_codes
       WHERE email = $1 AND purpose = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedEmail, purpose],
    );

    if (otpRes.rowCount === 0) {
      return res
        .status(400)
        .json({ message: 'Verification code is invalid or has expired.' });
    }

    const otpRecord = otpRes.rows[0];

    // Check expiration using the same local clock that generated it (timezone-agnostic)
    if (new Date(otpRecord.expires_at) < new Date()) {
      await pool.query('DELETE FROM otp_codes WHERE id = $1', [otpRecord.id]);
      return res
        .status(400)
        .json({ message: 'Verification code is invalid or has expired.' });
    }

    // Verify hash match
    if (!hashesMatch(otpRecord.otp_hash, submittedHash)) {
      const newAttempts = otpRecord.attempts + 1;
      if (newAttempts >= 5) {
        await pool.query('DELETE FROM otp_codes WHERE id = $1', [otpRecord.id]);
        return res.status(400).json({
          message:
            'Too many incorrect attempts. This code is now invalid. Please request a new one.',
        });
      } else {
        await pool.query('UPDATE otp_codes SET attempts = $1 WHERE id = $2', [
          newAttempts,
          otpRecord.id,
        ]);
        return res.status(400).json({
          message: `Incorrect verification code. Attempts remaining: ${5 - newAttempts}`,
        });
      }
    }

    // OTP is valid! Delete it and generate a short-lived reset token
    await pool.query('DELETE FROM otp_codes WHERE id = $1', [otpRecord.id]);

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    const tokenExpiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes validity

    // Invalidate existing reset tokens
    await pool.query(
      `DELETE FROM otp_codes WHERE email = $1 AND purpose = 'password_reset_token'`,
      [normalizedEmail],
    );

    // Save token hash
    await pool.query(
      `INSERT INTO otp_codes (email, otp_hash, purpose, expires_at)
       VALUES ($1, $2, 'password_reset_token', $3)`,
      [normalizedEmail, tokenHash, tokenExpiresAt],
    );

    res.json({
      success: true,
      resetToken,
    });
  } catch (error) {
    console.error('Verify Reset OTP Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * RESET PASSWORD (Applies new password using resetToken)
 */
exports.resetPassword = async (req, res) => {
  const { email, resetToken, newPassword } = req.body;
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !resetToken || !newPassword) {
    return res
      .status(400)
      .json({ message: 'Email, reset token, and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ message: 'Password must be at least 6 characters long.' });
  }

  try {
    // Defence in depth: forgotPassword already refuses to issue a code for a
    // Google-linked account, so no valid token should exist — but a password
    // set here could never be used to sign in, so refuse at the point of use
    // too rather than relying on the earlier gate holding forever.
    const target = await pool.query(
      'SELECT google_id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [normalizedEmail],
    );
    if (target.rows[0]?.google_id) {
      return res.status(400).json({
        message:
          'This account uses Google Sign-In and does not use a password.',
      });
    }

    const purpose = 'password_reset_token';
    const submittedHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Retrieve active reset tokens
    const tokenRes = await pool.query(
      `SELECT id FROM otp_codes 
       WHERE email = $1 AND otp_hash = $2 AND purpose = $3 AND expires_at > NOW()`,
      [normalizedEmail, submittedHash, purpose],
    );

    if (tokenRes.rowCount === 0) {
      logAction({
        req,
        action: 'PASSWORD_RESET_FAILED',
        entityType: 'user',
        actor: { id: null, email: normalizedEmail, role: null },
        details: { reason: 'invalid_or_expired_token' },
      });
      return res.status(400).json({
        message:
          'Reset token is invalid or has expired. Please restart the forgot password process.',
      });
    }

    // Encrypt the new password
    const hashed = await bcrypt.hash(newPassword, 10);

    // Update password & increment token_version to invalidate active sessions
    const updated = await pool.query(
      `UPDATE users
       SET password_hash = $1, token_version = token_version + 1, is_email_verified = true
       WHERE email = $2 AND deleted_at IS NULL
       RETURNING id`,
      [hashed, normalizedEmail],
    );

    // Clean up reset token
    await pool.query('DELETE FROM otp_codes WHERE id = $1', [
      tokenRes.rows[0].id,
    ]);

    // A password change invalidates every active session for the account, so
    // it is the event most worth being able to point at later.
    logAction({
      req,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: updated.rows[0]?.id ?? null,
      actor: {
        id: updated.rows[0]?.id ?? null,
        email: normalizedEmail,
        role: null,
      },
    });

    res.json({
      success: true,
      message:
        'Password reset successful. You can now login with your new password.',
    });
  } catch (error) {
    console.error('Reset Password Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.changePassword = async (req, res) => {
  const { password, current_password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }
  try {
    const userId = req.user.id;

    // Verify user exists and check if this is a forced reset or standard password change
    const userCheck = await pool.query(
      'SELECT id, password_hash, must_change_password FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (userCheck.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const dbUser = userCheck.rows[0];
    const isForcedReset = dbUser.must_change_password === true || req.user.scope === 'password_reset_only';

    // Normal users must verify their current password
    if (!isForcedReset) {
      if (!current_password) {
        return res.status(400).json({ message: 'Current password is required' });
      }
      const isMatch = await bcrypt.compare(current_password, dbUser.password_hash);
      if (!isMatch) {
        return res.status(400).json({ message: 'Incorrect current password' });
      }
    }

    const hashed = await bcrypt.hash(password, 10);
    
    // Update password, remove flag, increment token version
    await pool.query(
      `UPDATE users 
       SET password_hash = $1, must_change_password = false, token_version = token_version + 1 
       WHERE id = $2 AND deleted_at IS NULL`,
      [hashed, userId]
    );

    // Fetch user to generate new token
    const userRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, LOWER(r.role_key) AS role, u.domain, u.role_focus, u.onboarding_step, u.is_verified,
              u.is_email_verified, u.token_version, u.must_change_password,
              sp.college_id, sp.degree, sp.year,
              c.is_verified AS college_is_verified
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN colleges c ON c.id = sp.college_id
       WHERE u.id = $1`,
      [userId]
    );

    const user = userRes.rows[0];

    // Fetch facilitator college & subject scope if applicable
    let collegeIds = [];
    let subjectIds = [];
    if (user.role === 'facilitator') {
      const [colRes, subRes] = await Promise.all([
        pool.query(
          'SELECT college_id FROM facilitator_colleges WHERE facilitator_id = $1 AND is_deleted = false',
          [user.id],
        ),
        pool.query(
          'SELECT subject_id FROM facilitator_subjects WHERE facilitator_id = $1 AND is_deleted = false',
          [user.id],
        ),
      ]);
      collegeIds = colRes.rows.map((r) => r.college_id);
      subjectIds = subRes.rows.map((r) => r.subject_id);
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        token_version: user.token_version,
        scope: undefined, // Fully clear the scope!
        college_id: user.role === 'student' ? user.college_id : undefined,
        college_ids: user.role === 'facilitator' ? collegeIds : undefined,
        subject_ids: user.role === 'facilitator' ? subjectIds : undefined,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        domain: user.domain,
        role_focus: user.role_focus,
        onboarding_step: user.onboarding_step,
        is_verified: user.is_verified,
        is_email_verified: user.is_email_verified,
        must_change_password: user.must_change_password,
        college_id: user.college_id,
        college_ids: collegeIds,
        college_is_verified: user.college_is_verified,
        degree: user.degree,
        year: user.year,
      },
    });
  } catch (error) {
    console.error('Change Password Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
