'use strict';

const createConfig = require('uni-config-center')
const db = uniCloud.database();
const collection = db.collection('babyplace')
const dbRegExp = db.RegExp
const routeConfig = createConfig({
  pluginId: 'amap',
  defaultConfig: {
    key: '',
    driveUrl: 'https://restapi.amap.com/v3/direction/driving',
    extensions: 'all',
    timeout: 15000,
  },
})

const WRITE_ACTIONS = new Set(['create', 'update', 'remove', 'batchImport'])
const PUBLIC_ACTIONS = new Set(['list', 'detail'])
const SEED_ACTIONS = new Set([
  'ping',
  'insertBatch',
  'clearCollections',
  'seed.ping',
  'seed.insertBatch',
  'seed.clearCollections',
  'seed.upsertPoiBatch',
  'seed.listPoiByNames',
])
const ADMIN_ACTIONS = new Set([
  'poi.list', 'poi.detail', 'poi.create', 'poi.update', 'poi.remove',
  'article.list', 'article.detail', 'article.create', 'article.update', 'article.remove',
  'source.list', 'source.detail', 'source.create', 'source.update', 'source.remove',
  'review.list', 'review.detail', 'review.create', 'review.update', 'review.remove',
  'poi.nearby',
  'review.listByPoi',
  'recommend.home',
  'route.drive',
  'ai.searchPlaces',
  'map.searchNearby',
  'map.searchAmap',
  'meituan.search',
  'map.tencentSearch',
  'video.uploadAndEnhance',
  'video.render',
  'video.renderStatus',
  'video.uploadToXHS',
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
      setString('transport_hint')
      setString('parking_tip')
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

function formatRouteDistance(distance) {
  if (!distance) return ''
  if (distance >= 1000) return `${(distance / 1000).toFixed(distance >= 10000 ? 0 : 1)} 公里`
  return `${Math.round(distance)} 米`
}

function formatRouteDuration(duration) {
  if (!duration) return ''
  const minutes = duration > 180 ? Math.round(duration / 60) : Math.round(duration)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const remain = minutes % 60
    return remain ? `${hours}小时${remain}分钟` : `${hours}小时`
  }
  return `${Math.max(1, minutes)} 分钟`
}

function parseRoutePolyline(steps = [], origin, destination) {
  const points = []
  steps.forEach(step => {
    const polyline = sanitizeString(step?.polyline)
    if (!polyline) return
    polyline.split(';').forEach(item => {
      const [lngText, latText] = item.split(',')
      const latitude = toNumber(latText)
      const longitude = toNumber(lngText)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
      points.push({ latitude, longitude })
    })
  })
  if (!points.length) {
    return [
      { latitude: origin.lat, longitude: origin.lng },
      { latitude: destination.lat, longitude: destination.lng },
    ]
  }
  return points
}

async function routeDrive(params = {}) {
  const originLat = toNumber(params.originLat)
  const originLng = toNumber(params.originLng)
  const destLat = toNumber(params.destLat)
  const destLng = toNumber(params.destLng)
  const style = sanitizeString(params.style || '0') || '0'
  if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) return fail(400, 'origin coordinates are invalid')
  if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) return fail(400, 'destination coordinates are invalid')

  const key = sanitizeString(routeConfig.config('key'))
  if (!key) return fail(500, 'amap key is not configured')
  const driveUrl = sanitizeString(routeConfig.config('driveUrl')) || 'https://restapi.amap.com/v3/direction/driving'
  const extensions = sanitizeString(routeConfig.config('extensions')) || 'all'
  const timeout = Math.max(3000, toNumberSafe(routeConfig.config('timeout'), 15000))

  try {
    const response = await uniCloud.httpclient.request(driveUrl, {
      method: 'GET',
      dataType: 'json',
      timeout,
      data: {
        origin: `${originLng},${originLat}`,
        destination: `${destLng},${destLat}`,
        strategy: style,
        extensions,
        output: 'json',
        key,
      },
    })
    if (response.status !== 200) return fail(response.status || 500, 'amap request failed')
    const data = response.data || {}
    if (sanitizeString(data.status) !== '1') return fail(502, sanitizeString(data.info) || 'amap route failed', data)
    const route = data.route || {}
    const path = Array.isArray(route.paths) && route.paths.length ? route.paths[0] : {}
    const distance = toNumberSafe(path.distance, 0)
    const duration = toNumberSafe(path.duration, 0)
    const steps = Array.isArray(path.steps) ? path.steps : []
    return ok({
      distance,
      distanceText: formatRouteDistance(distance),
      duration,
      durationText: formatRouteDuration(duration),
      polyline: parseRoutePolyline(steps, {
        lat: originLat,
        lng: originLng,
      }, {
        lat: destLat,
        lng: destLng,
      }),
      instructions: steps.map(item => sanitizeString(item?.instruction)).filter(Boolean),
      raw: data,
    })
  } catch (error) {
    return fail(500, error.message || 'amap route failed')
  }
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

