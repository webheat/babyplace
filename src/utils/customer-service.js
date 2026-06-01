import csConfig from '@/config/customer-service.js';

/**
 * Open customer service chat.
 * Currently redirects to AI chat directly.
 * TODO: After enterprise WeChat certification, enable uni.openCustomerServiceChat
 */
export function openEnterpriseChat() {
  //企微未认证，暂时直接跳转 AI 聊天
  uni.navigateTo({ url: '/pages/chat/chat' });
  return true;
}

/**
 * Open the AI assistant chat page directly.
 */
export function openAIChat() {
  uni.navigateTo({ url: '/pages/chat/chat' });
}
