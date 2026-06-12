<template>
  <view v-if="show" class="fab" @click="openChat">
    <view class="fab-btn">
      <text class="fab-icon">🎤</text>
    </view>
    <text class="fab-label">AI助手</text>
  </view>
</template>

<script setup>
defineProps({
  show: { type: Boolean, default: true },
});

function openChat() {
  uni.navigateTo({ url: '/pages/chat/chat' });
}
</script>

<style scoped>
.fab {
  position: fixed;
  right: 28rpx;
  bottom: 180rpx;
  z-index: 9999;
}

.fab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96rpx;
  height: 96rpx;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 8rpx 24rpx rgba(16, 185, 129, 0.4);
  line-height: 96rpx;
  border: none;
}

.fab-btn::after {
  border: none;
}

.fab-icon {
  font-size: 32rpx;
  font-weight: 700;
  color: #fff;
}
</style>
