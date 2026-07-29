/**
 * Mock 用户数据（仅开发/调试模式使用）
 * 生产环境应通过 uni-id 或后端接口获取用户信息
 */

const USER_KEY = 'mock-user-info';
const TOKEN = 'debug-token';

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

const mockUserApi = {
  testLogin() {
    return ok({ user: getStoredUser(), token: TOKEN });
  },

  phoneLogin(phone) {
    return ok({ user: setStoredUser({ phone }), token: TOKEN });
  },

  codeLogin() {
    return ok({ user: getStoredUser(), token: TOKEN });
  },

  register() {
    return ok({ user: getStoredUser(), token: TOKEN });
  },

  userDetailInfo() {
    return ok(getStoredUser());
  },

  addEntryLog() {
    return ok({});
  },

  getBearerToken() {
    return ok(TOKEN);
  },

  changPhone(phone) {
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
  resetPassword() {
    return ok(true, 'password reset');
  },
  modifyPassword() {
    return ok(true, 'password updated');
  },
  code2unionid() {
    return ok({ unionid: 'debug-unionid' });
  },
};

export default mockUserApi;
