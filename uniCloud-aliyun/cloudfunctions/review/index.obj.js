'use strict';

const db = uniCloud.database();
const reviewCollection = db.collection('babyplace-user-review');
const poiCollection = db.collection('babyplace-poi');

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

async function refreshPoiRating(poiId) {
  const reviewResult = await reviewCollection.where({
    poi_id: poiId,
    status: 'approved',
  }).limit(1000).get();
  const reviews = reviewResult.data || [];
  const reviewCount = reviews.length;
  const score = reviews.reduce((sum, item) => sum + toInteger(item.rating, 0), 0);
  const avgRating = reviewCount ? Number((score / reviewCount).toFixed(2)) : 0;
  await poiCollection.doc(poiId).update({
    review_count: reviewCount,
    avg_rating: avgRating,
    updated_at: db.serverDate(),
  });
  return { reviewCount, avgRating };
}

module.exports = {
  async create(params = {}) {
    const payload = params.payload || {};
    const poiId = sanitizeString(payload.poi_id);
    if (!poiId) return fail(400, 'poi_id is required');
    const poiResult = await poiCollection.doc(poiId).get();
    const poi = (poiResult.data || [])[0];
    if (!poi) return fail(404, 'poi not found');
    const rating = toInteger(payload.rating, 0);
    if (rating < 1 || rating > 5) return fail(400, 'rating must be between 1 and 5');
    const now = db.serverDate();
    const result = await reviewCollection.add({
      poi_id: poiId,
      user_id: sanitizeString(payload.user_id),
      nickname: sanitizeString(payload.nickname),
      avatar: sanitizeString(payload.avatar),
      rating,
      comment: sanitizeString(payload.comment),
      visit_date: payload.visit_date || now,
      tags: sanitizeArray(payload.tags),
      images: sanitizeArray(payload.images),
      status: sanitizeString(payload.status) || 'approved',
      created_at: now,
      updated_at: now,
    });
    const stat = await refreshPoiRating(poiId);
    return ok({ id: result.id, poi_id: poiId, ...stat }, 'created');
  },

  async listByPoi(params = {}) {
    const poiId = sanitizeString(params.poi_id);
    if (!poiId) return fail(400, 'poi_id is required');
    const page = Math.max(1, toInteger(params.page, 1));
    const pageSize = Math.min(50, Math.max(1, toInteger(params.pageSize, 10)));
    const query = reviewCollection.where({
      poi_id: poiId,
      status: 'approved',
    });
    const countResult = await query.count();
    const listResult = await query
      .orderBy('created_at', 'desc')
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
};