// ============================================================
// AI Search: Dify 语义检索 + 数据库补充
// ============================================================

async function callDifyRetrieval(query) {
  const difyConfig = createConfig({
    pluginId: 'dify',
    defaultConfig: {
      api_url: 'https://oc.aixifs.com',
      dataset_api_key: '',
      dataset_id: '',
    },
  })
  const apiKey = sanitizeString(difyConfig.config('dataset_api_key'))
  const datasetId = sanitizeString(difyConfig.config('dataset_id'))
  if (!apiKey || !datasetId) return []

  try {
    const response = await uniCloud.httpclient.request(
      `https://oc.aixifs.com/v1/datasets/${datasetId}/retrieve`,
      {
        method: 'POST',
        dataType: 'json',
        contentType: 'application/json',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        data: { query, top_k: 5 },
        timeout: 10000,
      }
    )
    return response.data?.data || []
  } catch (error) {
    console.error('[callDifyRetrieval] error:', error.message)
    return []
  }
}

function extractPoiIds(difyResults) {
  const ids = new Set()
  difyResults.forEach(item => {
    // 从 document_id 或 segment 中提取 poi_id
    const docId = item.document_id || item.document?.id || ''
    if (docId) ids.add(docId)
    // 从 metadata 中提取
    const metadata = item.metadata || item.document?.metadata || {}
    if (metadata.poi_id) ids.add(metadata.poi_id)
  })
  return Array.from(ids).filter(Boolean)
}

async function fetchPoisByIds(ids) {
  if (!ids.length) return []
  try {
    const result = await db.collection('babyplace-poi')
      .where({ _id: db.command.in(ids) })
      .limit(10)
      .get()
    return result.data || []
  } catch (error) {
    return []
  }
}

async function searchPoiByKeyword(query, lat, lng) {
  const where = {
    status: 'published',
    $or: [
      { name: new dbRegExp({ regexp: query, options: 'i' }) },
      { canonical_name: new dbRegExp({ regexp: query, options: 'i' }) },
      { address: new dbRegExp({ regexp: query, options: 'i' }) },
      { tags: new dbRegExp({ regexp: query, options: 'i' }) },
      { category: new dbRegExp({ regexp: query, options: 'i' }) },
    ],
  }
  const result = await db.collection('babyplace-poi')
    .where(where)
    .limit(10)
    .get()
  let list = result.data || []

  // 如果有坐标，计算距离并排序
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    list = list.map(item => {
      const poiLat = toNumber(item.location?.lat, 0)
      const poiLng = toNumber(item.location?.lng, 0)
      return { ...item, distance: calcDistanceMeters(lat, lng, poiLat, poiLng) }
    }).sort((a, b) => a.distance - b.distance)
  }
  return list
}

async function fetchArticlesByPoiId(poiId) {
  try {
    // 通过 content-source 关联表查找文章
    const sources = await db.collection('babyplace-content-source')
      .where({ poi_id: poiId, status: 'active' })
      .limit(5)
      .get()
    const articleIds = (sources.data || []).map(s => s.article_id).filter(Boolean)
    if (!articleIds.length) return []
    const articles = await db.collection('babyplace-article')
      .where({ _id: db.command.in(articleIds) })
      .limit(5)
      .get()
    return articles.data || []
  } catch (error) {
    return []
  }
}

