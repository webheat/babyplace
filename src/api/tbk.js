import { getGoodsDetail, listGoods } from './goods';

function ok(data = {}, message = 'ok') {
  return Promise.resolve({ code: 200, message, data });
}

function mapGoodsItem(item = {}) {
  return {
    itemId: item._id,
    title: item.name || '未命名商品',
    pictUrl: item.cover || item.image || '/static/logo.png',
    itemDescription: item.address || item.summary || '',
    zkFinalPrice: '0',
    reservePrice: '0',
    couponAmount: '0',
    clickUrl: '',
    miniProgramUrl: '',
    nick: 'babyplace',
    raw: item,
  };
}

export default {
  async search(params = {}) {
    const result = await listGoods({
      keyword: params.keyword || params.q || '',
      page: params.page || 1,
      pageSize: params.pageSize || 20,
    });
    if (result.code !== 0) {
      return { code: 500, message: result.message || 'search failed', data: { records: [] } };
    }
    const records = (result.data?.list || []).map(mapGoodsItem);
    return ok({
      records,
      list: records,
      total: result.data?.total || records.length,
    });
  },

  async getItemCoupon(itemId) {
    const result = await getGoodsDetail(itemId);
    if (result.code !== 0) return { code: 500, message: result.message || 'detail failed', data: [] };
    return ok([{
      couponAmount: '0',
      couponInfo: '当前未配置券信息',
      item: mapGoodsItem(result.data || {}),
    }]);
  },

  async getItemInfo(itemId) {
    const result = await getGoodsDetail(itemId);
    if (result.code !== 0) return { code: 500, message: result.message || 'detail failed', data: {} };
    return ok(mapGoodsItem(result.data || {}));
  },

  async getTaoCode(itemId) {
    const result = await getGoodsDetail(itemId);
    const name = result.code === 0 ? result.data?.name : '商品';
    return ok({
      model: `${name || '商品'} - babyplace`,
    });
  },
};
