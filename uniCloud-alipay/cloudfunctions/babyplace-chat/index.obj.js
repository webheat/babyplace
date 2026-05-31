'use strict';

const createConfig = require('uni-config-center');

const astrbotConfig = createConfig({
  pluginId: 'astrbot',
  defaultConfig: {
    baseUrl: '',
    apiKey: '',
    timeout: 120000,
  },
});

function ok(data, message = 'ok') {
  return { code: 0, message, data };
}

function fail(code, message, data = null) {
  return { code, message, data };
}

function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

module.exports = {
  async send(params = {}) {
    const message = sanitizeString(params.message);
    if (!message) {
      return fail(400, 'message is required');
    }

    let sessionId = sanitizeString(params.sessionId);
    if (!sessionId) {
      sessionId = `mp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    const baseUrl = sanitizeString(astrbotConfig.config('baseUrl'));
    if (!baseUrl) {
      return fail(500, 'AstrBot chat service is not configured');
    }

    const apiKey = sanitizeString(astrbotConfig.config('apiKey'));
    const timeout = Math.max(10000, Number(astrbotConfig.config('timeout')) || 120000);

    const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/chat/sync`;

    try {
      const response = await uniCloud.httpclient.request(url, {
        method: 'POST',
        contentType: 'json',
        dataType: 'json',
        timeout,
        data: {
          username: `miniprogram_${sessionId}`,
          message,
          session_id: sessionId,
        },
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.status !== 200) {
        return fail(response.status || 500, 'AstrBot request failed');
      }

      const result = response.data || {};
      if (result.status !== 'ok') {
        return fail(502, result.message || 'AstrBot returned error');
      }

      return ok(result.data);
    } catch (error) {
      return fail(500, error.message || 'chat request failed');
    }
  },
};
