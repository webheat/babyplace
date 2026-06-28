/**
 * AI 客服 API — 通过 Go 后端 HTTP 接口调用
 */

import { callAdminAction } from '@/api/admin';

export async function sendChatMessage(message, sessionId) {
  try {
    const res = await new Promise((resolve, reject) => {
      uni.request({
        url: 'https://byupload.aixifs.com/api/chat',
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: { message, session_id: sessionId },
        timeout: 120000,
        success: (response) => resolve(response),
        fail: (error) => reject(error),
      });
    });
    return res.data;
  } catch (error) {
    return { code: -1, message: error?.errMsg || error?.message || '网络请求失败' };
  }
}
