'use strict';

const crypto = require('crypto');
let astrbotConfig = null;
let uniIdConfig = null;

try {
  const createConfig = require('uni-config-center');
  astrbotConfig = createConfig({
    pluginId: 'astrbot',
    defaultConfig: {
      baseUrl: '',
      apiKey: '',
      timeout: 120000,
      wechatReplyTimeout: 30000,
      wechatToken: '',
      officialAccountAppId: '',
      officialAccountAppSecret: '',
    },
  });
  uniIdConfig = createConfig({
    pluginId: 'uni-id',
    defaultConfig: {},
  });
} catch (error) {
  console.warn('uni-config-center unavailable, falling back to environment variables');
}

function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getConfigValue(name, fallback = '') {
  const envName = `ASTROBOT_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
  const envValue = sanitizeString(process.env[envName] || process.env[name]);
  if (envValue) return envValue;
  if (!astrbotConfig) return fallback;
  return sanitizeString(astrbotConfig.config(name)) || fallback;
}

function getUniIdConfigValue(path, fallback = '') {
  if (!uniIdConfig) return fallback;
  const value = path.split('.').reduce((result, key) => {
    if (!result || typeof result !== 'object') return undefined;
    return result[key];
  }, uniIdConfig.config());
  return sanitizeString(value) || fallback;
}

function getWechatToken() {
  return sanitizeString(
    process.env.WECHAT_TOKEN ||
    process.env.ASTROBOT_WECHAT_TOKEN ||
    getConfigValue('wechatToken') ||
    getConfigValue('token')
  );
}

function getOfficialAccountAppId() {
  return sanitizeString(
    process.env.WECHAT_OFFICIAL_ACCOUNT_APP_ID ||
    process.env.OFFICIAL_ACCOUNT_APP_ID ||
    getConfigValue('officialAccountAppId') ||
    getConfigValue('wechatAppId') ||
    getUniIdConfigValue('web.oauth.weixin-h5.appid')
  );
}

function getOfficialAccountAppSecret() {
  return sanitizeString(
    process.env.WECHAT_OFFICIAL_ACCOUNT_APP_SECRET ||
    process.env.OFFICIAL_ACCOUNT_APP_SECRET ||
    getConfigValue('officialAccountAppSecret') ||
    getConfigValue('wechatAppSecret') ||
    getUniIdConfigValue('web.oauth.weixin-h5.appsecret')
  );
}

function getQuery(event = {}) {
  if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
    return event.queryStringParameters;
  }
  if (event.queryParameters && typeof event.queryParameters === 'object') {
    return event.queryParameters;
  }
  if (event.query && typeof event.query === 'object') {
    return event.query;
  }
  if (typeof event.queryString === 'string') {
    return event.queryString.split('&').reduce((result, pair) => {
      const [rawKey, rawValue = ''] = pair.split('=');
      if (!rawKey) return result;
      result[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
      return result;
    }, {});
  }
  return {};
}

function getBody(event = {}) {
  if (typeof event.body !== 'string') return '';
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return event.body;
}

function verifyWechatSignature(query) {
  const token = getWechatToken();
  if (!token) return true;

  const signature = sanitizeString(query.signature);
  const timestamp = sanitizeString(query.timestamp);
  const nonce = sanitizeString(query.nonce);
  if (!signature || !timestamp || !nonce) return false;

  const digest = crypto
    .createHash('sha1')
    .update([token, timestamp, nonce].sort().join(''))
    .digest('hex');
  return digest === signature;
}

function parseXmlValue(xml, tagName) {
  const pattern = new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>|<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = pattern.exec(xml);
  return sanitizeString(match ? (match[1] || match[2] || '') : '');
}

function parseWechatMessage(xml) {
  return {
    toUserName: parseXmlValue(xml, 'ToUserName'),
    fromUserName: parseXmlValue(xml, 'FromUserName'),
    createTime: Number(parseXmlValue(xml, 'CreateTime')) || Math.floor(Date.now() / 1000),
    msgType: parseXmlValue(xml, 'MsgType'),
    content: parseXmlValue(xml, 'Content'),
    msgId: parseXmlValue(xml, 'MsgId'),
  };
}

function cdataValue(value) {
  return String(value || '').replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function textXml(toUserName, fromUserName, content) {
  return [
    '<xml>',
    `<ToUserName><![CDATA[${toUserName}]]></ToUserName>`,
    `<FromUserName><![CDATA[${fromUserName}]]></FromUserName>`,
    `<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>`,
    '<MsgType><![CDATA[text]]></MsgType>',
    `<Content><![CDATA[${cdataValue(content)}]]></Content>`,
    '</xml>',
  ].join('');
}

function emptyResponse() {
  return 'success';
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

let accessTokenCache = {
  token: '',
  expiresAt: 0,
};

async function callAstrbot(message, sessionId) {
  const baseUrl = getConfigValue('baseUrl');
  if (!baseUrl) throw new Error('AstrBot chat service is not configured');

  const apiKey = getConfigValue('apiKey');
  const configuredTimeout = Number(getConfigValue('wechatReplyTimeout') || getConfigValue('timeout')) || 120000;
  const timeout = Math.max(1000, configuredTimeout);
  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/chat/sync`;

  const response = await uniCloud.httpclient.request(url, {
    method: 'POST',
    contentType: 'json',
    dataType: 'json',
    timeout,
    data: {
      username: `wechat_service_${sessionId}`,
      message,
      session_id: sessionId,
    },
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });

  if (response.status !== 200) {
    throw new Error(`AstrBot request failed: ${response.status || 500}`);
  }

  const result = response.data || {};
  if (result.status && result.status !== 'ok') {
    throw new Error(result.message || 'AstrBot returned error');
  }

  return pickReply(result);
}

