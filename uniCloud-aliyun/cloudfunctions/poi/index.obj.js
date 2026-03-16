'use strict';

const db = uniCloud.database();
const poiCollection = db.collection('babyplace-poi');
const sourceCollection = db.collection('babyplace-content-source');
const dbCmd = db.command;

const MAX_PAGE_SIZE = 50;

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

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toInteger(value, fallback = 0) {
  const num = Number(value);
  return Number.isInteger(num) ? num : fallback;
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function normalizeName(value) {
  return sanitizeString(value)
    .toLowerCase()
    .replace(/[（）()·,，.。:：/\\\-\s]/g, '');
}

function levenshteinDistance(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  const dp = new Array(m + 1).fill(0);
  for (let j = 0; j <= m; j++) dp[j] = j;
  for (let i = 1; i <= n; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= m; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1);
      }
      prev = temp;
    }
  }
  return dp[m];
}

function calcNameSimilarity(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshteinDistance(left, right);
  const maxLength = Math.max(left.length, right.length);
  return maxLength ? 1 - distance / maxLength : 0;
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function calcDistanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
    * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizePoiPayload(payload = {}) {
  const location = payload.location || {};
  const facility = payload.facilities || {};
  return {
    name: sanitizeString(payload.name),
    canonical_name: sanitizeString(payload.canonical_name) || sanitizeString(payload.name),
    alias: sanitizeArray(payload.alias),
    city: sanitizeString(payload.city),
    district: sanitizeString(payload.district),
    address: sanitizeString(payload.address),
    location: {
      lat: toNumber(location.lat, 0),
      lng: toNumber(location.lng, 0),
    },
    category: sanitizeString(payload.category) || 'mixed',
    age_range: sanitizeArray(payload.age_range),
    indoor: toBool(payload.indoor, false),
    price_type: sanitizeString(payload.price_type) || 'free',
    recommended_duration: sanitizeString(payload.recommended_duration) || '2h',
    transport: sanitizeArray(payload.transport),
    facilities: {
      stroller_friendly: toBool(facility.stroller_friendly, false),
      restroom: toBool(facility.restroom, false),
      food: toBool(facility.food, false),
      shade: toBool(facility.shade, false),
      parking: toBool(facility.parking, false),
      rainy_day_ok: toBool(facility.rainy_day_ok, false),
    },
    summary: sanitizeString(payload.summary),
    recommend_reason: sanitizeString(payload.recommend_reason),
    notice: sanitizeString(payload.notice),
    cover_image: sanitizeString(payload.cover_image),
    gallery: sanitizeArray(payload.gallery),
    tags: sanitizeArray(payload.tags),
    source_count: Math.max(0, toInteger(payload.source_count, 0)),
    review_count: Math.max(0, toInteger(payload.review_count, 0)),
    avg_rating: Math.max(0, Math.min(5, toNumber(payload.avg_rating, 0))),
    status: sanitizeString(payload.status) || 'draft',
  };
}

function validatePoiPayload(payload, forUpdate = false) {
  const errors = [];
  if (!forUpdate || payload.name) {
    if (!payload.name || payload.name.length < 2 || payload.name.length > 80) {
      errors.push('name must be 2-80 characters');
    }
  }
  if (!forUpdate || payload.city) {
    if (!payload.city || payload.city.length > 40) {
      errors.push('city is required');
    }
  }
  if (!forUpdate || payload.district) {
    if (!payload.district || payload.district.length > 40) {
      errors.push('district is required');
    }
  }
  if (!forUpdate || payload.location) {
    if (payload.location.lat < -90 || payload.location.lat > 90) {
      errors.push('location.lat out of range');
    }
    if (payload.location.lng < -180 || payload.location.lng > 180) {
      errors.push('location.lng out of range');
    }
  }
  return errors;
}

async function findDedupMatch(payload) {
  const where = {
    city: payload.city,
    district: payload.district,
  };
  const result = await poiCollection.where(where).limit(200).get();
  const list = result.data || [];
  let bestMatch = null;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const nameSimilarity = calcNameSimilarity(payload.name, item.name || item.canonical_name);
    const lat1 = toNumber(payload.location?.lat, 0);
    const lng1 = toNumber(payload.location?.lng, 0);
    const lat2 = toNumber(item.location?.lat, 0);
    const lng2 = toNumber(item.location?.lng, 0);
    const distance = calcDistanceMeters(lat1, lng1, lat2, lng2);
    if (nameSimilarity > 0.85 && distance < 500) {
      if (!bestMatch || nameSimilarity > bestMatch.nameSimilarity) {
        bestMatch = { item, nameSimilarity, distance };
      }
    }
  }
  return bestMatch;
}

function patchMergePayload(existing, incoming) {
  const mergedAlias = Array.from(new Set([]
    .concat(sanitizeArray(existing.alias))
    .concat(sanitizeArray(incoming.alias))
    .concat(incoming.name ? [incoming.name] : [])
    .filter(Boolean)));
  return {
    canonical_name: sanitizeString(existing.canonical_name) || sanitizeString(existing.name),
    alias: mergedAlias,
    source_count: Math.max(toInteger(existing.source_count, 0), 0) + 1,
    updated_at: db.serverDate(),
  };
}

