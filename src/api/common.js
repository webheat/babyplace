import { TEST_VERIFICATION_CODE } from './_mocks/sms.js';

const FEEDBACK_KEY = 'babyplace-feedback-list';

function getList(key) {
  const current = uni.getStorageSync(key);
  return Array.isArray(current) ? current : [];
}

export default {
  miniappShareCover() {
    const covers = ['/static/logo.png', '/static/tab/home-selected.png', '/static/images/icon-default-avatar.png'];
    return { code: 200, message: 'ok', data: covers[Math.floor(Math.random() * covers.length)] || '/static/logo.png' };
  },

  officialAccountSwitch() {
    return { code: 200, message: 'ok', data: 1 };
  },

  addErrorLog(payload = {}) {
    console.error('addErrorLog', payload);
    return { code: 200, message: 'ok', data: true };
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
    return { code: 200, message: 'ok', data: true };
  },

  getUploadImageUrl() {
    return { code: 200, message: 'ok', data: { uploadUrl: '', fileUrl: '/static/logo.png' } };
  },

  getMsgCode(phone = '') {
    uni.setStorageSync('babyplace-msg-code', {
      phone,
      code: TEST_VERIFICATION_CODE,
      created_at: Date.now(),
      scene: 'reset-pwd-by-sms',
    });
    return { code: 200, message: 'ok', data: { phone, code: TEST_VERIFICATION_CODE, scene: 'reset-pwd-by-sms' } };
  },
};
