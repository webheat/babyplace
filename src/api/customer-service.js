/**
 * 客服 API 抽象层
 * 当前使用 uniCloud，未来可切换到独立服务器
 */

// 切换为 true 使用独立服务器，false 使用 uniCloud
const USE_EXTERNAL_SERVER = false;
const EXTERNAL_SERVER_URL = 'https://your-server.com/api/chat';

// uniCloud 模式
const chatObject = uniCloud.importObject('babyplace-chat');

/**
 * 发送客服消息
 * @param {string} message - 用户消息
 * @param {string} sessionId - 会话ID
 * @returns {Promise<{code: number, message: string, data: object}>}
 */
export async function sendCustomerServiceMessage(message, sessionId) {
  if (USE_EXTERNAL_SERVER) {
    return sendViaExternalServer(message, sessionId);
  }
  return sendViaUniCloud(message, sessionId);
}

// uniCloud 调用方式
async function sendViaUniCloud(message, sessionId) {
  try {
    return await chatObject.send({ message, sessionId });
  } catch (error) {
    console.error('uniCloud chat error:', error);
    return {
      code: -1,
      message: error.message || '网络请求失败',
      data: null
    };
  }
}

// 独立服务器调用方式（未来启用）
async function sendViaExternalServer(message, sessionId) {
  try {
    const response = await fetch(EXTERNAL_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId })
    });
    return await response.json();
  } catch (error) {
    console.error('External server chat error:', error);
    return {
      code: -1,
      message: error.message || '网络请求失败',
      data: null
    };
  }
}

export default {
  sendCustomerServiceMessage
};
