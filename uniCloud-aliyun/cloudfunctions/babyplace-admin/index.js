'use strict';

const db = uniCloud.database();
const collection = db.collection('babyplace')
const dbRegExp = db.RegExp

const WRITE_ACTIONS = new Set(['create', 'update', 'remove', 'batchImport'])
const PUBLIC_ACTIONS = new Set(['list', 'detail'])
const SEED_ACTIONS = new Set([
  'ping',
  'insertBatch',
  'clearCollections',
  'seed.ping',
  'seed.insertBatch',
  'seed.clearCollections',
])
const ADMIN_ACTIONS = new Set([
  'poi.list', 'poi.detail', 'poi.create', 'poi.update', 'poi.remove',
  'article.list', 'article.detail', 'article.create', 'article.update', 'article.remove',
  'source.list', 'source.detail', 'source.create', 'source.update', 'source.remove',
  'review.list', 'review.detail', 'review.create', 'review.update', 'review.remove',
  'poi.nearby',
  'review.listByPoi',
  'recommend.home',
])
const IMPORT_SECRET = 'babyplace2026'
const SEED_ALLOWED_COLLECTIONS = new Set([
  'babyplace-poi',
  'babyplace-article',
  'babyplace-content-source',
  'babyplace-user-review',
])
const ADMIN_ENTITY_CONFIG = {
  poi: {
    collection: 'babyplace-poi',
    keywordFields: ['name', 'canonical_name', 'address', 'city', 'district'],
    orderBy: [['updated_at', 'desc'], ['created_at', 'desc']],
    requiredFields: ['name', 'city', 'district'],
  },
  article: {
    collection: 'babyplace-article',
    keywordFields: ['title', 'source_account', 'url'],
    orderBy: [['publish_time', 'desc'], ['updated_at', 'desc']],
    requiredFields: ['title', 'source_account'],
  },
  source: {
    collection: 'babyplace-content-source',
    keywordFields: ['poi_id', 'article_id', 'quoted_text'],
    orderBy: [['updated_at', 'desc'], ['created_at', 'desc']],
    requiredFields: ['poi_id', 'article_id'],
  },
  review: {
    collection: 'babyplace-user-review',
    keywordFields: ['poi_id', 'nickname', 'comment'],
    orderBy: [['updated_at', 'desc'], ['created_at', 'desc']],
    requiredFields: ['poi_id'],
  },
}
const MUTABLE_FIELDS = [
  'name',
  'lat',
  'lng',
  'address',
  'suitable_ages',
  'transport_hint',
  'parking_tip',
  'stroller_friendly',
]

function ok(data, message = 'ok') {
  return { code: 0, message, data }
}

function fail(code, message, data = null) {
  return { code, message, data }
}

