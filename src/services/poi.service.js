/**
 * POI 业务服务层
 * 负责 POI 数据的业务组装和转换逻辑
 * 与 api/ 层（请求/响应）分离
 */

import poiSnapshot from '@/data/poi-snapshot.json';

/**
 * 从快照数据构建列表结果
 */
export function buildSnapshotListResult(params = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 20));
  const keyword = String(params.keyword || '').trim().toLowerCase();
  const source = Array.isArray(poiSnapshot) ? poiSnapshot.slice() : [];
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

/**
 * 从快照数据构建详情结果
 */
export function buildSnapshotDetailResult(id, params = {}) {
  const source = Array.isArray(poiSnapshot) ? poiSnapshot.slice() : [];
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

/**
 * 从快照数据构建附近结果
 */
export function buildSnapshotNearbyResult(params = {}) {
  const lat = Number(params.lat || params.latitude || NaN);
  const lng = Number(params.lng || params.longitude || NaN);
  const pageSize = Math.max(1, Number(params.pageSize || 20));
  const source = Array.isArray(poiSnapshot) ? poiSnapshot.slice() : [];
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
