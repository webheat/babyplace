'use strict';

const db = uniCloud.database();

const IMPORT_SECRET = 'babyplace2026';
const POI_COLLECTION = db.collection('babyplace-poi');
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

function sanitizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeString(item)).filter(Boolean);
}

function toNumberSafe(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toIntegerSafe(value, fallback = 0) {
  const num = Number(value);
  return Number.isInteger(num) ? num : fallback;
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function ensureAuthorized(params) {
  return sanitizeString(params.secret) === IMPORT_SECRET;
}

function normalizeCollectionName(name) {
  const normalized = sanitizeString(name);
  return ALLOWED_COLLECTIONS.has(normalized) ? normalized : '';
}

function normalizePoiDoc(input = {}) {
  const now = Date.now();
  const location = input.location || {};
  const facilities = input.facilities || {};
  return {
    _id: sanitizeString(input._id),
    name: sanitizeString(input.name),
    canonical_name: sanitizeString(input.canonical_name) || sanitizeString(input.name),
    alias: sanitizeArray(input.alias),
    city: sanitizeString(input.city),
    district: sanitizeString(input.district),
    address: sanitizeString(input.address),
    location: {
      lat: toNumberSafe(location.lat, 0),
      lng: toNumberSafe(location.lng, 0),
    },
    category: sanitizeString(input.category) || 'mixed',
    age_range: sanitizeArray(input.age_range),
    indoor: toBool(input.indoor, false),
    price_type: sanitizeString(input.price_type) || 'free',
    recommended_duration: sanitizeString(input.recommended_duration) || '2h',
    transport: sanitizeArray(input.transport),
    transport_hint: sanitizeString(input.transport_hint),
    parking_tip: sanitizeString(input.parking_tip),
    facilities: {
      stroller_friendly: toBool(facilities.stroller_friendly, false),
      restroom: toBool(facilities.restroom, false),
      food: toBool(facilities.food, false),
      shade: toBool(facilities.shade, false),
      parking: toBool(facilities.parking, false),
      rainy_day_ok: toBool(facilities.rainy_day_ok, false),
    },
    summary: sanitizeString(input.summary),
    recommend_reason: sanitizeString(input.recommend_reason),
    notice: sanitizeString(input.notice),
    cover_image: sanitizeString(input.cover_image),
    gallery: sanitizeArray(input.gallery),
    tags: sanitizeArray(input.tags),
    source_count: Math.max(0, toIntegerSafe(input.source_count, 0)),
    review_count: Math.max(0, toIntegerSafe(input.review_count, 0)),
    avg_rating: Math.max(0, Math.min(5, toNumberSafe(input.avg_rating, 0))),
    status: sanitizeString(input.status) || 'draft',
    created_at: now,
    updated_at: now,
  };
}

function mergePoiDocs(existing = {}, incoming = {}) {
  const mergedAlias = Array.from(new Set([]
    .concat(sanitizeArray(existing.alias))
    .concat(sanitizeArray(incoming.alias))
    .concat(sanitizeString(existing.name) ? [sanitizeString(existing.name)] : [])
    .concat(sanitizeString(incoming.name) ? [sanitizeString(incoming.name)] : [])
    .filter(Boolean)));

  const mergedTransport = Array.from(new Set([]
    .concat(sanitizeArray(existing.transport))
    .concat(sanitizeArray(incoming.transport))
    .filter(Boolean)));

  return {
    name: incoming.name || existing.name || '',
    canonical_name: incoming.canonical_name || existing.canonical_name || existing.name || incoming.name || '',
    alias: mergedAlias,
    city: incoming.city || existing.city || '',
    district: incoming.district || existing.district || '',
    address: incoming.address || existing.address || '',
    location: {
      lat: toNumberSafe(incoming.location && incoming.location.lat, 0) || toNumberSafe(existing.location && existing.location.lat, 0),
      lng: toNumberSafe(incoming.location && incoming.location.lng, 0) || toNumberSafe(existing.location && existing.location.lng, 0),
    },
    category: incoming.category || existing.category || 'mixed',
    age_range: sanitizeArray(incoming.age_range).length ? sanitizeArray(incoming.age_range) : sanitizeArray(existing.age_range),
    indoor: Object.prototype.hasOwnProperty.call(incoming, 'indoor') ? incoming.indoor : toBool(existing.indoor, false),
    price_type: incoming.price_type || existing.price_type || 'free',
    recommended_duration: incoming.recommended_duration || existing.recommended_duration || '2h',
    transport: mergedTransport,
    transport_hint: incoming.transport_hint || existing.transport_hint || '',
    parking_tip: incoming.parking_tip || existing.parking_tip || '',
    facilities: {
      stroller_friendly: toBool(incoming.facilities && incoming.facilities.stroller_friendly, toBool(existing.facilities && existing.facilities.stroller_friendly, false)),
      restroom: toBool(incoming.facilities && incoming.facilities.restroom, toBool(existing.facilities && existing.facilities.restroom, false)),
      food: toBool(incoming.facilities && incoming.facilities.food, toBool(existing.facilities && existing.facilities.food, false)),
      shade: toBool(incoming.facilities && incoming.facilities.shade, toBool(existing.facilities && existing.facilities.shade, false)),
      parking: toBool(incoming.facilities && incoming.facilities.parking, toBool(existing.facilities && existing.facilities.parking, false)),
      rainy_day_ok: toBool(incoming.facilities && incoming.facilities.rainy_day_ok, toBool(existing.facilities && existing.facilities.rainy_day_ok, false)),
    },
    summary: incoming.summary || existing.summary || '',
    recommend_reason: incoming.recommend_reason || existing.recommend_reason || '',
    notice: incoming.notice || existing.notice || '',
    cover_image: incoming.cover_image || existing.cover_image || '',
    gallery: sanitizeArray(incoming.gallery).length ? sanitizeArray(incoming.gallery) : sanitizeArray(existing.gallery),
    tags: Array.from(new Set([].concat(sanitizeArray(existing.tags)).concat(sanitizeArray(incoming.tags)).filter(Boolean))),
    source_count: Math.max(toIntegerSafe(existing.source_count, 0), toIntegerSafe(incoming.source_count, 0)),
    review_count: Math.max(toIntegerSafe(existing.review_count, 0), toIntegerSafe(incoming.review_count, 0)),
    avg_rating: Math.max(toNumberSafe(existing.avg_rating, 0), toNumberSafe(incoming.avg_rating, 0)),
    status: incoming.status || existing.status || 'draft',
  };
}

async function findPoiByName(item = {}) {
  const names = Array.from(new Set([]
    .concat(item._id ? [item._id] : [])
    .concat(item.name ? [item.name] : [])
    .concat(item.canonical_name ? [item.canonical_name] : [])
    .concat(Array.isArray(item.alias) ? item.alias : [])
    .map((name) => sanitizeString(name))
    .filter(Boolean)));

  if (item._id) {
    const docResult = await POI_COLLECTION.doc(item._id).get();
    const docItem = (docResult.data || [])[0];
    if (docItem) return docItem;
  }

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    let result = await POI_COLLECTION.where({ name }).limit(1).get();
    if ((result.data || []).length) return result.data[0];

    result = await POI_COLLECTION.where({ canonical_name: name }).limit(1).get();
    if ((result.data || []).length) return result.data[0];
  }

  if (names.length) {
    const result = await POI_COLLECTION.where({
      alias: db.command.in(names),
    }).limit(1).get();
    if ((result.data || []).length) return result.data[0];
  }

  return null;
}

async function seedPing() {
  return ok({ now: Date.now() }, 'pong');
}

async function seedListPoiByNames(params) {
  if (!ensureAuthorized(params)) return fail(401, 'unauthorized');
  const names = Array.isArray(params.names) ? params.names.map((item) => sanitizeString(item)).filter(Boolean) : [];
  if (!names.length) return fail(400, 'names is required');
  const list = [];
  for (let i = 0; i < names.length; i++) {
    const item = await findPoiByName({ name: names[i], canonical_name: names[i], alias: [names[i]] });
    if (item) list.push(item);
  }
  return ok({ list, total: list.length });
}

async function seedRemovePoiByNames(params) {
  if (!ensureAuthorized(params)) return fail(401, 'unauthorized');
  const names = Array.isArray(params.names) ? params.names.map((item) => sanitizeString(item)).filter(Boolean) : [];
  if (!names.length) return fail(400, 'names is required');
  const removedItems = [];
  for (let i = 0; i < names.length; i++) {
    const existing = await findPoiByName({ name: names[i], canonical_name: names[i], alias: [names[i]] });
    if (!existing || !existing._id) continue;
    const result = await POI_COLLECTION.doc(existing._id).remove();
    removedItems.push({ name: names[i], id: existing._id, deleted: result.deleted || 0 });
  }
  return ok({ list: removedItems, total: removedItems.length }, 'removed');
}

async function seedInsertBatch(params) {
  if (!ensureAuthorized(params)) return fail(401, 'unauthorized');
  const collectionName = normalizeCollectionName(params.collection);
  if (!collectionName) return fail(400, 'invalid collection');
  const data = Array.isArray(params.data) ? params.data : [];
  if (!data.length) return fail(400, 'data is required');
  if (data.length > 200) return fail(400, 'max batch size is 200');

  const targetCollection = db.collection(collectionName);
  const succeededItems = [];
  const failedItems = [];
  for (let i = 0; i < data.length; i++) {
    try {
      const doc = collectionName === 'babyplace-poi' ? normalizePoiDoc(data[i] || {}) : (data[i] || {});
      const result = await targetCollection.add(doc);
      succeededItems.push({ index: i, id: result.id });
    } catch (error) {
      failedItems.push({ index: i, reason: error.message || 'unknown error' });
    }
  }
  return ok({
    total: data.length,
    succeeded: succeededItems.length,
    failed: failedItems.length,
    succeededItems,
    failedItems,
  }, `imported ${succeededItems.length}/${data.length}`);
}

async function seedClearCollections(params) {
  if (!ensureAuthorized(params)) return fail(401, 'unauthorized');
  const collections = Array.isArray(params.collections) ? params.collections : [];
  const normalized = collections.map((item) => normalizeCollectionName(item)).filter(Boolean);
  if (!normalized.length) return fail(400, 'valid collections is required');

  const list = [];
  for (let i = 0; i < normalized.length; i++) {
    const collectionName = normalized[i];
    const removed = await db.collection(collectionName).where({}).remove();
    list.push({ collection: collectionName, deleted: removed.deleted || 0 });
  }
  return ok({ list }, 'cleared');
}

async function seedUpsertPoiBatch(params) {
  if (!ensureAuthorized(params)) return fail(401, 'unauthorized');
  const data = Array.isArray(params.data) ? params.data : [];
  if (!data.length) return fail(400, 'data is required');
  if (data.length > 100) return fail(400, 'max batch size is 100');

  const succeededItems = [];
  const failedItems = [];
  for (let i = 0; i < data.length; i++) {
    try {
      const incoming = normalizePoiDoc(data[i] || {});
      if (!incoming.name) {
        failedItems.push({ index: i, reason: 'name is required' });
        continue;
      }
      const existing = await findPoiByName(incoming);
      const merged = mergePoiDocs(existing || {}, incoming);
      if (existing && existing._id) {
        const updateResult = await POI_COLLECTION.doc(existing._id).update({
          ...merged,
          updated_at: Date.now(),
        });
        succeededItems.push({ index: i, id: existing._id, mode: 'update', updated: updateResult.updated || 0 });
      } else {
        const now = Date.now();
        const createResult = await POI_COLLECTION.add({
          ...merged,
          created_at: now,
          updated_at: now,
        });
        succeededItems.push({ index: i, id: createResult.id, mode: 'create' });
      }
    } catch (error) {
      failedItems.push({ index: i, reason: error.message || 'unknown error' });
    }
  }

  return ok({
    total: data.length,
    succeeded: succeededItems.length,
    failed: failedItems.length,
    succeededItems,
    failedItems,
  }, `upserted ${succeededItems.length}/${data.length}`);
}

exports.main = async (event) => {
  const action = sanitizeString(event.action);
  switch (action) {
    case 'ping':
    case 'seed.ping':
      return seedPing();
    case 'insertBatch':
    case 'seed.insertBatch':
      return seedInsertBatch(event);
    case 'clearCollections':
    case 'seed.clearCollections':
      return seedClearCollections(event);
    case 'seed.listPoiByNames':
      return seedListPoiByNames(event);
    case 'seed.removePoiByNames':
      return seedRemovePoiByNames(event);
    case 'seed.upsertPoiBatch':
      return seedUpsertPoiBatch(event);
    default:
      return fail(400, 'invalid action');
  }
};
