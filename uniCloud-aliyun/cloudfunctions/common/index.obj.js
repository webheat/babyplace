'use strict';

const db = uniCloud.database();
const feedbackCollection = db.collection('babyplace-feedback');
const errorLogCollection = db.collection('babyplace-error-log');

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
  async officialAccountSwitch() {
    return ok(1);
  },

  async miniappShareCover() {
    return ok('/static/logo.png');
  },

  async addErrorLog(params = {}) {
    const payload = params && typeof params === 'object' ? params : {};
    await errorLogCollection.add({
      message: sanitizeString(payload.message),
      stack: sanitizeString(payload.stack),
      page: sanitizeString(payload.page),
      extra: payload.extra && typeof payload.extra === 'object' ? payload.extra : {},
      created_at: db.serverDate(),
    });
    return ok(true);
  },

  async feedback(params = {}) {
    const content = sanitizeString(params.content);
    const contact = sanitizeString(params.contact);
    if (!content) return fail(400, 'content is required');
    const result = await feedbackCollection.add({
      content,
      contact,
      status: 'pending',
      created_at: db.serverDate(),
      updated_at: db.serverDate(),
    });
    return ok({ id: result.id }, 'submitted');
  },

  async getUploadImageUrl() {
    return ok({
      uploadUrl: '',
      fileUrl: '/static/logo.png',
    });
  },
};