function sanitizeString(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function toNumber(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function toInteger(value) {
  const num = toNumber(value)
  return num !== null && Number.isInteger(num) ? num : null
}

function toNumberSafe(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toIntegerSafe(value, fallback = 0) {
  const num = Number(value)
  return Number.isInteger(num) ? num : fallback
}

function toRadians(value) {
  return value * Math.PI / 180
}

function calcDistanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
    * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function sanitizeArray(value) {
  if (!Array.isArray(value)) return []
  return value.map(item => sanitizeString(item)).filter(Boolean)
}

function createSeedNow() {
  return Date.now()
}

function normalizePayload(payload = {}) {
  const normalized = {}
  MUTABLE_FIELDS.forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return
    switch (field) {
      case 'name':
      case 'address':
      case 'suitable_ages':
      case 'transport_hint':
      case 'parking_tip':
      case 'stroller_friendly':
        normalized[field] = sanitizeString(payload[field])
        break
      case 'lat':
      case 'lng':
        normalized[field] = toNumber(payload[field])
        break
    }
  })
  return normalized
}

function validatePayload(payload) {
  const errors = []
  if (!payload.name || payload.name.length < 2 || payload.name.length > 50) {
    errors.push('name must be 2-50 characters')
  }
  if (payload.lat === null || payload.lat < -90 || payload.lat > 90) {
    errors.push('lat must be between -90 and 90')
  }
  if (payload.lng === null || payload.lng < -180 || payload.lng > 180) {
    errors.push('lng must be between -180 and 180')
  }
  if (!payload.address || payload.address.length < 2 || payload.address.length > 200) {
    errors.push('address must be 2-200 characters')
  }
  return errors
}

async function createGoods(params, context) {
  const payload = normalizePayload(params.payload || {})
  const errors = validatePayload(payload)
  if (errors.length) return fail(400, errors.join('; '))
  const now = Date.now()
  const data = { ...payload, createdBy: 'public', updatedBy: 'public', createdAt: now, updatedAt: now }
  const result = await collection.add(data)
  return ok({ id: result.id }, 'created')
}

async function listGoods(params) {
  const page = Math.max(toInteger(params.page) || 1, 1)
  const pageSize = Math.min(Math.max(toInteger(params.pageSize) || 10, 1), 50)
  const keyword = sanitizeString(params.keyword)
  const where = {}
  if (keyword) {
    where.$or = [
      { name: new dbRegExp({ regexp: keyword, options: 'i' }) },
      { address: new dbRegExp({ regexp: keyword, options: 'i' }) },
    ]
  }
  const query = collection.where(where)
  const totalResult = await query.count()
  const listResult = await query
    .orderBy('updatedAt', 'desc')
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  const list = JSON.parse(JSON.stringify(listResult.data || []))
  return ok({ list, total: totalResult.total, page, pageSize })
}

async function detailGoods(params) {
  const id = sanitizeString(params.id)
  if (!id) return fail(400, 'id is required')
  const result = await collection.where({ _id: id }).limit(1).get()
  const item = result.data[0]
  if (!item) return fail(404, 'spot not found')
  return ok(item)
}

async function updateGoods(params, context) {
  const id = sanitizeString(params.id)
  if (!id) return fail(400, 'id is required')
  const payload = normalizePayload(params.payload || {}, { isUpdate: true })
  if (!Object.keys(payload).length) return fail(400, 'payload is required')
  const errors = validatePayload(payload, { isUpdate: true })
  if (errors.length) return fail(400, errors.join('; '))
  const updateData = { ...payload, updatedAt: Date.now() }
  const result = await collection.doc(id).update(updateData)
  if (!result.updated) return fail(404, 'spot not found')
  return ok({ id, updated: result.updated }, 'updated')
}

async function removeGoods(params, context) {
  const id = sanitizeString(params.id)
  if (!id) return fail(400, 'id is required')
  const result = await collection.doc(id).remove()
  if (!result.deleted) return fail(404, 'spot not found')
  return ok({ id, deleted: result.deleted }, 'removed')
}

async function batchImportGoods(params, context) {
  const providedSecret = sanitizeString(params.secret)
  let uid = 'system'
  if (providedSecret && providedSecret === IMPORT_SECRET) {
    uid = 'http-import'
  } else {
    return fail(401, 'login required')
  }
  const items = Array.isArray(params.items) ? params.items : []
  if (items.length === 0) return fail(400, 'items array is required')
  if (items.length > 100) return fail(400, 'maximum 100 items per batch')
  const now = Date.now()
  const succeeded = []
  const failed = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const payload = normalizePayload(item)
    const errors = validatePayload(payload)
    if (errors.length) {
      failed.push({ index: i, data: item, errors })
      continue
    }
    try {
      const data = { ...payload, createdBy: uid, updatedBy: uid, createdAt: now, updatedAt: now }
      const result = await collection.add(data)
      succeeded.push({ index: i, id: result.id, name: payload.name })
    } catch (error) {
      failed.push({ index: i, data: item, errors: [error.message || 'unknown error'] })
    }
  }
  return ok({
    total: items.length,
    succeeded: succeeded.length,
    failed: failed.length,
    succeededItems: succeeded,
    failedItems: failed,
  }, `imported ${succeeded.length}/${items.length} items`)
}

