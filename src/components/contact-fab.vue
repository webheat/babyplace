<template>
  <!-- #ifdef MP-WEIXIN -->
  <view class="fab-wrapper">
    <view v-if="showBubble && questions.length" class="bubble">
      <view class="bubble-title">{{ bubbleTitle }}</view>
      <view
        v-for="(q, i) in questions"
        :key="i"
        class="bubble-item"
        @click.stop="pickQuestion(q)"
      >
        {{ q }}
      </view>
      <view class="bubble-arrow" />
    </view>
    <button
      class="fab"
      open-type="contact"
      :send-message-title="currentTitle"
      :show-message-card="true"
      @contact="onContact"
      @error="onError"
    >
      <view class="fab-btn" @click.stop="toggleBubble">
        <text class="fab-icon">💬</text>
      </view>
      <text class="fab-label">在线客服</text>
    </button>
  </view>
  <!-- #endif -->
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  sendMessageTitle: { type: String, default: '' },
  bubbleTitle: { type: String, default: '常见问题' },
  questions: { type: Array, default: () => [] },
});

const showBubble = ref(false);
const currentTitle = ref(props.sendMessageTitle);

function toggleBubble() {
  showBubble.value = !showBubble.value;
}

function pickQuestion(q) {
  currentTitle.value = q;
  showBubble.value = false;
}

function onContact() {
  showBubble.value = false;
}

function onError(e) {
  console.error('[contact-fab] error:', e.detail);
}
</script>

<style scoped>
.fab-wrapper {
  position: fixed;
  right: 28rpx;
  bottom: 180rpx;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.bubble {
  position: absolute;
  bottom: 130rpx;
  right: 0;
  min-width: 320rpx;
  max-width: 480rpx;
  background: #fff;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.12);
  padding: 20rpx 24rpx;
}

.bubble-title {
  font-size: 24rpx;
  color: #999;
  margin-bottom: 12rpx;
}

.bubble-item {
  font-size: 26rpx;
  color: #333;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
  line-height: 1.4;
}

.bubble-item:last-of-type {
  border-bottom: none;
}

.bubble-arrow {
  position: absolute;
  bottom: -16rpx;
  right: 40rpx;
  width: 0;
  height: 0;
  border-left: 16rpx solid transparent;
  border-right: 16rpx solid transparent;
  border-top: 16rpx solid #fff;
}

.fab {
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
