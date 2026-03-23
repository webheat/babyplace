import { callAdminAction } from '@/api/admin';
import poiSnapshot from '@/data/poi-snapshot.json';

const poiObject = uniCloud.importObject('poi');

function ok(data = {}, message = 'ok') {
  return { code: 0, message, data };
}

function getSnapshotList() {
  return Array.isArray(poiSnapshot) ? poiSnapshot.slice() : [];
}

function buildSnapshotListResult(params = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 20));
  const keyword = String(params.keyword || '').trim().toLowerCase();
  const source = getSnapshotList();
  const filtered = keyword
    ? source.filter((item) => [item.name, item.canonical_name, item.address, item.city, item.district]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword))
    : source;
  const start = (page - 1) * pageSize;
  return ok({
    list: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  });
}

function buildSnapshotDetailResult(id, params = {}) {
  const source = getSnapshotList();
  const poi = source.find((item) => item._id === id) || source.find((item) => item.slug === id);
  if (!poi) return { code: 404, message: 'not found', data: null };
  return ok({
    poi,
    reviews: [],
    sources: [],
    ...params,
  });
}

function buildSnapshotNearbyResult(params = {}) {
  const lat = Number(params.lat || params.latitude || NaN);
  const lng = Number(params.lng || params.longitude || NaN);
  const pageSize = Math.max(1, Number(params.pageSize || 20));
  const source = getSnapshotList()
    .filter((item) => Number(item?.location?.lat) && Number(item?.location?.lng))
    .map((item) => {
      const itemLat = Number(item.location.lat || 0);
      const itemLng = Number(item.location.lng || 0);
      const score = Number.isFinite(lat) && Number.isFinite(lng)
        ? Math.abs(itemLat - lat) + Math.abs(itemLng - lng)
        : 0;
      return { ...item, __score: score };
    })
    .sort((left, right) => left.__score - right.__score)
    .slice(0, pageSize)
    .map(({ __score, ...item }) => item);
  return ok({
    list: source,
    total: source.length,
    page: 1,
    pageSize,
  });
}

async function fallbackListPoi(params = {}) {
  const result = await callAdminAction('poi.list', params);
  return result?.code === 0 ? result : buildSnapshotListResult(params);
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
  const result = await callAdminAction('poi.nearby', params);
  return result?.code === 0 ? result : buildSnapshotNearbyResult(params);
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
  const result = await fallbackDetailPoi(id, params);
  return result?.code === 0 ? result : buildSnapshotDetailResult(id, params);
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