function parseAdminAction(action) {
  const parts = sanitizeString(action).split('.')
  if (parts.length !== 2) return null
  const entity = parts[0]
  const operation = parts[1]
  if (!ADMIN_ENTITY_CONFIG[entity]) return null
  if (!['list', 'detail', 'create', 'update', 'remove'].includes(operation)) return null
  return { entity, operation }
}

function normalizeAdminPayload(entity, payload = {}, isUpdate = false) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const normalized = {}
  const setString = (key) => {
    if (!isUpdate || Object.prototype.hasOwnProperty.call(source, key)) normalized[key] = sanitizeString(source[key])
  }
  const setArray = (key) => {
    if (!isUpdate || Object.prototype.hasOwnProperty.call(source, key)) normalized[key] = sanitizeArray(source[key])
  }
  const setNumber = (key, fallback = 0) => {
    if (!isUpdate || Object.prototype.hasOwnProperty.call(source, key)) normalized[key] = toNumberSafe(source[key], fallback)
  }
  const setInteger = (key, fallback = 0) => {
    if (!isUpdate || Object.prototype.hasOwnProperty.call(source, key)) normalized[key] = toIntegerSafe(source[key], fallback)
  }
  const setBool = (key, fallback = false) => {
    if (!isUpdate || Object.prototype.hasOwnProperty.call(source, key)) normalized[key] = toBool(source[key], fallback)
  }
  const setRaw = (key, fallback = null) => {
    if (!isUpdate || Object.prototype.hasOwnProperty.call(source, key)) normalized[key] = source[key] || fallback
  }

  switch (entity) {
    case 'poi': {
      setString('name')
      setString('canonical_name')
      setArray('alias')
      setString('city')
      setString('district')
      setString('address')
      if (!isUpdate || Object.prototype.hasOwnProperty.call(source, 'location')) {
        const location = source.location && typeof source.location === 'object' ? source.location : {}
        normalized.location = {
          lat: toNumberSafe(location.lat, 0),
          lng: toNumberSafe(location.lng, 0),
        }
      }
      setString('category')
      setArray('age_range')
      setBool('indoor', false)
      setString('price_type')
      setString('recommended_duration')
      setArray('transport')
      if (!isUpdate || Object.prototype.hasOwnProperty.call(source, 'facilities')) {
        const facilities = source.facilities && typeof source.facilities === 'object' ? source.facilities : {}
        normalized.facilities = {
          stroller_friendly: toBool(facilities.stroller_friendly, false),
          restroom: toBool(facilities.restroom, false),
          food: toBool(facilities.food, false),
          shade: toBool(facilities.shade, false),
          parking: toBool(facilities.parking, false),
          rainy_day_ok: toBool(facilities.rainy_day_ok, false),
        }
      }
      setString('summary')
      setString('recommend_reason')
      setString('notice')
      setString('cover_image')
      setArray('gallery')
      setArray('tags')
      setInteger('source_count', 0)
      setInteger('review_count', 0)
      setNumber('avg_rating', 0)
      setString('status')
      break
    }
    case 'article':
      setString('title')
      setString('source_account')
      setString('source_account_id')
      setRaw('publish_time', db.serverDate())
      setString('url')
      setString('cover_image')
      setString('content_text')
      setString('content_html')
      setArray('images')
      setArray('extracted_poi_names')
      if (!isUpdate || Object.prototype.hasOwnProperty.call(source, 'parse_result')) {
        normalized.parse_result = source.parse_result && typeof source.parse_result === 'object' ? source.parse_result : {}
      }
      setString('status')
      setNumber('parse_confidence', 0)
      break
    case 'source':
      setString('poi_id')
      setString('article_id')
      setString('source_type')
      setString('quoted_text')
      setArray('support_fields')
      setNumber('confidence_score', 0)
      setBool('is_primary', false)
      setString('status')
      break
    case 'review':
      setString('poi_id')
      setString('user_id')
      setString('nickname')
      setString('avatar')
      setInteger('rating', 5)
      setString('comment')
      setRaw('visit_date', db.serverDate())
      setArray('tags')
      setArray('images')
      setString('status')
      break
  }

  return normalized
}

