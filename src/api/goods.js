const HTTP_URL = 'https://byupload.aixifs.com/babyplace-admin';

function httpCall(data) {
  const requestBody = JSON.stringify(data || {});
  return new Promise((resolve) => {
    uni.request({
      url: HTTP_URL,
      method: 'POST',
      // Keep text/plain for endpoint compatibility.
      header: {
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      timeout: 30000,
      data: requestBody,
      success: ({ statusCode, data: responseData }) => {
        if (statusCode >= 200 && statusCode < 300) {
          if (responseData && typeof responseData === 'object') {
            resolve(responseData);
            return;
          }
          try {
            resolve(JSON.parse(String(responseData || '')));
          } catch (e) {
            resolve({ code: -1, message: 'parse error' });
          }
          return;
        }
        resolve({ code: statusCode, message: 'HTTP error' });
      },
      fail: (error) => {
        const isTimeout = String(error?.errMsg || '').toLowerCase().includes('timeout');
        resolve({ code: -1, message: isTimeout ? 'timeout' : 'network error' });
      }
    });
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
