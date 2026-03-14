<template>
  <view class="page">
    <view class="hero">
      <text class="eyebrow">babyplace spots</text>
      <text class="title">景点基础数据</text>
      <text class="subtitle">公开展示当前已录入的景点基础信息。管理员新增、编辑和删除都在 `/admin` 页面完成。</text>
      <view class="hero-actions">
        <button class="hero-button" size="mini" @click="goAdmin">进入管理页</button>
        <text class="hero-status">{{ loginStatusText }}</text>
      </view>
    </view>

    <view class="toolbar">
      <input
        v-model="keyword"
        class="search"
        confirm-type="search"
        placeholder="搜索景点名称或地址"
        @confirm="refreshGoods"
      />
      <button class="button" type="primary" :loading="loading" @click="refreshGoods">刷新</button>
    </view>

    <view v-if="errorMessage" class="state error">{{ errorMessage }}</view>
    <view v-else-if="loading" class="state">加载中...</view>
    <view v-else-if="!goodsList.length" class="state">暂无景点数据</view>

    <view v-else class="goods-list">
      <view v-for="item in goodsList" :key="item._id" class="goods-card">
        <view class="meta">
          <text class="name">{{ item.name }}</text>
          <text class="summary">{{ item.address }}</text>
          <view class="tag-row">
            <text class="tag">纬度 {{ formatCoord(item.lat) }}</text>
            <text class="tag">经度 {{ formatCoord(item.lng) }}</text>
            <text v-if="item.suitable_ages" class="tag">{{ item.suitable_ages }}</text>
            <text v-if="item.transport_hint" class="tag">{{ item.transport_hint }}</text>
            <text v-if="item.parking_tip" class="tag">{{ item.parking_tip }}</text>
            <text v-if="item.stroller_friendly" class="tag">{{ item.stroller_friendly }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { listGoods } from '../../api/goods';
import { hasValidUniIdToken } from '../../utils/auth';

const goodsList = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const keyword = ref('');
const loginStatusText = computed(() => (hasValidUniIdToken() ? '已检测到登录态' : '未登录'));

function formatCoord(value) {
  const num = Number(value || 0);
  return num.toFixed(6);
}

function goAdmin() {
  uni.navigateTo({
    url: '/pages/admin/index',
  });
}

async function refreshGoods() {
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await listGoods({
      keyword: keyword.value,
      page: 1,
      pageSize: 20,
    });

    if (result.code !== 0) {
      throw new Error(result.message || '加载失败');
    }

    goodsList.value = result.data.list || [];
  } catch (error) {
    goodsList.value = [];
    errorMessage.value = error.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  refreshGoods();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 48rpx 28rpx 60rpx;
  background:
    radial-gradient(circle at top left, #ffe6cf 0%, rgba(255, 230, 207, 0) 36%),
    linear-gradient(180deg, #fffaf2 0%, #fff 100%);
}

.hero {
  margin-bottom: 32rpx;
}

.eyebrow {
  display: block;
  margin-bottom: 12rpx;
  font-size: 22rpx;
  color: #9f6a35;
  text-transform: uppercase;
  letter-spacing: 4rpx;
}

.title {
  display: block;
  font-size: 52rpx;
  font-weight: 600;
  color: #3c2415;
}

.subtitle {
  display: block;
  margin-top: 16rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: #7b6557;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 24rpx;
}

.hero-button {
  margin: 0;
  border-radius: 999rpx;
  background: #fff;
  color: #8f5e31;
  border: 2rpx solid #edc79c;
}

.hero-status {
  font-size: 24rpx;
  color: #8a6a55;
}

.toolbar {
  display: flex;
  gap: 16rpx;
  align-items: center;
  margin-bottom: 28rpx;
}

.search {
  flex: 1;
  height: 80rpx;
  padding: 0 24rpx;
  border: 2rpx solid #efd7bf;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.92);
}

.button {
  margin: 0;
  border-radius: 20rpx;
  background: #d98b3a;
}

.state {
  padding: 32rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.88);
  color: #6d574b;
  text-align: center;
}

.error {
  color: #b84032;
}

.goods-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.goods-card {
  padding: 20rpx;
  border: 2rpx solid rgba(235, 210, 185, 0.9);
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 16rpx 40rpx rgba(91, 54, 24, 0.08);
}

.meta {
  flex: 1;
}

.name {
  display: block;
  margin-bottom: 12rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #2f2118;
}

.summary {
  display: block;
  margin-bottom: 16rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #756050;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.tag {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: #f9efe4;
  font-size: 22rpx;
  color: #8a6547;
}
</style>