function validateAdminPayload(entity, payload = {}, isUpdate = false) {
  const config = ADMIN_ENTITY_CONFIG[entity]
  if (!config) return ['invalid entity']
  const errors = []
  if (!isUpdate) {
    config.requiredFields.forEach(field => {
      if (!sanitizeString(payload[field])) {
        errors.push(`${field} is required`)
      }
    })
  } else if (!Object.keys(payload).length) {
    errors.push('payload is required')
  }
  if ((entity === 'poi' || entity === 'review') && Object.prototype.hasOwnProperty.call(payload, 'rating')) {
    const rating = toInteger(payload.rating)
    if (rating === null || rating < 1 || rating > 5) errors.push('rating must be 1-5')
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'parse_confidence')) {
    const score = toNumber(payload.parse_confidence)
    if (score === null || score < 0 || score > 1) errors.push('parse_confidence must be 0-1')
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'confidence_score')) {
    const score = toNumber(payload.confidence_score)
    if (score === null || score < 0 || score > 1) errors.push('confidence_score must be 0-1')
  }
  return errors
}

async function listAdminEntity(entity, params = {}) {
  const config = ADMIN_ENTITY_CONFIG[entity]
  if (!config) return fail(400, 'invalid entity')
  const page = Math.max(toInteger(params.page) || 1, 1)
  const pageSize = Math.min(Math.max(toInteger(params.pageSize) || 10, 1), 50)
  const keyword = sanitizeString(params.keyword)
  const where = {}
  if (keyword) {
    where.$or = config.keywordFields.map(field => ({
      [field]: new dbRegExp({ regexp: keyword, options: 'i' }),
    }))
  }
  let query = db.collection(config.collection).where(where)
  const totalResult = await query.count()
  config.orderBy.forEach(order => {
    query = query.orderBy(order[0], order[1])
  })
  const result = await query
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  return ok({ list: result.data || [], total: totalResult.total || 0, page, pageSize })
}

