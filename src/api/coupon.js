import { listPoi } from './poi';

function buildCouponItem(item = {}, index = 0, type = 'meituan') {
  const color = type === 'ele' ? '#11c296' : '#ff6100';
  return {
    id: item._id || `${type}-${index + 1}`,
    title: item.name || (type === 'ele' ? '领券看雨天好去处' : '领券看热门榜单'),
    subtitle: item.summary || item.recommend_reason || '精选推荐',
    qrcode: item.cover_image || '/static/logo.png',
    url: '',
    appid: '',
    path: '',
    color,
    tag: type === 'ele' ? '雨天友好' : '人气推荐',
    poiId: item._id || '',
    city: item.city || '',
    district: item.district || '',
  };
}

async function loadCouponList(type) {
  const result = await listPoi({ page: 1, pageSize: 6 });
  const list = result.data?.list || [];
  let filtered = list;
  if (type === 'ele') {
    filtered = list.filter((item) => item?.indoor || item?.facilities?.rainy_day_ok);
  }
  if (!filtered.length) {
    filtered = list;
  }
  return filtered.slice(0, 3).map((item, index) => buildCouponItem(item, index, type));
}

export default {
  async eleCoupon() {
    const list = await loadCouponList('ele');
    return { code: 200, message: 'ok', data: list };
  },

  async meituanCoupon() {
    const list = await loadCouponList('meituan');
    return { code: 200, message: 'ok', data: list };
  },
};
