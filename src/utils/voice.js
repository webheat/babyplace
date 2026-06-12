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
  console.warn('[voice.js] startVoiceRecognize called');
  console.warn('[voice.js] plugin type:', typeof plugin);
  console.warn('[voice.js] recognitionManager type:', typeof recognitionManager);
  if (!recognitionManager) {
    console.error('[voice.js] recognitionManager is null/undefined!');
    onError && onError({ errMsg: '语音插件未加载，请检查 WechatSI 插件配置' });
    return;
  }

  try {
    recognitionManager.start({ lang: 'zh_CN' });
    console.log('[voice.js] recognitionManager.start() called');
  } catch (err) {
    console.error('[voice.js] start error:', err);
    onError(err);
    return;
  }

  recognitionManager.onRecognize((res) => {
    console.log('[voice.js] onRecognize:', res);
    // 实时识别结果（增量）
    onResult({ text: res.result, isFinal: false })
  })
  recognitionManager.onStop((res) => {
    console.log('[voice.js] onStop:', res);
    // 最终识别结果
    onResult({ text: res.result, isFinal: true })
  })
  recognitionManager.onError((err) => {
    console.error('[voice.js] onError:', err);
    onError(err)
  })
  // #endif

  // #ifdef H5
  // H5 使用 Web Speech API（Chrome/Edge 支持）
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    onError && onError({ errMsg: '当前浏览器不支持语音识别，请使用 Chrome/Edge' })
    return
  }
  const recognition = new SpeechRecognition()
  recognition.lang = 'zh-CN'
  recognition.continuous = true
  recognition.interimResults = true
  window.__h5Recognition = recognition

  recognition.onresult = (event) => {
    let interimTranscript = ''
    let finalTranscript = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
      if (event.results[i].isFinal) {
        finalTranscript += transcript
      } else {
        interimTranscript += transcript
      }
    }
    if (interimTranscript) {
      onResult({ text: interimTranscript, isFinal: false })
    }
    if (finalTranscript) {
      onResult({ text: finalTranscript, isFinal: true })
    }
  }
  recognition.onerror = (err) => {
    onError && onError({ errMsg: err.error || '语音识别错误' })
  }
  recognition.onend = () => {
    // 自动停止时触发 final
  }
  try {
    recognition.start()
  } catch (err) {
    onError && onError({ errMsg: '启动语音识别失败: ' + err.message })
  }
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
