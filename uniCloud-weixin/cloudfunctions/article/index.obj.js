'use strict';

const db = uniCloud.database();
const collection = db.collection('babyplace-article');

function ok(data, message = 'ok') {
  return { code: 0, message, data };
}

function fail(code, message, data = null) {
  return { code, message, data };
}

function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value.map(item => sanitizeString(item)).filter(Boolean) : [];
}

function toInteger(value, fallback = 0) {
  const num = Number(value);
  return Number.isInteger(num) ? num : fallback;
}

function normalizePayload(payload = {}) {
  return {
    title: sanitizeString(payload.title),
    source_account: sanitizeString(payload.source_account),
    source_account_id: sanitizeString(payload.source_account_id),
    publish_time: payload.publish_time || db.serverDate(),
    url: sanitizeString(payload.url),
    cover_image: sanitizeString(payload.cover_image),
    content_text: sanitizeString(payload.content_text),
    content_html: sanitizeString(payload.content_html),
    images: sanitizeArray(payload.images),
    extracted_poi_names: sanitizeArray(payload.extracted_poi_names),
    parse_result: payload.parse_result && typeof payload.parse_result === 'object' ? payload.parse_result : {},
    status: sanitizeString(payload.status) || 'pending',
    parse_confidence: Number(payload.parse_confidence) || 0,
  };
}

module.exports = {
  async list(params = {}) {
    const page = Math.max(1, toInteger(params.page, 1));
    const pageSize = Math.min(50, Math.max(1, toInteger(params.pageSize, 10)));
    const keyword = sanitizeString(params.keyword);
    const where = {};
    if (keyword) {
      where.$or = [
        { title: new db.RegExp({ regexp: keyword, options: 'i' }) },
        { source_account: new db.RegExp({ regexp: keyword, options: 'i' }) },
      ];
    }
    const query = collection.where(where);
    const countResult = await query.count();
    const listResult = await query
      .orderBy('publish_time', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();
    return ok({
      list: listResult.data || [],
      total: countResult.total || 0,
      page,
      pageSize,
    });
  },

  async detail(params = {}) {
    const id = sanitizeString(params.id);
    if (!id) return fail(400, 'id is required');
    const result = await collection.doc(id).get();
    const item = (result.data || [])[0];
    if (!item) return fail(404, 'article not found');
    return ok(item);
  },

  async create(params = {}) {
    const payload = normalizePayload(params.payload || {});
    if (!payload.title || !payload.source_account) {
      return fail(400, 'title and source_account are required');
    }
    const now = db.serverDate();
    const result = await collection.add({
      ...payload,
      created_at: now,
      updated_at: now,
    });
    return ok({ id: result.id }, 'created');
  },

  async update(params = {}) {
    const id = sanitizeString(params.id);
    if (!id) return fail(400, 'id is required');
    const payload = normalizePayload(params.payload || {});
    const result = await collection.doc(id).update({
      ...payload,
      updated_at: db.serverDate(),
    });
    if (!result.updated) return fail(404, 'article not found');
    return ok({ id, updated: result.updated }, 'updated');
  },

  async remove(params = {}) {
    const id = sanitizeString(params.id);
    if (!id) return fail(400, 'id is required');
    const result = await collection.doc(id).remove();
    if (!result.deleted) return fail(404, 'article not found');
    return ok({ id, deleted: result.deleted }, 'removed');
  },
};
