/**
 * searchNearby - 附近地点搜索
 * 调用 babyplace-admin 的 map.searchNearby action
 * 返回附近的遛娃地点列表
 */
module.exports = async function searchNearby(params) {
  const { lat, lng, keyword, radius } = params

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      isError: true,
      content: '无法获取您的位置信息，请确保已授权位置权限',
      structuredContent: { error: '缺少位置信息' }
    }
  }

  try {
    const requestData = {
      action: 'map.searchNearby',
      lat,
      lng,
    }
    if (keyword) requestData.keyword = keyword
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
        content: '附近搜索失败，请稍后重试',
        structuredContent: { error: res.data?.message || '请求失败' }
      }
    }

    const data = res.data?.data
    const list = data?.list || []

    if (!list.length) {
      return {
        isError: false,
        content: '附近暂无推荐地点，试试扩大搜索范围吧',
        structuredContent: { list: [], total: 0 }
      }
    }

    // 格式化回答文本
    const radiusText = data?.radius ? `${(data.radius / 1000).toFixed(1)}km` : '3km'
    const answerLines = [`在 ${radiusText} 范围内找到 ${list.length} 个地点：\n`]
    list.slice(0, 5).forEach((poi, index) => {
      const distanceText = poi.distance >= 1000
        ? `${(poi.distance / 1000).toFixed(1)}km`
        : `${Math.round(poi.distance)}m`
      answerLines.push(`${index + 1}. ${poi.name}（${distanceText}）`)
      if (poi.address) answerLines.push(`   📍 ${poi.address}`)
      answerLines.push('')
    })

    return {
      isError: false,
      content: answerLines.join('\n'),
      structuredContent: {
        list: list.map(poi => ({
          _id: poi._id,
          name: poi.name,
          address: poi.address,
          location: poi.location,
          category: poi.category,
          distance: poi.distance,
          avg_rating: poi.avg_rating,
          tags: poi.tags,
          cover_image: poi.cover_image,
        })),
        total: data?.total || list.length,
        page: data?.page || 1,
        pageSize: data?.pageSize || 20,
        radius: data?.radius || 3000,
      },
      _meta: {
        ui: {
          componentPath: 'components/places-card/index'
        }
      }
    }
  } catch (err) {
    console.error('[searchNearby] error:', err)
    return {
      isError: true,
      content: '网络连接失败，请检查网络后重试',
      structuredContent: { error: err.errMsg || '网络异常' }
    }
  }
}
