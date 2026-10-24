const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const requiredEnvironmentVariables = [
  'GOOGLE_IDENTITY_CLIENT_ID',
  'GOOGLE_IDENTITY_CLIENT_SECRET',
  'GOOGLE_IDENTITY_CALLBACK_URL',
];

function getGoogleIdentityConfig() {
  const missing = requiredEnvironmentVariables.filter(
    (name) => !process.env[name]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(
      `Google identity configuration is incomplete. Missing: ${missing.join(', ')}`,
    );
  }

  return {
    clientId: process.env.GOOGLE_IDENTITY_CLIENT_ID.trim(),
    clientSecret: process.env.GOOGLE_IDENTITY_CLIENT_SECRET.trim(),
    callbackUrl: process.env.GOOGLE_IDENTITY_CALLBACK_URL.trim(),
    stateSecret: (
      process.env.GOOGLE_IDENTITY_STATE_SECRET ||
      process.env.JWT_SECRET ||
      ''
    ).trim(),
  };
}

function createGoogleIdentityClient(config = getGoogleIdentityConfig()) {
  return new OAuth2Client(
    config.clientId,
    config.clientSecret,
    config.callbackUrl,
  );
}

function createPkceVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function createPkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

module.exports = {
  createGoogleIdentityClient,
  createGoogleIdentityConfig: getGoogleIdentityConfig,
  createPkceChallenge,
  createPkceVerifier,
};
