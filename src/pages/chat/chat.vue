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
          <view v-if="msg.role === 'bot' && hasLocation(msg.text)" class="map-action">
            <view class="map-btn" @tap="openMapFromText(msg.text)">
              <text>📍 查看地图</text>
            </view>
          </view>
          <view v-if="msg.sources && msg.sources.length" class="sources">
            <text class="sources-title">📚 参考来源：</text>
            <text v-for="(s, j) in msg.sources" :key="j" class="source-item">
              · {{ s.dataset_name || s.title || '知识库' }}
            </text>
          </view>
        </view>
      </view>
      <view v-if="sending" class="message-row bot">
        <view class="bubble loading">
          <text>正在思考...</text>
        </view>
      </view>
      <view id="msg-bottom" style="height: 20rpx" />
    </scroll-view>

    <!-- 语音识别实时文本 -->
    <view v-if="voiceText" class="voice-preview">
      <text>{{ voiceText }}</text>
    </view>

    <!-- 语音模式 -->
    <view v-if="inputMode === 'voice'" class="voice-bar">
      <view
        class="voice-main-btn"
        :class="{ active: isListening }"
        @touchstart="onVoiceStart"
        @touchend="onVoiceEnd"
      >
        <text class="voice-main-icon">{{ isListening ? '🔴' : '🎤' }}</text>
        <text class="voice-main-text">{{ isListening ? '松开结束' : '按住说话' }}</text>
      </view>
      <view class="mode-switch" @tap="inputMode = 'text'">
        <text>键盘</text>
      </view>
    </view>

    <!-- 文字模式 -->
    <view v-else class="input-bar">
      <view class="mode-switch" @tap="inputMode = 'voice'">
        <text>🎤</text>
      </view>
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
import config from '@/config/config';
// #ifdef MP-WEIXIN
import { startVoiceRecognize, stopVoiceRecognize, speak } from '@/utils/voice';
// #endif

const OPENCLAW_API = config.openclawApi;

const messages = ref([]);
const inputText = ref('');
const sending = ref(false);
const scrollTarget = ref('');
const sessionKey = ref('');
const isListening = ref(false);
const voiceText = ref('');
const inputMode = ref('voice'); // 'voice' | 'text'

function scrollToBottom() {
  nextTick(() => {
    scrollTarget.value = '';
    nextTick(() => {
      scrollTarget.value = 'msg-bottom';
    });
  });
}

function clearChat() {
  messages.value = [];
  sessionKey.value = '';
}

// #ifdef MP-WEIXIN
function onVoiceStart() {
  console.log('[voice] onVoiceStart called, sending:', sending.value);
  if (sending.value) return;
  isListening.value = true;
  voiceText.value = '';

  console.log('[voice] calling startVoiceRecognize, isListening:', isListening.value);
  try {
  startVoiceRecognize(
    (res) => {
      console.log('[voice] result:', res);
      if (res.isFinal) {
        voiceText.value = '';
        if (res.text) {
          inputText.value = res.text;
          // 识别完成自动发送
          nextTick(() => sendMessage());
        }
      } else {
        voiceText.value = res.text;
      }
    },
    (err) => {
      console.error('[voice] error:', err);
      isListening.value = false;
      voiceText.value = '';
      uni.showToast({ title: '语音识别失败: ' + (err.errMsg || JSON.stringify(err)), icon: 'none' });
    }
  );
  } catch (e) {
    console.error('[voice] startVoiceRecognize threw:', e);
    isListening.value = false;
    uni.showToast({ title: '语音初始化失败: ' + e.message, icon: 'none' });
  }
}

function onVoiceEnd() {
  console.log('[voice] onVoiceEnd called, isListening:', isListening.value);
  if (!isListening.value) return;
  isListening.value = false;
  stopVoiceRecognize();
}
// #endif

// #ifdef H5
function onVoiceStart() {
  uni.showToast({ title: 'H5不支持语音，请使用小程序', icon: 'none' });
}
function onVoiceEnd() {}
// #endif

// 判断回复中是否包含地点信息
function hasLocation(text) {
  if (!text) return false;
  const keywords = ['公园', '广场', '商场', '餐厅', '酒店', '景区', '博物馆', '图书馆', '医院', '学校', '地铁', '路', '街', '号'];
  return keywords.some(k => text.includes(k));
}

