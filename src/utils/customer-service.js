export function isWeixinDevtools() {
  // #ifdef MP-WEIXIN
  try {
    return uni.getSystemInfoSync()?.platform === 'devtools';
  } catch (error) {
    return false;
  }
  // #endif
  return false;
}

export function openCustomerServiceChatPage() {
  uni.navigateTo({ url: '/pages/chat/chat' });
  return true;
}

export const openEnterpriseChat = openCustomerServiceChatPage;
