import { callAdminAction } from '@/api/admin';

export async function createReview(payload) {
  return callAdminAction('review.create', { payload });
}

export async function listReviewByPoi(poi_id, params = {}) {
  return callAdminAction('review.listByPoi', { poi_id, ...params });
}
