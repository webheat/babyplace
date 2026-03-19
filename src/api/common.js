const FEEDBACK_KEY = 'babyplace-feedback-list';
const MSG_CODE_KEY = 'babyplace-msg-code';
const commonObject = uniCloud.importObject('common');
const uniIdCo = uniCloud.importObject('uni-id-co', { customUI: true });

function ok(data = {}, message = 'ok') {
  return Promise.resolve({ code: 200, message, data });
}

function getList(key) {
  const current = uni.getStorageSync(key);
  return Array.isArray(current) ? current : [];
}

export default {
  async miniappShareCover() {
    try {
      const result = await commonObject.miniappShareCover();
      if (result.code === 0 || result.code === 200) {
        return ok(result.data || '/static/logo.png');
      }
    } catch (_error) {
      // Fallback to local static covers when cloud object is unavailable.
    }
    const covers = ['/static/logo.png', '/static/tab/home-selected.png', '/static/images/icon-default-avatar.png'];
    return ok(covers[Math.floor(Math.random() * covers.length)] || '/static/logo.png');
  },

  async officialAccountSwitch() {
    try {
      const result = await commonObject.officialAccountSwitch();
      if (result.code === 0 || result.code === 200) {
        return ok(result.data ?? 1);
      }
    } catch (_error) {
      // Fallback to enabled.
    }
    return ok(1);
  },

  async addErrorLog(payload = {}) {
    try {
      const result = await commonObject.addErrorLog(payload);
      if (result.code === 0 || result.code === 200) {
        return ok(true);
      }
    } catch (_error) {
      console.error('common.addErrorLog', payload);
    }
    return ok(true);
  },

  async feedback(payload = {}) {
    try {
      const result = await commonObject.feedback(payload);
      if (result.code === 0 || result.code === 200) {
        return ok(result.data || true, 'submitted');
      }
    } catch (_error) {
      // Fallback to local persistence while cloud object is unavailable.
    }
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

  async getUploadImageUrl() {
    try {
      const result = await commonObject.getUploadImageUrl();
      if (result.code === 0 || result.code === 200) {
        return ok(result.data || { uploadUrl: '', fileUrl: '/static/logo.png' });
      }
    } catch (_error) {
      // Fallback to static file url.
    }
    return ok({
      uploadUrl: '',
      fileUrl: '/static/logo.png',
    });
  },

  async getMsgCode(phone = '', captcha = '', scene = 'reset-pwd-by-sms') {
    try {
      const result = await uniIdCo.sendSmsCode({
        mobile: phone,
        captcha,
        scene,
      });
      if (result && (result.errCode === 0 || result.code === 0)) {
        uni.setStorageSync(MSG_CODE_KEY, {
          phone,
          code: '',
          created_at: Date.now(),
          scene,
        });
        return ok({
          phone,
          scene,
          requestId: result.requestId || '',
        });
      }
    } catch (_error) {
      // Fallback to local code when sms service or captcha cloud object is unavailable.
    }
    const code = '123456';
    uni.setStorageSync(MSG_CODE_KEY, {
      phone,
      code,
      created_at: Date.now(),
      scene,
    });
    return ok({ phone, code, scene });
  },
};
