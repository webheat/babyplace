<template>
  <view class="chat-page">
    <!-- AI 生成内容声明（微信平台合规要求） -->
    <view class="ai-disclaimer">
      <text class="ai-disclaimer-text">🤖 以上内容由人工智能生成，仅供参考</text>
    </view>
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
          <view v-if="msg.role === 'bot'" class="ai-tag">
            <text class="ai-tag-text">AI生成</text>
          </view>
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
import config from '@/config/config';

const OPENCLAW_API = config.openclawApi;
const CHAT_MODEL = config.chatModel || 'deepseek-v4-flash';

const messages = ref([]);
const inputText = ref('');
const sending = ref(false);
const scrollTarget = ref('');
const sessionKey = ref('');

// 页面加载时尝试获取定位坐标（用于推荐当地地点）
const userLat = ref(0);
const userLng = ref(0);

onMounted(() => {
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
  sessionKey.value = '';
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

    const payload = {
      message: text,
      agent_id: 'main',
      model: CHAT_MODEL,
      timeout: 300,
    };
    if (sessionKey.value) {
      payload.session_key = sessionKey.value;
    }
    if (userCity) {
      payload.message = `[用户所在城市：${userCity}] ${text}`;
    } else if (userLat.value && userLng.value) {
      payload.message = `[用户坐标：${userLat.value.toFixed(4)},${userLng.value.toFixed(4)}] ${text}`;
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

/* AI 生成内容声明横幅 */
.ai-disclaimer {
  padding: 14rpx 24rpx;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  text-align: center;
}
.ai-disclaimer-text {
  font-size: 24rpx;
  color: #92400e;
  font-weight: 500;
}

/* AI 生成标签（每条 bot 回复上方） */
.ai-tag {
  margin-bottom: 8rpx;
}
.ai-tag-text {
  display: inline-block;
  padding: 2rpx 12rpx;
  font-size: 20rpx;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 8rpx;
  border: 1rpx solid #e5e7eb;
}
</style>
