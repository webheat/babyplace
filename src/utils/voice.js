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

  // 防止 onFinish/onStop 双重触发 isFinal
  let finalFired = false

  // 用赋值方式注册回调（WechatSI 插件 API）
  recognitionManager.onRecognize = (res) => {
    console.warn('[voice.js] >>> onRecognize:', JSON.stringify(res));
    onResult({ text: res.result, isFinal: false })
  }
  recognitionManager.onFinish = (res) => {
    console.warn('[voice.js] >>> onFinish:', JSON.stringify(res));
    if (!finalFired) {
      finalFired = true
      onResult({ text: res.result, isFinal: true })
    }
  }
  recognitionManager.onStop = (res) => {
    console.warn('[voice.js] >>> onStop:', JSON.stringify(res));
    if (!finalFired && res.result) {
      finalFired = true
      onResult({ text: res.result, isFinal: true })
    }
  }
  recognitionManager.onError = (err) => {
    console.warn('[voice.js] >>> onError:', JSON.stringify(err));
    onError(err)
  }

  try {
    recognitionManager.start({ lang: 'zh_CN', duration: 60000 });
    console.warn('[voice.js] start() called successfully');
  } catch (err) {
    console.warn('[voice.js] start threw:', JSON.stringify(err));
    onError(err);
    return;
  }
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
  // 延迟 300ms 再停止，让识别有时间处理最后的音频
  setTimeout(() => {
    recognitionManager.stop()
  }, 300)
  // #endif
}

/**
 * 将长文本按句子拆分成多段，每段不超过 maxLen
 * @param {string} text
 * @param {number} maxLen - 每段最大字符数，默认 200
 * @returns {string[]}
 */
function splitTextForTTS(text, maxLen = 200) {
  // 按中英文句号、问号、感叹号、换行拆分
  const sentences = text.split(/(?<=[。！？!?\n])\s*/).filter(Boolean)
  const chunks = []
  let current = ''
  for (const s of sentences) {
    if (current.length + s.length > maxLen && current) {
      chunks.push(current)
      current = ''
    }
    current += s
  }
  if (current) chunks.push(current)
  // 如果单句超长，硬切
  const result = []
  for (const c of chunks) {
    if (c.length <= maxLen) {
      result.push(c)
    } else {
      for (let i = 0; i < c.length; i += maxLen) {
        result.push(c.slice(i, i + maxLen))
      }
    }
  }
  return result
}

// #ifdef MP-WEIXIN
/**
 * 播放单段 TTS 音频（内部辅助）
 * @param {string} text - 单段文本
 * @param {Object} options
 * @returns {Promise<void>}
 */
function speakOneChunk(text, options) {
  return new Promise((resolve, reject) => {
    plugin.textToSpeech({
      lang: options.lang || 'zh_CN',
      content: text,
      success: (res) => {
        const audio = wx.createInnerAudioContext()
        audio.src = res.filename
        audio.onEnded(() => {
          audio.destroy()
          resolve()
        })
        audio.onError((err) => {
          console.error('[voice.js] InnerAudioContext onError:', err)
          audio.destroy()
          reject(err)
        })
        audio.play()
      },
      fail: (err) => {
        console.error('[voice.js] textToSpeech fail:', err)
        reject(err)
      },
    })
  })
}
// #endif

/**
 * 文字转语音并播放（TTS）
 * 长文本自动按句子拆分，逐段播放
 * @param {string} text - 要朗读的文字
 * @param {Object} options - 配置项
 * @param {string} options.lang - 语言，默认 'zh_CN'
 * @returns {Promise<void>} 全部播放完成 resolve，失败 reject
 */
export function speak(text, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const chunks = splitTextForTTS(text)

      // #ifdef MP-WEIXIN
      for (const chunk of chunks) {
        await speakOneChunk(chunk, options)
      }
      resolve()
      // #endif

      // #ifdef H5
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        let index = 0
        const playNext = () => {
          if (index >= chunks.length) {
            resolve()
            return
          }
          const utterance = new SpeechSynthesisUtterance(chunks[index])
          utterance.lang = options.lang || 'zh-CN'
          utterance.onend = () => {
            index++
            playNext()
          }
          utterance.onerror = (err) => reject(err)
          window.speechSynthesis.speak(utterance)
        }
        playNext()
      } else {
        reject(new Error('当前环境不支持语音合成'))
      }
      // #endif
    } catch (err) {
      console.error('[voice.js] speak unexpected error:', err)
      reject(err)
    }
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
