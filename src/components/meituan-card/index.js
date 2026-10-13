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
    foods: [],
    poiName: '',
  },

  methods: {
    onDataChange(newVal) {
      if (newVal && newVal.foods) {
        this.setData({
          foods: newVal.foods,
          poiName: newVal.poiName || '',
        })
      }
    },

    onJumpMeituan(e) {
      const poi = e.currentTarget.dataset.poi
      const keyword = poi ? poi.name : this.data.poiName || '美食'

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

    onFoodTap(e) {
      const food = e.currentTarget.dataset.food
      if (!food) return

      // #ifdef MP-WEIXIN
      uni.navigateToMiniProgram({
        appId: MEITUAN_APP_ID,
        path: `/pages/index/index?keyword=${encodeURIComponent(food.name)}`,
        envVersion: 'release',
        fail: () => {
          uni.showToast({ title: '跳转失败', icon: 'none' })
        }
      })
      // #endif

      // #ifdef H5
      window.open(`${config.meituanH5Url}?keyword=${encodeURIComponent(food.name)}`, '_blank')
      // #endif
    },

    onMoreFood() {
      const keyword = this.data.poiName || '美食'

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
