'use strict';

const db = uniCloud.database();

const IMPORT_SECRET = 'babyplace2026';
const ALLOWED_COLLECTIONS = new Set([
  'babyplace-poi',
  'babyplace-article',
  'babyplace-content-source',
  'babyplace-user-review',
]);

function ok(data, message = 'ok') {
  return { code: 0, message, data };
}

function fail(code, message, data = null) {
  return { code, message, data };
}

function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toInteger(value, fallback = 0) {
  const num = Number(value);
  return Number.isInteger(num) ? num : fallback;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value.map(item => sanitizeString(item)).filter(Boolean) : [];
}

function parseEvent(event) {
  if (event.httpMethod && event.body) {
    try {
      let body = event.body;
      if (event.isBase64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf8');
      }
      return JSON.parse(body);
    } catch (error) {
      return null;
    }
  }
  return event || {};
}

function ensureAllowedCollection(collection) {
  const normalized = sanitizeString(collection);
  if (!ALLOWED_COLLECTIONS.has(normalized)) return '';
  return normalized;
}

function normalizePoiDoc(input = {}) {
  return {
    name: sanitizeString(input.name) || '未命名地点',
    canonical_name: sanitizeString(input.canonical_name) || sanitizeString(input.name) || '未命名地点',
    alias: sanitizeArray(input.alias),
    city: sanitizeString(input.city) || '广州',
    district: sanitizeString(input.district) || '天河区',
    address: sanitizeString(input.address) || '',
    location: {
      lat: toNumber(input.location?.lat, 23.1291),
      lng: toNumber(input.location?.lng, 113.2644),
    },
    category: sanitizeString(input.category) || 'mixed',
    age_range: sanitizeArray(input.age_range),
    indoor: toBool(input.indoor, false),
    price_type: sanitizeString(input.price_type) || 'free',
    recommended_duration: sanitizeString(input.recommended_duration) || '2h',
    transport: sanitizeArray(input.transport),
    facilities: {
      stroller_friendly: toBool(input.facilities?.stroller_friendly, true),
      restroom: toBool(input.facilities?.restroom, true),
      food: toBool(input.facilities?.food, false),
      shade: toBool(input.facilities?.shade, false),
      parking: toBool(input.facilities?.parking, false),
      rainy_day_ok: toBool(input.facilities?.rainy_day_ok, false),
    },
    summary: sanitizeString(input.summary),
    recommend_reason: sanitizeString(input.recommend_reason) || sanitizeString(input.summary),
    notice: sanitizeString(input.notice),
    cover_image: sanitizeString(input.cover_image),
    gallery: sanitizeArray(input.gallery),
    tags: sanitizeArray(input.tags),
    source_count: Math.max(0, toInteger(input.source_count, 0)),
    review_count: Math.max(0, toInteger(input.review_count, 0)),
    avg_rating: Math.max(0, Math.min(5, toNumber(input.avg_rating, 0))),
    status: sanitizeString(input.status) || 'published',
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
  };
}

function normalizeArticleDoc(input = {}) {
  return {
    title: sanitizeString(input.title) || '未命名文章',
    source_account: sanitizeString(input.source_account) || '测试公众号',
    source_account_id: sanitizeString(input.source_account_id),
    publish_time: db.serverDate(),
    url: sanitizeString(input.url),
    cover_image: sanitizeString(input.cover_image),
    content_text: sanitizeString(input.content_text),
    content_html: sanitizeString(input.content_html),
    images: sanitizeArray(input.images),
    extracted_poi_names: sanitizeArray(input.extracted_poi_names),
    parse_result: input.parse_result && typeof input.parse_result === 'object' ? input.parse_result : {},
    status: sanitizeString(input.status) || 'parsed',
    parse_confidence: Math.max(0, Math.min(1, toNumber(input.parse_confidence, 0.8))),
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
  };
}

