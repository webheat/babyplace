/**
 * 小红书发布 API
 * 直接调用 Go 后端（不走 admin.js 的 uniCloud 通道）
 */

// Go 后端地址，从 .env 读取
const GO_SERVER = import.meta.env.VITE_GO_SERVER || 'http://localhost:8080'

function goRequest(path, options = {}) {
  return new Promise((resolve) => {
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
          resolve({ status: 'error', message: `HTTP ${statusCode}` })
        }
      },
      fail: (err) => {
        resolve({ status: 'error', message: err?.errMsg || '网络错误' })
      },
    })
  })
}

/**
 * 检查小红书授权状态
 * @returns {Promise<{status, configured, authorized}>}
 */
export async function getXHSStatus() {
  return goRequest('/api/xhs/status')
}

/**
 * 获取小红书 OAuth 授权 URL
 * @returns {Promise<{status, auth_url}>}
 */
export async function getXHSAuthUrl() {
  return goRequest('/api/xhs/auth')
}

/**
 * 发布视频到小红书
 * @param {Object} params
 * @param {string} params.videoUrl - 视频 URL
 * @param {string} params.title - 笔记标题
 * @param {string} params.content - 笔记内容
 * @param {string[]} params.tags - 话题标签
 * @returns {Promise<{status, message, data?}>}
 */
export async function publishToXHS(params) {
  return goRequest('/api/xhs/publish', {
    method: 'POST',
    data: params,
    timeout: 360000, // 视频上传可能较慢，6 分钟超时
  })
}
