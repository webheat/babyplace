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
      <button
        class="voice-btn"
        :class="{ active: isRecording }"
        :disabled="sending || !voiceSupported"
        @tap="handleVoiceTap"
      >
        {{ isRecording ? '停止' : '语音' }}
      </button>
      <input
        v-model="inputText"
        class="input-field"
        :placeholder="isRecording ? '正在听你说...' : '输入消息...'"
        confirm-type="send"
        :disabled="sending || isRecording"
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
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { sendChatMessage } from '@/api/chat.js';

const messages = ref([]);
const inputText = ref('');
const sending = ref(false);
const isRecording = ref(false);
const voiceSupported = ref(false);
const scrollTarget = ref('');
const sessionId = ref(`cs_${Date.now()}`);

let voiceManager = null;

function scrollToBottom() {
  nextTick(() => {
    scrollTarget.value = '';
    nextTick(() => {
      scrollTarget.value = 'msg-bottom';
    });
  });
}

function showToast(title) {
  uni.showToast({ title, icon: 'none' });
}

function normalizeVoiceError(error) {
  const message = String(error?.errMsg || error?.message || '').toLowerCase();
  if (message.includes('auth deny') || message.includes('authorize')) return '未获得录音权限';
  if (message.includes('not support') || message.includes('support')) return '当前环境不支持语音识别';
  if (message.includes('no speech') || message.includes('silence')) return '没有识别到语音';
  if (message.includes('network')) return '语音识别网络异常';
  return '语音识别失败';
}

function authorizeRecord() {
  return new Promise((resolve, reject) => {
    uni.authorize({
      scope: 'scope.record',
      success: () => resolve(true),
      fail: (error) => reject(error)
    });
  });
}

function requestRecordPermission() {
  return new Promise((resolve) => {
    uni.getSetting({
      success: async (setting) => {
        if (setting.authSetting?.['scope.record']) {
          resolve(true);
          return;
        }

        try {
          await authorizeRecord();
          resolve(true);
        } catch (error) {
          uni.showModal({
            title: '需要录音权限',
            content: '请允许录音权限后使用语音输入',
            confirmText: '去设置',
            success: (modal) => {
              if (!modal.confirm) {
                resolve(false);
                return;
              }
              uni.openSetting({
                success: (openResult) => {
                  resolve(Boolean(openResult.authSetting?.['scope.record']));
                },
                fail: () => resolve(false)
              });
            },
            fail: () => resolve(false)
          });
        }
      },
      fail: () => resolve(false)
    });
  });
}

function initVoiceManager() {
  // #ifdef MP-WEIXIN
  if (typeof requirePlugin !== 'function') return;
  try {
    const plugin = requirePlugin('WechatSI');
    voiceManager = plugin.getRecordRecognitionManager();
    voiceSupported.value = Boolean(voiceManager);

    voiceManager.onStart = () => {
      isRecording.value = true;
    };
    voiceManager.onRecognize = (result) => {
      const text = result?.result || '';
      if (text) inputText.value = text;
    };
    voiceManager.onStop = (result) => {
      isRecording.value = false;
      const text = (result?.result || '').trim();
      if (text) {
        inputText.value = text;
        return;
      }
      showToast('没有识别到语音');
    };
    voiceManager.onError = (error) => {
      isRecording.value = false;
      showToast(normalizeVoiceError(error));
    };
  } catch (error) {
    voiceSupported.value = false;
  }
  // #endif
}

async function handleVoiceTap() {
  if (!voiceSupported.value || !voiceManager) {
    showToast('当前环境不支持语音识别');
    return;
  }
  if (isRecording.value) {
    voiceManager.stop();
    return;
  }
  const granted = await requestRecordPermission();
  if (!granted) {
    showToast('未获得录音权限');
    return;
  }
  try {
    inputText.value = '';
    voiceManager.start({ lang: 'zh_CN' });
  } catch (error) {
    isRecording.value = false;
    showToast(normalizeVoiceError(error));
  }
}

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || sending.value) return;

  messages.value.push({ role: 'user', text });
  inputText.value = '';
  scrollToBottom();

  sending.value = true;
  try {
    const result = await sendChatMessage(text, sessionId.value);
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

onMounted(() => {
  initVoiceManager();
});

onUnmounted(() => {
  if (isRecording.value && voiceManager) voiceManager.stop();
});
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

.voice-btn {
  flex-shrink: 0;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 24rpx;
  margin-right: 16rpx;
  background: #eef2ff;
  color: #2563eb;
  font-size: 26rpx;
  border-radius: 36rpx;
  border: none;
}

.voice-btn.active {
  background: #fee2e2;
  color: #dc2626;
}

.voice-btn[disabled] {
  opacity: 0.45;
}

.voice-btn::after {
  border: none;
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