function normalizeSourceDoc(input = {}) {
  return {
    poi_id: sanitizeString(input.poi_id),
    article_id: sanitizeString(input.article_id),
    source_type: sanitizeString(input.source_type) || 'article',
    quoted_text: sanitizeString(input.quoted_text),
    support_fields: sanitizeArray(input.support_fields),
    confidence_score: Math.max(0, Math.min(1, toNumber(input.confidence_score, 0.8))),
    is_primary: toBool(input.is_primary, false),
    status: sanitizeString(input.status) || 'active',
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
  };
}

function normalizeReviewDoc(input = {}) {
  const rating = Math.max(1, Math.min(5, toInteger(input.rating, 5)));
  return {
    poi_id: sanitizeString(input.poi_id),
    user_id: sanitizeString(input.user_id),
    nickname: sanitizeString(input.nickname) || '体验用户',
    avatar: sanitizeString(input.avatar),
    rating,
    comment: sanitizeString(input.comment) || '体验不错',
    visit_date: db.serverDate(),
    tags: sanitizeArray(input.tags),
    images: sanitizeArray(input.images),
    status: sanitizeString(input.status) || 'approved',
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
  };
}

function normalizeDoc(collection, input) {
  switch (collection) {
    case 'babyplace-poi':
      return normalizePoiDoc(input);
    case 'babyplace-article':
      return normalizeArticleDoc(input);
    case 'babyplace-content-source':
      return normalizeSourceDoc(input);
    case 'babyplace-user-review':
      return normalizeReviewDoc(input);
    default:
      return input || {};
  }
}

async function insertBatch(collection, items) {
  const succeededItems = [];
  const failedItems = [];
  for (let i = 0; i < items.length; i++) {
    const raw = items[i] || {};
    try {
      const doc = normalizeDoc(collection, raw);
      if (collection === 'babyplace-content-source' && (!doc.poi_id || !doc.article_id)) {
        failedItems.push({ index: i, reason: 'poi_id/article_id is required' });
        continue;
      }
      if (collection === 'babyplace-user-review' && !doc.poi_id) {
        failedItems.push({ index: i, reason: 'poi_id is required' });
        continue;
      }
      const result = await db.collection(collection).add(doc);
      succeededItems.push({ index: i, id: result.id });
    } catch (error) {
      failedItems.push({ index: i, reason: error.message || 'unknown error' });
    }
  }
  return {
    total: items.length,
    succeeded: succeededItems.length,
    failed: failedItems.length,
    succeededItems,
    failedItems,
  };
}

async function clearCollections(collections) {
  const list = Array.isArray(collections) ? collections : [];
  const normalized = list.map(ensureAllowedCollection).filter(Boolean);
  if (!normalized.length) return fail(400, 'valid collections is required');
  const result = [];
  for (let i = 0; i < normalized.length; i++) {
    const name = normalized[i];
    const removed = await db.collection(name).where({}).remove();
    result.push({ collection: name, deleted: removed.deleted || 0 });
  }
  return ok({ list: result }, 'cleared');
}

exports.main = async (event) => {
  const payload = parseEvent(event);
  if (!payload) return fail(400, 'invalid JSON body');
  const secret = sanitizeString(payload.secret);
  if (secret !== IMPORT_SECRET) return fail(401, 'unauthorized');
  const action = sanitizeString(payload.action) || 'insertBatch';

  if (action === 'clearCollections') {
    return clearCollections(payload.collections);
  }

  if (action === 'ping') {
    return ok({ now: Date.now() }, 'pong');
  }

  if (action !== 'insertBatch') return fail(400, 'invalid action');
  const collection = ensureAllowedCollection(payload.collection);
  if (!collection) return fail(400, 'invalid collection');
  const data = Array.isArray(payload.data) ? payload.data : [];
  if (!data.length) return fail(400, 'data is required');
  if (data.length > 200) return fail(400, 'max batch size is 200');

  const importResult = await insertBatch(collection, data);
  return ok(importResult, `imported ${importResult.succeeded}/${importResult.total}`);
};
