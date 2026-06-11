import { callAdminAction } from '@/api/admin';

const AMAP_DRIVE_URL = 'https://restapi.amap.com/v3/direction/driving';
const AMAP_WEB_KEY = 'abcef158da87a62e42e1fb968ed33dd4';

function getRouteObject() {
  if (typeof uniCloud === 'undefined' || !uniCloud || typeof uniCloud.importObject !== 'function') {
    return null;
  }
  try {
    return uniCloud.importObject('route');
  } catch (_error) {
    return null;
  }
}

function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatDistance(distance) {
  if (!distance) return '';
  if (distance >= 1000) return `${(distance / 1000).toFixed(distance >= 10000 ? 0 : 1)} 公里`;
  return `${Math.round(distance)} 米`;
}

function formatDuration(duration) {
  if (!duration) return '';
  const minutes = duration > 180 ? Math.round(duration / 60) : Math.round(duration);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    return remain ? `${hours}小时${remain}分钟` : `${hours}小时`;
  }
  return `${Math.max(1, minutes)} 分钟`;
}

function parsePolyline(steps = [], origin, destination) {
  const points = [];
  steps.forEach((item) => {
    const polyline = sanitizeString(item?.polyline);
    if (!polyline) return;
    polyline.split(';').forEach((pair) => {
      const [lngText, latText] = pair.split(',');
      const latitude = toNumber(latText, NaN);
      const longitude = toNumber(lngText, NaN);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      points.push({ latitude, longitude });
    });
  });
  if (!points.length) {
    return [
      { latitude: origin.lat, longitude: origin.lng },
      { latitude: destination.lat, longitude: destination.lng },
    ];
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first.latitude - origin.lat) > 0.0001 || Math.abs(first.longitude - origin.lng) > 0.0001) {
    points.unshift({ latitude: origin.lat, longitude: origin.lng });
  }
  if (Math.abs(last.latitude - destination.lat) > 0.0001 || Math.abs(last.longitude - destination.lng) > 0.0001) {
    points.push({ latitude: destination.lat, longitude: destination.lng });
  }
  return points;
}

function normalizeAmapResult(raw = {}, params = {}) {
  const route = raw?.route || {};
  const path = Array.isArray(route.paths) && route.paths.length ? route.paths[0] : {};
  const distance = toNumber(path.distance, 0);
  const duration = toNumber(path.duration, 0);
  const steps = Array.isArray(path.steps) ? path.steps : [];
  return {
    code: 0,
    message: 'ok',
    data: {
      distance,
      distanceText: formatDistance(distance),
      duration,
      durationText: formatDuration(duration),
      polyline: parsePolyline(steps, {
        lat: toNumber(params.originLat, 0),
        lng: toNumber(params.originLng, 0),
      }, {
        lat: toNumber(params.destLat, 0),
        lng: toNumber(params.destLng, 0),
      }),
      instructions: steps
        .map((item) => sanitizeString(item?.instruction))
        .filter(Boolean),
      raw,
    },
  };
}

function requestAmapDrive(params = {}) {
  return new Promise((resolve) => {
    uni.request({
      url: AMAP_DRIVE_URL,
      method: 'GET',
      timeout: 30000,
      data: {
        origin: `${params.originLng},${params.originLat}`,
        destination: `${params.destLng},${params.destLat}`,
        strategy: sanitizeString(params.style || '0') || '0',
        extensions: 'all',
        output: 'json',
        key: AMAP_WEB_KEY,
      },
      success: ({ statusCode, data }) => {
        if (statusCode >= 200 && statusCode < 300 && String(data?.status || '') === '1') {
          resolve(normalizeAmapResult(data, params));
          return;
        }
        resolve({
          code: statusCode || 500,
          message: sanitizeString(data?.info) || 'amap route failed',
          data,
        });
      },
      fail: (error) => {
        const message = String(error?.errMsg || '').toLowerCase().includes('timeout')
          ? 'timeout'
          : 'network error';
        resolve({ code: -1, message });
      },
    });
  });
}

export async function planDriveRoute(params = {}) {
  const routeObject = getRouteObject();
  if (routeObject && typeof routeObject.drive === 'function') {
    try {
      const result = await routeObject.drive(params);
      if (result?.code === 0) return result;
    } catch (_error) {
      // Fall through to HTTP/admin fallback.
    }
  }

  try {
    const adminResult = await callAdminAction('route.drive', params);
    if (adminResult?.code === 0) return adminResult;
  } catch (_error) {
    // Fall through to direct amap fallback.
  }

  return requestAmapDrive(params);
}