async function searchPlaces(params = {}) {
  const query = sanitizeString(params.query)
  if (!query) return fail(400, 'query is required')
  const lat = toNumber(params.lat)
  const lng = toNumber(params.lng)

  // 1. Dify 语义检索
  const difyResults = await callDifyRetrieval(query)
  const difyPoiIds = extractPoiIds(difyResults)
  let pois = await fetchPoisByIds(difyPoiIds)

  // 2. 如果 Dify 结果不足，补充数据库搜索
  if (pois.length < 3) {
    const dbPois = await searchPoiByKeyword(query, lat, lng)
    const existIds = new Set(pois.map(p => p._id))
    dbPois.forEach(p => {
      if (!existIds.has(p._id)) pois.push(p)
    })
  }

  // 3. 如果有坐标，重新排序
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    pois = pois.map(item => {
      const poiLat = toNumber(item.location?.lat, 0)
      const poiLng = toNumber(item.location?.lng, 0)
      return { ...item, distance: calcDistanceMeters(lat, lng, poiLat, poiLng) }
    }).sort((a, b) => a.distance - b.distance)
  }

  // 4. 取前 3 个，附带关联文章
  const top3 = pois.slice(0, 3)
  const result = await Promise.all(top3.map(async poi => {
    const articles = await fetchArticlesByPoiId(poi._id)
    return {
      poi,
      articles,
      summary: poi.summary || poi.recommend_reason || '',
      booking_url: poi.booking_url || '',
      distance: poi.distance || null,
    }
  }))

  return ok({ places: result, query, total: pois.length })
}

// ============================================================
// Map: 附近地点搜索
// ============================================================

