<template>
  <!-- #ifdef MP-WEIXIN -->
  <button class="fab" open-type="contact" @error="onError">
    <view class="fab-btn">
      <text class="fab-icon">💬</text>
    </view>
    <text class="fab-label">在线客服</text>
  </button>
  <!-- #endif -->
</template>

<script setup>
function onError(e) {
  console.error('[contact-fab] error:', e.detail);
}
</script>

<style scoped>
.fab {
  position: fixed;
  right: 28rpx;
  bottom: 180rpx;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  line-height: normal;
}

.fab::after {
  border: none;
}

.fab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 8rpx 24rpx rgba(16, 185, 129, 0.4);
}

.fab-icon {
  font-size: 36rpx;
}

.fab-label {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #666;
  text-align: center;
}
</style>
