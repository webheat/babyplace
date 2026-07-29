import config from '@/config/config';

const GO_SERVER = config.goServer;

function showToastError(message) {
  uni.showToast({ title: message, icon: 'none' });
}

/**
 * 上传图片到 Go 后端（中转到 Remotion 服务）
 */
export function uploadImage(filePath) {
  return new Promise((resolve) => {
    console.log('[uploadImage] 开始上传:', filePath, '目标:', `${GO_SERVER}/api/video/upload`)
    uni.uploadFile({
      url: `${GO_SERVER}/api/video/upload`,
      filePath,
      name: 'file',
      success: (res) => {
        console.log('[uploadImage] 响应:', res.statusCode, res.data)
        if (res.statusCode !== 200) {
          console.error('[uploadImage] 状态码错误:', res.statusCode)
          showToastError(`上传失败 (${res.statusCode})`)
          resolve({ code: -1, message: `上传失败 (${res.statusCode})` })
          return
        }
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
          console.log('[uploadImage] 解析后:', data)
          if (data.status === 'ok') {
            console.log('[uploadImage] 成功:', data.data)
            resolve({ code: 0, data: data.data })
          } else if (data.code === 0) {
            resolve(data)
          } else {
            console.error('[uploadImage] 业务失败:', data.message)
            showToastError(data.message || '上传失败')
            resolve({ code: -1, message: data.message || '上传失败' })
          }
        } catch (e) {
          console.error('[uploadImage] JSON解析失败:', e, res.data)
          showToastError('解析响应失败')
          resolve({ code: -1, message: '解析响应失败' })
        }
      },
      fail: (err) => {
        console.error('[uploadImage] 请求失败:', err)
        showToastError(err.errMsg || '上传失败')
        resolve({ code: -1, message: err.errMsg || '上传失败' })
      },
    })
  })
}

/**
 * 上传图片并 AI 增强
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
          if (data.status === 'ok') {
            resolve({ code: 0, data: data.data })
          } else if (data.code === 0) {
            resolve(data)
          } else {
            showToastError(data.message || '增强失败')
            resolve({ code: -1, message: data.message || '增强失败' })
          }
        } else {
          showToastError(res.data?.message || `增强失败 (${res.statusCode})`)
          resolve({ code: -1, message: res.data?.message || '增强失败' })
        }
      },
      fail: (err) => {
        showToastError(err.errMsg || '网络错误')
        resolve({ code: -1, message: err.errMsg || '网络错误' })
      },
    })
  })
}

/**
 * 提交视频渲染任务
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
          if (data.status === 'ok') {
            resolve({ code: 0, data: data.data })
          } else if (data.code === 0) {
            resolve(data)
          } else {
            showToastError(data.message || '渲染提交失败')
            resolve({ code: -1, message: data.message || '渲染提交失败' })
          }
        } else {
          showToastError(res.data?.message || `渲染提交失败 (${res.statusCode})`)
          resolve({ code: -1, message: res.data?.message || '渲染提交失败' })
        }
      },
      fail: (err) => {
        showToastError(err.errMsg || '网络错误')
        resolve({ code: -1, message: err.errMsg || '网络错误' })
      },
    })
  })
}

/**
 * 查询渲染状态
 */
export async function getRenderStatus(renderId) {
  return new Promise((resolve) => {
    uni.request({
      url: `${GO_SERVER}/api/video/render/${renderId}`,
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const data = res.data
          if (data.status === 'ok') {
            resolve({ code: 0, data: data.data })
          } else if (data.code === 0) {
            resolve(data)
          } else {
            showToastError(data.message || '查询失败')
            resolve({ code: -1, message: data.message || '查询失败' })
          }
        } else {
          showToastError(res.data?.message || `查询失败 (${res.statusCode})`)
          resolve({ code: -1, message: res.data?.message || '查询失败' })
        }
      },
      fail: (err) => {
        showToastError(err.errMsg || '网络错误')
        resolve({ code: -1, message: err.errMsg || '网络错误' })
      },
    })
  })
}

const MAX_RETRIES = 120;
const POLL_INTERVAL = 5000;

/**
 * 轮询等待渲染完成
 */
export async function waitForRender(renderId, onProgress) {
  for (let i = 0; i < MAX_RETRIES; i++) {
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

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
  }

  return { success: false, error: '渲染超时' }
}
