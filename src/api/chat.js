import config from '@/config/config';

const CHAT_API_URL = config.chatApiUrl;

export async function sendChatMessage(message, sessionId) {
  try {
    const res = await new Promise((resolve, reject) => {
      uni.request({
        url: CHAT_API_URL,
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
    uni.showToast({ title: error?.errMsg || error?.message || '网络请求失败', icon: 'none' });
    return { code: -1, message: error?.errMsg || error?.message || '网络请求失败' };
  }
}
