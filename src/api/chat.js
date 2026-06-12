/**
 * AI 客服 API
 * 支持两种后端模式：
 *   1. uniCloud 云函数（默认）
 *   2. Golang HTTP 后端（设置 CHAT_API_URL 后启用）
 */

const CHAT_API_URL = ''; // 例: https://your-server.com/api/chat，留空则使用云函数

const chatObject = CHAT_API_URL ? null : uniCloud.importObject('babyplace-chat');

export async function sendChatMessage(message, sessionId) {
  if (CHAT_API_URL) {
    // Golang HTTP 后端模式
    const [err, res] = await uni.request({
      url: CHAT_API_URL,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { message, session_id: sessionId },
      timeout: 120000,
    });
    if (err) {
      return { code: -1, message: err.errMsg || '网络请求失败' };
    }
    return res.data;
  }
  // uniCloud 云函数模式
  return chatObject.send({ message, sessionId });
}
