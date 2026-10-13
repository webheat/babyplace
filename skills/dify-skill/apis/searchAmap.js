/**
 * searchAmap - 高德地图 POI 搜索
 * 调用 babyplace-admin 的 map.searchAmap action
 * 返回高德地图 POI 搜索结果
 */
module.exports = async function searchAmap(params) {
  const { keyword, lat, lng, city, radius, page, pageSize } = params

  if (!keyword || !keyword.trim()) {
    return {
      isError: true,
      content: '请输入搜索关键词，例如"儿童乐园"、"博物馆"',
      structuredContent: { error: '搜索关键词不能为空' }
    }
  }

  try {
    const requestData = {
      action: 'map.searchAmap',
      keyword,
    }
    if (lat) requestData.lat = lat
    if (lng) requestData.lng = lng
    if (city) requestData.city = city
    if (radius) requestData.radius = radius
    if (page) requestData.page = page
    if (pageSize) requestData.pageSize = pageSize

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
        content: '高德搜索失败，请稍后重试',
        structuredContent: { error: res.data?.message || '请求失败' }
      }
    }

    const data = res.data?.data
    const list = data?.list || []

    if (!list.length) {
      return {
        isError: false,
        content: `未找到"${keyword}"相关地点，换个关键词试试`,
        structuredContent: { list: [], total: 0 }
      }
    }

    // 格式化回答文本
    const answerLines = [`高德搜索"${keyword}"找到 ${list.length} 个结果：\n`]
    list.slice(0, 5).forEach((poi, index) => {
      const distanceText = poi.distance ? `（${poi.distance >= 1000 ? (poi.distance / 1000).toFixed(1) + 'km' : poi.distance + 'm'}）` : ''
      answerLines.push(`${index + 1}. ${poi.name}${distanceText}`)
      if (poi.address) answerLines.push(`   📍 ${poi.address}`)
      if (poi.type) answerLines.push(`   🏷️ ${poi.type}`)
      answerLines.push('')
    })

    return {
      isError: false,
      content: answerLines.join('\n'),
      structuredContent: {
        list: list.map(poi => ({
          id: poi.id,
          name: poi.name,
          address: poi.address,
          location: poi.location,
          type: poi.type,
          tel: poi.tel || '',
          distance: poi.distance || '',
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
    console.error('[searchAmap] error:', err)
    return {
      isError: true,
      content: '网络连接失败，请检查网络后重试',
      structuredContent: { error: err.errMsg || '网络异常' }
    }
  }
}
