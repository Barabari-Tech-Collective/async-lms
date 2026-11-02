const path = require('path');
const dotenv = require('dotenv');

const environmentFile =
  process.env.NODE_ENV === 'production'
    ? null
    : `.env.${process.env.NODE_ENV || 'development'}`;

if (environmentFile) {
  dotenv.config({ path: path.join(__dirname, '..', environmentFile) });
}
dotenv.config();

const requiredEnvironmentVariables = [
  'GOOGLE_MEET_CLIENT_ID',
  'GOOGLE_MEET_CLIENT_SECRET',
  'GOOGLE_MEET_REFRESH_TOKEN',
];

// The current refresh token belongs to a temporary organization account.
// Before final production handoff, replace it with the approved facilitator or
// organization account token and update the worker's secret. Non-Testing OAuth
// apps avoid the seven-day Testing-mode limit, but tokens can still be revoked. (vinay 1-nov-2026)

function getGoogleMeetConfig() {
  const missing = requiredEnvironmentVariables.filter(
    (name) => !process.env[name]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(
      `Google Meet configuration is incomplete. Missing: ${missing.join(', ')}`,
    );
  }

  return {
    clientId: process.env.GOOGLE_MEET_CLIENT_ID.trim(),
    clientSecret: process.env.GOOGLE_MEET_CLIENT_SECRET.trim(),
    refreshToken: process.env.GOOGLE_MEET_REFRESH_TOKEN.trim(),
    redirectUri: process.env.GOOGLE_MEET_OAUTH_REDIRECT_URI?.trim() || null,
    apiBaseUrl: process.env.GOOGLE_MEET_API_BASE_URL?.trim() || 'https://meet.googleapis.com',
    requestTimeoutMs: Number.parseInt(
      process.env.GOOGLE_MEET_REQUEST_TIMEOUT_MS || '15000',
      10,
    ),
  };
}

module.exports = { getGoogleMeetConfig };
