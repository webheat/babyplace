<template>
  <view class="page">
    <view v-if="loading" class="state">加载中...</view>
    <view v-else-if="!detail.itemId" class="state">未找到商品</view>
    <view v-else class="content">
      <view class="hero">
        <image class="hero-cover" :src="detail.pictUrl || '/static/logo.png'" mode="aspectFill" />
        <view class="hero-copy">
          <text class="title">{{ detail.title }}</text>
          <text class="subtitle">{{ detail.itemDescription || '暂无描述' }}</text>
          <view class="price-row">
            <text class="price">¥{{ formatPrice(detail.zkFinalPrice) }}</text>
            <text class="market">¥{{ formatPrice(detail.reservePrice) }}</text>
          </view>
        </view>
      </view>
      <view class="section">
        <text class="section-title">详情信息</text>
        <text class="paragraph">商品ID：{{ detail.itemId }}</text>
        <text class="paragraph">来源：{{ detail.nick || 'babyplace' }}</text>
        <text class="paragraph">优惠：{{ detail.couponAmount || '0' }} 元</text>
      </view>
      <view class="section">
        <text class="section-title">操作</text>
        <button class="button" @click="copyName">复制名称</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import api from '@/common/api-util.js';
import utils from '@/common/utils.js';

const loading = ref(false);
const detail = ref({});

function formatPrice(value) {
  const price = Number(value || 0);
  return Number.isFinite(price) ? price.toFixed(1) : '0.0';
}

function copyName() {
  utils.setClipboardData(detail.value?.title || '');
}

async function loadDetail(id) {
  if (!id) return;
  loading.value = true;
  try {
    const result = await api.tbk.getItemInfo(id);
    if (result.code !== api.SUCCESS) throw new Error(result.message || '加载失败');
    detail.value = result.data || {};
  } catch (error) {
    detail.value = {};
    uni.showToast({ title: error.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onLoad((options) => {
  loadDetail(options?.id || '');
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #fff7ed;
}
.state {
  padding: 24rpx;
  border-radius: 16rpx;
  background: #fff;
  text-align: center;
  color: #78716c;
}
.content {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.hero,
.section {
  padding: 24rpx;
  border-radius: 22rpx;
  background: #fff;
}
.hero-cover {
  width: 100%;
  height: 420rpx;
  border-radius: 20rpx;
  background: #fed7aa;
}
.hero-copy {
  margin-top: 18rpx;
}
.title {
  display: block;
  font-size: 38rpx;
  font-weight: 700;
  color: #1f2937;
}
.subtitle,
.paragraph {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: #6b7280;
}
.price-row {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
  margin-top: 18rpx;
}
.price {
  font-size: 40rpx;
  font-weight: 700;
  color: #ea580c;
}
.market {
  font-size: 26rpx;
  text-decoration: line-through;
  color: #9ca3af;
}
.section-title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #7c2d12;
}
.button {
  border-radius: 18rpx;
  background: #ea580c;
  color: #fff;
}
</style>