async function mapSearchNearby(params = {}) {
  const lat = toNumber(params.lat)
  const lng = toNumber(params.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail(400, 'lat/lng is required')
  }
  const radius = Math.max(100, Math.min(50000, toInteger(params.radius) || 3000))
  const keyword = sanitizeString(params.keyword) || ''
  const page = Math.max(toInteger(params.page) || 1, 1)
  const pageSize = Math.min(Math.max(toInteger(params.pageSize) || 20, 1), 50)

  let where = { status: 'published' }
  if (keyword) {
    where.$or = [
      { name: new dbRegExp({ regexp: keyword, options: 'i' }) },
      { category: new dbRegExp({ regexp: keyword, options: 'i' }) },
      { tags: new dbRegExp({ regexp: keyword, options: 'i' }) },
    ]
  }

  const result = await db.collection('babyplace-poi').where(where).limit(500).get()
  const list = (result.data || [])
    .map(item => {
      const poiLat = toNumber(item.location?.lat, 0)
      const poiLng = toNumber(item.location?.lng, 0)
      return { ...item, distance: calcDistanceMeters(lat, lng, poiLat, poiLng) }
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

// ============================================================
// Map: 高德地图搜索
// ============================================================

async function mapSearchAmap(params = {}) {
  const keyword = sanitizeString(params.keyword)
  if (!keyword) return fail(400, 'keyword is required')
  const lat = toNumber(params.lat)
  const lng = toNumber(params.lng)
  const city = sanitizeString(params.city) || '广州'
  const radius = toInteger(params.radius) || 3000

  const key = sanitizeString(routeConfig.config('key'))
  if (!key) return fail(500, 'amap key is not configured')

  try {
    // 高德 POI 搜索 API
    const data = {
      key,
      keywords: keyword,
      city,
      offset: Math.min(toInteger(params.pageSize) || 20, 25),
      page: Math.max(toInteger(params.page) || 1, 1),
      output: 'json',
    }

    // 如果有坐标，使用周边搜索
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      data.location = `${lng},${lat}`
      data.radius = Math.max(100, Math.min(50000, radius))
      data.sortrule = 'distance'
    }

    const response = await uniCloud.httpclient.request(
      'https://restapi.amap.com/v3/place/around',
      {
        method: 'GET',
        dataType: 'json',
        timeout: 10000,
        data,
      }
    )

    if (response.status !== 200) return fail(response.status || 500, 'amap request failed')
    const result = response.data || {}
    if (sanitizeString(result.status) !== '1') {
      return fail(502, sanitizeString(result.info) || 'amap search failed')
    }

    const pois = (result.pois || []).map(poi => ({
      id: poi.id,
      name: poi.name,
      address: poi.address,
      location: poi.location,
      type: poi.type,
      tel: poi.tel || '',
      distance: poi.distance || '',
      poiid: poi.poiid || '',
    }))

    return ok({
      list: pois,
      total: parseInt(result.count) || 0,
      page: data.page,
      pageSize: data.offset,
    })
  } catch (error) {
    return fail(500, error.message || 'amap search failed')
  }
}

// ============================================================
// Map: 腾讯地图搜索
// ============================================================

async function mapTencentSearch(params = {}) {
  const keyword = sanitizeString(params.keyword)
  if (!keyword) return fail(400, 'keyword is required')
  const lat = toNumber(params.lat)
  const lng = toNumber(params.lng)
  const region = sanitizeString(params.region) || '广州'
  const page = Math.max(toInteger(params.page) || 1, 1)
  const pageSize = Math.min(Math.max(toInteger(params.pageSize) || 20, 1), 20)

  const tencentConfig = createConfig({
    pluginId: 'tencent-map',
    defaultConfig: { key: '' },
  })
  const key = sanitizeString(tencentConfig.config('key'))
  if (!key) return fail(500, 'tencent map key is not configured')

  try {
    const requestData = {
      keyword,
      boundary: `region(${region},0)`,
      page_size: pageSize,
      page_index: page,
      key,
    }

    // 如果有坐标，使用圆形范围搜索
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      requestData.boundary = `circle(${lng},${lat},${Math.min(toInteger(params.radius) || 3000, 50000)})`
    }

    const response = await uniCloud.httpclient.request(
      'https://apis.map.qq.com/ws/place/v1/search',
      {
        method: 'GET',
        dataType: 'json',
        timeout: 10000,
        data: requestData,
      }
    )

    if (response.status !== 200) return fail(response.status || 500, 'tencent map request failed')
    const result = response.data || {}
    if (result.status !== 0) {
      return fail(502, result.message || 'tencent map search failed')
    }

    const pois = (result.data || []).map(poi => ({
      id: poi.id,
      title: poi.title,
      address: poi.address,
      location: poi.location,
      tel: poi.tel || '',
      category: poi.category || '',
      distance: poi._distance || '',
    }))

    return ok({
      list: pois,
      total: result.count || 0,
      page,
      pageSize,
    })
  } catch (error) {
    return fail(500, error.message || 'tencent map search failed')
  }
}

// ============================================================
// Meituan: 美团美食搜索
// ============================================================

async function meituanSearch(params = {}) {
  const lat = toNumber(params.lat)
  const lng = toNumber(params.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail(400, 'lat/lng is required for meituan search')
  }
  const keyword = sanitizeString(params.keyword) || '美食'
  const category = sanitizeString(params.category) || ''
  const radius = Math.max(500, Math.min(10000, toInteger(params.radius) || 3000))

  const meituanConfig = createConfig({
    pluginId: 'meituan',
    defaultConfig: { app_key: '', app_secret: '' },
  })
  const appKey = sanitizeString(meituanConfig.config('app_key'))

  // 如果美团 API 未配置，返回模拟数据
  if (!appKey) {
    return ok({
      list: [],
      total: 0,
      message: '美团 API 未配置，请联系管理员',
      hint: '可通过配置 uni-config-center meituan 插件启用',
    })
  }

  try {
    // 调用美团开放平台搜索 API（示例）
    const timestamp = Math.floor(Date.now() / 1000)
    const response = await uniCloud.httpclient.request(
      'https://openapi.meituan.com/api/v1/food/search',
      {
        method: 'POST',
        dataType: 'json',
        contentType: 'application/json',
        timeout: 10000,
        data: {
          app_key: appKey,
          timestamp,
          lat,
          lng,
          keyword,
          category,
          radius,
          limit: Math.min(toInteger(params.pageSize) || 20, 50),
          offset: (Math.max(toInteger(params.page) || 1, 1) - 1) * Math.min(toInteger(params.pageSize) || 20, 50),
        },
      }
    )

    const result = response.data || {}
    const pois = (result.data || []).map(item => ({
      id: item.id,
      name: item.name,
      address: item.address,
      rating: item.rating || 0,
      avg_price: item.avg_price || 0,
      images: item.images || [],
      category: item.category || '',
      distance: item.distance || 0,
    }))

    return ok({
      list: pois,
      total: result.total || 0,
      page: Math.max(toInteger(params.page) || 1, 1),
      pageSize: Math.min(toInteger(params.pageSize) || 20, 50),
    })
  } catch (error) {
    return fail(500, error.message || 'meituan search failed')
  }
}

// ============================================================
// Video: 图片 AI 增强
// ============================================================

function getAIApiKey() {
  return 't7npV6raGbd2f4HOMR4RRi0gsK2MbvPWk5TMs4i8Q9eJ80cG'
}

function getStylePrompt(style) {
  const prompts = {
    enhance: 'high quality, detailed, vibrant colors, professional photography',
    cartoon: 'cartoon style, anime, colorful, cute, child-friendly',
    watercolor: 'watercolor painting, soft colors, artistic, dreamy',
    sketch: 'pencil sketch, hand-drawn, artistic, detailed linework',
  }
  return prompts[style] || prompts.enhance
}

async function videoUploadAndEnhance(params = {}) {
  const images = Array.isArray(params.images) ? params.images : []
  const style = sanitizeString(params.style) || 'enhance'

  if (!images.length) return fail(400, 'images is required')

  const enhancedImages = []

  for (let i = 0; i < images.length; i++) {
    const imageUrl = sanitizeString(images[i])
    if (!imageUrl) continue

    try {
      const result = await uniCloud.httpclient.request(
        'https://aikey.aixifs.com/v1/images/generations',
        {
          method: 'POST',
          dataType: 'json',
          contentType: 'application/json',
          headers: {
            'Authorization': `Bearer ${getAIApiKey()}`,
          },
          data: {
            model: 'stable-diffusion-xl',
            prompt: getStylePrompt(style),
            image: imageUrl,
            strength: 0.3,
            num_inference_steps: 30,
          },
          timeout: 60000,
        }
      )

      if (result.data?.data?.[0]?.url) {
        enhancedImages.push(result.data.data[0].url)
      } else {
        enhancedImages.push(imageUrl)
      }
    } catch (error) {
      console.error(`[videoUploadAndEnhance] image ${i} failed:`, error.message)
      enhancedImages.push(imageUrl)
    }
  }

  return ok({ images: enhancedImages })
}

// ============================================================
// Video: 提交 Remotion 渲染
// ============================================================

async function videoRender(params = {}) {
  const images = Array.isArray(params.images) ? params.images : []
  const poiName = sanitizeString(params.poiName) || '遛娃好去处'
  const poiAddress = sanitizeString(params.poiAddress) || ''
  const tags = Array.isArray(params.tags) ? params.tags : ['亲子', '遛娃', '推荐']
  const summary = sanitizeString(params.summary) || '适合带小朋友来玩的好地方'
  const audioSrc = sanitizeString(params.audioSrc) || ''

  if (!images.length) return fail(400, 'images is required')

  try {
    const result = await uniCloud.httpclient.request(
      'http://lanes.ymxt.top:3010/api/renders',
      {
        method: 'POST',
        dataType: 'json',
        contentType: 'application/json',
        data: {
          templateId: 'BabyplacePoi',
          inputProps: {
            poiName,
            poiAddress,
            images,
            tags,
            summary,
            audioSrc,
          },
        },
        timeout: 30000,
      }
    )

    if (result.data?.renderId) {
      return ok({
        renderId: result.data.renderId,
        status: result.data.status,
      })
    }

    return fail(500, '渲染提交失败')
  } catch (error) {
    return fail(500, error.message || '渲染提交失败')
  }
}

// ============================================================
// Video: 查询渲染状态
// ============================================================

async function videoRenderStatus(params = {}) {
  const renderId = sanitizeString(params.renderId)
  if (!renderId) return fail(400, 'renderId is required')

  try {
    const result = await uniCloud.httpclient.request(
      `http://lanes.ymxt.top:3010/api/renders/${renderId}`,
      {
        method: 'GET',
        dataType: 'json',
        timeout: 10000,
      }
    )

    return ok({
      renderId: result.data?.renderId,
      status: result.data?.status,
      progress: result.data?.progress || 0,
      videoUrl: result.data?.videoUrl || null,
      error: result.data?.error || null,
    })
  } catch (error) {
    return fail(500, error.message || '查询渲染状态失败')
  }
}

// ============================================================
// Video: 上传到小红书（预留接口）
// ============================================================

async function videoUploadToXHS(params = {}) {
  const videoUrl = sanitizeString(params.videoUrl)
  const title = sanitizeString(params.title)
  const content = sanitizeString(params.content)
  const tags = Array.isArray(params.tags) ? params.tags : []

  if (!videoUrl) return fail(400, 'videoUrl is required')
  if (!title) return fail(400, 'title is required')

  // 读取小红书配置
  try {
    const xhsConfig = createConfig({
      pluginId: 'xiaohongshu',
      defaultConfig: {
        app_id: '',
        app_secret: '',
        redirect_uri: '',
        scopes: [],
      },
    })
    const appId = sanitizeString(xhsConfig.config('app_id'))
    const appSecret = sanitizeString(xhsConfig.config('app_secret'))

    if (!appId || !appSecret) {
      return fail(400, '小红书 API 未配置，请联系管理员')
    }

    // TODO: 实现完整的 OAuth 2.0 流程和视频上传
    // 1. 获取 access_token
    // 2. 下载视频文件
    // 3. 上传视频到小红书
    // 4. 发布笔记

    return fail(501, '小红书发布功能开发中，敬请期待')
  } catch (error) {
    return fail(500, error.message || '小红书上传失败')
  }
}

// ============================================================
// Dispatch
// ============================================================

async function dispatchAdminAction(action, params = {}) {
  if (action === 'review.listByPoi') return listReviewByPoi(params)
  if (action === 'poi.nearby') return nearbyPoi(params)
  if (action === 'recommend.home') return recommendHome(params)
  if (action === 'route.drive') return routeDrive(params)
  if (action === 'ai.searchPlaces') return searchPlaces(params)
  if (action === 'map.searchNearby') return mapSearchNearby(params)
  if (action === 'map.searchAmap') return mapSearchAmap(params)
  if (action === 'meituan.search') return meituanSearch(params)
  if (action === 'map.tencentSearch') return mapTencentSearch(params)
  if (action === 'video.uploadAndEnhance') return videoUploadAndEnhance(params)
  if (action === 'video.render') return videoRender(params)
  if (action === 'video.renderStatus') return videoRenderStatus(params)
  if (action === 'video.uploadToXHS') return videoUploadToXHS(params)
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
    transport_hint: sanitizeString(input.transport_hint),
    parking_tip: sanitizeString(input.parking_tip),
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

function normalizeSeedPoiUpsertDoc(input = {}) {
  const location = input.location || {}
  const facilities = input.facilities || {}
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
  }
}

function mergePoiDocs(existing = {}, incoming = {}) {
  const mergedAlias = Array.from(new Set([]
    .concat(sanitizeArray(existing.alias))
    .concat(sanitizeArray(incoming.alias))
    .concat(sanitizeString(existing.name) ? [sanitizeString(existing.name)] : [])
    .concat(sanitizeString(incoming.name) ? [sanitizeString(incoming.name)] : [])
    .filter(Boolean)))

  const mergedTransport = Array.from(new Set([]
    .concat(sanitizeArray(existing.transport))
    .concat(sanitizeArray(incoming.transport))
    .filter(Boolean)))

  return {
    name: incoming.name || existing.name || '',
    canonical_name: incoming.canonical_name || existing.canonical_name || existing.name || incoming.name || '',
    alias: mergedAlias,
    city: incoming.city || existing.city || '',
    district: incoming.district || existing.district || '',
    address: incoming.address || existing.address || '',
    location: {
      lat: toNumberSafe(incoming.location?.lat, 0) || toNumberSafe(existing.location?.lat, 0),
      lng: toNumberSafe(incoming.location?.lng, 0) || toNumberSafe(existing.location?.lng, 0),
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
      stroller_friendly: toBool(incoming.facilities?.stroller_friendly, toBool(existing.facilities?.stroller_friendly, false)),
      restroom: toBool(incoming.facilities?.restroom, toBool(existing.facilities?.restroom, false)),
      food: toBool(incoming.facilities?.food, toBool(existing.facilities?.food, false)),
      shade: toBool(incoming.facilities?.shade, toBool(existing.facilities?.shade, false)),
      parking: toBool(incoming.facilities?.parking, toBool(existing.facilities?.parking, false)),
      rainy_day_ok: toBool(incoming.facilities?.rainy_day_ok, toBool(existing.facilities?.rainy_day_ok, false)),
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
  }
}

async function findSeedPoiByName(item = {}) {
  const names = Array.from(new Set([]
    .concat(item._id ? [item._id] : [])
    .concat(item.name ? [item.name] : [])
    .concat(item.canonical_name ? [item.canonical_name] : [])
    .concat(Array.isArray(item.alias) ? item.alias : [])
    .map(name => sanitizeString(name))
    .filter(Boolean)))

  if (item._id) {
    const docResult = await db.collection('babyplace-poi').doc(item._id).get()
    const docItem = (docResult.data || [])[0]
    if (docItem) return docItem
  }

  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    let result = await db.collection('babyplace-poi').where({
      name,
    }).limit(1).get()
    if ((result.data || []).length) return result.data[0]

    result = await db.collection('babyplace-poi').where({
      canonical_name: name,
    }).limit(1).get()
    if ((result.data || []).length) return result.data[0]
  }

  if (names.length) {
    const result = await db.collection('babyplace-poi')
      .where({
        alias: db.command.in(names),
      })
      .limit(1)
      .get()
    if ((result.data || []).length) return result.data[0]
  }

  return null
}

async function seedListPoiByNames(params) {
  if (!ensureSeedAuthorized(params)) return fail(401, 'unauthorized')
  const names = Array.isArray(params.names) ? params.names.map(item => sanitizeString(item)).filter(Boolean) : []
  if (!names.length) return fail(400, 'names is required')
  const result = []
  for (let i = 0; i < names.length; i++) {
    const item = await findSeedPoiByName({ name: names[i], canonical_name: names[i], alias: [names[i]] })
    if (item) result.push(item)
  }
  return ok({ list: result, total: result.length })
}

async function seedUpsertPoiBatch(params) {
  if (!ensureSeedAuthorized(params)) return fail(401, 'unauthorized')
  const data = Array.isArray(params.data) ? params.data : []
  if (!data.length) return fail(400, 'data is required')
  if (data.length > 100) return fail(400, 'max batch size is 100')

  const poiCollection = db.collection('babyplace-poi')
  const succeededItems = []
  const failedItems = []
  for (let i = 0; i < data.length; i++) {
    try {
      const incoming = normalizeSeedPoiUpsertDoc(data[i] || {})
      if (!incoming.name) {
        failedItems.push({ index: i, reason: 'name is required' })
        continue
      }
      const existing = await findSeedPoiByName(incoming)
      const merged = mergePoiDocs(existing || {}, incoming)
      if (existing?._id) {
        const updateResult = await poiCollection.doc(existing._id).update({
          ...merged,
          updated_at: db.serverDate(),
        })
        succeededItems.push({ index: i, id: existing._id, mode: 'update', updated: updateResult.updated || 0 })
      } else {
        const createResult = await poiCollection.add({
          ...merged,
          created_at: db.serverDate(),
          updated_at: db.serverDate(),
        })
        succeededItems.push({ index: i, id: createResult.id, mode: 'create' })
      }
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
  }, `upserted ${succeededItems.length}/${data.length}`)
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
    case 'seed.listPoiByNames':
      return seedListPoiByNames(params, context)
    case 'seed.upsertPoiBatch':
      return seedUpsertPoiBatch(params, context)
    default: return fail(400, 'invalid action')
  }
}
