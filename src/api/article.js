import { callAdminAction } from '@/api/admin';

function toTimeValue(value) {
  if (!value) return Date.now();
  if (typeof value === 'number') return value;
  if (typeof value?.getTime === 'function') return value.getTime();
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function normalizeArticle(item = {}) {
  return {
    id: item.id,
    title: item.title || '未命名文章',
    sub_title: item.source_account || item.url || '暂无摘要',
    cat_name: item.status || 'article',
    cover_type: item.cover_image ? 1 : 0,
    image: item.cover_image || (item.images || [])[0] || '/static/logo.png',
    images: item.images || [],
    publish_at: toTimeValue(item.publish_time || item.updated_at || item.created_at),
    content: item.content_text || item.content_html || '',
    url: item.url || '',
    view_num: 0,
    collect_num: 0,
    author: item.source_account || 'babyplace',
  };
}

function ok(data = {}, message = 'ok') {
  return { code: 0, message, data };
}

export default {
  getArticleCats() {
    return ok([
      { id: 'all', name: '全部' },
      { id: 'indoor', name: '室内' },
      { id: 'park', name: '公园' },
      { id: 'play', name: '乐园' },
    ]);
  },

  async getArticleList(catId = '', _status = 0, _pageType = 1, page = 1) {
    const result = await callAdminAction('article.list', { page: Number(page || 1), pageSize: 20 });
    if (result?.code === 0) {
      const list = (result.data?.list || []).map(normalizeArticle);
      const filtered = catId && catId !== 1 && catId !== 'all'
        ? list.filter((item) => item.cat_name === catId)
        : list;
      return ok(filtered);
    }
    return ok([]);
  },

  async getArticleDetail(articleId) {
    const result = await callAdminAction('article.detail', { id: articleId });
    if (result?.code === 0 && result.data) {
      const article = normalizeArticle(result.data);
      article.reviews = [];
      article.sources = [];
      return ok(article);
    }
    return { code: 404, message: result?.message || 'not found', data: null };
  },

  articleCollect() {
    return ok(true);
  },

  incShareNum() {
    return ok(true);
  },
};
