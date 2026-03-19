import articleApi from './article';
import { listPoi } from './poi';

function ok(data = {}, message = 'ok') {
  return Promise.resolve({ code: 200, message, data });
}

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
      const articleResult = await articleApi.getArticleList('all', 0, 1, 1);
      if (articleResult.code === 200) {
        return ok((articleResult.data || []).slice(0, 20).map((item, index) => ({
          id: item.id || String(index + 1),
          title: item.title || '系统消息',
          content: item.sub_title || item.content || '内容已更新',
          created_at: item.publish_at || Date.now(),
          read_flag: false,
        })));
      }
    } catch (_error) {
      // Fallback to poi-based messages.
    }
    const result = await listPoi({ page: 1, pageSize: 20 });
    return ok((result.data?.list || []).map(buildMessage));
  },

  async getSysMessageChat() {
    const result = await listPoi({ page: 1, pageSize: 10 });
    return ok((result.data?.list || []).map(buildMessage));
  },

  clearSysMessageChat() {
    return ok(true);
  },
};
