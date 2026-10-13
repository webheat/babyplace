'use strict';

const createConfig = require('uni-config-center');

const amapConfig = createConfig({
  pluginId: 'amap',
  defaultConfig: {
    key: '',
    poiAroundUrl: 'https://restapi.amap.com/v3/place/around',
    restaurantType: '050000',
    restaurantRadius: 2000,
    restaurantOffset: 20,
    extensions: 'all',
    timeout: 15000,
  },
});

const meituanConfig = createConfig({
  pluginId: 'meituan',
  defaultConfig: {
    appKey: '',
    waimaiMiniAppId: 'wxde8ac0a21135c07d',
    youxuanMiniAppId: 'wx77af438b3505c00e',
    defaultSidPrefix: 'babyplace',
    defaultActivityUrl: 'https://i.meituan.com/awp/hfe/block/d96243aa3d49acef70d9/81974/index.html',
    runionUrl: 'https://runion.meituan.com/url',
    enableToken: false,
  },
});

const db = uniCloud.database();
const dbCmd = db.command;
const restaurantCollection = db.collection('babyplace-restaurant');
const poiCollection = db.collection('babyplace-poi');
const eventLogCollection = db.collection('babyplace-event-log');

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LIMIT = 20;

function ok(data, message = 'ok') {
  return { code: 0, message, data };
}

function fail(code, message, data = null) {
  return { code, message, data };
}

function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeArray(value) {
  return Array.isArray(value)
    ? value.map((item) => sanitizeString(item)).filter(Boolean)
    : [];
}

function encodeUrl(value) {
  return encodeURIComponent(String(value || ''));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toInteger(value, fallback = 0) {
  const num = Number(value);
  return Number.isInteger(num) ? num : fallback;
}

function toTimestampMs(value) {
  if (!value) return 0;
  if (typeof value.getTime === 'function') return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }
  if (typeof value === 'object' && typeof value.valueOf === 'function') {
    const result = value.valueOf();
    return typeof result === 'number' ? result : 0;
  }
  return 0;
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

function normalizeName(value) {
  return sanitizeString(value)
    .toLowerCase()
    .replace(/[（）()·,，.。:：/\\\-\s]/g, '');
}

function levenshteinDistance(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  const dp = new Array(m + 1).fill(0);
  for (let j = 0; j <= m; j++) dp[j] = j;
  for (let i = 1; i <= n; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= m; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1);
      prev = temp;
    }
  }
  return dp[m];
}

function calcNameSimilarity(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshteinDistance(left, right);
  const maxLength = Math.max(left.length, right.length);
  return maxLength ? 1 - distance / maxLength : 0;
}

function parseLocationText(text = '') {
  const parts = sanitizeString(text).split(',');
  if (parts.length !== 2) {
    return { lat: 0, lng: 0 };
  }
  return {
    lng: toNumber(parts[0], 0),
    lat: toNumber(parts[1], 0),
  };
}

function buildTagMeta(item = {}) {
  const keyword = [
    item.name,
    item.category,
    item.address,
    ...(item.tags || []),
  ].join(' ');
  const text = sanitizeString(keyword).toLowerCase();
  const avgPrice = toNumber(item.avg_price, 0);
  const rating = toNumber(item.rating, 0);

  const tagMeta = {
    kid_friendly: /亲子|家庭|儿童|宝贝|萌娃/.test(text) || avgPrice <= 120 || rating >= 4.3,
    baby_chair: /宝宝椅|婴儿椅|亲子/.test(text),
    stroller_ok: /商场|中心|广场|咖啡|餐厅|亲子/.test(text),
    quiet: /咖啡|茶|庭院|书吧|西餐/.test(text),
    kids_menu: /儿童餐|亲子|家庭套餐/.test(text),
    space_large: /广场|商场|中心|酒家|农庄|花园/.test(text) || avgPrice >= 80,
  };

  if (tagMeta.kid_friendly && !tagMeta.stroller_ok) {
    tagMeta.stroller_ok = true;
  }
  return tagMeta;
}

