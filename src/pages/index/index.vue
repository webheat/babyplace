<template>
  <view class="page">
    <view class="hero">
      <text class="title">Babyplace POI 推荐</text>
      <text class="subtitle">以地点为核心，聚合文章与用户评价。</text>
      <view class="actions">
        <button class="button primary" size="mini" @click="goPoiList">查看全部地点</button>
        <button class="button" size="mini" @click="loadHome">刷新推荐</button>
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">精选推荐</text>
      </view>
      <view v-if="loading" class="state">加载中...</view>
      <view v-else-if="!homeData.featured.length" class="state">暂无推荐</view>
      <view v-else class="list">
        <poi-card v-for="item in homeData.featured" :key="item._id" :poi="item" @click="goDetail" />
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">附近地点</text>
      </view>
      <view v-if="!homeData.nearby.length" class="state">未获取到定位或附近暂无数据</view>
      <view v-else class="list">
        <poi-card v-for="item in homeData.nearby" :key="item._id" :poi="item" @click="goDetail" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import PoiCard from '@/components/poi-card.vue';
import { recommendHome } from '@/api/recommend';

const loading = ref(false);
const homeData = reactive({
  featured: [],
  nearby: [],
  latest: [],
});

function goPoiList() {
  uni.navigateTo({ url: '/pages/poi/list' });
}

function goDetail(item) {
  if (!item?._id) return;
  uni.navigateTo({ url: `/pages/poi/detail?id=${item._id}` });
}

function getCurrentLocation() {
  return new Promise((resolve) => {
    uni.getLocation({
      type: 'gcj02',
      success: ({ latitude, longitude }) => {
        resolve({ lat: latitude, lng: longitude });
      },
      fail: () => resolve(null),
    });
  });
}

async function loadHome() {
  loading.value = true;
  try {
    const location = await getCurrentLocation();
    const result = await recommendHome({
      lat: location?.lat,
      lng: location?.lng,
      radius: 5000,
    });
    if (result.code !== 0) throw new Error(result.message || '加载失败');
    homeData.featured = result.data?.featured || [];
    homeData.nearby = result.data?.nearby || [];
    homeData.latest = result.data?.latest || [];
  } catch (error) {
    uni.showToast({
      title: error.message || '加载失败',
      icon: 'none',
    });
    homeData.featured = [];
    homeData.nearby = [];
    homeData.latest = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadHome();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 28rpx;
  background: #f7fafc;
}

.hero {
  margin-bottom: 24rpx;
  padding: 28rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #e3f4ff, #e8fff4);
}

.title {
  display: block;
  font-size: 44rpx;
  font-weight: 700;
  color: #1f2937;
}

.subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #4b5563;
}

.actions {
  margin-top: 18rpx;
  display: flex;
  gap: 12rpx;
}

.button {
  margin: 0;
  border-radius: 12rpx;
  background: #fff;
  color: #1f2937;
}

.button.primary {
  background: #2563eb;
  color: #fff;
}

.section {
  margin-bottom: 26rpx;
}

.section-head {
  margin-bottom: 14rpx;
}

.section-title {
  font-size: 32rpx;
  color: #1f2937;
  font-weight: 600;
}

.state {
  padding: 28rpx;
  border-radius: 16rpx;
  background: #fff;
  color: #6b7280;
  text-align: center;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
</style>
