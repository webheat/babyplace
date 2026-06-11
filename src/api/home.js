import { listPoi } from './poi';

function ok(data = {}, message = 'ok') {
  return Promise.resolve({ code: 200, message, data });
}

function buildBanner(item = {}, index = 0) {
  return {
    id: item._id || String(index + 1),
    title: item.name || '亲子推荐',
    image: item.cover_image || '/static/logo.png',
    action: 'poi',
    action_param: item._id || '',
  };
}

export default {
  async getBanner() {
    const result = await listPoi({ page: 1, pageSize: 5 });
    const list = (result.data?.list || []).map(buildBanner);
    return ok(list);
  },
};