function buildDisplayTags(tagMeta = {}, item = {}) {
  const tags = [];
  if (tagMeta.kid_friendly) tags.push('亲子友好');
  if (tagMeta.baby_chair) tags.push('宝宝椅');
  if (tagMeta.stroller_ok) tags.push('可推车');
  if (tagMeta.quiet) tags.push('相对安静');
  if (tagMeta.kids_menu) tags.push('儿童餐');
  if (tagMeta.space_large) tags.push('空间大');
  if (toNumber(item.avg_price, 0) > 0) tags.push(`人均${Math.round(toNumber(item.avg_price, 0))}`);
  if (toNumber(item.distance, 0) > 0) tags.push(`${Math.round(toNumber(item.distance, 0))}m`);
  return tags.slice(0, 6);
}

function normalizeScore(item = {}) {
  const distance = Math.max(0, toNumber(item.distance, 0));
  const rating = Math.max(0, Math.min(5, toNumber(item.rating, 0)));
  const tagMeta = item.tag_meta || {};
  const distanceScore = distance <= 0 ? 0.4 : Math.max(0, 1 - distance / 3000);
  const ratingScore = rating / 5;
  const kidScore = [
    tagMeta.kid_friendly,
    tagMeta.baby_chair,
    tagMeta.stroller_ok,
    tagMeta.quiet,
    tagMeta.kids_menu,
    tagMeta.space_large,
  ].filter(Boolean).length / 6;
  const couponScore = sanitizeString(item.coupon_info) ? 1 : 0;
  return Number((0.4 * distanceScore + 0.2 * ratingScore + 0.2 * kidScore + 0.2 * couponScore).toFixed(4));
}

function normalizeRestaurantItem(raw = {}, place = {}, source = 'fallback') {
  const location = parseLocationText(raw.location || '');
  const lat = toNumber(raw.lat, location.lat);
  const lng = toNumber(raw.lng, location.lng);
  const placeLat = toNumber(place.location?.lat, 0);
  const placeLng = toNumber(place.location?.lng, 0);
  const distance = raw.distance !== undefined
    ? Math.max(0, toNumber(raw.distance, 0))
    : (lat && lng && placeLat && placeLng ? calcDistanceMeters(placeLat, placeLng, lat, lng) : 0);
  const avgPrice = Math.max(0, toNumber(raw.avg_price ?? raw.cost, 0));
  const rating = Math.max(0, Math.min(5, toNumber(raw.rating, 0)));
  const item = {
    place_id: sanitizeString(place._id),
    source_id: sanitizeString(raw.source_id || raw.id),
    source,
    name: sanitizeString(raw.name),
    lat,
    lng,
    address: sanitizeString(raw.address),
    tel: sanitizeString(raw.tel),
    category: sanitizeString(raw.category || raw.type),
    avg_price: avgPrice,
    rating,
    distance,
    coupon_info: sanitizeString(raw.coupon_info),
    jump_url: sanitizeString(raw.jump_url),
    note: sanitizeString(raw.note),
    status: 'active',
  };
  item.tag_meta = buildTagMeta(item);
  item.tags = buildDisplayTags(item.tag_meta, item);
  item.score = normalizeScore(item);
  return item;
}

function dedupeRestaurants(list = []) {
  const result = [];
  for (let i = 0; i < list.length; i++) {
    const current = list[i];
    if (!current?.name) continue;
    const duplicateIndex = result.findIndex((item) => {
      const similarity = calcNameSimilarity(item.name, current.name);
      const distance = calcDistanceMeters(
        toNumber(item.lat, 0),
        toNumber(item.lng, 0),
        toNumber(current.lat, 0),
        toNumber(current.lng, 0),
      );
      return similarity > 0.8 && distance < 50;
    });
    if (duplicateIndex === -1) {
      result.push(current);
      continue;
    }
    if (result[duplicateIndex].source !== 'gaode' && current.source === 'gaode') {
      result.splice(duplicateIndex, 1, current);
    }
  }
  return result;
}

