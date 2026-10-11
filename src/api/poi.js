import { callAdminAction } from '@/api/admin';
import poiSnapshot from '@/data/poi-snapshot.json';
import { showErrorToast } from '@/api/request';

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
  return {
    code: 0,
    message: 'ok',
    data: {
      list: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    },
  };
}

function buildSnapshotDetailResult(id, params = {}) {
  const source = getSnapshotList();
  const poi = source.find((item) => item._id === id) || source.find((item) => item.slug === id);
  if (!poi) return { code: 404, message: 'not found', data: null };
  return {
    code: 0,
    message: 'ok',
    data: {
      poi,
      reviews: [],
      sources: [],
      ...params,
    },
  };
}

function buildSnapshotNearbyResult(params = {}) {
  const lat = Number(params.lat || params.latitude || NaN);
  const lng = Number(params.lng || params.longitude || NaN);
  const pageSize = Math.max(1, Number(params.pageSize || 20));
  const source = getSnapshotList();
  const result = source
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

  return {
    code: 0,
    message: 'ok',
    data: {
      list: result,
      total: result.length,
      page: 1,
      pageSize,
    },
  };
}

export async function listPoi(params = {}) {
  try {
    const result = await callAdminAction('poi.list', params);
    return result?.code === 0 ? result : buildSnapshotListResult(params);
  } catch (error) {
    showErrorToast(error?.message || '加载地点列表失败');
    return buildSnapshotListResult(params);
  }
}

export async function detailPoi(id, params = {}) {
  try {
    const [poiResult, reviewResult] = await Promise.all([
      callAdminAction('poi.detail', { id, ...params }),
      callAdminAction('review.listByPoi', { poi_id: id, page: 1, pageSize: 20 }),
    ]);
    if (poiResult?.code !== 0) return buildSnapshotDetailResult(id, params);
    return {
      code: 0,
      message: 'ok',
      data: {
        poi: poiResult.data || {},
        reviews: reviewResult?.code === 0 ? (reviewResult.data?.list || []) : [],
        sources: [],
      },
    };
  } catch (error) {
    showErrorToast(error?.message || '加载地点详情失败');
    return buildSnapshotDetailResult(id, params);
  }
}

export async function nearbyPoi(params = {}) {
  try {
    const result = await callAdminAction('poi.nearby', params);
    return result?.code === 0 ? result : buildSnapshotNearbyResult(params);
  } catch (error) {
    showErrorToast(error?.message || '加载附近地点失败');
    return buildSnapshotNearbyResult(params);
  }
}
