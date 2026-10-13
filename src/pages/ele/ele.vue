<template>
  <view class="page">
    <view class="hero hero-rain">
      <text class="eyebrow">雨天备选</text>
      <text class="title">下雨天也能轻松出门</text>
      <text class="subtitle">优先显示室内、雨天友好、评分更高的亲子地点，保留旧频道的专题感。</text>
      <view class="hero-pills">
        <view class="hero-pill active">室内优先</view>
        <view class="hero-pill">评分筛选</view>
        <view class="hero-pill">亲子友好</view>
      </view>
    </view>

    <view class="topic-card">
      <view class="topic-top">
        <image class="topic-banner" src="/static/ele2_ydl.jpg" mode="widthFix" />
      </view>
      <view class="topic-center">
        <image class="topic-qrcode" :src="couponList[0]?.qrcode || '/static/logo.png'" mode="aspectFill" />
        <view
          v-for="item in couponList"
          :key="item.id"
          class="topic-action"
          @click="goCoupon(item)"
        >
          {{ item.title }}
        </view>
      </view>
      <view class="topic-note">
        <text>旧专题页结构已接回，当前按钮直接跳转到对应地点详情。</text>
      </view>
    </view>

    <view class="section section-highlight">
      <view class="section-head">
        <text class="section-title">雨天友好精选</text>
        <text class="section-tip">`indoor` / `rainy_day_ok`</text>
      </view>
      <view v-if="loading" class="state">加载中...</view>
      <view v-else-if="!rainyList.length" class="state">暂无符合条件的数据</view>
      <view v-else class="featured-list">
        <view v-for="item in rainyList" :key="item._id" class="featured-card" @click="goDetail(item)">
          <image lazy-load class="featured-cover" :src="item.cover_image || '/static/logo.png'" mode="aspectFill" />
          <view class="featured-body">
            <text class="featured-name">{{ item.name }}</text>
            <text class="featured-meta">{{ item.city }} {{ item.district }}</text>
            <text class="featured-desc">{{ item.summary || item.recommend_reason || '适合临时出发的雨天去处' }}</text>
            <view class="featured-footer">
              <text class="score">{{ Number(item.avg_rating || 0).toFixed(1) }}分</text>
              <text class="tag">雨天可去</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">本周高评分</text>
      </view>
      <view v-if="!topRatedList.length" class="state">暂无数据</view>
      <view v-else class="list">
        <poi-card v-for="item in topRatedList" :key="item._id" :poi="item" @click="goDetail" @map="openMap" />
      </view>
      <view class="view-more" @click="goPoiList">查看更多地点</view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import PoiCard from '@/components/poi-card.vue';
import { listPoi } from '@/api/poi';
import api from '@/common/api-util.js';
import { openPoiMap, pickTop, sortByRating } from '@/utils/poi';

const loading = ref(false);
const list = ref([]);
const couponList = ref([]);

const rainyList = computed(() => pickTop(
  sortByRating(
    list.value.filter((item) => item?.indoor || item?.facilities?.rainy_day_ok),
  ),
  4,
));

const topRatedList = computed(() => pickTop(sortByRating(list.value), 6));

function goDetail(item) {
  if (!item?._id) return;
  uni.navigateTo({ url: `/pages/life/shop/shop?id=${item._id}` });
}

function openMap(item) {
  openPoiMap(item);
}

function goCoupon(item) {
  if (item?.poiId) {
    uni.navigateTo({ url: `/pages/life/shop/shop?id=${item.poiId}` });
  }
}

async function loadPage() {
  loading.value = true;
  try {
    const result = await listPoi({ page: 1, pageSize: 20 });
    if (result.code !== 0) throw new Error(result.message || '加载失败');
    list.value = result.data?.list || [];
  } catch (error) {
    list.value = [];
    uni.showToast({ title: error.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function goPoiList() {
  uni.navigateTo({ url: '/pages/poi/list' });
}

async function loadCoupons() {
  const result = await api.coupon.eleCoupon();
  couponList.value = result.code === api.SUCCESS ? (result.data || []) : [];
}

onMounted(() => {
  loadPage();
  loadCoupons();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: linear-gradient(180deg, #0f5b78 0%, #0e7490 28%, #f4fbfd 28%, #f4fbfd 100%);
}
.hero,
.section {
  border-radius: 24rpx;
  overflow: hidden;
}
.hero {
  padding: 30rpx;
  color: #fff;
}
.hero-rain {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.08));
}
.eyebrow,
.subtitle,
.section-tip {
  font-size: 24rpx;
}
.title {
  display: block;
  margin: 10rpx 0 12rpx;
  font-size: 42rpx;
  font-weight: 700;
}
.hero-pills {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
  margin-top: 20rpx;
}
.hero-pill {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.14);
  font-size: 22rpx;
}
.hero-pill.active {
  background: #fff;
  color: #0e7490;
}
.section {
  margin-top: 24rpx;
  padding: 24rpx;
  background: #fff;
}
.section-highlight {
  background: #f8fdff;
}
.topic-card {
  margin-top: 24rpx;
  overflow: hidden;
  border-radius: 24rpx;
  background: #fff;
}
.topic-top {
  background: #0e7490;
}
.topic-banner {
  width: 100%;
}
.topic-center {
  width: 650rpx;
  margin: 0 auto;
  padding: 28rpx 0 20rpx;
  text-align: center;
}
.topic-qrcode {
  width: 260rpx;
  height: 260rpx;
  border-radius: 18rpx;
  background: #d7f1f8;
}
.topic-action {
  width: 100%;
  margin-top: 16rpx;
  padding: 24rpx;
  border-radius: 999rpx;
  background: #11c296;
  font-size: 30rpx;
  font-weight: 600;
  color: #fff;
}
.topic-note {
  padding: 0 30rpx 28rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #527185;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14rpx;
}
.section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #163047;
}
.section-tip {
  color: #527185;
}
.state {
  padding: 28rpx;
  border-radius: 18rpx;
  text-align: center;
  background: #fff;
  color: #648094;
}
.featured-list,
.list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
.featured-card {
  display: flex;
  gap: 16rpx;
  padding: 18rpx;
  border-radius: 20rpx;
  background: #fff;
}
.featured-cover {
  width: 180rpx;
  height: 180rpx;
  border-radius: 18rpx;
  background: #d7f1f8;
  flex-shrink: 0;
}
.featured-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.featured-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #163047;
}
.featured-meta,
.featured-desc {
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #527185;
}
.featured-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}
.score {
  font-size: 30rpx;
  font-weight: 700;
  color: #0e7490;
}
.tag {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: #e6f7fb;
  font-size: 22rpx;
  color: #0e7490;
}

.view-more {
  text-align: center;
  padding: 24rpx;
  color: #2563eb;
  font-size: 28rpx;
}
</style>
