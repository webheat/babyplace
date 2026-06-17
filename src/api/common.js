const FEEDBACK_KEY = 'babyplace-feedback-list';

function ok(data = {}, message = 'ok') {
  return Promise.resolve({ code: 200, message, data });
}

function getList(key) {
  const current = uni.getStorageSync(key);
  return Array.isArray(current) ? current : [];
}

export default {
  miniappShareCover() {
    const covers = ['/static/logo.png', '/static/tab/home-selected.png', '/static/images/icon-default-avatar.png'];
    return ok(covers[Math.floor(Math.random() * covers.length)] || '/static/logo.png');
  },

  officialAccountSwitch() {
    return ok(1);
  },

  addErrorLog(payload = {}) {
    console.error('addErrorLog', payload);
    return ok(true);
  },

  async feedback(payload = {}) {
    const list = getList(FEEDBACK_KEY);
    list.unshift({
      id: `${Date.now()}`,
      content: payload.content || '',
      contact: payload.contact || '',
      created_at: Date.now(),
    });
    uni.setStorageSync(FEEDBACK_KEY, list.slice(0, 50));
    return ok(true, 'submitted');
  },

  getUploadImageUrl() {
    return ok({
      uploadUrl: '',
      fileUrl: '/static/logo.png',
    });
  },

  getMsgCode(phone = '') {
    const code = '123456';
    uni.setStorageSync('babyplace-msg-code', {
      phone,
      code,
      created_at: Date.now(),
      scene: 'reset-pwd-by-sms',
    });
    return ok({ phone, code, scene: 'reset-pwd-by-sms' });
  },
};
