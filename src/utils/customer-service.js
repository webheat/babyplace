import csConfig from '@/config/customer-service.js';

/**
 * Open enterprise WeChat customer service chat.
 * Falls back to AI chat page if the native API is unavailable.
 */
export function openEnterpriseChat() {
  const { corpId, extInfo } = csConfig;

  if (corpId && extInfo) {
    uni.openCustomerServiceChat({
      extInfo: { url: extInfo },
      corpId,
      fail(err) {
        console.warn('openCustomerServiceChat failed, falling back to AI chat:', err);
        uni.navigateTo({ url: '/pages/chat/chat' });
      },
    });
    return true;
  }

  // No enterprise CS config — go straight to AI chat
  uni.navigateTo({ url: '/pages/chat/chat' });
  return true;
}

/**
 * Open the AI assistant chat page directly.
 */
export function openAIChat() {
  uni.navigateTo({ url: '/pages/chat/chat' });
}
