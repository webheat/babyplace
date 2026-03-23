import { callAdminAction } from '@/api/admin';
import poiSnapshot from '@/data/poi-snapshot.json';

const recommendObject = uniCloud.importObject('recommend');

function buildSnapshotHome(params = {}) {
  const radius = Number(params.radius || 5000);
  const source = Array.isArray(poiSnapshot) ? poiSnapshot.slice() : [];
  const featured = source.slice(0, 6);
  const nearby = source
    .filter((item) => Number(item?.location?.lat) && Number(item?.location?.lng))
    .slice(0, 6);
  const latest = source.slice(0, 6);
  return {
    code: 0,
    message: 'ok',
    data: {
      radius,
      featured,
      nearby,
      latest,
    },
  };
}

export async function recommendHome(params = {}) {
  try {
    const result = await recommendObject.home(params);
    if (result?.code === 0) return result;
  } catch (error) {
    console.error('recommend.home importObject failed, fallback to admin action', error);
  }
  const result = await callAdminAction('recommend.home', params);
  return result?.code === 0 ? result : buildSnapshotHome(params);
}
