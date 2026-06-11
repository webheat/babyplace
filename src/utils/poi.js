export function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function extractUniqueCities(list = []) {
  const map = new Map();
  list.forEach((item) => {
    const city = typeof item?.city === 'string' ? item.city.trim() : '';
    if (city && !map.has(city)) {
      map.set(city, city);
    }
  });
  return Array.from(map.values());
}

export function extractTags(list = [], limit = 12) {
  const counter = new Map();
  list.forEach((item) => {
    (item?.tags || []).forEach((tag) => {
      const text = typeof tag === 'string' ? tag.trim() : '';
      if (!text) return;
      counter.set(text, (counter.get(text) || 0) + 1);
    });
  });
  return Array.from(counter.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function matchesKeyword(item, keyword) {
  const text = normalizeText(keyword);
  if (!text) return true;
  return [
    item?.name,
    item?.city,
    item?.district,
    item?.address,
    item?.summary,
    item?.recommend_reason,
    ...(item?.tags || []),
  ].some((value) => normalizeText(value).includes(text));
}

export function filterPoiList(list = [], filters = {}) {
  const {
    keyword = '',
    city = '',
    tag = '',
    indoorOnly = false,
  } = filters;
  return list.filter((item) => {
    if (city && item?.city !== city) return false;
    if (tag && !(item?.tags || []).includes(tag)) return false;
    if (indoorOnly && !item?.indoor && !item?.facilities?.rainy_day_ok) return false;
    return matchesKeyword(item, keyword);
  });
}

export function sortByRating(list = []) {
  return [...list].sort((left, right) => {
    const ratingDiff = Number(right?.avg_rating || 0) - Number(left?.avg_rating || 0);
    if (ratingDiff !== 0) return ratingDiff;
    return Number(right?.review_count || 0) - Number(left?.review_count || 0);
  });
}

export function pickTop(list = [], count = 6) {
  return list.slice(0, count);
}

export function hasFamilyFeature(item) {
  return Boolean(
    item?.facilities?.restroom
    || item?.facilities?.stroller_friendly
    || item?.facilities?.food
  );
}

export function hasPoiLocation(item) {
  const lat = Number(item?.location?.lat || 0);
  const lng = Number(item?.location?.lng || 0);
  return lat > 0 && lng > 0;
}

export function openPoiMap(item) {
  if (!hasPoiLocation(item)) {
    uni.showToast({ title: '该地点暂无地图坐标', icon: 'none' });
    return;
  }
  uni.openLocation({
    latitude: Number(item.location.lat),
    longitude: Number(item.location.lng),
    name: item?.name || '地点位置',
    address: [item?.city, item?.district, item?.address].filter(Boolean).join(' '),
    scale: 16,
  });
}
