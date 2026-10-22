const axios = require('axios');
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
  }

  async getAccessToken() {
    try {
      const { token } = await this.oauthClient.getAccessToken();
      if (!token) {
        throw new GoogleMeetError('Google returned no access token');
      }
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

    try {
      return await axios({
        method,
        url: `${this.config.apiBaseUrl}/v2${path}`,
        data,
        params,
        timeout: this.config.requestTimeoutMs,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...headers,
        },
      });
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
    return (await this.request('POST', '/spaces', { data: space })).data;
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
