const poiObject = uniCloud.importObject('poi');

export async function listPoi(params = {}) {
  return poiObject.list(params);
}

export async function detailPoi(id, params = {}) {
  return poiObject.detail({ id, ...params });
}

export async function nearbyPoi(params = {}) {
  return poiObject.nearby(params);
}
