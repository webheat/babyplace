import axios from 'axios'

const manageApi = axios.create({
  baseURL: '/manage/api',
  timeout: 10000,
})

const adminApi = axios.create({
  baseURL: '/babyplace-admin',
  timeout: 30000,
})

// --- 认证 ---

export async function login(password) {
  const { data } = await manageApi.post('/login', { password })
  if (data.code !== 0) throw new Error(data.message)
  return data
}

export async function logout() {
  await manageApi.post('/logout')
}

export async function checkAuth() {
  const { data } = await manageApi.get('/check')
  if (data.code !== 0) throw new Error(data.message)
  return data
}

// --- CRUD ---

export async function adminAction(action, params = {}) {
  const { data } = await adminApi.post('', { action, ...params })
  return data
}

// POI
export const poiApi = {
  list: (params) => adminAction('poi.list', params),
  detail: (id) => adminAction('poi.detail', { id }),
  create: (payload) => adminAction('poi.create', { payload }),
  update: (id, payload) => adminAction('poi.update', { id, payload }),
  remove: (id) => adminAction('poi.remove', { id }),
}

// Review
export const reviewApi = {
  list: (params) => adminAction('review.list', params),
  detail: (id) => adminAction('review.detail', { id }),
  create: (payload) => adminAction('review.create', { payload }),
  update: (id, payload) => adminAction('review.update', { id, payload }),
  remove: (id) => adminAction('review.remove', { id }),
}

// Article
export const articleApi = {
  list: (params) => adminAction('article.list', params),
  detail: (id) => adminAction('article.detail', { id }),
  create: (payload) => adminAction('article.create', { payload }),
  update: (id, payload) => adminAction('article.update', { id, payload }),
  remove: (id) => adminAction('article.remove', { id }),
}

// Content Source
export const sourceApi = {
  list: (params) => adminAction('source.list', params),
  detail: (id) => adminAction('source.detail', { id }),
  create: (payload) => adminAction('source.create', { payload }),
  update: (id, payload) => adminAction('source.update', { id, payload }),
  remove: (id) => adminAction('source.remove', { id }),
}
