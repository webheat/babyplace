<template>
  <view class="page">
    <view class="hero">
      <view class="hero-copy">
        <text class="hero-kicker">淘宝频道</text>
        <text class="hero-title">省心好物清单</text>
        <text class="hero-subtitle">保留旧版橙色导购氛围，把当前商品库映射成小程序可展示的推荐流。</text>
      </view>
      <view class="hero-search" @click="goSearch">
        <text class="search-icon">搜</text>
        <text class="search-text">搜索商品、地点、活动</text>
      </view>
      <view class="hero-actions">
        <view class="action-chip active" @click="goSearch">搜商品</view>
        <view class="action-chip" @click="goList">全部好物</view>
      </view>
    </view>

    <view class="section hot-section">
      <view class="section-head">
        <text class="section-title">热门推荐</text>
        <text class="section-more" @click="goList">更多</text>
      </view>
      <view v-if="loading" class="state">加载中...</view>
      <view v-else-if="!featuredGoods.length" class="state">暂无商品</view>
      <view v-else class="goods-grid">
        <view v-for="item in featuredGoods" :key="item._id" class="featured-card" @click="openDetail(item)">
          <image lazy-load class="featured-image" :src="item.cover || item.image || '/static/logo.png'" mode="aspectFill" />
          <view class="featured-body">
            <text class="featured-name">{{ item.name }}</text>
            <text class="featured-desc">{{ item.summary || item.address || '适合亲子场景的推荐好物' }}</text>
            <view class="featured-footer">
              <text class="featured-price">¥{{ formatPrice(item.price) }}</text>
              <text class="featured-tag">精选</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="section feed-section">
      <view class="section-head">
        <text class="section-title">好物列表</text>
      </view>
      <view v-if="!recommendGoods.length && !loading" class="state">暂无内容</view>
      <view v-else class="goods-list">
        <view v-for="item in recommendGoods" :key="item._id" class="goods-card" @click="openDetail(item)">
          <image lazy-load class="goods-image" :src="item.cover || item.image || '/static/logo.png'" mode="aspectFill" />
          <view class="goods-content">
            <text class="goods-name">{{ item.name }}</text>
            <text class="goods-summary">{{ item.summary || item.address || '暂无描述' }}</text>
            <view class="goods-meta">
              <view class="meta-left">
                <text class="meta-chip">亲子精选</text>
                <text class="meta-chip muted">{{ item.category || '日常用品' }}</text>
              </view>
              <text class="goods-price">¥{{ formatPrice(item.price) }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { listGoods } from '@/api/goods';

const loading = ref(false);
const list = ref([]);

const featuredGoods = computed(() => list.value.slice(0, 4));
const recommendGoods = computed(() => list.value.slice(0, 10));

function goSearch() {
  uni.navigateTo({ url: '/pages/taobao/tbk/search/search' });
}

function goList() {
  uni.navigateTo({ url: '/pages/taobao/tbk/search-goods-list/search-goods-list' });
}

function openDetail(item) {
  if (!item?._id) return;
  uni.navigateTo({ url: `/pages/taobao/tbk/goods-details/goods-details?id=${item._id}` });
}

function formatPrice(value) {
  const price = Number(value || 0);
  return Number.isFinite(price) ? price.toFixed(1) : '0.0';
}

async function loadList() {
  loading.value = true;
  try {
    const result = await listGoods({ page: 1, pageSize: 12 });
    if (result.code !== 0) throw new Error(result.message || '加载失败');
    list.value = result.data?.list || [];
  } catch (error) {
    list.value = [];
    uni.showToast({ title: error.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onMounted(loadList);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: linear-gradient(180deg, #fff1e8 0%, #fff7f1 34%, #fff7f1 100%);
}

.hero,
.section {
  border-radius: 26rpx;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 18rpx 40rpx rgba(124, 45, 18, 0.07);
}

.hero {
  padding: 30rpx;
  background: linear-gradient(135deg, #ff8a3d, #ff6b3d 55%, #ff9257 100%);
}

.hero-kicker {
  display: block;
  font-size: 22rpx;
  letter-spacing: 4rpx;
  color: rgba(255, 255, 255, 0.82);
}

.hero-title {
  display: block;
  margin-top: 12rpx;
  font-size: 48rpx;
  font-weight: 700;
  color: #fff;
}

.hero-subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.9);
}

.hero-search {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-top: 22rpx;
  padding: 18rpx 22rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.92);
}

.search-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: #fff1e8;
  font-size: 22rpx;
  color: #ea580c;
}

.search-text {
  font-size: 24rpx;
  color: #9a3412;
}

.hero-actions {
  display: flex;
  gap: 12rpx;
  margin-top: 20rpx;
}

.action-chip {
  padding: 12rpx 22rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.18);
  font-size: 24rpx;
  color: #fff;
}

.action-chip.active {
  background: #fff;
  color: #ea580c;
}

.section {
  margin-top: 20rpx;
  padding: 24rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #7c2d12;
}

.section-more {
  font-size: 24rpx;
  color: #ea580c;
}

.state {
  padding: 26rpx;
  border-radius: 18rpx;
  background: #fff7ed;
  text-align: center;
  color: #9a3412;
}

.goods-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
}

.featured-card {
  overflow: hidden;
  border-radius: 20rpx;
  background: #fff7ed;
}

.featured-image {
  width: 100%;
  height: 220rpx;
  background: #fed7aa;
}

.featured-body {
  padding: 18rpx;
}

.featured-name {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.5;
  color: #1f2937;
}

.featured-desc {
  display: block;
  min-height: 68rpx;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #6b7280;
}

.featured-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14rpx;
}

.featured-price,
.goods-price {
  font-size: 32rpx;
  font-weight: 700;
  color: #ea580c;
}

.featured-tag {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: #fff;
  font-size: 22rpx;
  color: #ea580c;
}

.goods-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.goods-card {
  display: flex;
  gap: 18rpx;
  padding: 18rpx;
  border-radius: 22rpx;
  background: #fff7ed;
}

.goods-image {
  width: 180rpx;
  height: 180rpx;
  border-radius: 18rpx;
  background: #fed7aa;
  flex-shrink: 0;
}

.goods-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.goods-name {
  font-size: 30rpx;
  font-weight: 600;
  line-height: 1.5;
  color: #1f2937;
}

.goods-summary {
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b7280;
}

.goods-meta {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: auto;
}

.meta-left {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.meta-chip {
  padding: 8rpx 12rpx;
  border-radius: 999rpx;
  background: #fff;
  font-size: 20rpx;
  color: #ea580c;
}

.meta-chip.muted {
  color: #9a3412;
  background: #ffedd5;
}
</style>