function rankRestaurants(list = []) {
  return list
    .map((item) => {
      const normalized = {
        ...item,
        tag_meta: item.tag_meta || buildTagMeta(item),
      };
      normalized.tags = sanitizeArray(item.tags).length
        ? sanitizeArray(item.tags)
        : buildDisplayTags(normalized.tag_meta, normalized);
      normalized.score = normalizeScore(normalized);
      return normalized;
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.distance !== right.distance) return left.distance - right.distance;
      return right.rating - left.rating;
    });
}

function buildSid(seed = '') {
  const prefix = sanitizeString(meituanConfig.config('defaultSidPrefix')) || 'babyplace';
  const raw = `${prefix}${sanitizeString(seed).toLowerCase()}`.replace(/[^a-z0-9]/g, '');
  return (raw || `${prefix}0`).slice(0, 64);
}

function buildMeituanPromoLinks(seed = '') {
  const appKey = sanitizeString(meituanConfig.config('appKey'));
  if (!appKey) {
    return null;
  }

  const sid = buildSid(seed);
  const activityUrl = sanitizeString(meituanConfig.config('defaultActivityUrl'))
    || 'https://i.meituan.com/awp/hfe/block/d96243aa3d49acef70d9/81974/index.html';
  const runionUrl = sanitizeString(meituanConfig.config('runionUrl'))
    || 'https://runion.meituan.com/url';
  const waimaiMiniAppId = sanitizeString(meituanConfig.config('waimaiMiniAppId')) || 'wxde8ac0a21135c07d';
  const enableToken = Boolean(meituanConfig.config('enableToken'));

  const sourceActivityUrl = `${activityUrl}${activityUrl.includes('?') ? '&' : '?'}appkey=${encodeUrl(`${appKey}:${sid}`)}`;
  const runionLink = `${runionUrl}?key=${encodeUrl(appKey)}&url=${encodeUrl(sourceActivityUrl)}&sid=${encodeUrl(sid)}`;
  let pagePath = `/index/pages/h5/h5?weburl=${encodeUrl(runionLink)}`;
  if (enableToken) {
    pagePath += '&f_token=1&f_userId=1';
  }

  return {
    appKey,
    sid,
    h5_url: runionLink,
    mini_app_id: waimaiMiniAppId,
    mini_program_path: pagePath,
    activity_url: activityUrl,
  };
}

function buildFallbackRestaurants(place = {}, limit = 6) {
  const categories = [
    { name: '亲子餐厅', category: '亲子餐饮', price: 88, rating: 4.6, coupon: '到店套餐可咨询' },
    { name: '轻食咖啡', category: '咖啡轻食', price: 52, rating: 4.4, coupon: '' },
    { name: '家庭茶点', category: '粤式茶点', price: 76, rating: 4.5, coupon: '工作日更合适' },
    { name: '儿童友好餐吧', category: '简餐', price: 68, rating: 4.3, coupon: '' },
    { name: '安静小馆', category: '家常菜', price: 62, rating: 4.2, coupon: '' },
    { name: '大空间餐厅', category: '家庭聚餐', price: 98, rating: 4.5, coupon: '适合周末聚餐' },
  ];
  const baseLat = toNumber(place.location?.lat, 0);
  const baseLng = toNumber(place.location?.lng, 0);
  const district = sanitizeString(place.district || place.city);

  return categories.slice(0, limit).map((item, index) => {
    const offset = (index + 1) * 0.00035;
    return normalizeRestaurantItem({
      id: `fallback-${place._id || 'place'}-${index + 1}`,
      name: `${district}${item.name}`,
      lat: baseLat ? baseLat + offset : 0,
      lng: baseLng ? baseLng + offset : 0,
      address: [place.city, district, `距${sanitizeString(place.name) || '当前地点'}步行约${6 + index * 2}分钟`].filter(Boolean).join(' '),
      category: item.category,
      avg_price: item.price,
      rating: item.rating,
      distance: 260 + index * 180,
      coupon_info: item.coupon,
      note: '未命中在线餐厅接口时的本地兜底推荐',
    }, place, 'fallback');
  });
}

function sanitizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function formatDayKey(value) {
  const date = new Date(toTimestampMs(value) || Date.now());
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDateRange(days = 7) {
  const safeDays = Math.max(1, Math.min(90, toInteger(days, 7)));
  const startMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  return {
    days: safeDays,
    startDate: new Date(startMs),
  };
}

function pickTopEntries(map = {}, limit = 10, keyName = 'name') {
  return Object.keys(map)
    .map((key) => ({ [keyName]: key, ...map[key] }))
    .sort((left, right) => right.count - left.count)
    .slice(0, Math.max(1, Math.min(50, toInteger(limit, 10))));
}

function summarizeEventList(list = []) {
  const summary = {
    total: list.length,
    restaurant_click: 0,
    meituan_jump_click: 0,
  };
  const byDayMap = {};
  const byPlatformMap = {};
  const restaurantMap = {};
  const poiMap = {};

  list.forEach((item) => {
    const eventName = sanitizeString(item.event_name);
    const platform = sanitizeString(item.platform) || 'unknown';
    const day = formatDayKey(item.created_at);
    const restaurantName = sanitizeString(item.restaurant_name) || '未命名餐厅';
    const poiId = sanitizeString(item.poi_id) || 'unknown';

    if (eventName === 'restaurant_click') summary.restaurant_click += 1;
    if (eventName === 'meituan_jump_click') summary.meituan_jump_click += 1;

    if (!byDayMap[day]) {
      byDayMap[day] = { day, total: 0, restaurant_click: 0, meituan_jump_click: 0 };
    }
    byDayMap[day].total += 1;
    if (eventName === 'restaurant_click') byDayMap[day].restaurant_click += 1;
    if (eventName === 'meituan_jump_click') byDayMap[day].meituan_jump_click += 1;

    if (!byPlatformMap[platform]) {
      byPlatformMap[platform] = { platform, count: 0 };
    }
    byPlatformMap[platform].count += 1;

    const restaurantKey = `${restaurantName}__${sanitizeString(item.restaurant_id)}`;
    if (!restaurantMap[restaurantKey]) {
      restaurantMap[restaurantKey] = {
        restaurant_name: restaurantName,
        restaurant_id: sanitizeString(item.restaurant_id),
        count: 0,
        jump_count: 0,
      };
    }
    restaurantMap[restaurantKey].count += 1;
    if (eventName === 'meituan_jump_click') restaurantMap[restaurantKey].jump_count += 1;

    if (!poiMap[poiId]) {
      poiMap[poiId] = {
        poi_id: poiId,
        count: 0,
        jump_count: 0,
      };
    }
    poiMap[poiId].count += 1;
    if (eventName === 'meituan_jump_click') poiMap[poiId].jump_count += 1;
  });

  const conversionRate = summary.restaurant_click
    ? Number((summary.meituan_jump_click / summary.restaurant_click * 100).toFixed(2))
    : 0;

  return {
    summary: {
      ...summary,
      conversion_rate: conversionRate,
    },
    by_day: Object.keys(byDayMap)
      .map((key) => byDayMap[key])
      .sort((left, right) => left.day.localeCompare(right.day)),
    by_platform: pickTopEntries(byPlatformMap, 10, 'platform'),
    top_restaurants: pickTopEntries(restaurantMap, 10, 'key').map((item) => ({
      restaurant_name: item.restaurant_name,
      restaurant_id: item.restaurant_id,
      count: item.count,
      jump_count: item.jump_count,
    })),
    top_pois: pickTopEntries(poiMap, 10, 'poi_id').map((item) => ({
      poi_id: item.poi_id,
      count: item.count,
      jump_count: item.jump_count,
    })),
  };
}

async function getPlace(placeId) {
  const result = await poiCollection.doc(placeId).get();
  return (result.data || [])[0] || null;
}

async function getCachedRestaurants(placeId) {
  const result = await restaurantCollection
    .where({ place_id: placeId, status: 'active' })
    .orderBy('updated_at', 'desc')
    .limit(100)
    .get();
  return result.data || [];
}

async function replaceRestaurants(placeId, list = []) {
  const now = db.serverDate();
  const existing = await restaurantCollection.where({ place_id: placeId }).get();
  const existingList = existing.data || [];
  for (let i = 0; i < existingList.length; i++) {
    await restaurantCollection.doc(existingList[i]._id).remove();
  }
  for (let i = 0; i < list.length; i++) {
    await restaurantCollection.add({
      ...list[i],
      fetched_at: now,
      created_at: now,
      updated_at: now,
    });
  }
}

async function fetchGaodeRestaurants(place = {}, params = {}) {
  const key = sanitizeString(amapConfig.config('key'));
  if (!key) return [];

  const lat = toNumber(place.location?.lat, NaN);
  const lng = toNumber(place.location?.lng, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const poiAroundUrl = sanitizeString(amapConfig.config('poiAroundUrl')) || 'https://restapi.amap.com/v3/place/around';
  const restaurantType = sanitizeString(amapConfig.config('restaurantType')) || '050000';
  const radius = Math.max(300, Math.min(5000, toInteger(params.radius, toInteger(amapConfig.config('restaurantRadius'), 2000))));
  const offset = Math.max(1, Math.min(MAX_LIMIT, toInteger(params.limit, toInteger(amapConfig.config('restaurantOffset'), 20))));
  const timeout = Math.max(3000, toInteger(amapConfig.config('timeout'), 15000));

  try {
    const response = await uniCloud.httpclient.request(poiAroundUrl, {
      method: 'GET',
      dataType: 'json',
      timeout,
      data: {
        key,
        location: `${lng},${lat}`,
        radius,
        types: restaurantType,
        offset,
        page: 1,
        extensions: 'all',
        sortrule: 'distance',
        output: 'json',
      },
    });
    if (response.status !== 200) return [];
    const data = response.data || {};
    if (sanitizeString(data.status) !== '1') return [];
    const pois = Array.isArray(data.pois) ? data.pois : [];
    return pois.map((item) => normalizeRestaurantItem({
      id: item.id,
      name: item.name,
      location: item.location,
      address: item.address,
      tel: item.tel,
      category: item.type,
      cost: item.biz_ext?.cost,
      rating: item.biz_ext?.rating,
      distance: item.distance,
      jump_url: `https://www.meituan.com/s/${encodeURIComponent(sanitizeString(item.name))}/`,
    }, place, 'gaode'));
  } catch (error) {
    return [];
  }
}

module.exports = {
  async listByPlace(params = {}) {
    const placeId = sanitizeString(params.place_id || params.placeId);
    if (!placeId) return fail(400, 'place_id is required');

    const place = await getPlace(placeId);
    if (!place) return fail(404, 'place not found');

    const cached = await getCachedRestaurants(placeId);
    const cachedSorted = rankRestaurants(cached);
    const latestCachedAt = cachedSorted.length ? toTimestampMs(cachedSorted[0].updated_at) : 0;
    const isFresh = latestCachedAt && (Date.now() - latestCachedAt < CACHE_TTL_MS);

    if (isFresh) {
      return ok({
        list: cachedSorted.slice(0, Math.max(1, Math.min(MAX_LIMIT, toInteger(params.limit, 10)))),
        place_id: placeId,
        source: 'cache',
        cache_hit: true,
      });
    }

    const fetched = await fetchGaodeRestaurants(place, params);
    let merged = dedupeRestaurants(fetched);
    let source = 'gaode';

    if (!merged.length) {
      merged = dedupeRestaurants(buildFallbackRestaurants(place, Math.max(6, toInteger(params.limit, 10))));
      source = 'fallback';
    }

    const ranked = rankRestaurants(merged).slice(0, Math.max(1, Math.min(MAX_LIMIT, toInteger(params.limit, 10))));

    if (ranked.length) {
      await replaceRestaurants(placeId, ranked);
      const refreshed = rankRestaurants(await getCachedRestaurants(placeId));
      return ok({
        list: refreshed.slice(0, Math.max(1, Math.min(MAX_LIMIT, toInteger(params.limit, 10)))),
        place_id: placeId,
        source,
        cache_hit: false,
      });
    }

    if (cachedSorted.length) {
      return ok({
        list: cachedSorted.slice(0, Math.max(1, Math.min(MAX_LIMIT, toInteger(params.limit, 10)))),
        place_id: placeId,
        source: 'stale-cache',
        cache_hit: true,
      });
    }

    return ok({
      list: [],
      place_id: placeId,
      source: 'empty',
      cache_hit: false,
    });
  },

  async getLink(params = {}) {
    const restaurantId = sanitizeString(params.restaurant_id || params.id);
    if (!restaurantId) return fail(400, 'restaurant_id is required');

    const result = await restaurantCollection.doc(restaurantId).get();
    const item = (result.data || [])[0];
    if (!item) return fail(404, 'restaurant not found');

    const searchKeyword = sanitizeString([item.name, item.address].filter(Boolean).join(' '));
    const promo = buildMeituanPromoLinks(restaurantId || item.place_id || item.name);
    const jumpUrl = promo?.h5_url || sanitizeString(item.jump_url) || `https://www.meituan.com/s/${encodeURIComponent(item.name || searchKeyword)}/`;
    return ok({
      restaurant_id: restaurantId,
      jump_url: jumpUrl,
      coupon_info: sanitizeString(item.coupon_info) || (promo ? '已生成联盟跳转链接' : '联盟链接待接入，先返回搜索页'),
      keyword: searchKeyword,
      mode: promo ? 'mini-program' : 'web',
      app_id: promo?.mini_app_id || '',
      page_path: promo?.mini_program_path || '',
      sid: promo?.sid || '',
      activity_url: promo?.activity_url || '',
      source: item.source || 'fallback',
    });
  },

  async track(params = {}) {
    const eventName = sanitizeString(params.event_name || params.eventName);
    if (!eventName) return fail(400, 'event_name is required');

    const payload = {
      event_name: eventName,
      poi_id: sanitizeString(params.poi_id || params.poiId),
      restaurant_id: sanitizeString(params.restaurant_id || params.restaurantId),
      restaurant_name: sanitizeString(params.restaurant_name || params.restaurantName),
      platform: sanitizeString(params.platform),
      scene: sanitizeString(params.scene),
      target_type: sanitizeString(params.target_type || params.targetType),
      target_value: sanitizeString(params.target_value || params.targetValue),
      meta: sanitizeObject(params.meta),
      created_at: db.serverDate(),
    };

    await eventLogCollection.add(payload);
    return ok({ event_name: eventName });
  },

  async dashboard(params = {}) {
    const range = createDateRange(params.days);
    const pageSize = Math.max(20, Math.min(500, toInteger(params.page_size || params.pageSize, 200)));
    const eventName = sanitizeString(params.event_name || params.eventName);
    const where = {
      created_at: dbCmd.gte(range.startDate),
    };
    if (eventName) {
      where.event_name = eventName;
    }

    const result = await eventLogCollection
      .where(where)
      .orderBy('created_at', 'desc')
      .limit(pageSize)
      .get();

    const list = result.data || [];
    const stats = summarizeEventList(list);
    const recent = list.slice(0, 50).map((item) => ({
      _id: item._id,
      event_name: sanitizeString(item.event_name),
      poi_id: sanitizeString(item.poi_id),
      restaurant_id: sanitizeString(item.restaurant_id),
      restaurant_name: sanitizeString(item.restaurant_name),
      platform: sanitizeString(item.platform),
      scene: sanitizeString(item.scene),
      target_type: sanitizeString(item.target_type),
      target_value: sanitizeString(item.target_value),
      created_at: item.created_at,
    }));

    return ok({
      days: range.days,
      query: {
        event_name: eventName,
        page_size: pageSize,
      },
      ...stats,
      recent,
    });
  },
};
