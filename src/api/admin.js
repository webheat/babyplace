const HTTP_URL = 'https://ds.aixifs.com/'

function httpCall(data) {
  const requestBody = JSON.stringify(data || {})
  return new Promise((resolve) => {
    uni.request({
      url: HTTP_URL,
      method: 'POST',
      header: {
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      timeout: 30000,
      data: requestBody,
      success: ({ statusCode, data: responseData }) => {
        if (statusCode >= 200 && statusCode < 300) {
          if (responseData && typeof responseData === 'object') {
            resolve(responseData)
            return
          }
          try {
            resolve(JSON.parse(String(responseData || '')))
          } catch (e) {
            resolve({ code: -1, message: 'parse error' })
          }
          return
        }
        resolve({ code: statusCode, message: 'HTTP error' })
      },
      fail: (error) => {
        const isTimeout = String(error?.errMsg || '').toLowerCase().includes('timeout')
        resolve({ code: -1, message: isTimeout ? 'timeout' : 'network error' })
      }
    })
  })
}

export async function listAdminItems(moduleKey, params = {}) {
  return httpCall({
    action: `${moduleKey}.list`,
    ...params,
  })
}

export async function createAdminItem(moduleKey, payload) {
  return httpCall({
    action: `${moduleKey}.create`,
    payload,
  })
}

export async function updateAdminItem(moduleKey, id, payload) {
  return httpCall({
    action: `${moduleKey}.update`,
    id,
    payload,
  })
}

export async function removeAdminItem(moduleKey, id) {
  return httpCall({
    action: `${moduleKey}.remove`,
    id,
  })
}
