<template>
  <view class="page">
    <view class="head">
      <text class="title">搜索结果</text>
      <text class="subtitle">关键词：{{ currentKeyword || '全部' }}</text>
    </view>
    <view v-if="loading" class="state">加载中...</view>
    <view v-else-if="!list.length" class="state">暂无结果</view>
    <view v-else class="list">
      <view v-for="item in list" :key="item.itemId" class="item" @click="openDetail(item)">
        <image lazy-load class="item-image" :src="item.pictUrl || '/static/logo.png'" mode="aspectFill" />
        <view class="item-body">
          <text class="item-title">{{ item.title }}</text>
          <text class="item-desc">{{ item.itemDescription || '暂无描述' }}</text>
          <view class="item-footer">
            <text class="item-price">¥{{ formatPrice(item.zkFinalPrice) }}</text>
            <text class="item-tag">{{ item.nick || 'babyplace' }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import api from '@/common/api-util.js';

const loading = ref(false);
const list = ref([]);
const currentKeyword = ref('');

function formatPrice(value) {
  const price = Number(value || 0);
  return Number.isFinite(price) ? price.toFixed(1) : '0.0';
}

function openDetail(item) {
  if (!item?.itemId) return;
  uni.navigateTo({ url: `/pages/taobao/tbk/goods-details/goods-details?id=${item.itemId}` });
}

async function loadList(keyword = '') {
  loading.value = true;
  currentKeyword.value = keyword;
  try {
    const result = await api.tbk.search({ keyword, page: 1, pageSize: 20 });
    list.value = result.code === api.SUCCESS ? (result.data?.records || result.data?.list || []) : [];
    if (result.code !== api.SUCCESS) throw new Error(result.message || '加载失败');
  } catch (error) {
    list.value = [];
    uni.showToast({ title: error.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onLoad((options) => {
  loadList(options?.keyword ? decodeURIComponent(options.keyword) : '');
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #fff7ed;
}
.head {
  margin-bottom: 16rpx;
}
.title {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: #1f2937;
}
.subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #78716c;
}
.state {
  padding: 24rpx;
  border-radius: 16rpx;
  background: #fff;
  text-align: center;
  color: #78716c;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.item {
  display: flex;
  gap: 16rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  background: #fff;
}
.item-image {
  width: 170rpx;
  height: 170rpx;
  border-radius: 16rpx;
  background: #fed7aa;
  flex-shrink: 0;
}
.item-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.item-title {
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.5;
  color: #1f2937;
}
.item-desc {
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b7280;
}
.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}
.item-price {
  font-size: 32rpx;
  font-weight: 700;
  color: #ea580c;
}
.item-tag {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: #fff7ed;
  font-size: 22rpx;
  color: #c2410c;
}
</style>
