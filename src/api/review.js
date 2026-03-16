const reviewObject = uniCloud.importObject('review');

export async function createReview(payload) {
  return reviewObject.create({ payload });
}

export async function listReviewByPoi(poi_id, params = {}) {
  return reviewObject.listByPoi({ poi_id, ...params });
}
