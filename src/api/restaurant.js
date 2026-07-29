import { detailPoi } from './poi';
import { buildFallbackRestaurants } from './_mocks/restaurant.js';

async function buildFallbackResult(placeId, params = {}) {
  const detailResult = await detailPoi(placeId);
  const poi = detailResult?.code === 0 ? (detailResult.data?.poi || {}) : {};
  const list = buildFallbackRestaurants(poi, Math.max(1, Number(params.limit || 6)));
  return {
    code: 0,
    message: 'ok',
    data: {
      list,
      place_id: placeId,
      source: 'fallback',
      cache_hit: false,
    },
  };
}

export async function listRestaurantByPlace(placeId, params = {}) {
  return buildFallbackResult(placeId, params);
}

export async function getRestaurantLink(restaurantId) {
  return {
    code: 0,
    message: 'ok',
    data: {
      restaurant_id: restaurantId,
      jump_url: '',
      coupon_info: '联盟链接待接入，可复制餐厅名后手动搜索',
      keyword: '',
      mode: 'copy',
      app_id: '',
      page_path: '',
      source: 'fallback',
    },
  };
}

export async function trackRestaurantEvent() {
  return { code: 0, message: 'ok', data: {} };
}

export async function getRestaurantDashboard(params = {}) {
  return {
    code: 0,
    message: 'ok',
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
