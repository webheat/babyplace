import config from '@/config/config';

const GO_SERVER = config.goServer;

function goRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${GO_SERVER}${path}`,
      method: options.method || 'GET',
      header: {
        'Content-Type': 'application/json',
        ...options.header,
      },
      data: options.data,
      timeout: options.timeout || 30000,
      success: ({ statusCode, data }) => {
        if (statusCode >= 200 && statusCode < 300) {
          resolve(data)
        } else {
          reject(new Error(`HTTP ${statusCode}: ${data?.message || 'request failed'}`))
        }
      },
      fail: (err) => {
        reject(new Error(err?.errMsg || '网络错误'))
      }
    })
  })
}

export async function getXHSStatus() {
  return goRequest('/api/xhs/status')
}

export async function getXHSAuthUrl() {
  return goRequest('/api/xhs/auth')
}

export async function publishToXHS(params) {
  return goRequest('/api/xhs/publish', {
    method: 'POST',
    data: params,
    timeout: 360000,
  })
}
