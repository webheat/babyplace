<template>
  <!-- #ifdef MP-WEIXIN -->
  <view class="fab-wrapper">
    <view v-if="showBubble" class="bubble">
      <view class="bubble-title">{{ bubbleTitle }}</view>
      <view
        v-for="(q, i) in questions"
        :key="i"
        class="bubble-item"
        @click="pickQuestion(q)"
      >
        {{ q }}
      </view>
      <button
        class="bubble-contact-btn"
        open-type="contact"
        :send-message-title="currentTitle"
        :show-message-card="true"
        @contact="onContact"
        @error="onError"
      >
        直接咨询
      </button>
      <view class="bubble-arrow" />
    </view>
    <view class="fab-btn" @click="toggleBubble">
      <text class="fab-icon">💬</text>
      <text class="fab-label">在线客服</text>
    </view>
  </view>
  <!-- #endif -->
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  sendMessageTitle: { type: String, default: '' },
  bubbleTitle: { type: String, default: '常见问题' },
  questions: { type: Array, default: () => [] },
});

const showBubble = ref(false);
const currentTitle = ref(props.sendMessageTitle);

watch(() => props.sendMessageTitle, (val) => {
  currentTitle.value = val;
});

function toggleBubble() {
  showBubble.value = !showBubble.value;
}

function pickQuestion(q) {
  currentTitle.value = q;
}

function onContact() {
  showBubble.value = false;
  currentTitle.value = props.sendMessageTitle;
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
  min-width: 340rpx;
  max-width: 500rpx;
  background: #fff;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.15);
  padding: 24rpx;
}

.bubble-title {
  font-size: 24rpx;
  color: #999;
  margin-bottom: 16rpx;
}

.bubble-item {
  font-size: 26rpx;
  color: #333;
  padding: 16rpx 12rpx;
  border-radius: 12rpx;
  margin-bottom: 8rpx;
  background: #f7f8fa;
  line-height: 1.4;
}

.bubble-item:active {
  background: #e8f5e9;
  color: #10b981;
}

.bubble-contact-btn {
  margin-top: 16rpx;
  width: 100%;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 28rpx;
  color: #fff;
  background: linear-gradient(135deg, #10b981, #059669);
  border-radius: 36rpx;
  border: none;
  padding: 0;
}

.bubble-contact-btn::after {
  border: none;
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

.fab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 110rpx;
  height: 110rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 8rpx 24rpx rgba(16, 185, 129, 0.4);
}

.fab-icon {
  font-size: 40rpx;
}

.fab-label {
  font-size: 18rpx;
  color: #fff;
  margin-top: 2rpx;
}
</style>
