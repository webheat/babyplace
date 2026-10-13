import { listPoi } from './poi';

function buildMessage(item = {}, index = 0) {
  return {
    id: item._id || String(index + 1),
    title: item.name || '系统消息',
    content: item.recommend_reason || item.summary || '地点信息已更新',
    created_at: item.updated_at || item.created_at || Date.now(),
    read_flag: false,
  };
}

export default {
  async getSysMessageList() {
    try {
      const articleResult = await listPoi({ page: 1, pageSize: 20 });
      return { code: 200, message: 'ok', data: (articleResult.data?.list || []).slice(0, 20).map((item, index) => ({
        id: item._id || String(index + 1),
        title: item.name || '系统消息',
        content: item.recommend_reason || item.summary || '内容已更新',
        created_at: item.updated_at || item.created_at || Date.now(),
        read_flag: false,
      })) };
    } catch (error) {
      uni.showToast({ title: error?.message || '加载消息失败', icon: 'none' });
      return { code: 200, message: 'ok', data: [] };
    }
  },

  async getSysMessageChat() {
    try {
      const result = await listPoi({ page: 1, pageSize: 10 });
      return { code: 200, message: 'ok', data: (result.data?.list || []).map(buildMessage) };
    } catch (error) {
      uni.showToast({ title: error?.message || '加载消息失败', icon: 'none' });
      return { code: 200, message: 'ok', data: [] };
    }
  },

  clearSysMessageChat() {
    return { code: 200, message: 'ok', data: true };
  },
};
