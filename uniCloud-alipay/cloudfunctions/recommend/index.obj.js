'use strict';

const db = uniCloud.database();
const poiCollection = db.collection('babyplace-poi');

function ok(data, message = 'ok') {
  return { code: 0, message, data };
}

function fail(code, message, data = null) {
  return { code, message, data };
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toInteger(value, fallback = 0) {
  const num = Number(value);
  return Number.isInteger(num) ? num : fallback;
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function calcDistanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
    * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = {
  async home(params = {}) {
    const lat = toNumber(params.lat, NaN);
    const lng = toNumber(params.lng, NaN);
    const nearbyRadius = Math.max(500, Math.min(20000, toInteger(params.radius, 5000)));
    const allResult = await poiCollection.where({ status: 'published' }).limit(200).get();
    const list = allResult.data || [];
    const featured = [...list]
      .sort((a, b) => (toNumber(b.avg_rating, 0) - toNumber(a.avg_rating, 0))
        || (toInteger(b.review_count, 0) - toInteger(a.review_count, 0)))
      .slice(0, 6);
    const latest = [...list]
      .sort((a, b) => {
        const aTime = a.updated_at?.getTime ? a.updated_at.getTime() : 0;
        const bTime = b.updated_at?.getTime ? b.updated_at.getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 6);

    let nearby = [];
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      nearby = list
        .map(item => {
          const poiLat = toNumber(item.location?.lat, 0);
          const poiLng = toNumber(item.location?.lng, 0);
          return {
            ...item,
            distance: calcDistanceMeters(lat, lng, poiLat, poiLng),
          };
        })
        .filter(item => item.distance <= nearbyRadius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 6);
    }
    return ok({
      featured,
      latest,
      nearby,
    });
  },
};