module.exports = {
  async list(params = {}) {
    const page = Math.max(1, toInteger(params.page, 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toInteger(params.pageSize, 10)));
    const keyword = sanitizeString(params.keyword);
    const city = sanitizeString(params.city);
    const district = sanitizeString(params.district);
    const includeDraft = Boolean(params.includeDraft);
    const where = {};
    if (!includeDraft) where.status = 'published';
    if (city) where.city = city;
    if (district) where.district = district;
    if (keyword) {
      where.$or = [
        { name: new db.RegExp({ regexp: keyword, options: 'i' }) },
        { canonical_name: new db.RegExp({ regexp: keyword, options: 'i' }) },
        { address: new db.RegExp({ regexp: keyword, options: 'i' }) },
      ];
    }
    const query = poiCollection.where(where);
    const countResult = await query.count();
    const listResult = await query
      .orderBy('updated_at', 'desc')
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
    const includeDraft = Boolean(params.includeDraft);
    const result = await poiCollection.doc(id).get();
    const item = (result.data || [])[0];
    if (!item) return fail(404, 'poi not found');
    if (!includeDraft && item.status !== 'published') return fail(404, 'poi not found');
    const reviewResult = await db.collection('babyplace-user-review')
      .where({ poi_id: id, status: 'approved' })
      .orderBy('created_at', 'desc')
      .limit(20)
      .get();
    const sourceResult = await sourceCollection
      .where({ poi_id: id, status: 'active' })
      .orderBy('updated_at', 'desc')
      .limit(20)
      .get();
    return ok({
      poi: item,
      reviews: reviewResult.data || [],
      sources: sourceResult.data || [],
    });
  },

  async nearby(params = {}) {
    const lat = toNumber(params.lat, NaN);
    const lng = toNumber(params.lng, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return fail(400, 'lat/lng is required');
    }
    const radius = Math.max(100, Math.min(50000, toInteger(params.radius, 3000)));
    const page = Math.max(1, toInteger(params.page, 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toInteger(params.pageSize, 20)));
    const result = await poiCollection.where({ status: 'published' }).limit(500).get();
    const list = (result.data || [])
      .map(item => {
        const poiLat = toNumber(item.location?.lat, 0);
        const poiLng = toNumber(item.location?.lng, 0);
        const distance = calcDistanceMeters(lat, lng, poiLat, poiLng);
        return { ...item, distance };
      })
      .filter(item => item.distance <= radius)
      .sort((a, b) => a.distance - b.distance);
    const total = list.length;
    const start = (page - 1) * pageSize;
    return ok({
      list: list.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      radius,
    });
  },

  async create(params = {}) {
    const payload = normalizePoiPayload(params.payload || {});
    const errors = validatePoiPayload(payload, false);
    if (errors.length) return fail(400, errors.join('; '));
    const dedup = await findDedupMatch(payload);
    if (dedup) {
      const updateResult = await poiCollection.doc(dedup.item._id).update(patchMergePayload(dedup.item, payload));
      if (!updateResult.updated) return fail(500, 'dedup merge failed');
      if (sanitizeString(params.article_id)) {
        await sourceCollection.add({
          poi_id: dedup.item._id,
          article_id: sanitizeString(params.article_id),
          source_type: 'article',
          quoted_text: '',
          support_fields: [],
          confidence_score: dedup.nameSimilarity,
          is_primary: false,
          status: 'active',
          created_at: db.serverDate(),
          updated_at: db.serverDate(),
        });
      }
      return ok({
        id: dedup.item._id,
        deduped: true,
        similarity: dedup.nameSimilarity,
        distance: dedup.distance,
      }, 'merged');
    }
    const now = db.serverDate();
    const result = await poiCollection.add({
      ...payload,
      created_at: now,
      updated_at: now,
    });
    if (sanitizeString(params.article_id)) {
      await sourceCollection.add({
        poi_id: result.id,
        article_id: sanitizeString(params.article_id),
        source_type: 'article',
        quoted_text: '',
        support_fields: [],
        confidence_score: 1,
        is_primary: true,
        status: 'active',
        created_at: now,
        updated_at: now,
      });
    }
    return ok({ id: result.id, deduped: false }, 'created');
  },

  async update(params = {}) {
    const id = sanitizeString(params.id);
    if (!id) return fail(400, 'id is required');
    const payload = normalizePoiPayload(params.payload || {});
    const errors = validatePoiPayload(payload, true);
    if (errors.length) return fail(400, errors.join('; '));
    const updateData = { ...payload, updated_at: db.serverDate() };
    const result = await poiCollection.doc(id).update(updateData);
    if (!result.updated) return fail(404, 'poi not found');
    return ok({ id, updated: result.updated }, 'updated');
  },

  async remove(params = {}) {
    const id = sanitizeString(params.id);
    if (!id) return fail(400, 'id is required');
    const result = await poiCollection.doc(id).remove();
    if (!result.deleted) return fail(404, 'poi not found');
    return ok({ id, deleted: result.deleted }, 'removed');
  },

  async upsertFromSource(params = {}) {
    return this.create(params);
  },
};
