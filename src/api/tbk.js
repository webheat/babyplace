import { getGoodsDetail, listGoods } from './goods';
import { mapGoodsItem } from '@/services/taobao.service';

export default {
  async search(params = {}) {
    try {
      const result = await listGoods({
        keyword: params.keyword || params.q || '',
        page: params.page || 1,
        pageSize: params.pageSize || 20,
      });
      if (result.code !== 0) {
        return { code: 500, message: result.message || 'search failed', data: { records: [] } };
      }
      const records = (result.data?.list || []).map(mapGoodsItem);
      return { code: 200, message: 'ok', data: { records, list: records, total: result.data?.total || records.length } };
    } catch (error) {
      uni.showToast({ title: error?.message || '搜索失败', icon: 'none' });
      return { code: 500, message: 'search failed', data: { records: [] } };
    }
  },

  async getItemCoupon(itemId) {
    try {
      const result = await getGoodsDetail(itemId);
      if (result.code !== 0) return { code: 500, message: result.message || 'detail failed', data: [] };
      return { code: 200, message: 'ok', data: [{
        couponAmount: '0',
        couponInfo: '当前未配置券信息',
        item: mapGoodsItem(result.data || {}),
      }] };
    } catch (error) {
      uni.showToast({ title: error?.message || '获取优惠券失败', icon: 'none' });
      return { code: 500, message: 'detail failed', data: [] };
    }
  },

  async getItemInfo(itemId) {
    try {
      const result = await getGoodsDetail(itemId);
      if (result.code !== 0) return { code: 500, message: result.message || 'detail failed', data: {} };
      return { code: 200, message: 'ok', data: mapGoodsItem(result.data || {}) };
    } catch (error) {
      uni.showToast({ title: error?.message || '获取商品信息失败', icon: 'none' });
      return { code: 500, message: 'detail failed', data: {} };
    }
  },

  async getTaoCode(itemId) {
    try {
      const result = await getGoodsDetail(itemId);
      const name = result.code === 0 ? result.data?.name : '商品';
      return { code: 200, message: 'ok', data: { model: `${name || '商品'} - babyplace` } };
    } catch (error) {
      uni.showToast({ title: error?.message || '获取淘口令失败', icon: 'none' });
      return { code: 200, message: 'ok', data: { model: '商品 - babyplace' } };
    }
  },
};
