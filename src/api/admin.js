import { postText } from '@/api/request';

export async function callAdminAction(action, params = {}) {
  return postText('/babyplace-admin', { action, ...params });
}

export async function listAdminItems(moduleKey, params = {}) {
  return callAdminAction(`${moduleKey}.list`, params);
}

export async function createAdminItem(moduleKey, payload) {
  return callAdminAction(`${moduleKey}.create`, { payload });
}

export async function updateAdminItem(moduleKey, id, payload) {
  return callAdminAction(`${moduleKey}.update`, { id, payload });
}

export async function removeAdminItem(moduleKey, id) {
  return callAdminAction(`${moduleKey}.remove`, { id });
}
