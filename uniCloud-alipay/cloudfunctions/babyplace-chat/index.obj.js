'use strict';

const fs = require('fs');
const path = require('path');

function loadAstrbotConfig() {
  try {
    const configPath = path.resolve(__dirname, '../common/uni-config-center/astrbot/config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.warn('Failed to load astrbot config:', error.message);
  }
  return {
    baseUrl: '',
    apiKey: '',
    timeout: 120000,
  };
}

const astrbotConfig = loadAstrbotConfig();

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

    const baseUrl = sanitizeString(astrbotConfig.baseUrl);
    if (!baseUrl) {
      return fail(500, 'AstrBot chat service is not configured');
    }

    const apiKey = sanitizeString(astrbotConfig.apiKey);
    const timeout = Math.max(10000, Number(astrbotConfig.timeout) || 120000);

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
