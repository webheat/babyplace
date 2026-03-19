'use strict';

const createConfig = require('uni-config-center');

const routeConfig = createConfig({
  pluginId: 'tianditu',
  defaultConfig: {
    key: '',
    driveUrl: 'https://api.tianditu.gov.cn/drive',
    timeout: 15000,
  },
});

function ok(data, message = 'ok') {
  return { code: 0, message, data };
}

function fail(code, message, data = null) {
  return { code, message, data };
}

function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function buildCoordString(lng, lat) {
  return `${lng},${lat}`;
}

function sanitizeStyle(value) {
  const style = sanitizeString(value || '0');
  return ['0', '1', '2', '3'].includes(style) ? style : '0';
}

function parseRouteCoordinateText(value) {
  const text = sanitizeString(value);
  if (!text) return [];
  return text
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [lngText, latText] = item.split(',');
      const latitude = toNumber(latText, NaN);
      const longitude = toNumber(lngText, NaN);
      if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
      return { latitude, longitude };
    })
    .filter(Boolean);
}

function parseRouteCoordinateList(list = []) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const latitude = toNumber(item.lat ?? item.latitude ?? item.y, NaN);
      const longitude = toNumber(item.lon ?? item.lng ?? item.longitude ?? item.x, NaN);
      if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
      return { latitude, longitude };
    })
    .filter(Boolean);
}

function ensureBoundaryPoints(points, origin, destination) {
  const result = Array.isArray(points) ? points.slice() : [];
  if (!result.length) {
    return [
      { latitude: origin.lat, longitude: origin.lng },
      { latitude: destination.lat, longitude: destination.lng },
    ];
  }
  const first = result[0];
  const last = result[result.length - 1];
  if (Math.abs(first.latitude - origin.lat) > 0.0001 || Math.abs(first.longitude - origin.lng) > 0.0001) {
    result.unshift({ latitude: origin.lat, longitude: origin.lng });
  }
  if (Math.abs(last.latitude - destination.lat) > 0.0001 || Math.abs(last.longitude - destination.lng) > 0.0001) {
    result.push({ latitude: destination.lat, longitude: destination.lng });
  }
  return result;
}

function pickFirstRoute(result = {}) {
  if (Array.isArray(result.routes) && result.routes.length) return result.routes[0];
  if (Array.isArray(result.lines) && result.lines.length) return result.lines[0];
  if (Array.isArray(result.results) && result.results.length) return result.results[0];
  return result.route || result;
}

function normalizeInstructions(route = {}, result = {}) {
  const rawSteps = []
    .concat(Array.isArray(route.steps) ? route.steps : [])
    .concat(Array.isArray(route.segments) ? route.segments : [])
    .concat(Array.isArray(result.steps) ? result.steps : []);
  return rawSteps
    .map((item) => sanitizeString(
      item?.strguide
      || item?.instruction
      || item?.guide
      || item?.segmentName
      || item?.text
    ))
    .filter(Boolean);
}

function normalizeDistance(route = {}, result = {}) {
  return Math.max(0, toNumber(
    route.distance
    ?? route.length
    ?? route.routeDistance
    ?? result.distance
    ?? result.length
    ?? result.routeDistance,
    0,
  ));
}

function normalizeDuration(route = {}, result = {}) {
  return Math.max(0, toNumber(
    route.duration
    ?? route.time
    ?? route.routeTime
    ?? result.duration
    ?? result.time
    ?? result.routeTime,
    0,
  ));
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

function normalizeRoutePayload(raw = {}, origin, destination) {
  const result = raw?.result || raw?.results || raw;
  const route = pickFirstRoute(result);
  const routePoints = ensureBoundaryPoints([
    ...parseRouteCoordinateText(
      route?.routelatlon
      || route?.routeLatLon
      || route?.routepoints
      || result?.routelatlon
      || result?.routeLatLon
      || result?.routepoints
    ),
    ...parseRouteCoordinateList(route?.points || route?.pointlist || result?.points || result?.pointlist),
  ], origin, destination);
  const distance = normalizeDistance(route, result);
  const duration = normalizeDuration(route, result);

  return {
    distance,
    distanceText: formatDistance(distance),
    duration,
    durationText: formatDuration(duration),
    style: sanitizeStyle(route?.style || result?.style || '0'),
    polyline: routePoints,
    instructions: normalizeInstructions(route, result),
    raw,
  };
}

module.exports = {
  async drive(params = {}) {
    const originLat = toNumber(params.originLat, NaN);
    const originLng = toNumber(params.originLng, NaN);
    const destLat = toNumber(params.destLat, NaN);
    const destLng = toNumber(params.destLng, NaN);
    const style = sanitizeStyle(params.style);

    if (!isValidLatitude(originLat) || !isValidLongitude(originLng)) {
      return fail(400, 'origin coordinates are invalid');
    }
    if (!isValidLatitude(destLat) || !isValidLongitude(destLng)) {
      return fail(400, 'destination coordinates are invalid');
    }

    const key = sanitizeString(routeConfig.config('key'));
    if (!key) {
      return fail(500, 'tianditu key is not configured');
    }

    const driveUrl = sanitizeString(routeConfig.config('driveUrl')) || 'https://api.tianditu.gov.cn/drive';
    const timeout = Math.max(3000, toNumber(routeConfig.config('timeout'), 15000));
    const postStr = JSON.stringify({
      orig: buildCoordString(originLng, originLat),
      dest: buildCoordString(destLng, destLat),
      style,
    });

    try {
      const response = await uniCloud.httpclient.request(driveUrl, {
        method: 'GET',
        dataType: 'json',
        timeout,
        data: {
          postStr,
          type: 'search',
          tk: key,
        },
      });
      if (response.status !== 200) {
        return fail(response.status || 500, 'tianditu request failed');
      }
      const data = response.data || {};
      const status = sanitizeString(data.status);
      if (status && status !== '0') {
        return fail(502, sanitizeString(data.msg) || 'tianditu route failed', data);
      }
      return ok(normalizeRoutePayload(data, {
        lat: originLat,
        lng: originLng,
      }, {
        lat: destLat,
        lng: destLng,
      }));
    } catch (error) {
      return fail(500, error.message || 'tianditu route failed');
    }
  },
};
