/**
 * places-card - 地点推荐卡片组件
 * 展示 AI 推荐的遛娃地点，支持导航、预约、美食搜索
 */
Component({
  properties: {
    // 接口返回的 structuredContent
    data: {
      type: Object,
      value: {},
      observer: 'onDataChange'
    }
  },

  data: {
    places: [],
  },

  methods: {
    onDataChange(newVal) {
      if (newVal && newVal.places) {
        // 为每个地点计算距离文本
        const places = newVal.places.map(item => {
          const distance = item.distance
          let distanceText = ''
          if (distance) {
            distanceText = distance >= 1000
              ? `${(distance / 1000).toFixed(1)}km`
              : `${Math.round(distance)}m`
          }
          return { ...item, distanceText }
        })
        this.setData({ places })
      }
    },

    /**
     * 一键导航 - 跳转到 POI 详情页（含路线规划）
     */
    onNavigate(e) {
      const poi = e.currentTarget.dataset.poi
      if (!poi) return

      // 方案A: 跳转到 POI 详情页（已有 RoutePlannerCard 组件）
      if (poi._id) {
        uni.navigateTo({
          url: `/pages/life/shop/shop?id=${poi._id}`
        })
        return
      }

      // 方案B: 直接打开原生地图导航
      if (poi.location && poi.location.lat && poi.location.lng) {
        uni.openLocation({
          latitude: poi.location.lat,
          longitude: poi.location.lng,
          name: poi.name || '目的地',
          address: poi.address || '',
          fail: () => {
            uni.showToast({ title: '无法打开地图', icon: 'none' })
          }
        })
      }
    },

    /**
     * 一键预约
     */
    onBooking(e) {
      const url = e.currentTarget.dataset.url
      if (!url) {
        uni.showToast({ title: '暂无预约入口', icon: 'none' })
        return
      }

      // 跳转到 WebView 页面打开预约链接
      uni.navigateTo({
        url: `/pages/webview/webview/webview?url=${encodeURIComponent(url)}`,
        fail: () => {
          // 如果 webview 页面不存在，尝试直接打开
          // #ifdef H5
          window.open(url, '_blank')
          // #endif
          // #ifdef MP-WEIXIN
          uni.setClipboardData({
            data: url,
            success: () => {
              uni.showToast({ title: '预约链接已复制，请在浏览器中打开', icon: 'none' })
            }
          })
          // #endif
        }
      })
    },

    /**
     * 附近美食搜索
     */
    onSearchFood(e) {
      const poi = e.currentTarget.dataset.poi
      if (!poi) return

      // 获取用户位置后搜索附近美食
      uni.getLocation({
        type: 'gcj02',
        success: (res) => {
          // 触发搜索美食事件，由父组件处理
          this.triggerEvent('searchFood', {
            lat: res.latitude,
            lng: res.longitude,
            keyword: poi.name,
            poi: poi,
          })
        },
        fail: () => {
          // 无位置信息时使用 POI 坐标
          if (poi.location) {
            this.triggerEvent('searchFood', {
              lat: poi.location.lat,
              lng: poi.location.lng,
              keyword: poi.name,
              poi: poi,
            })
          } else {
            uni.showToast({ title: '无法获取位置信息', icon: 'none' })
          }
        }
      })
    },

    /**
     * 文章链接点击
     */
    onArticleTap(e) {
      const url = e.currentTarget.dataset.url
      if (!url) return

      uni.navigateTo({
        url: `/pages/webview/webview/webview?url=${encodeURIComponent(url)}`,
        fail: () => {
          // #ifdef MP-WEIXIN
          uni.setClipboardData({
            data: url,
            success: () => {
              uni.showToast({ title: '链接已复制', icon: 'none' })
            }
          })
          // #endif
        }
      })
    },

    /**
     * 跳转美团小程序下单
     */
    onJumpMeituan(e) {
      const poi = e.currentTarget.dataset.poi
      const keyword = poi ? poi.name : '美食'

      // #ifdef MP-WEIXIN
      wx.navigateToMiniProgram({
        appId: 'wxde8ac0a21135c07d',
        path: `/pages/index/index?keyword=${encodeURIComponent(keyword)}`,
        envVersion: 'release',
        fail: () => {
          uni.showToast({ title: '请打开微信搜索美团', icon: 'none' })
        }
      })
      // #endif

      // #ifdef H5
      window.open(`https://h5.waimai.meituan.com/waimai/mindex/home?keyword=${encodeURIComponent(keyword)}`, '_blank')
      // #endif

      // #ifndef MP-WEIXIN || H5
      uni.showToast({ title: '请在微信中打开美团', icon: 'none' })
      // #endif
    },

    /**
     * 查看更多美食（跳转美团搜索）
     */
    onMoreFood(e) {
      const poi = e.currentTarget.dataset.poi
      const keyword = poi ? poi.name : '美食'

      // #ifdef MP-WEIXIN
      wx.navigateToMiniProgram({
        appId: 'wxde8ac0a21135c07d',
        path: `/pages/index/index?keyword=${encodeURIComponent(keyword)}`,
        envVersion: 'release',
        fail: () => {
          uni.showToast({ title: '请打开微信搜索美团', icon: 'none' })
        }
      })
      // #endif

      // #ifdef H5
      window.open(`https://h5.waimai.meituan.com/waimai/mindex/home?keyword=${encodeURIComponent(keyword)}`, '_blank')
      // #endif
    },
  }
})
