import csConfig from '@/config/customer-service.js';

export function openEnterpriseChat() {
  // #ifdef MP-WEIXIN
  const corpId = (csConfig.corpId || '').trim();
  const extInfo = (csConfig.extInfo || '').trim();
  if (!corpId || !extInfo) return false;
  uni.openCustomerServiceChat({
    corpId,
    extInfo,
    fail(err) {
      uni.showToast({ title: '打开客服失败', icon: 'none' });
      console.error('openCustomerServiceChat fail:', err);
    },
  });
  return true;
  // #endif
  return false;
}
