import { callAdminAction } from './admin'

/**
 * 上传图片并 AI 增强
 * @param {string[]} images - 图片 URL 数组
 * @param {string} style - 风格: 'enhance' | 'cartoon' | 'watercolor' | 'sketch'
 * @returns {Promise<{code: number, data: {images: string[]}}>}
 */
export async function uploadAndEnhance(images, style = 'enhance') {
  return callAdminAction('video.uploadAndEnhance', { images, style })
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
  return callAdminAction('video.render', params)
}

/**
 * 查询渲染状态
 * @param {string} renderId - 渲染任务 ID
 * @returns {Promise<{code: number, data: {renderId, status, progress, videoUrl, error}}>}
 */
export async function getRenderStatus(renderId) {
  return callAdminAction('video.renderStatus', { renderId })
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
