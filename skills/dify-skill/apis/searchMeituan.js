/**
 * searchMeituan - 美团美食搜索
 * 调用 babyplace-admin 的 meituan.search action
 * 返回附近美食列表
 */
module.exports = async function searchMeituan(params) {
  const { lat, lng, keyword, category, radius } = params

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      isError: true,
      content: '无法获取您的位置信息，请确保已授权位置权限',
      structuredContent: { error: '缺少位置信息' }
    }
  }

  try {
    const requestData = {
      action: 'meituan.search',
      lat,
      lng,
    }
    if (keyword) requestData.keyword = keyword
    if (category) requestData.category = category
    if (radius) requestData.radius = radius

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
        content: '美团搜索失败，请稍后重试',
        structuredContent: { error: res.data?.message || '请求失败' }
      }
    }

    const data = res.data?.data
    const list = data?.list || []

    if (!list.length) {
      const hint = data?.message || '附近暂无美食，换个关键词试试'
      return {
        isError: false,
        content: hint,
        structuredContent: { list: [], total: 0, message: hint }
      }
    }

    // 格式化回答文本
    const answerLines = [`找到 ${list.length} 家美食：\n`]
    list.slice(0, 5).forEach((item, index) => {
      const priceText = item.avg_price ? `人均 ¥${item.avg_price}` : ''
      const ratingText = item.rating ? `⭐${item.rating}` : ''
      const distanceText = item.distance ? `${item.distance >= 1000 ? (item.distance / 1000).toFixed(1) + 'km' : item.distance + 'm'}` : ''
      answerLines.push(`${index + 1}. ${item.name}`)
      if (item.address) answerLines.push(`   📍 ${item.address}`)
      answerLines.push(`   ${[ratingText, priceText, distanceText].filter(Boolean).join(' | ')}`)
      answerLines.push('')
    })

    return {
      isError: false,
      content: answerLines.join('\n'),
      structuredContent: {
        list: list.map(item => ({
          id: item.id,
          name: item.name,
          address: item.address,
          rating: item.rating || 0,
          avg_price: item.avg_price || 0,
          images: item.images || [],
          category: item.category || '',
          distance: item.distance || 0,
        })),
        total: data?.total || 0,
        page: data?.page || 1,
        pageSize: data?.pageSize || 20,
      },
      _meta: {
        ui: {
          componentPath: 'components/places-card/index'
        }
      }
    }
  } catch (err) {
    console.error('[searchMeituan] error:', err)
    return {
      isError: true,
      content: '网络连接失败，请检查网络后重试',
      structuredContent: { error: err.errMsg || '网络异常' }
    }
  }
}
