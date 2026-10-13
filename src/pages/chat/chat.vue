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
        :key="`msg-${msg.role}-${i}`"
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
        </view>
      </view>
      <view v-if="sending" class="message-row bot">
        <view class="bubble loading">
          <text>正在回复...</text>
        </view>
      </view>
      <!-- 推荐问题按钮 -->
      <view v-if="suggestedQuestions.length && !sending" class="suggested-questions">
        <view
          v-for="(q, i) in suggestedQuestions"
          :key="`sq-${q}`"
          class="suggest-btn"
          @tap="sendSuggested(q)"
        >
          <text>{{ q }}</text>
        </view>
      </view>
      <view id="msg-bottom" style="height: 20rpx" />
    </scroll-view>

    <!-- 文字输入 -->
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
import { ref, nextTick, onMounted } from 'vue';

const CHAT_API = 'https://oc.aixifs.com/api/chat';

const messages = ref([]);
const inputText = ref('');
const sending = ref(false);
const scrollTarget = ref('');
const sessionId = ref('');
const suggestedQuestions = ref([]);

// 页面加载时尝试获取定位坐标（用于推荐当地地点）
const userLat = ref(0);
const userLng = ref(0);

const OPENING_STATEMENT = '你好！有什么问题都可以问我～';
const PRESET_SUGGESTIONS = [
  '发货要几天？',
  '怎么查物流？',
  '可以退货吗？',
];

onMounted(() => {
  messages.value.push({ role: 'bot', text: OPENING_STATEMENT });
  suggestedQuestions.value = PRESET_SUGGESTIONS;
  // #ifdef MP-WEIXIN
  uni.getLocation({
    type: 'gcj02',
    success: (res) => {
      userLat.value = res.latitude;
      userLng.value = res.longitude;
      console.log('[chat] got location:', res.latitude, res.longitude);
    },
    fail: (err) => {
      console.warn('[chat] getLocation failed:', err);
    }
  });
  // #endif
})

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
  sessionId.value = '';
  suggestedQuestions.value = [];
}

// 发送推荐问题
function sendSuggested(question) {
  inputText.value = question;
  suggestedQuestions.value = [];
  nextTick(() => sendMessage());
}

// 判断回复中是否包含地点信息
function hasLocation(text) {
  if (!text) return false;
  const keywords = ['公园', '广场', '商场', '餐厅', '酒店', '景区', '博物馆', '图书馆', '医院', '学校', '地铁', '路', '街', '号'];
  return keywords.some(k => text.includes(k));
}

// 从文本中提取地点并打开地图
function openMapFromText(text) {
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

  places = [...new Set(places)].slice(0, 3);

  if (places.length === 0) {
    uni.showToast({ title: '未识别到地点', icon: 'none' });
    return;
  }

  if (places.length === 1) {
    openMapSearch(places[0]);
    return;
  }

  uni.showActionSheet({
    itemList: places,
    success: (res) => {
      openMapSearch(places[res.tapIndex]);
    },
  });
}

function openMapSearch(name) {
  // #ifdef MP-WEIXIN
  uni.openLocation({
    latitude: 0,
    longitude: 0,
    name: name,
    scale: 15,
    fail: () => {
      openExternalMap(name);
    }
  });
  // #endif

  // #ifdef H5
  openExternalMap(name);
  // #endif
}

function openExternalMap(name) {
  const encoded = encodeURIComponent(name);
  const url = `https://apis.map.qq.com/chooser/search?type=1&keyword=${encoded}&region=全国`;
  window.open(url, '_blank');
}

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || sending.value) return;

  messages.value.push({ role: 'user', text });
  inputText.value = '';
  suggestedQuestions.value = [];
  scrollToBottom();

  sending.value = true;
  try {
    const storedUser = uni.getStorageSync('mock-user-info');
    let userCity = storedUser?.city || '';

    if (!userCity) {
      try {
        const cachedLocation = uni.getStorageSync('user-city');
        if (cachedLocation) userCity = cachedLocation;
      } catch (e) {}
    }

    let message = text;
    if (userCity) {
      message = `[用户所在城市：${userCity}] ${text}`;
    } else if (userLat.value && userLng.value) {
      message = `[用户坐标：${userLat.value.toFixed(4)},${userLng.value.toFixed(4)}] ${text}`;
    }

    const payload = { message };
    if (sessionId.value) {
      payload.session_id = sessionId.value;
    }

    const res = await new Promise((resolve, reject) => {
      uni.request({
        url: CHAT_API,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
        },
        data: payload,
        timeout: 120000,
        success: (r) => resolve(r),
        fail: (err) => reject(err),
      });
    });

    if (res.statusCode === 200 && res.data?.status === 'ok') {
      const reply = res.data.data?.reply || '';
      const newSessionId = res.data.data?.session_id || '';
      if (newSessionId) {
        sessionId.value = newSessionId;
      }
      messages.value.push({ role: 'bot', text: reply || '（无回复）' });
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

/* 推荐问题 */
.suggested-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: 12rpx 24rpx;
  justify-content: flex-start;
}

.suggest-btn {
  padding: 12rpx 24rpx;
  background: #fff;
  border: 1rpx solid #10b981;
  border-radius: 28rpx;
  font-size: 24rpx;
  color: #059669;
}

.suggest-btn:active {
  background: #ecfdf5;
}
</style>
