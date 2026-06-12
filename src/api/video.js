const GO_SERVER = import.meta.env.VITE_GO_SERVER || 'http://localhost:8090'

/**
 * 上传图片到 Go 后端（中转到 Remotion 服务）
 * @param {string} filePath - 本地文件路径（uni.chooseImage 的 tempPath）
 * @returns {Promise<{code: number, data: {url: string}}>}
 */
export function uploadImage(filePath) {
  return new Promise((resolve, reject) => {
    console.log('[uploadImage] 开始上传:', filePath, '目标:', `${GO_SERVER}/api/video/upload`)
    uni.uploadFile({
      url: `${GO_SERVER}/api/video/upload`,
      filePath,
      name: 'file',
      success: (res) => {
        console.log('[uploadImage] 响应:', res.statusCode, res.data)
        if (res.statusCode !== 200) {
          console.error('[uploadImage] 状态码错误:', res.statusCode)
          resolve({ code: -1, message: `上传失败 (${res.statusCode})` })
          return
        }
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
          console.log('[uploadImage] 解析后:', data)
          // 兼容后端返回 {status:'ok'} 或 {code:0} 两种格式
          if (data.status === 'ok') {
            console.log('[uploadImage] 成功:', data.data)
            resolve({ code: 0, data: data.data })
          } else if (data.code === 0) {
            resolve(data)
          } else {
            console.error('[uploadImage] 业务失败:', data.message)
            resolve({ code: -1, message: data.message || '上传失败' })
          }
        } catch (e) {
          console.error('[uploadImage] JSON解析失败:', e, res.data)
          resolve({ code: -1, message: '解析响应失败' })
        }
      },
      fail: (err) => {
        console.error('[uploadImage] 请求失败:', err)
        resolve({ code: -1, message: err.errMsg || '上传失败' })
      },
    })
  })
}

/**
 * 上传图片并 AI 增强
 * @param {string[]} images - 图片 URL 数组
 * @param {string} style - 风格: 'enhance' | 'cartoon' | 'watercolor' | 'sketch'
 * @returns {Promise<{code: number, data: {images: string[]}}>}
 */
export async function uploadAndEnhance(images, style = 'enhance') {
  return new Promise((resolve) => {
    uni.request({
      url: `${GO_SERVER}/api/video/enhance`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { images, style },
      timeout: 120000,
      success: (res) => {
        if (res.statusCode === 200) {
          const data = res.data
          // 兼容后端返回 {status:'ok'} 或 {code:0} 两种格式
          if (data.status === 'ok') {
            resolve({ code: 0, data: data.data })
          } else if (data.code === 0) {
            resolve(data)
          } else {
            resolve({ code: -1, message: data.message || '增强失败' })
          }
        } else {
          resolve({ code: -1, message: res.data?.message || '增强失败' })
        }
      },
      fail: (err) => {
        resolve({ code: -1, message: err.errMsg || '网络错误' })
      },
    })
  })
}

/**
 * 提交视频渲染任务
 * @param {Object} params
 * @param {string[]} params.images - 图片 URL 数组
 * @param {string} params.poiName - 地点名称
 * @param {string} params.poiAddress - 地点地址
 * @param {string[]} params.tags - 标签
 * @param {string} params.summary - 摘要
 * @param {string} params.audioSrc - 背景音乐 URL（可选）
 * @returns {Promise<{code: number, data: {renderId: string, status: string}}>}
 */
export async function renderVideo(params) {
  return new Promise((resolve) => {
    uni.request({
      url: `${GO_SERVER}/api/video/render`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: params,
      timeout: 30000,
      success: (res) => {
        if (res.statusCode === 200) {
          const data = res.data
          // 兼容后端返回 {status:'ok'} 或 {code:0} 两种格式
          if (data.status === 'ok') {
            resolve({ code: 0, data: data.data })
          } else if (data.code === 0) {
            resolve(data)
          } else {
            resolve({ code: -1, message: data.message || '渲染提交失败' })
          }
        } else {
          resolve({ code: -1, message: res.data?.message || '渲染提交失败' })
        }
      },
      fail: (err) => {
        resolve({ code: -1, message: err.errMsg || '网络错误' })
      },
    })
  })
}

/**
 * 查询渲染状态
 * @param {string} renderId - 渲染任务 ID
 * @returns {Promise<{code: number, data: {renderId, status, progress, videoUrl, error}}>}
 */
export async function getRenderStatus(renderId) {
  return new Promise((resolve) => {
    uni.request({
      url: `${GO_SERVER}/api/video/render/${renderId}`,
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200) {
          const data = res.data
          // 兼容后端返回 {status:'ok'} 或 {code:0} 两种格式
          if (data.status === 'ok') {
            resolve({ code: 0, data: data.data })
          } else if (data.code === 0) {
            resolve(data)
          } else {
            resolve({ code: -1, message: data.message || '查询失败' })
          }
        } else {
          resolve({ code: -1, message: res.data?.message || '查询失败' })
        }
      },
      fail: (err) => {
        resolve({ code: -1, message: err.errMsg || '网络错误' })
      },
    })
  })
}

/**
 * 轮询等待渲染完成
 * @param {string} renderId - 渲染任务 ID
 * @param {Function} onProgress - 进度回调 ({status, progress}) => void
 * @returns {Promise<{success: boolean, videoUrl?: string, error?: string}>}
 */
export async function waitForRender(renderId, onProgress) {
  const maxRetries = 120
  const interval = 5000

  for (let i = 0; i < maxRetries; i++) {
    const result = await getRenderStatus(renderId)

    if (result.code === 0) {
      const { status, progress, videoUrl, error } = result.data

      if (onProgress) {
        onProgress({ status, progress })
      }

      if (status === 'done' && videoUrl) {
        return { success: true, videoUrl }
      }

      if (status === 'failed' || error) {
        return { success: false, error: error || '渲染失败' }
      }
    }

    await new Promise(resolve => setTimeout(resolve, interval))
  }

  return { success: false, error: '渲染超时' }
}
