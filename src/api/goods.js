const HTTP_URL = 'https://byupload.aixifs.com/babyplace-admin';

function httpCall(data) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', HTTP_URL, true);
    // Use text/plain JSON to satisfy current CORS policy on this endpoint.
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
    xhr.timeout = 30000;
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          resolve({ code: -1, message: 'parse error' });
        }
      } else {
        resolve({ code: xhr.status, message: 'HTTP error' });
      }
    };
    xhr.onerror = function() {
      resolve({ code: -1, message: 'network error' });
    };
    xhr.ontimeout = function() {
      resolve({ code: -1, message: 'timeout' });
    };
    xhr.send(JSON.stringify(data));
  });
}

export async function listGoods(params = {}) {
  return httpCall({
    action: 'list',
    ...params,
  });
}

export async function getGoodsDetail(id) {
  return httpCall({
    action: 'detail',
    id,
  });
}

export async function createGoods(payload) {
  return httpCall({
    action: 'create',
    payload,
  });
}

export async function updateGoods(id, payload) {
  return httpCall({
    action: 'update',
    id,
    payload,
  });
}

export async function removeGoods(id) {
  return httpCall({
    action: 'remove',
    id,
  });
}

export async function batchImportGoods(items) {
  return httpCall({
    action: 'batchImport',
    items,
  });
}
