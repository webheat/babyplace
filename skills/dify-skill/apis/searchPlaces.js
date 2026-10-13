/**
 * searchPlaces - AI 语义搜索遛娃地点
 * 调用 babyplace-admin 的 ai.searchPlaces action
 * 返回 3 个推荐地点 + 文章摘要
 */
module.exports = async function searchPlaces(params) {
  const { query, lat, lng } = params

  if (!query || !query.trim()) {
    return {
      isError: true,
      content: '请输入您的搜索需求，例如"附近有什么遛娃的地方"',
      structuredContent: { error: '搜索内容不能为空' }
    }
  }

  try {
    const requestData = { action: 'ai.searchPlaces', query }
    if (lat) requestData.lat = lat
    if (lng) requestData.lng = lng

    const res = await new Promise((resolve, reject) => {
      wx.request({
        url: 'https://byupload.aixifs.com/babyplace-admin',
        method: 'POST',
        header: { 'Content-Type': 'text/plain;charset=UTF-8' },
        data: JSON.stringify(requestData),
        success: (res) => resolve(res),
        fail: (err) => reject(err)
      })
    })

    if (res.statusCode !== 200 || res.data?.code !== 0) {
      return {
        isError: true,
        content: '地点搜索失败，请稍后重试',
        structuredContent: { error: res.data?.message || '请求失败', status: res.statusCode }
      }
    }

    const data = res.data?.data
    const places = data?.places || []

    if (!places.length) {
      return {
        isError: false,
        content: `未找到与"${query}"相关的遛娃地点，换个关键词试试吧`,
        structuredContent: { places: [], query, total: 0 }
      }
    }

    // 格式化回答文本
    const answerLines = [`为您找到 ${places.length} 个推荐地点：\n`]
    places.forEach((item, index) => {
      const poi = item.poi || {}
      const distanceText = item.distance ? `（${item.distance >= 1000 ? (item.distance / 1000).toFixed(1) + 'km' : Math.round(item.distance) + 'm'}）` : ''
      answerLines.push(`${index + 1}. ${poi.name || '未知地点'}${distanceText}`)
      if (poi.address) answerLines.push(`   📍 ${poi.address}`)
      if (item.summary) answerLines.push(`   💡 ${item.summary.substring(0, 80)}...`)
      if (item.articles?.length) answerLines.push(`   📄 相关文章 ${item.articles.length} 篇`)
      answerLines.push('')
    })

    return {
      isError: false,
      content: answerLines.join('\n'),
      structuredContent: {
        places: places.map(item => ({
          poi: item.poi,
          articles: item.articles || [],
          summary: item.summary || '',
          booking_url: item.booking_url || '',
          distance: item.distance || null,
        })),
        query: data?.query || query,
        total: data?.total || places.length,
      },
      _meta: {
        ui: {
          componentPath: 'components/places-card/index'
        }
      }
    }
  } catch (err) {
    console.error('[searchPlaces] error:', err)
    return {
      isError: true,
      content: '网络连接失败，请检查网络后重试',
      structuredContent: { error: err.errMsg || '网络异常' }
    }
  }
}
