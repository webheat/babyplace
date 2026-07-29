import { postText } from '@/api/request';

export async function listGoods(params = {}) {
  return postText('/babyplace-admin', {
    action: 'list',
    ...params,
  });
}

export async function getGoodsDetail(id) {
  return postText('/babyplace-admin', {
    action: 'detail',
    id,
  });
}

export async function createGoods(payload) {
  return postText('/babyplace-admin', {
    action: 'create',
    payload,
  });
}

export async function updateGoods(id, payload) {
  return postText('/babyplace-admin', {
    action: 'update',
    id,
    payload,
  });
}

export async function removeGoods(id) {
  return postText('/babyplace-admin', {
    action: 'remove',
    id,
  });
}

export async function batchImportGoods(items) {
  return postText('/babyplace-admin', {
    action: 'batchImport',
    items,
  });
}
