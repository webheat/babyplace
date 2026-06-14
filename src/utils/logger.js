/**
 * 通用日志工具
 * 封装微信实时日志 + Go 后端远程上报
 *
 * 用法：
 *   import { logInfo, logWarn, logError } from '@/utils/logger'
 *   logInfo('page_load', { page: 'poi/detail' })
 *   logError('api_fail', error, { action: 'poi.list' })
 */

// #ifdef MP-WEIXIN
const LOG_URL = `${(import.meta.env.VITE_GO_SERVER || 'https://oc.aixifs.com').replace(/\/$/, '')}/api/client-log`
const SOURCE = 'mp-weixin-app'
let _realtimeLogger = null
// #endif

function safeStringify(value) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeError(error) {
  if (!error) return {}
  if (typeof error === 'string') return { message: error }
  return {
    errCode: error.errCode,
    errMsg: error.errMsg,
    message: error.message,
    stack: error.stack,
    raw: safeStringify(error),
  }
}

function getRuntimeContext() {
  // #ifdef MP-WEIXIN
  const accountInfo = wx.getAccountInfoSync ? wx.getAccountInfoSync() : {}
  const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  const currentPage = pages.length ? pages[pages.length - 1] : null
  return {
    envVersion: accountInfo?.miniProgram?.envVersion || '',
    appId: accountInfo?.miniProgram?.appId || '',
    SDKVersion: systemInfo.SDKVersion || '',
    brand: systemInfo.brand || '',
    model: systemInfo.model || '',
    platform: systemInfo.platform || '',
    system: systemInfo.system || '',
    page: currentPage?.route || '',
  }
  // #endif
  // #ifdef H5
  return {
    platform: 'h5',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    page: typeof window !== 'undefined' ? window.location.pathname : '',
  }
  // #endif
}

function getRealtimeLogger() {
  // #ifdef MP-WEIXIN
  if (_realtimeLogger) return _realtimeLogger
  if (wx.getRealtimeLogManager) {
    _realtimeLogger = wx.getRealtimeLogManager()
  }
  return _realtimeLogger
  // #endif
  return null
}

function writeRealtimeLog(level, eventName, detail = {}) {
  const logger = getRealtimeLogger()
  if (!logger) return
  const payload = { event: eventName, ...getRuntimeContext(), ...detail }
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'
  logger[method](`[${SOURCE}]`, payload)
}

function reportRemote(eventName, detail = {}) {
  // #ifdef MP-WEIXIN
  try {
    uni.request({
      url: LOG_URL,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      timeout: 5000,
      data: {
        source: SOURCE,
        event: eventName,
        ...getRuntimeContext(),
        ...detail,
      },
      fail: (err) => {
        console.warn('[logger] reportRemote failed:', err?.errMsg || err)
      },
    })
  } catch (err) {
    console.warn('[logger] reportRemote unavailable:', err?.message || err)
  }
  // #endif
}

// ─── 导出函数 ────────────────────────────────────────────────

/**
 * 信息日志（仅写实时日志，不上报远程）
 */
export function logInfo(eventName, detail = {}) {
  console.log(`[logger] ${eventName}`, detail)
  writeRealtimeLog('info', eventName, detail)
}

/**
 * 警告日志（写实时日志 + 上报远程）
 */
export function logWarn(eventName, detail = {}) {
  console.warn(`[logger] ${eventName}`, detail)
  writeRealtimeLog('warn', eventName, detail)
  reportRemote(eventName, { level: 'warn', ...detail })
}

/**
 * 错误日志（写实时日志 + 上报远程）
 * @param {string} eventName - 事件名
 * @param {Error|string} error - 错误对象或消息
 * @param {Object} detail - 额外信息
 */
export function logError(eventName, error, detail = {}) {
  const normalizedError = normalizeError(error)
  const payload = { ...detail, error: normalizedError }
  console.error(`[logger] ${eventName}`, payload)
  writeRealtimeLog('error', eventName, payload)
  reportRemote(eventName, { level: 'error', ...payload })
}
