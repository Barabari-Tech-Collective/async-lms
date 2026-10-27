const axios = require('axios');
const https = require('https');
const { OAuth2Client } = require('google-auth-library');
const { getGoogleMeetConfig } = require('../config/googleMeet');

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

class GoogleMeetError extends Error {
  constructor(message, { retryable = false, status = null, cause = null } = {}) {
    super(message);
    this.name = 'GoogleMeetError';
    this.retryable = retryable;
    this.status = status;
    this.cause = cause;
  }
}

function getErrorStatus(error) {
  return error.response?.status || error.status || null;
}

function isRetryableError(error) {
  const status = getErrorStatus(error);
  return (
    RETRYABLE_STATUS_CODES.has(status) ||
    error.code === 'ECONNABORTED' ||
    error.code === 'ETIMEDOUT' ||
    ['ECONNRESET', 'ENETUNREACH', 'EAI_AGAIN'].includes(error.code)
  );
}

function getErrorMessage(error) {
  const apiMessage = error.response?.data?.error?.message;
  return apiMessage || error.message || 'Google Meet request failed';
}

class GoogleMeetService {
  constructor(config = getGoogleMeetConfig()) {
    this.config = config;
    this.oauthClient = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.redirectUri || undefined,
    );
    this.oauthClient.setCredentials({ refresh_token: config.refreshToken });
    this.accessTokenPromise = null;
    this.cachedAccessToken = null;
    this.accessTokenExpiresAt = 0;
    this.httpAgent = new https.Agent({ keepAlive: true, maxSockets: 20 });
  }

  async getAccessToken() {
    if (
      this.cachedAccessToken &&
      this.accessTokenExpiresAt > Date.now() + 60 * 1000
    ) {
      return this.cachedAccessToken;
    }
    if (this.accessTokenPromise) return this.accessTokenPromise;
    this.accessTokenPromise = this.fetchAccessToken();
    try {
      return await this.accessTokenPromise;
    } finally {
      this.accessTokenPromise = null;
    }
  }

  async fetchAccessToken() {
    const startedAt = Date.now();
    try {
      const { token, res } = await this.oauthClient.getAccessToken();
      if (!token) throw new GoogleMeetError('Google returned no access token');
      this.cachedAccessToken = token;
      this.accessTokenExpiresAt = res?.data?.expiry_date || Date.now() + 5 * 60 * 1000;
      console.info(JSON.stringify({
        component: 'google-meet',
        operation: 'access_token',
        elapsedMilliseconds: Date.now() - startedAt,
      }));
      return token;
    } catch (error) {
      if (error instanceof GoogleMeetError) throw error;
      throw new GoogleMeetError(
        `Unable to obtain Google Meet access token: ${getErrorMessage(error)}`,
        { retryable: isRetryableError(error), status: getErrorStatus(error), cause: error },
      );
    }
  }

  async request(method, path, { data, params, headers = {} } = {}) {
    const accessToken = await this.getAccessToken();
    const startedAt = Date.now();

    try {
      const response = await axios({
        method,
        url: `${this.config.apiBaseUrl}/v2${path}`,
        data,
        params,
        timeout: this.config.requestTimeoutMs,
        httpsAgent: this.httpAgent,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...headers,
        },
      });
      console.info(JSON.stringify({
        component: 'google-meet',
        operation: 'request',
        method,
        path,
        status: response.status,
        elapsedMilliseconds: Date.now() - startedAt,
      }));
      return response;
    } catch (error) {
      throw new GoogleMeetError(
        `Google Meet API request failed: ${getErrorMessage(error)}`,
        {
          retryable: isRetryableError(error),
          status: getErrorStatus(error),
          cause: error,
        },
      );
    }
  }

  async createSpace(space = {}) {
    const payload = {
      config: {
        accessType: 'OPEN',
        moderation: 'ON',
        ...(space.config || {}),
      },
      ...space,
    };
    return (await this.request('POST', '/spaces', { data: payload })).data;
  }

  async getSpace(spaceName) {
    return (await this.request('GET', `/${encodePath(spaceName)}`)).data;
  }

  async updateSpace(spaceName, space, updateMask) {
    return (
      await this.request('PATCH', `/${encodePath(spaceName)}`, {
        data: space,
        params: { updateMask },
      })
    ).data;
  }

  async addCohost(spaceName, email) {
    if (!email) {
      throw new GoogleMeetError('A facilitator email is required to add a co-host');
    }
    try {
      return (
        await this.request('POST', `/${encodePath(spaceName)}/members`, {
          data: { email, role: 'COHOST' },
        })
      ).data;
    } catch (error) {
      if (error.status === 409 && /exist|duplicate|already/i.test(error.message)) {
        return null;
      }
      throw error;
    }
  }

  async restrictSpace(spaceName) {
    return this.updateSpace(
      spaceName,
      {
        name: spaceName,
        config: { accessType: 'RESTRICTED' },
      },
      'config.accessType',
    );
  }

  async endActiveConference(spaceName) {
    return (
      await this.request('POST', `/${encodePath(spaceName)}:endActiveConference`)
    ).data;
  }

  async listConferenceRecords(params = {}) {
    return this.listAll('/conferenceRecords', 'conferenceRecords', params);
  }

  async listParticipants(conferenceRecordName, params = {}) {
    return this.listAll(
      `/${encodePath(conferenceRecordName)}/participants`,
      'participants',
      params,
    );
  }

  async listParticipantSessions(participantName, params = {}) {
    return this.listAll(
      `/${encodePath(participantName)}/participantSessions`,
      'participantSessions',
      params,
    );
  }

  async listAll(path, collectionKey, params = {}) {
    const items = [];
    let pageToken;

    do {
      const response = await this.request('GET', path, {
        params: { ...params, pageToken },
      });
      const body = response.data || {};
      if (!Array.isArray(body[collectionKey])) {
        throw new GoogleMeetError(
          `Google Meet response did not contain the expected ${collectionKey} collection`,
        );
      }
      items.push(...body[collectionKey]);
      pageToken = body.nextPageToken || null;
    } while (pageToken);

    return items;
  }
}

function encodePath(value) {
  return String(value)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

module.exports = {
  GoogleMeetError,
  GoogleMeetService,
  isRetryableError,
};
