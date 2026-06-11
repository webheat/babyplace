import { detailPoi, listPoi } from './poi';

const articleObject = uniCloud.importObject('article');

function toTimeValue(value) {
  if (!value) return Date.now();
  if (typeof value === 'number') return value;
  if (typeof value?.getTime === 'function') return value.getTime();
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function buildArticleFromPoi(poi = {}) {
  const timestamp = toTimeValue(poi.updated_at || poi.created_at);
  const imageList = []
    .concat(poi.cover_image ? [poi.cover_image] : [])
    .concat(Array.isArray(poi.gallery) ? poi.gallery : [])
    .filter(Boolean);
  const image = imageList[0] || '/static/logo.png';
  const coverType = imageList.length > 1 ? 2 : (imageList.length === 1 ? 1 : 0);
  const summary = poi.recommend_reason || poi.summary || '暂无内容';
  const content = [
    summary,
    poi.notice ? `注意事项：${poi.notice}` : '',
    poi.address ? `地址：${[poi.city, poi.district, poi.address].filter(Boolean).join(' ')}` : '',
    poi.recommended_duration ? `建议停留：${poi.recommended_duration}` : '',
    Array.isArray(poi.tags) && poi.tags.length ? `标签：${poi.tags.join(' / ')}` : '',
  ].filter(Boolean).join('\n\n');

  return {
    id: poi._id,
    poi_id: poi._id,
    title: poi.name || '未命名地点',
    sub_title: summary,
    cat_name: poi.category || '亲子地点',
    cover_type: coverType,
    image,
    images: imageList,
    publish_at: timestamp,
    content,
    url: '',
    view_num: Number(poi.review_count || 0),
    collect_num: Number(poi.source_count || 0),
    author: 'babyplace',
  };
}

function ok(data = {}, message = 'ok') {
  return Promise.resolve({ code: 200, message, data });
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
    try {
      const result = await articleObject.list({ page: Number(page || 1), pageSize: 20 });
      if (result.code === 0) {
        const list = (result.data?.list || []).map((item) => ({
          id: item._id,
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
        }));
        return ok(list);
      }
    } catch (_error) {
      // Fallback to poi-driven article mapping when article cloud object is unavailable.
    }

    const result = await listPoi({ page: Number(page || 1), pageSize: 20 });
    const list = (result.data?.list || []).map(buildArticleFromPoi);
    const filtered = catId && catId !== 1 && catId !== 'all'
      ? list.filter((item) => item.cat_name === catId)
      : list;
    return ok(filtered);
  },

  async getArticleDetail(articleId) {
    try {
      const result = await articleObject.detail({ id: articleId });
      if (result.code === 0 && result.data) {
        const item = result.data;
        return ok({
          id: item._id,
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
          reviews: [],
          sources: [],
        });
      }
    } catch (_error) {
      // Fallback to poi detail mapping when article cloud object is unavailable.
    }

    const result = await detailPoi(articleId);
    if (result.code !== 0) {
      return { code: 404, message: result.message || 'not found', data: null };
    }
    const article = buildArticleFromPoi(result.data?.poi || {});
    article.sources = result.data?.sources || [];
    article.reviews = result.data?.reviews || [];
    return ok(article);
  },

  articleCollect() {
    return ok(true);
  },

  incShareNum() {
    return ok(true);
  },
};
