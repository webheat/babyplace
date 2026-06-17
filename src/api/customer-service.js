/**
 * 客服 API — 通过 Go 后端 HTTP 接口调用
 */

export async function sendCustomerServiceMessage(message, sessionId) {
  try {
    const [err, res] = await uni.request({
      url: 'https://byupload.aixifs.com/api/chat',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { message, session_id: sessionId },
      timeout: 120000,
    });
    if (err) {
      return { code: -1, message: err.errMsg || '网络请求失败', data: null };
    }
    return res.data;
  } catch (error) {
    return { code: -1, message: error.message || '网络请求失败', data: null };
  }
}

export default {
  sendCustomerServiceMessage,
};
