const USER_KEY = 'mock-user-info';
const TOKEN = 'debug-token';
const uniIdCo = uniCloud.importObject('uni-id-co', { customUI: true });

function createDefaultUser() {
  return {
    user_id: 'guest',
    nickname: '游客用户',
    avatar: '/static/images/icon-default-avatar.png',
    phone: '13800138000',
    gender: 0,
    birthday: '',
    city: '',
    description: '欢迎来到 babyplace',
    wechat: '',
    wechat_pic: '',
  };
}

function getStoredUser() {
  const current = uni.getStorageSync(USER_KEY);
  if (current && typeof current === 'object') {
    return { ...createDefaultUser(), ...current };
  }
  const fallback = createDefaultUser();
  uni.setStorageSync(USER_KEY, fallback);
  return fallback;
}

function setStoredUser(payload = {}) {
  const nextUser = { ...getStoredUser(), ...payload };
  uni.setStorageSync(USER_KEY, nextUser);
  return nextUser;
}

function ok(data = {}, message = 'ok') {
  return Promise.resolve({ code: 200, message, data });
}

function getUniIdUserPayload(result = {}, overrides = {}) {
  const userInfo = result.userInfo && typeof result.userInfo === 'object' ? result.userInfo : {};
  return {
    user_id: userInfo._id || userInfo.uid || result.uid || overrides.user_id,
    nickname: userInfo.nickname || userInfo.username || overrides.nickname,
    avatar: userInfo.avatar_file?.url || userInfo.avatar || overrides.avatar,
    phone: userInfo.mobile || overrides.phone,
    gender: typeof userInfo.gender === 'number' ? userInfo.gender : overrides.gender,
    birthday: userInfo.birthday || overrides.birthday,
    city: userInfo.city || overrides.city,
    description: userInfo.description || overrides.description,
    wechat: userInfo.wx_openid ? '已绑定微信' : overrides.wechat,
    wechat_pic: overrides.wechat_pic,
  };
}

function normalizeLoginResult(result = {}, overrides = {}) {
  const token = result.token || uni.getStorageSync('uni_id_token') || TOKEN;
  const user = setStoredUser(getUniIdUserPayload(result, {
    ...getStoredUser(),
    ...overrides,
  }));
  return ok({ user, token });
}

async function tryRealLoginByWeixin(code) {
  const result = await uniIdCo.loginByWeixin({ code });
  if (!result || (!result.token && !result.uid && !result.userInfo)) {
    throw new Error('uni-id loginByWeixin returned empty result');
  }
  if (result.token) {
    uni.setStorageSync('uni_id_token', result.token);
  }
  if (typeof result.tokenExpired !== 'undefined') {
    uni.setStorageSync('uni_id_token_expired', result.tokenExpired || 0);
  }
  if (result.refreshToken) {
    uni.setStorageSync('uni_id_refresh_token', result.refreshToken);
  }
  return normalizeLoginResult(result);
}

async function tryRealPasswordLogin(phone, password) {
  const result = await uniIdCo.login({ mobile: phone, password });
  if (!result || (!result.token && !result.uid && !result.userInfo)) {
    throw new Error('uni-id login returned empty result');
  }
  if (result.token) {
    uni.setStorageSync('uni_id_token', result.token);
  }
  if (typeof result.tokenExpired !== 'undefined') {
    uni.setStorageSync('uni_id_token_expired', result.tokenExpired || 0);
  }
  return normalizeLoginResult(result, { phone });
}

async function tryRealAccountInfo() {
  const result = await uniIdCo.getAccountInfo();
  const current = getStoredUser();
  return ok(setStoredUser({
    ...current,
    user_spec: {
      isMobileBound: Boolean(result.isMobileBound),
      isWeixinBound: Boolean(result.isWeixinBound),
      isEmailBound: Boolean(result.isEmailBound),
      isPasswordSet: Boolean(result.isPasswordSet),
    },
  }));
}

async function tryRealBindMobile(phone, code, captcha) {
  const result = await uniIdCo.bindMobileBySms({
    mobile: phone,
    code,
    captcha,
  });
  return ok({
    user: setStoredUser({ phone }),
    token: uni.getStorageSync('uni_id_token') || TOKEN,
    result,
  });
}

async function tryRealUpdatePassword(oldPassword, newPassword) {
  await uniIdCo.updatePwd({
    oldPassword,
    newPassword,
  });
  return ok(true, 'password updated');
}

async function tryRealResetPassword(phone, code, password, captcha) {
  await uniIdCo.resetPwdBySms({
    mobile: phone,
    code,
    password,
    captcha,
  });
  return ok(true, 'password reset');
}

export default {
  testLogin() {
    return ok({ user: getStoredUser(), token: TOKEN });
  },

  async phoneLogin(phone, password) {
    try {
      return await tryRealPasswordLogin(phone, password);
    } catch (_error) {
      return ok({ user: getStoredUser(), token: TOKEN });
    }
  },

  async codeLogin(code) {
    try {
      return await tryRealLoginByWeixin(code);
    } catch (_error) {
      return ok({ user: getStoredUser(), token: TOKEN });
    }
  },

  register() {
    return ok({ user: getStoredUser(), token: TOKEN });
  },

  async userDetailInfo() {
    try {
      return await tryRealAccountInfo();
    } catch (_error) {
      return ok(getStoredUser());
    }
  },

  addEntryLog() {
    return ok({});
  },

  getBearerToken() {
    return ok(TOKEN);
  },

  async changPhone(phone, code = '', captcha = '') {
    try {
      if (code && captcha) {
        return await tryRealBindMobile(phone, code, captcha);
      }
    } catch (_error) {
      // Fallback to local persistence.
    }
    const user = setStoredUser({ phone });
    return ok({ user, token: TOKEN });
  },

  bindIdcardByOcr() {
    return ok({});
  },
  idCardInfo() {
    return ok({});
  },
  idCardOcrInfo() {
    return ok({});
  },
  rebindIdcard() {
    return ok({});
  },
  uploadFrontIdcard() {
    return ok({ url: '' });
  },
  changeUserAvatar(avatar) {
    return ok(setStoredUser({ avatar }));
  },
  changeUserWechatQrcode(wechat_pic) {
    return ok(setStoredUser({ wechat_pic }));
  },
  modifyUserAddress(city) {
    return ok(setStoredUser({ city }));
  },
  modifyUserIntInfo(field, value) {
    if (!field) return ok(getStoredUser());
    return ok(setStoredUser({ [field]: value }));
  },
  modifyUserStrInfo(field, value) {
    if (!field) return ok(getStoredUser());
    return ok(setStoredUser({ [field]: value }));
  },
  async resetPassword(phone, code, password, captcha = '') {
    try {
      if (phone && code && password && captcha) {
        return await tryRealResetPassword(phone, code, password, captcha);
      }
    } catch (_error) {
      // Fallback to mock success while sms flow is unavailable.
    }
    return ok(true, 'password reset');
  },
  async modifyPassword(oldPassword, newPassword) {
    try {
      if (oldPassword && newPassword) {
        return await tryRealUpdatePassword(oldPassword, newPassword);
      }
    } catch (_error) {
      // Fallback to mock success when cloud object is unavailable.
    }
    return ok(true, 'password updated');
  },
  code2unionid() {
    return ok({ unionid: 'debug-unionid' });
  },
};
