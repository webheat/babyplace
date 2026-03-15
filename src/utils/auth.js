const config = {
  appid: {
    weixin: {
      h5: 'wxde10b66d0c930b78',
      web: 'wx0ebd7da2e72e6be2',
    },
  },
};

const WECHAT_REDIRECT_ORIGIN = 'https://ds.aixifs.com';
const LOGIN_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export const ADMIN_PAGE_ROUTE = '/pages/admin/index';

function buildAbsoluteUrl(path = '/') {
  // #ifdef H5
  const normalizedPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${String(path || '')}`;
  return `${WECHAT_REDIRECT_ORIGIN}/?target=${encodeURIComponent(normalizedPath)}`;
  // #endif
  return '';
}

function isWeixinBrowser() {
  // #ifdef H5
  return /MicroMessenger/i.test(window.navigator.userAgent || '');
  // #endif
  return false;
}

function getH5WechatAppId() {
  return isWeixinBrowser() ? config?.appid?.weixin?.h5 : config?.appid?.weixin?.web;
}

export function getUniIdToken() {
  return uni.getStorageSync('uni_id_token') || '';
}

export function getUniIdTokenExpired() {
  const rawValue = uni.getStorageSync('uni_id_token_expired');
  const value = Number(rawValue || 0);
  return Number.isFinite(value) ? value : 0;
}

export function getLoginTime() {
  const rawValue = uni.getStorageSync('uni_id_login_time');
  const value = Number(rawValue || 0);
  return Number.isFinite(value) ? value : 0;
}

export function setLoginTime(timestamp = Date.now()) {
  uni.setStorageSync('uni_id_login_time', timestamp);
}

export function clearLoginState() {
  uni.removeStorageSync('uni_id_token');
  uni.removeStorageSync('uni_id_token_expired');
  uni.removeStorageSync('uni_id_refresh_token');
  uni.removeStorageSync('uni_id_login_time');
}

export function hasValidUniIdToken() {
  const token = getUniIdToken();
  if (!token) {
    return false;
  }

  const expiredAt = getUniIdTokenExpired();
  if (expiredAt && expiredAt <= Date.now()) {
    return false;
  }

  const loginTime = getLoginTime();
  if (loginTime > 0 && Date.now() - loginTime > LOGIN_SESSION_DURATION_MS) {
    return false;
  }

  return true;
}

export function formatTokenExpired() {
  const expiredAt = getUniIdTokenExpired();
  if (!expiredAt) {
    return '未记录过期时间';
  }

  const date = new Date(expiredAt);
  if (Number.isNaN(date.getTime())) {
    return '过期时间格式异常';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function getWechatLoginConfigStatus() {
  const h5AppId = config?.appid?.weixin?.h5;
  const webAppId = config?.appid?.weixin?.web;

  return {
    h5AppId,
    webAppId,
    ready: Boolean(h5AppId && h5AppId !== 'xxxxxx' && webAppId && webAppId !== 'xxxxxx'),
  };
}

export function buildWechatRedirectUrl(targetPath = '/admin') {
  return buildAbsoluteUrl(targetPath || '/admin');
}

export function startH5WeixinLogin({ redirectPath = '/admin' } = {}) {
  // #ifdef H5
  const { ready } = getWechatLoginConfigStatus();
  const appId = getH5WechatAppId();

  if (!ready || !appId || appId === 'xxxxxx') {
    uni.showModal({
      title: '微信参数未配置',
      content: '请先在云端 uni-id/config.json 中填写微信 AppID 与 AppSecret。',
      showCancel: false,
    });
    return false;
  }

  const redirectUrl = buildWechatRedirectUrl(redirectPath);

  if (isWeixinBrowser()) {
    window.location.href = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=code&scope=snsapi_userinfo&state=STATE&connect_redirect=1#wechat_redirect`;
    return true;
  }

  window.location.href = `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=code&scope=snsapi_login&state=STATE#wechat_redirect`;
  return true;
  // #endif

  uni.showToast({
    title: '仅支持 H5 使用',
    icon: 'none',
  });
  return false;
}
