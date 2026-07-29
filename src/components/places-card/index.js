import config from '@/config/config';

const MEITUAN_APP_ID = config.meituanAppId;

Component({
  properties: {
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

    onNavigate(e) {
      const poi = e.currentTarget.dataset.poi
      if (!poi) return

      if (poi._id) {
        uni.navigateTo({
          url: `/pages/life/shop/shop?id=${poi._id}`
        })
        return
      }

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

    onBooking(e) {
      const url = e.currentTarget.dataset.url
      if (!url) {
        uni.showToast({ title: '暂无预约入口', icon: 'none' })
        return
      }

      uni.navigateTo({
        url: `/pages/webview/webview/webview?url=${encodeURIComponent(url)}`,
        fail: () => {
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

    onSearchFood(e) {
      const poi = e.currentTarget.dataset.poi
      if (!poi) return

      uni.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.triggerEvent('searchFood', {
            lat: res.latitude,
            lng: res.longitude,
            keyword: poi.name,
            poi: poi,
          })
        },
        fail: () => {
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

    onJumpMeituan(e) {
      const poi = e.currentTarget.dataset.poi
      const keyword = poi ? poi.name : '美食'

      // #ifdef MP-WEIXIN
      uni.navigateToMiniProgram({
        appId: MEITUAN_APP_ID,
        path: `/pages/index/index?keyword=${encodeURIComponent(keyword)}`,
        envVersion: 'release',
        fail: () => {
          uni.showToast({ title: '请打开微信搜索美团', icon: 'none' })
        }
      })
      // #endif

      // #ifdef H5
      window.open(`${config.meituanH5Url}?keyword=${encodeURIComponent(keyword)}`, '_blank')
      // #endif

      // #ifndef MP-WEIXIN || H5
      uni.showToast({ title: '请在微信中打开美团', icon: 'none' })
      // #endif
    },

    onMoreFood(e) {
      const poi = e.currentTarget.dataset.poi
      const keyword = poi ? poi.name : '美食'

      // #ifdef MP-WEIXIN
      uni.navigateToMiniProgram({
        appId: MEITUAN_APP_ID,
        path: `/pages/index/index?keyword=${encodeURIComponent(keyword)}`,
        envVersion: 'release',
        fail: () => {
          uni.showToast({ title: '请打开微信搜索美团', icon: 'none' })
        }
      })
      // #endif

      // #ifdef H5
      window.open(`${config.meituanH5Url}?keyword=${encodeURIComponent(keyword)}`, '_blank')
      // #endif
    },
  }
})
