'use strict';

const db = uniCloud.database();
const collection = db.collection('babyplace')
const dbRegExp = db.RegExp

const WRITE_ACTIONS = new Set(['create', 'update', 'remove', 'batchImport'])
const PUBLIC_ACTIONS = new Set(['list', 'detail'])
const IMPORT_SECRET = 'babyplace2026'
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
  if (!WRITE_ACTIONS.has(action) && !PUBLIC_ACTIONS.has(action)) return fail(400, 'invalid action')
  switch (action) {
    case 'create': return createGoods(params, context)
    case 'list': return listGoods(params, context)
    case 'detail': return detailGoods(params)
    case 'update': return updateGoods(params, context)
    case 'remove': return removeGoods(params, context)
    case 'batchImport': return batchImportGoods(params, context)
    default: return fail(400, 'invalid action')
  }
}
