<template>
  <view class="chat-page">
    <scroll-view
      class="message-list"
      scroll-y
      :scroll-into-view="scrollTarget"
      scroll-with-animation
    >
      <view
        v-for="(msg, i) in messages"
        :key="i"
        :id="'msg-' + i"
        :class="['message-row', msg.role]"
      >
        <view class="bubble">
          <text>{{ msg.text }}</text>
        </view>
      </view>
      <view v-if="sending" class="message-row bot">
        <view class="bubble loading">
          <text>正在思考...</text>
        </view>
      </view>
      <view id="msg-bottom" style="height: 20rpx" />
    </scroll-view>

    <view class="input-bar">
      <input
        v-model="inputText"
        class="input-field"
        placeholder="输入消息..."
        confirm-type="send"
        :disabled="sending"
        @confirm="sendMessage"
      />
      <button
        class="send-btn"
        :disabled="!inputText.trim() || sending"
        @tap="sendMessage"
      >
        发送
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref, nextTick } from 'vue';
import { sendCustomerServiceMessage } from '@/api/customer-service.js';

const messages = ref([]);
const inputText = ref('');
const sending = ref(false);
const scrollTarget = ref('');
const sessionId = ref(`cs_${Date.now()}`);

function scrollToBottom() {
  nextTick(() => {
    scrollTarget.value = '';
    nextTick(() => {
      scrollTarget.value = 'msg-bottom';
    });
  });
}

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || sending.value) return;

  messages.value.push({ role: 'user', text });
  inputText.value = '';
  scrollToBottom();

  sending.value = true;
  try {
    const result = await sendCustomerServiceMessage(text, sessionId.value);
    if (result.code === 0 && result.data) {
      messages.value.push({ role: 'bot', text: result.data.reply || '(无回复)' });
    } else {
      messages.value.push({ role: 'bot', text: `抱歉，出现了错误：${result.message}` });
    }
  } catch (e) {
    messages.value.push({ role: 'bot', text: '网络异常，请稍后重试' });
  } finally {
    sending.value = false;
    scrollToBottom();
  }
}
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
}

.message-list {
  flex: 1;
  padding: 20rpx 24rpx;
  box-sizing: border-box;
}

.message-row {
  display: flex;
  margin-bottom: 20rpx;
}

.message-row.user {
  justify-content: flex-end;
}

.message-row.bot {
  justify-content: flex-start;
}

.bubble {
  max-width: 75%;
  padding: 20rpx 28rpx;
  border-radius: 24rpx;
  font-size: 28rpx;
  line-height: 1.6;
  word-break: break-all;
}

.message-row.user .bubble {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  border-bottom-right-radius: 8rpx;
}

.message-row.bot .bubble {
  background: #fff;
  color: #333;
  border-bottom-left-radius: 8rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

.bubble.loading {
  opacity: 0.6;
}

.input-bar {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid #e5e5e5;
}

.input-field {
  flex: 1;
  height: 72rpx;
  padding: 0 24rpx;
  background: #f5f5f5;
  border-radius: 36rpx;
  font-size: 28rpx;
}

.send-btn {
  margin-left: 16rpx;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 32rpx;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  font-size: 28rpx;
  border-radius: 36rpx;
  border: none;
}

.send-btn[disabled] {
  opacity: 0.5;
}

.send-btn::after {
  border: none;
}
</style>
