/**
 * askDify - 向 Dify 知识库提问
 * 调用 Dify Chat API，返回 AI 回答
 */
module.exports = async function askDify(params) {
  const { question } = params

  if (!question || !question.trim()) {
    return {
      isError: true,
      content: '请输入您的问题',
      structuredContent: { error: '问题不能为空' }
    }
  }

  try {
    // 获取用户标识：优先用微信 openid，其次 _id，最后匿名
    const userInfo = wx.getStorageSync('userInfo') || {}
    const token = wx.getStorageSync('token') || ''
    const userId = userInfo.wx_openid || userInfo._id || token || 'anonymous_' + Date.now()

    const res = await new Promise((resolve, reject) => {
      wx.request({
        url: 'https://oc.aixifs.com/v1/chat-messages',
        method: 'POST',
        header: {
          'Authorization': 'Bearer app-aMB5cKJpDqNxR3tV7yW8eU2hL4fG9bZ1',
          'Content-Type': 'application/json'
        },
        data: {
          query: question,
          user: userId,
          response_mode: 'blocking',
          inputs: {}
        },
        success: (res) => resolve(res),
        fail: (err) => reject(err)
      })
    })

    if (res.statusCode !== 200) {
      return {
        isError: true,
        content: '知识库查询失败，请稍后重试',
        structuredContent: { error: res.data?.message || '请求失败', status: res.statusCode }
      }
    }

    // Chat API 返回格式
    const answer = res.data?.answer || '抱歉，没有找到相关答案'
    const conversationId = res.data?.conversation_id || ''
    const retrieverResources = res.data?.metadata?.retriever_resources || []

    return {
      isError: false,
      content: answer,
      structuredContent: {
        answer: answer,
        conversationId: conversationId,
        query: question,
        sources: retrieverResources
      },
      _meta: {
        ui: {
          componentPath: 'components/answer-card/index'
        }
      }
    }
  } catch (err) {
    console.error('[askDify] error:', err)
    return {
      isError: true,
      content: '网络连接失败，请检查网络后重试',
      structuredContent: { error: err.errMsg || '网络异常' }
    }
  }
}
