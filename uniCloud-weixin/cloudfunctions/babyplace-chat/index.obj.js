'use strict';

const createConfig = require('uni-config-center');

const chatConfig = createConfig({
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

function pickReply(result) {
  if (!result || typeof result !== 'object') return '';
  const data = result.data && typeof result.data === 'object' ? result.data : result;
  return sanitizeString(
    data.reply ||
    data.message ||
    data.content ||
    data.text ||
    data.response ||
    data.result
  );
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

    const baseUrl = sanitizeString(chatConfig.config('baseUrl'));
    if (!baseUrl) {
      return fail(500, 'AstrBot chat service is not configured');
    }

    const apiKey = sanitizeString(chatConfig.config('apiKey'));
    const timeout = Math.max(10000, Number(chatConfig.config('timeout')) || 120000);

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

      return ok({
        ...(result.data && typeof result.data === 'object' ? result.data : {}),
        reply: pickReply(result),
      });
    } catch (error) {
      return fail(500, error.message || 'chat request failed');
    }
  },
};