async function listReviewByPoi(params = {}) {
  const poiId = sanitizeString(params.poi_id)
  if (!poiId) return fail(400, 'poi_id is required')
  const page = Math.max(toInteger(params.page) || 1, 1)
  const pageSize = Math.min(Math.max(toInteger(params.pageSize) || 10, 1), 50)
  const query = db.collection('babyplace-user-review').where({
    poi_id: poiId,
    status: 'approved',
  })
  const countResult = await query.count()
  const result = await query
    .orderBy('created_at', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  return ok({
    list: result.data || [],
    total: countResult.total || 0,
    page,
    pageSize,
  })
}

async function nearbyPoi(params = {}) {
  const lat = toNumber(params.lat)
  const lng = toNumber(params.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail(400, 'lat/lng is required')
  }
  const radius = Math.max(100, Math.min(50000, toInteger(params.radius) || 3000))
  const page = Math.max(toInteger(params.page) || 1, 1)
  const pageSize = Math.min(Math.max(toInteger(params.pageSize) || 20, 1), 50)
  const result = await db.collection('babyplace-poi').where({ status: 'published' }).limit(500).get()
  const list = (result.data || [])
    .map(item => {
      const poiLat = toNumber(item.location?.lat, 0)
      const poiLng = toNumber(item.location?.lng, 0)
      return {
        ...item,
        distance: calcDistanceMeters(lat, lng, poiLat, poiLng),
      }
    })
    .filter(item => item.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
  const total = list.length
  const start = (page - 1) * pageSize
  return ok({
    list: list.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    radius,
  })
}

async function recommendHome(params = {}) {
  const lat = toNumber(params.lat, NaN)
  const lng = toNumber(params.lng, NaN)
  const radius = Math.max(500, Math.min(20000, toInteger(params.radius) || 5000))
  const result = await db.collection('babyplace-poi').where({ status: 'published' }).limit(200).get()
  const list = result.data || []
  const featured = [...list]
    .sort((a, b) => (toNumberSafe(b.avg_rating, 0) - toNumberSafe(a.avg_rating, 0))
      || (toIntegerSafe(b.review_count, 0) - toIntegerSafe(a.review_count, 0)))
    .slice(0, 6)
  const latest = [...list]
    .sort((a, b) => {
      const aTime = a.updated_at?.getTime ? a.updated_at.getTime() : 0
      const bTime = b.updated_at?.getTime ? b.updated_at.getTime() : 0
      return bTime - aTime
    })
    .slice(0, 6)
  let nearby = []
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    nearby = list
      .map(item => {
        const poiLat = toNumber(item.location?.lat, 0)
        const poiLng = toNumber(item.location?.lng, 0)
        return {
          ...item,
          distance: calcDistanceMeters(lat, lng, poiLat, poiLng),
        }
      })
      .filter(item => item.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 6)
  }
  return ok({
    featured,
    latest,
    nearby,
  })
}

async function detailAdminEntity(entity, params = {}) {
  const config = ADMIN_ENTITY_CONFIG[entity]
  if (!config) return fail(400, 'invalid entity')
  const id = sanitizeString(params.id)
  if (!id) return fail(400, 'id is required')
  const result = await db.collection(config.collection).doc(id).get()
  const item = (result.data || [])[0]
  if (!item) return fail(404, `${entity} not found`)
  return ok(item)
}

async function createAdminEntity(entity, params = {}) {
  const config = ADMIN_ENTITY_CONFIG[entity]
  if (!config) return fail(400, 'invalid entity')
  const payload = normalizeAdminPayload(entity, params.payload || {}, false)
  const errors = validateAdminPayload(entity, payload, false)
  if (errors.length) return fail(400, errors.join('; '))
  const now = db.serverDate()
  const result = await db.collection(config.collection).add({
    ...payload,
    created_at: now,
    updated_at: now,
  })
  return ok({ id: result.id }, 'created')
}

async function updateAdminEntity(entity, params = {}) {
  const config = ADMIN_ENTITY_CONFIG[entity]
  if (!config) return fail(400, 'invalid entity')
  const id = sanitizeString(params.id)
  if (!id) return fail(400, 'id is required')
  const payload = normalizeAdminPayload(entity, params.payload || {}, true)
  const errors = validateAdminPayload(entity, payload, true)
  if (errors.length) return fail(400, errors.join('; '))
  const result = await db.collection(config.collection).doc(id).update({
    ...payload,
    updated_at: db.serverDate(),
  })
  if (!result.updated) return fail(404, `${entity} not found`)
  return ok({ id, updated: result.updated }, 'updated')
}

async function removeAdminEntity(entity, params = {}) {
  const config = ADMIN_ENTITY_CONFIG[entity]
  if (!config) return fail(400, 'invalid entity')
  const id = sanitizeString(params.id)
  if (!id) return fail(400, 'id is required')
  const result = await db.collection(config.collection).doc(id).remove()
  if (!result.deleted) return fail(404, `${entity} not found`)
  return ok({ id, deleted: result.deleted }, 'removed')
}

async function dispatchAdminAction(action, params = {}) {
  if (action === 'review.listByPoi') return listReviewByPoi(params)
  if (action === 'poi.nearby') return nearbyPoi(params)
  if (action === 'recommend.home') return recommendHome(params)
  const parsed = parseAdminAction(action)
  if (!parsed) return fail(400, 'invalid action')
  const { entity, operation } = parsed
  switch (operation) {
    case 'list': return listAdminEntity(entity, params)
    case 'detail': return detailAdminEntity(entity, params)
    case 'create': return createAdminEntity(entity, params)
    case 'update': return updateAdminEntity(entity, params)
    case 'remove': return removeAdminEntity(entity, params)
    default: return fail(400, 'invalid action')
  }
}

function ensureSeedAuthorized(params) {
  const providedSecret = sanitizeString(params.secret)
  return providedSecret && providedSecret === IMPORT_SECRET
}

function normalizeSeedCollectionName(collection) {
  const normalized = sanitizeString(collection)
  if (!SEED_ALLOWED_COLLECTIONS.has(normalized)) return ''
  return normalized
}

function normalizeSeedPoiDoc(input = {}) {
  const location = input.location || {}
  const facilities = input.facilities || {}
  const now = createSeedNow()
  return {
    name: sanitizeString(input.name) || '未命名地点',
    canonical_name: sanitizeString(input.canonical_name) || sanitizeString(input.name) || '未命名地点',
    alias: sanitizeArray(input.alias),
    city: sanitizeString(input.city) || '广州',
    district: sanitizeString(input.district) || '天河区',
    address: sanitizeString(input.address) || '',
    location: {
      lat: toNumberSafe(location.lat, 23.1291),
      lng: toNumberSafe(location.lng, 113.2644),
    },
    category: sanitizeString(input.category) || 'mixed',
    age_range: sanitizeArray(input.age_range),
    indoor: toBool(input.indoor, false),
    price_type: sanitizeString(input.price_type) || 'free',
    recommended_duration: sanitizeString(input.recommended_duration) || '2h',
    transport: sanitizeArray(input.transport),
    facilities: {
      stroller_friendly: toBool(facilities.stroller_friendly, true),
      restroom: toBool(facilities.restroom, true),
      food: toBool(facilities.food, false),
      shade: toBool(facilities.shade, false),
      parking: toBool(facilities.parking, false),
      rainy_day_ok: toBool(facilities.rainy_day_ok, false),
    },
    summary: sanitizeString(input.summary),
    recommend_reason: sanitizeString(input.recommend_reason) || sanitizeString(input.summary),
    notice: sanitizeString(input.notice),
    cover_image: sanitizeString(input.cover_image),
    gallery: sanitizeArray(input.gallery),
    tags: sanitizeArray(input.tags),
    source_count: Math.max(0, toIntegerSafe(input.source_count, 0)),
    review_count: Math.max(0, toIntegerSafe(input.review_count, 0)),
    avg_rating: Math.max(0, Math.min(5, toNumberSafe(input.avg_rating, 0))),
    status: sanitizeString(input.status) || 'published',
    created_at: now,
    updated_at: now,
  }
}

function normalizeSeedArticleDoc(input = {}) {
  const now = createSeedNow()
  return {
    title: sanitizeString(input.title) || '未命名文章',
    source_account: sanitizeString(input.source_account) || '测试公众号',
    source_account_id: sanitizeString(input.source_account_id),
    publish_time: now,
    url: sanitizeString(input.url),
    cover_image: sanitizeString(input.cover_image),
    content_text: sanitizeString(input.content_text),
    content_html: sanitizeString(input.content_html),
    images: sanitizeArray(input.images),
    extracted_poi_names: sanitizeArray(input.extracted_poi_names),
    parse_result: input.parse_result && typeof input.parse_result === 'object' ? input.parse_result : {},
    status: sanitizeString(input.status) || 'parsed',
    parse_confidence: Math.max(0, Math.min(1, toNumberSafe(input.parse_confidence, 0.8))),
    created_at: now,
    updated_at: now,
  }
}

function normalizeSeedSourceDoc(input = {}) {
  const now = createSeedNow()
  return {
    poi_id: sanitizeString(input.poi_id),
    article_id: sanitizeString(input.article_id),
    source_type: sanitizeString(input.source_type) || 'article',
    quoted_text: sanitizeString(input.quoted_text),
    support_fields: sanitizeArray(input.support_fields),
    confidence_score: Math.max(0, Math.min(1, toNumberSafe(input.confidence_score, 0.8))),
    is_primary: toBool(input.is_primary, false),
    status: sanitizeString(input.status) || 'active',
    created_at: now,
    updated_at: now,
  }
}

function normalizeSeedReviewDoc(input = {}) {
  const now = createSeedNow()
  return {
    poi_id: sanitizeString(input.poi_id),
    user_id: sanitizeString(input.user_id),
    nickname: sanitizeString(input.nickname) || '体验用户',
    avatar: sanitizeString(input.avatar),
    rating: Math.max(1, Math.min(5, toIntegerSafe(input.rating, 5))),
    comment: sanitizeString(input.comment) || '体验不错',
    visit_date: now,
    tags: sanitizeArray(input.tags),
    images: sanitizeArray(input.images),
    status: sanitizeString(input.status) || 'approved',
    created_at: now,
    updated_at: now,
  }
}

function normalizeSeedDoc(collectionName, input = {}) {
  switch (collectionName) {
    case 'babyplace-poi':
      return normalizeSeedPoiDoc(input)
    case 'babyplace-article':
      return normalizeSeedArticleDoc(input)
    case 'babyplace-content-source':
      return normalizeSeedSourceDoc(input)
    case 'babyplace-user-review':
      return normalizeSeedReviewDoc(input)
    default:
      return input
  }
}

async function seedPing() {
  return ok({ now: Date.now() }, 'pong')
}

async function seedInsertBatch(params) {
  if (!ensureSeedAuthorized(params)) return fail(401, 'unauthorized')
  const collectionName = normalizeSeedCollectionName(params.collection)
  if (!collectionName) return fail(400, 'invalid collection')
  const data = Array.isArray(params.data) ? params.data : []
  if (!data.length) return fail(400, 'data is required')
  if (data.length > 200) return fail(400, 'max batch size is 200')

  const targetCollection = db.collection(collectionName)
  const succeededItems = []
  const failedItems = []
  for (let i = 0; i < data.length; i++) {
    const raw = data[i] || {}
    try {
      const doc = normalizeSeedDoc(collectionName, raw)
      if (collectionName === 'babyplace-content-source' && (!doc.poi_id || !doc.article_id)) {
        failedItems.push({ index: i, reason: 'poi_id/article_id is required' })
        continue
      }
      if (collectionName === 'babyplace-user-review' && !doc.poi_id) {
        failedItems.push({ index: i, reason: 'poi_id is required' })
        continue
      }
      const result = await targetCollection.add(doc)
      succeededItems.push({ index: i, id: result.id })
    } catch (error) {
      failedItems.push({ index: i, reason: error.message || 'unknown error' })
    }
  }
  return ok({
    total: data.length,
    succeeded: succeededItems.length,
    failed: failedItems.length,
    succeededItems,
    failedItems,
  }, `imported ${succeededItems.length}/${data.length}`)
}

async function seedClearCollections(params) {
  if (!ensureSeedAuthorized(params)) return fail(401, 'unauthorized')
  const collections = Array.isArray(params.collections) ? params.collections : []
  const normalized = collections.map(item => normalizeSeedCollectionName(item)).filter(Boolean)
  if (!normalized.length) return fail(400, 'valid collections is required')

  const list = []
  for (let i = 0; i < normalized.length; i++) {
    const collectionName = normalized[i]
    const removed = await db.collection(collectionName).where({}).remove()
    list.push({ collection: collectionName, deleted: removed.deleted || 0 })
  }
  return ok({ list }, 'cleared')
}

exports.main = async (event, context) => {
  let params = event
  if (event.httpMethod && event.body) {
    try {
      let body = event.body
      if (event.isBase64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf8')
      }
      params = JSON.parse(body)
    } catch (e) {
      return fail(400, 'invalid JSON body')
    }
  }
  const action = sanitizeString(params.action)
  if (!action) return fail(400, 'action is required')
  if (ADMIN_ACTIONS.has(action)) {
    return dispatchAdminAction(action, params)
  }
  if (!WRITE_ACTIONS.has(action) && !PUBLIC_ACTIONS.has(action) && !SEED_ACTIONS.has(action)) {
    return fail(400, 'invalid action')
  }
  switch (action) {
    case 'create': return createGoods(params, context)
    case 'list': return listGoods(params, context)
    case 'detail': return detailGoods(params)
    case 'update': return updateGoods(params, context)
    case 'remove': return removeGoods(params, context)
    case 'batchImport': return batchImportGoods(params, context)
    case 'ping':
    case 'seed.ping':
      return seedPing(params, context)
    case 'insertBatch':
    case 'seed.insertBatch':
      return seedInsertBatch(params, context)
    case 'clearCollections':
    case 'seed.clearCollections':
      return seedClearCollections(params, context)
    default: return fail(400, 'invalid action')
  }
}
