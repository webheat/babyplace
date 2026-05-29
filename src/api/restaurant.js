import { detailPoi } from '@/api/poi';

const restaurantObject = uniCloud.importObject('restaurant');

function ok(data = {}, message = 'ok') {
  return { code: 0, message, data };
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildFallbackRestaurants(place = {}, limit = 6) {
  const district = String(place?.district || place?.city || '').trim();
  const baseLat = toNumber(place?.location?.lat, 0);
  const baseLng = toNumber(place?.location?.lng, 0);
  const source = [
    { name: '亲子餐厅', category: '亲子餐饮', avg_price: 88, rating: 4.6, distance: 260, tags: ['亲子友好', '宝宝椅', '可推车'] },
    { name: '轻食咖啡', category: '咖啡轻食', avg_price: 52, rating: 4.4, distance: 420, tags: ['相对安静', '可推车'] },
    { name: '家庭茶点', category: '粤式茶点', avg_price: 76, rating: 4.5, distance: 630, tags: ['亲子友好', '空间大'] },
    { name: '儿童友好餐吧', category: '简餐', avg_price: 68, rating: 4.3, distance: 790, tags: ['儿童餐', '可推车'] },
    { name: '安静小馆', category: '家常菜', avg_price: 62, rating: 4.2, distance: 960, tags: ['相对安静'] },
    { name: '大空间餐厅', category: '家庭聚餐', avg_price: 98, rating: 4.5, distance: 1180, tags: ['空间大', '亲子友好'] },
  ];

  return source.slice(0, limit).map((item, index) => ({
    _id: `fallback-${place?._id || 'place'}-${index + 1}`,
    place_id: place?._id || '',
    source: 'fallback',
    name: `${district}${item.name}`,
    category: item.category,
    avg_price: item.avg_price,
    rating: item.rating,
    distance: item.distance,
    tags: item.tags,
    coupon_info: index % 2 === 0 ? '当前展示为兜底推荐，可先到店咨询优惠' : '',
    note: '未命中在线餐厅接口时的本地兜底推荐',
    lat: baseLat ? baseLat + (index + 1) * 0.00035 : 0,
    lng: baseLng ? baseLng + (index + 1) * 0.00035 : 0,
    address: [place?.city, district, `距${place?.name || '当前地点'}步行约${6 + index * 2}分钟`].filter(Boolean).join(' '),
    score: Number((0.95 - index * 0.08).toFixed(2)),
  }));
}

async function buildFallbackResult(placeId, params = {}) {
  const detailResult = await detailPoi(placeId);
  const poi = detailResult?.code === 0 ? (detailResult.data?.poi || {}) : {};
  const list = buildFallbackRestaurants(poi, Math.max(1, Number(params.limit || 6)));
  return ok({
    list,
    place_id: placeId,
    source: 'fallback',
    cache_hit: false,
  });
}

export async function listRestaurantByPlace(placeId, params = {}) {
  try {
    const result = await restaurantObject.listByPlace({ place_id: placeId, ...params });
    if (result?.code === 0) return result;
  } catch (error) {
    console.error('restaurant.listByPlace importObject failed, fallback to local result', error);
  }
  return buildFallbackResult(placeId, params);
}

export async function getRestaurantLink(restaurantId, params = {}) {
  try {
    const result = await restaurantObject.getLink({ restaurant_id: restaurantId, ...params });
    if (result?.code === 0) return result;
  } catch (error) {
    console.error('restaurant.getLink importObject failed, fallback to search url', error);
  }
  return ok({
    restaurant_id: restaurantId,
    jump_url: '',
    coupon_info: '联盟链接待接入，可复制餐厅名后手动搜索',
    keyword: '',
    mode: 'copy',
    app_id: '',
    page_path: '',
    source: 'fallback',
  });
}

export async function trackRestaurantEvent(payload = {}) {
  try {
    const result = await restaurantObject.track(payload);
    if (result?.code === 0) return result;
  } catch (error) {
    console.error('restaurant.track importObject failed, ignore event', error);
  }
  return ok({}, 'ignored');
}

export async function getRestaurantDashboard(params = {}) {
  try {
    const result = await restaurantObject.dashboard(params);
    if (result?.code === 0) return result;
  } catch (error) {
    console.error('restaurant.dashboard importObject failed', error);
  }
  return {
    code: -1,
    message: 'dashboard unavailable',
    data: {
      days: Number(params.days || 7),
      summary: {
        total: 0,
        restaurant_click: 0,
        meituan_jump_click: 0,
        conversion_rate: 0,
      },
      by_day: [],
      by_platform: [],
      top_restaurants: [],
      top_pois: [],
      recent: [],
    },
  };
}
