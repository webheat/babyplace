<template>
  <view class="page">
    <view class="hero">
      <text class="title">我的二维码</text>
      <text class="subtitle">恢复二维码展示页，用当前登录用户信息生成分享二维码。</text>
    </view>
    <view class="panel">
      <view class="qrcode-wrap">
        <uqrcode ref="qrcodeRef" />
      </view>
      <view class="tips-card">
        <text class="tips-title">使用方式</text>
        <text class="tips-text">可用于分享个人主页或做当前用户标识，后续可接真实用户名片链路。</text>
      </view>
      <text class="hint">{{ qrText }}</text>
      <button class="button" @click="copyQrText">复制二维码内容</button>
    </view>
  </view>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue';
import Uqrcode from '@/components/uqrcode/uqrcode.vue';
import auth from '@/common/auth.js';

const qrcodeRef = ref(null);
const qrText = ref('babyplace://user/guest');

function copyQrText() {
  uni.setClipboardData({ data: qrText.value });
}

async function renderQrcode() {
  const userInfo = auth.getLocalUserInfo() || {};
  qrText.value = `babyplace://user/${userInfo.user_id || 'guest'}?nickname=${encodeURIComponent(userInfo.nickname || '游客用户')}`;
  await nextTick();
  qrcodeRef.value?.make({
    text: qrText.value,
    size: 260,
  });
}

onMounted(renderQrcode);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 34%, #f8fafc 100%);
}
.hero {
  padding: 8rpx 4rpx 22rpx;
}
.panel {
  padding: 28rpx;
  border-radius: 22rpx;
  background: #fff;
}
.title {
  display: block;
  font-size: 38rpx;
  font-weight: 700;
  color: #1f2937;
}
.subtitle {
  display: block;
  margin: 10rpx 0 24rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #64748b;
}
.qrcode-wrap {
  display: flex;
  justify-content: center;
}
.tips-card {
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: #f8fafc;
}
.tips-title {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #1f2937;
}
.tips-text {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #64748b;
}
.hint {
  display: block;
  margin-top: 20rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #94a3b8;
  word-break: break-all;
}

.button {
  margin-top: 20rpx;
  border-radius: 16rpx;
  background: #2563eb;
  color: #fff;
}
</style>