// 从文本中提取地点并打开地图
function openMapFromText(text) {
  // 提取地名：匹配「XX公园」「XX广场」等模式
  const patterns = [
    /([一-龥]{2,10}(?:公园|广场|商场|购物中心|餐厅|酒店|景区|博物馆|图书馆|医院|学校))/g,
    /(?:推荐|去|到|在)([一-龥]{2,15}(?:路|街|号|区))/g,
  ];

  let places = [];
  for (const p of patterns) {
    const matches = text.matchAll(p);
    for (const m of matches) {
      places.push(m[1] || m[0]);
    }
  }

  // 去重
  places = [...new Set(places)].slice(0, 3);

  if (places.length === 0) {
    uni.showToast({ title: '未识别到地点', icon: 'none' });
    return;
  }

  // 如果只有一个地点，直接搜索
  if (places.length === 1) {
    openMapSearch(places[0]);
    return;
  }

  // 多个地点让用户选择
  uni.showActionSheet({
    itemList: places,
    success: (res) => {
      openMapSearch(places[res.tapIndex]);
    },
  });
}

// 打开地图搜索
function openMapSearch(name) {
  // #ifdef MP-WEIXIN
  // 使用微信内置地图搜索
  uni.openLocation({
    latitude: 0,
    longitude: 0,
    name: name,
    scale: 15,
    fail: () => {
      // 如果没有坐标，打开腾讯地图 H5
      openExternalMap(name);
    }
  });
  // #endif

  // #ifdef H5
  openExternalMap(name);
  // #endif
}

// 打开外部地图
function openExternalMap(name) {
  const encoded = encodeURIComponent(name);
  // 腾讯地图 H5
  const url = `https://apis.map.qq.com/chooser/search?type=1&keyword=${encoded}&region=全国`;
  window.open(url, '_blank');
}

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || sending.value) return;

  messages.value.push({ role: 'user', text });
  inputText.value = '';
  voiceText.value = '';
  scrollToBottom();

  sending.value = true;
  try {
    const payload = {
      message: text,
      agent_id: 'main',
      model: 'deepseek-v4-pro',
      timeout: 300,
    };
    if (sessionKey.value) {
      payload.session_key = sessionKey.value;
    }

    const res = await new Promise((resolve, reject) => {
      uni.request({
        url: OPENCLAW_API,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
        },
        data: payload,
        success: (r) => resolve(r),
        fail: (err) => reject(err),
      });
    });

    if (res.statusCode === 200 && res.data?.status === 'ok') {
      const reply = res.data.data?.reply || '';
      const newSessionKey = res.data.data?.session_key || '';
      if (newSessionKey) {
        sessionKey.value = newSessionKey;
      }
      messages.value.push({ role: 'bot', text: reply || '（无回复）' });

      // 语音播报 AI 回复
      // #ifdef MP-WEIXIN
      if (reply) {
        speak(reply).catch(() => {});
      }
      // #endif
    } else {
      const errMsg = res.data?.message || '未知错误';
      messages.value.push({ role: 'bot', text: `抱歉，查询失败：${errMsg}` });
    }
  } catch (e) {
    console.error('[chat] error:', e);
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

.sources {
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #eee;
  font-size: 22rpx;
  color: #888;
}

.map-action {
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #eee;
}

.map-btn {
  display: inline-block;
  padding: 8rpx 20rpx;
  background: #e3f2fd;
  border-radius: 20rpx;
  font-size: 24rpx;
  color: #1976d2;
}

.sources-title {
  display: block;
  margin-bottom: 4rpx;
}

.source-item {
  display: block;
  font-size: 22rpx;
  color: #666;
}

.voice-preview {
  padding: 12rpx 24rpx;
  background: #e8f5e9;
  font-size: 26rpx;
  color: #2e7d32;
  text-align: center;
}

.voice-bar {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid #e5e5e5;
}

.voice-main-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96rpx;
  background: #f0fdf4;
  border-radius: 48rpx;
  border: 2rpx solid #bbf7d0;
}

.voice-main-btn.active {
  background: #fef2f2;
  border-color: #fecaca;
}

.voice-main-icon {
  font-size: 36rpx;
  margin-right: 12rpx;
}

.voice-main-text {
  font-size: 30rpx;
  color: #333;
}

.mode-switch {
  width: 80rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 16rpx;
  background: #f5f5f5;
  border-radius: 50%;
  font-size: 28rpx;
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
