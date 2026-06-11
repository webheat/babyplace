/**
 * meituan-card - 美团美食卡片组件
 * 展示 POI 附近的美团美食推荐，支持跳转美团小程序下单
 */
Component({
  properties: {
    // 美食列表数据
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

    /**
     * 跳转美团小程序搜索附近美食
     */
    onJumpMeituan(e) {
      const poi = e.currentTarget.dataset.poi
      const keyword = poi ? poi.name : this.data.poiName || '美食'

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
     * 点击单个美食项 - 跳转美团小程序查看详情
     */
    onFoodTap(e) {
      const food = e.currentTarget.dataset.food
      if (!food) return

      // #ifdef MP-WEIXIN
      wx.navigateToMiniProgram({
        appId: 'wxde8ac0a21135c07d',
        path: `/pages/index/index?keyword=${encodeURIComponent(food.name)}`,
        envVersion: 'release',
        fail: () => {
          uni.showToast({ title: '跳转失败', icon: 'none' })
        }
      })
      // #endif

      // #ifdef H5
      window.open(`https://h5.waimai.meituan.com/waimai/mindex/home?keyword=${encodeURIComponent(food.name)}`, '_blank')
      // #endif
    },

    /**
     * 查看更多美食
     */
    onMoreFood() {
      const keyword = this.data.poiName || '美食'

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
