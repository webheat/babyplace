/**
 * 语音工具模块
 * 封装微信同声传译插件（WechatSI）的 ASR 和 TTS 功能
 *
 * ASR（语音识别）：用户说话 → 文字
 * TTS（语音合成）：文字 → AI 说话
 */

// #ifdef MP-WEIXIN
const plugin = requirePlugin('WechatSI')
const recorderManager = wx.getRecorderManager()
const recognitionManager = plugin.getRecordRecognitionManager()
// #endif

/**
 * 开始语音识别（ASR）
 * @param {Function} onResult - 识别结果回调 { text: string, isFinal: boolean }
 * @param {Function} onError - 错误回调
 */
export function startVoiceRecognize(onResult, onError) {
  // #ifdef MP-WEIXIN
  recognitionManager.start({ lang: 'zh_CN' })
  recognitionManager.onRecognize((res) => {
    // 实时识别结果（增量）
    onResult({ text: res.result, isFinal: false })
  })
  recognitionManager.onStop((res) => {
    // 最终识别结果
    onResult({ text: res.result, isFinal: true })
  })
  recognitionManager.onError((err) => {
    onError(err)
  })
  // #endif

  // #ifdef H5
  // H5 环境不支持 WechatSI，降级提示
  onError && onError({ errMsg: 'H5 环境不支持语音识别，请使用微信小程序' })
  // #endif
}

/**
 * 停止语音识别
 */
export function stopVoiceRecognize() {
  // #ifdef MP-WEIXIN
  recognitionManager.stop()
  // #endif
}

/**
 * 文字转语音并播放（TTS）
 * @param {string} text - 要朗读的文字
 * @param {Object} options - 配置项
 * @param {string} options.lang - 语言，默认 'zh_CN'
 * @returns {Promise<void>} 播放完成 resolve，失败 reject
 */
export function speak(text, options = {}) {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    plugin.textToSpeech({
      lang: options.lang || 'zh_CN',
      tts: true,
      content: text,
      success: (res) => {
        const audio = wx.createInnerAudioContext()
        audio.src = res.filename
        audio.onEnded(() => {
          audio.destroy()
          resolve()
        })
        audio.onError((err) => {
          audio.destroy()
          reject(err)
        })
        audio.play()
      },
      fail: (err) => {
        reject(err)
      },
    })
    // #endif

    // #ifdef H5
    // H5 环境降级：使用 Web Speech API 的 SpeechSynthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = options.lang || 'zh-CN'
      utterance.onend = () => resolve()
      utterance.onerror = (err) => reject(err)
      window.speechSynthesis.speak(utterance)
    } else {
      reject(new Error('当前环境不支持语音合成'))
    }
    // #endif
  })
}

/**
 * 检查语音插件是否可用
 * @returns {boolean}
 */
export function isVoiceAvailable() {
  // #ifdef MP-WEIXIN
  return typeof plugin !== 'undefined' && typeof recognitionManager !== 'undefined'
  // #endif
  // #ifdef H5
  return typeof window !== 'undefined' && !!window.speechSynthesis
  // #endif
  return false
}
