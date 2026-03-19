import { callAdminAction } from '@/api/admin';

const recommendObject = uniCloud.importObject('recommend');

export async function recommendHome(params = {}) {
  try {
    const result = await recommendObject.home(params);
    if (result?.code === 0) return result;
  } catch (error) {
    console.error('recommend.home importObject failed, fallback to admin action', error);
  }
  return callAdminAction('recommend.home', params);
}
