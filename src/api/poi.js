import { callAdminAction } from '@/api/admin';

const poiObject = uniCloud.importObject('poi');

async function fallbackListPoi(params = {}) {
  return callAdminAction('poi.list', params);
}

async function fallbackDetailPoi(id, params = {}) {
  const [poiResult, reviewResult] = await Promise.all([
    callAdminAction('poi.detail', { id, ...params }),
    callAdminAction('review.listByPoi', { poi_id: id, page: 1, pageSize: 20 }),
  ]);
  if (poiResult?.code !== 0) return poiResult;
  return {
    code: 0,
    message: 'ok',
    data: {
      poi: poiResult.data || {},
      reviews: reviewResult?.code === 0 ? (reviewResult.data?.list || []) : [],
      sources: [],
    },
  };
}

async function fallbackNearbyPoi(params = {}) {
  return callAdminAction('poi.nearby', params);
}

export async function listPoi(params = {}) {
  try {
    const result = await poiObject.list(params);
    if (result?.code === 0) return result;
  } catch (error) {
    console.error('poi.list importObject failed, fallback to admin action', error);
  }
  return fallbackListPoi(params);
}

export async function detailPoi(id, params = {}) {
  try {
    const result = await poiObject.detail({ id, ...params });
    if (result?.code === 0) return result;
  } catch (error) {
    console.error('poi.detail importObject failed, fallback to admin action', error);
  }
  return fallbackDetailPoi(id, params);
}

export async function nearbyPoi(params = {}) {
  try {
    const result = await poiObject.nearby(params);
    if (result?.code === 0) return result;
  } catch (error) {
    console.error('poi.nearby importObject failed, fallback to admin action', error);
  }
  return fallbackNearbyPoi(params);
}
