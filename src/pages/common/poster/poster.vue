<template>
  <view class="page">
    <view class="hero">
      <text class="title">分享海报</text>
      <text class="subtitle">保留旧海报页的分享用途，当前提供海报预览和二维码展示。</text>
    </view>

    <view class="poster-card">
      <view class="meta-strip">
        <view class="meta-item">
          <text class="meta-label">主题</text>
          <text class="meta-value">首页推荐</text>
        </view>
        <view class="meta-item">
          <text class="meta-label">方式</text>
          <text class="meta-value">截图分享</text>
        </view>
      </view>

      <view class="poster-preview">
        <view class="poster-cover">
          <image class="cover-image" :src="coverImage" mode="aspectFill" />
          <view class="cover-mask">
            <text class="cover-title">Babyplace</text>
            <text class="cover-desc">周末遛娃 / 雨天备选 / 地点推荐</text>
          </view>
        </view>
        <view class="qrcode-box">
          <uqrcode ref="qrcodeRef" />
        </view>
      </view>

      <button class="button" @click="saveTip">长按二维码或截图分享</button>
      <button class="button secondary" @click="copyPosterLink">复制海报链接</button>
    </view>
  </view>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue';
import Uqrcode from '@/components/uqrcode/uqrcode.vue';
import api from '@/common/api-util.js';

const qrcodeRef = ref(null);
const coverImage = ref('/static/logo.png');
const posterText = 'babyplace://home';

function saveTip() {
  uni.showToast({ title: '请长按二维码或使用截图分享', icon: 'none' });
}

function copyPosterLink() {
  uni.setClipboardData({ data: posterText });
}

async function initPoster() {
  const result = await api.common.miniappShareCover();
  if (result.code === api.SUCCESS && result.data) {
    coverImage.value = result.data;
  }
  await nextTick();
  qrcodeRef.value?.make({
    text: posterText,
    size: 220,
  });
}

onMounted(initPoster);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%);
}
.hero {
  padding: 8rpx 4rpx 22rpx;
}
.poster-card {
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
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #64748b;
}
.meta-strip {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12rpx;
}
.meta-item {
  padding: 18rpx;
  border-radius: 18rpx;
  background: #f8fafc;
}
.meta-label {
  display: block;
  font-size: 22rpx;
  color: #94a3b8;
}
.meta-value {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #1f2937;
}
.poster-preview {
  margin-top: 22rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: #f8fafc;
}
.poster-cover {
  position: relative;
  height: 420rpx;
  border-radius: 20rpx;
  overflow: hidden;
}
.cover-image {
  width: 100%;
  height: 100%;
}
.cover-mask {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 24rpx;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.7) 100%);
}
.cover-title {
  display: block;
  font-size: 38rpx;
  font-weight: 700;
  color: #fff;
}
.cover-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.9);
}
.qrcode-box {
  display: flex;
  justify-content: center;
  padding-top: 26rpx;
}
.button {
  margin-top: 20rpx;
  border-radius: 16rpx;
  background: #2563eb;
  color: #fff;
}

.button.secondary {
  background: #eef2ff;
  color: #2563eb;
}
</style>