async function getWechatAccessToken() {
  if (accessTokenCache.token && accessTokenCache.expiresAt - Date.now() > 60000) {
    return accessTokenCache.token;
  }

  const appId = getOfficialAccountAppId();
  const appSecret = getOfficialAccountAppSecret();
  if (!appId || !appSecret) {
    throw new Error('official account appId/appSecret is not configured');
  }

  const response = await uniCloud.httpclient.request('https://api.weixin.qq.com/cgi-bin/token', {
    method: 'GET',
    dataType: 'json',
    timeout: 10000,
    data: {
      grant_type: 'client_credential',
      appid: appId,
      secret: appSecret,
    },
  });

  const result = response.data || {};
  if (response.status !== 200 || !result.access_token) {
    throw new Error(result.errmsg || `get access_token failed: ${response.status || 500}`);
  }

  accessTokenCache = {
    token: result.access_token,
    expiresAt: Date.now() + Math.max(60, Number(result.expires_in || 7200) - 300) * 1000,
  };
  return accessTokenCache.token;
}

async function sendWechatCustomerText(openid, content) {
  const accessToken = await getWechatAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${encodeURIComponent(accessToken)}`;
  const response = await uniCloud.httpclient.request(url, {
    method: 'POST',
    contentType: 'json',
    dataType: 'json',
    timeout: 10000,
    data: {
      touser: openid,
      msgtype: 'text',
      text: {
        content,
      },
    },
  });

  const result = response.data || {};
  if (response.status !== 200 || Number(result.errcode || 0) !== 0) {
    throw new Error(result.errmsg || `send customer message failed: ${response.status || 500}`);
  }
  return result;
}

async function replyWechatCustomerMessage(message) {
  const sessionId = message.fromUserName || message.msgId || `wechat_${Date.now()}`;
  const reply = await callAstrbot(message.content, sessionId);
  await sendWechatCustomerText(message.fromUserName, reply || '我已收到，请稍后再试。');
}

function handleWechatMessageAsync(message) {
  replyWechatCustomerMessage(message).catch((error) => {
    console.error('babychat async reply failed', error);
  });
}

exports.main = async (event = {}) => {
  const query = getQuery(event);

  if (!verifyWechatSignature(query)) {
    return 'invalid signature';
  }

  if (event.httpMethod === 'GET' || query.echostr) {
    return sanitizeString(query.echostr);
  }

  const body = getBody(event);
  const message = parseWechatMessage(body);
  if (message.msgType !== 'text' || !message.content) {
    return emptyResponse();
  }

  handleWechatMessageAsync(message);
  return emptyResponse();
};
