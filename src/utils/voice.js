/**
 * 语音工具模块
 * 封装微信同声传译插件（WechatSI）的 ASR 和 TTS 功能
 *
 * ASR（语音识别）：用户说话 → 文字
 * TTS（语音合成）：文字 → AI 说话
 */

import { logInfo as logVoiceInfo, logError as logVoiceError } from '@/utils/logger'

// #ifdef MP-WEIXIN
let plugin = null
let recognitionManager = null
let isStopping = false  // 防止 stop→start 竞态

function ensurePlugin() {
  if (!plugin) {
    try {
      plugin = requirePlugin('WechatSI')
      logVoiceInfo('plugin.require.success')
    } catch (error) {
      logVoiceError('plugin.require.fail', error)
      throw error
    }
  }
  if (!recognitionManager) {
    try {
      recognitionManager = plugin.getRecordRecognitionManager()
      logVoiceInfo('plugin.recognitionManager.success')
    } catch (error) {
      logVoiceError('plugin.recognitionManager.fail', error)
      throw error
    }
  }
  return recognitionManager
}
// #endif

const TTS_CHUNK_MAX_LENGTH = 100

/**
 * 开始语音识别（ASR）
 * @param {Function} onResult - 识别结果回调 { text: string, isFinal: boolean }
 * @param {Function} onError - 错误回调
 */
export function startVoiceRecognize(onResult, onError) {
  // #ifdef MP-WEIXIN
  // 防止在 stop 过程中立刻 start，导致 -30011 错误
  if (isStopping) {
    logVoiceInfo('asr.start.skipped', { reason: 'isStopping' })
    return
  }

  let mgr = null
  try {
    mgr = ensurePlugin()
  } catch (error) {
    onError && onError(error)
    return
  }
  if (!mgr) {
    const error = { errMsg: '语音插件未加载，请检查 WechatSI 插件配置' }
    logVoiceError('asr.manager.empty', error)
    onError && onError(error)
    return
  }

  // 防止 onFinish/onStop 双重触发 isFinal
  let finalFired = false

  // 用赋值方式注册回调（WechatSI 插件 API）
  mgr.onRecognize = (res) => {
    onResult({ text: res.result, isFinal: false })
  }
  mgr.onFinish = (res) => {
    if (!finalFired) {
      finalFired = true
      logVoiceInfo('asr.finish', { resultLength: String(res?.result || '').length })
      onResult({ text: res.result, isFinal: true })
    }
  }
  mgr.onStop = (res) => {
    if (!finalFired && res.result) {
      finalFired = true
      logVoiceInfo('asr.stop.final', { resultLength: String(res?.result || '').length })
      onResult({ text: res.result, isFinal: true })
    } else {
      logVoiceInfo('asr.stop.empty', { hasResult: !!res?.result })
    }
  }
  mgr.onError = (err) => {
    logVoiceError('asr.onError', err)
    onError(err)
  }

  try {
    logVoiceInfo('asr.start.before', { lang: 'zh_CN' })
    mgr.start({ lang: 'zh_CN' })
    logVoiceInfo('asr.start.success', { lang: 'zh_CN' })
  } catch (err) {
    logVoiceError('asr.start.throw', err, { lang: 'zh_CN' })
    onError(err)
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
  let mgr = null
  try {
    mgr = ensurePlugin()
  } catch (error) {
    logVoiceError('asr.stop.ensurePlugin.fail', error)
    return
  }
  if (mgr) {
    isStopping = true
    logVoiceInfo('asr.stop.before')
    // 延迟 300ms 再停止，让识别有时间处理最后的音频
    setTimeout(() => {
      try {
        mgr.stop()
        logVoiceInfo('asr.stop.success')
      } catch (err) {
        console.warn('[voice.js] stop threw:', JSON.stringify(err))
        logVoiceError('asr.stop.throw', err)
      } finally {
        // stop 完成后再等 200ms 才允许 start，确保插件状态清理干净
        setTimeout(() => { isStopping = false }, 200)
      }
    }, 300)
  }
  // #endif
}

/**
 * 将长文本按句子拆分成多段，每段不超过 maxLen
 * @param {string} text
 * @param {number} maxLen - 每段最大字符数，默认 200
 * @returns {string[]}
 */
function splitTextForTTS(text, maxLen = TTS_CHUNK_MAX_LENGTH) {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) return []

  // 按中英文句号、问号、感叹号、换行拆分
  const sentences = normalizedText.split(/(?<=[。！？!?\n])\s*/).filter(Boolean)
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
        result.push(c.slice(i, i + maxLen).trim())
      }
    }
  }
  return result.filter(Boolean)
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
    try {
      ensurePlugin()
    } catch (error) {
      logVoiceError('tts.ensurePlugin.fail', error)
      reject(error)
      return
    }
    logVoiceInfo('tts.request.before', { textLength: text.length })
    plugin.textToSpeech({
      lang: options.lang || 'zh_CN',
      content: text,
      success: (res) => {
        logVoiceInfo('tts.request.success', {
          textLength: text.length,
          hasFilename: !!res?.filename,
        })
        const audio = wx.createInnerAudioContext()
        audio.src = res.filename
        audio.onEnded(() => {
          audio.destroy()
          resolve()
        })
        audio.onError((err) => {
          console.error('[voice.js] InnerAudioContext onError:', err)
          logVoiceError('tts.audio.error', err, { textLength: text.length })
          audio.destroy()
          reject(err)
        })
        audio.play()
      },
      fail: (err) => {
        console.error('[voice.js] textToSpeech fail:', JSON.stringify(err))
        logVoiceError('tts.request.fail', err, { textLength: text.length })
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
      if (!chunks.length) {
        resolve()
        return
      }

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
  try {
    ensurePlugin()
    return !!plugin && !!recognitionManager
  } catch (e) {
    return false
  }
  // #endif
  // #ifdef H5
  return typeof window !== 'undefined' && !!window.speechSynthesis
  // #endif
  return false
}
