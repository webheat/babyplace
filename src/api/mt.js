import { listPoi, detailPoi, nearbyPoi } from './poi';

function ok(data = {}, message = 'ok') { return Promise.resolve({ code: 200, message, data }); }

function toCategoryItem(name = '', index = 0) {
  return {
    id: String(index + 1),
    name: name || '全部',
    title: name || '全部',
  };
}

function buildShopRecord(poi = {}) {
  return {
    shopInfo: {
      shopId: poi._id,
      shopName: poi.name,
      shopPower: Number(poi.avg_rating || 0) * 10,
      cateName: poi.category || '亲子地点',
      regionName: poi.district || poi.city || '',
      address: [poi.city, poi.district, poi.address].filter(Boolean).join(' '),
      bizHourDesc: poi.recommended_duration || '',
      pricePerson: 0,
      distanceToShow: poi.distance ? `${Math.round(Number(poi.distance))}m` : '',
    },
    dealDetail: {},
    dealBaseInfo: {
      defaultPic: poi.cover_image || '/static/logo.png',
      dealTitle: poi.summary || poi.recommend_reason || poi.name,
      finalPrice: 0,
      marketPrice: 0,
    },
    couponInfo: {
      miniProgramUrl: '',
    },
    poi,
  };
}

export default {
  miniAppId() { return ok('wx-babyplace-demo'); },
  ip2city(_lng, _lat) { return ok({ city: '全国', cityId: '0' }); },
  async cityCategories(_cityId, _cat0Id) {
    const result = await listPoi({ page: 1, pageSize: 50 });
    const list = result.data?.list || [];
    const set = new Set();
    list.forEach((item) => {
      const name = item.category || '亲子地点';
      if (name) set.add(name);
    });
    const categories = Array.from(set).map((name, index) => toCategoryItem(name, index));
    return ok(categories.length ? categories : [toCategoryItem('亲子地点', 0)]);
  },
  async dealsSearch(params = {}) {
    if (params.shopIds) {
      const result = await detailPoi(params.shopIds);
      if (result.code !== 0) return ok({ page: 1, recordCount: 0, records: [] });
      const poi = result.data?.poi || {};
      return ok({
        page: 1,
        recordCount: poi._id ? 1 : 0,
        records: poi._id ? [buildShopRecord(poi)] : [],
      });
    }
    const result = params.lat && params.lng
      ? await nearbyPoi({ lat: params.lat, lng: params.lng, radius: params.radii || 5000, page: params.page || 1, pageSize: 20 })
      : await listPoi({ page: params.page || 1, pageSize: 20, keyword: params.keywords || '' });
    let list = result.data?.list || [];
    if (params.cat0Id) {
      const categoryId = String(params.cat0Id);
      const categories = await this.cityCategories(params.cityId, params.cat0Id);
      const target = (categories.data || []).find((item) => String(item.id) === categoryId);
      if (target?.name) {
        list = list.filter((item) => (item.category || '亲子地点') === target.name);
      }
    }
    return ok({
      page: Number(result.data?.page || 1),
      recordCount: Number(result.data?.total || list.length),
      records: list.map((poi) => buildShopRecord(poi)),
    });
  },
};
