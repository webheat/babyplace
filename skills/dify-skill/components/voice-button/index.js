let plugin = null
let recognitionManager = null

function ensurePlugin() {
  if (!plugin) {
    plugin = requirePlugin('WechatSI')
  }
  if (!recognitionManager) {
    recognitionManager = plugin.getRecordRecognitionManager()
  }
  return recognitionManager
}

Component({
  properties: {
    /** 是否禁用语音按钮 */
    disabled: { type: Boolean, value: false }
  },

  data: {
    /** 是否正在录音识别中 */
    isListening: false,
    /** 实时识别文本 */
    realtimeText: '',
    /** 最终识别文本 */
    finalText: '',
    /** 录音动画帧 */
    animationTimer: null,
    /** 录音时长（秒） */
    duration: 0,
    /** 最大录音时长（秒） */
    maxDuration: 60
  },

  lifetimes: {
    detached() {
      this._clearTimers()
    }
  },

  methods: {
    /**
     * 触摸开始 — 长按说话
     */
    onTouchStart() {
      if (this.data.disabled || this.data.isListening) return

      this.setData({ isListening: true, realtimeText: '', finalText: '', duration: 0 })

      const mgr = ensurePlugin()
      // 开始录音识别
      mgr.start({ lang: 'zh_CN' })

      // 录音时长计时
      this._durationTimer = setInterval(() => {
        const duration = this.data.duration + 1
        if (duration >= this.data.maxDuration) {
          this.onTouchEnd()
          return
        }
        this.setData({ duration })
      }, 1000)

      // 实时识别回调
      mgr.onRecognize((res) => {
        this.setData({ realtimeText: res.result })
      })

      // 识别完成回调
      mgr.onStop((res) => {
        this._clearTimers()
        const finalText = res.result || this.data.realtimeText
        this.setData({
          isListening: false,
          finalText,
          realtimeText: ''
        })

        if (finalText) {
          this.triggerEvent('result', { text: finalText })
        } else {
          this.triggerEvent('error', { errMsg: '未识别到语音内容' })
        }
      })

      // 错误回调
      mgr.onError((err) => {
        this._clearTimers()
        this.setData({ isListening: false, realtimeText: '' })
        this.triggerEvent('error', err)
      })

      this.triggerEvent('start')
    },

    /**
     * 触摸结束 — 停止录音，等待识别结果
     */
    onTouchEnd() {
      if (!this.data.isListening) return
      const mgr = ensurePlugin()
      if (mgr) mgr.stop()
      this.triggerEvent('stop')
    },

    /**
     * 清理定时器
     */
    _clearTimers() {
      if (this._durationTimer) {
        clearInterval(this._durationTimer)
        this._durationTimer = null
      }
    }
  }
})
