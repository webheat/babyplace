<template>
  <view class="page">
    <view class="hero hero-hot">
      <text class="eyebrow">人气榜单</text>
      <text class="title">亲子地点热度榜</text>
      <text class="subtitle">按评分、评论量和亲子配套整理成旧版榜单频道的浏览方式。</text>
      <view class="hero-tabs">
        <view class="hero-tab active">综合推荐</view>
        <view class="hero-tab">带娃省心</view>
      </view>
    </view>

    <view class="topic-card">
      <view class="topic-top">
        <image class="topic-banner" src="/static/meituan1-center-top.jpg" mode="widthFix" />
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
        <text>沿用旧专题页的中心卡片结构，当前入口映射到热门地点详情。</text>
      </view>
    </view>

    <view class="section rank-section">
      <view class="section-head">
        <text class="section-title">综合推荐榜</text>
      </view>
      <view v-if="loading" class="state">加载中...</view>
      <view v-else-if="!hotList.length" class="state">暂无榜单数据</view>
      <view v-else class="ranking">
        <view v-for="(item, index) in hotList" :key="item._id" class="rank-card" @click="goDetail(item)">
          <view class="rank-no" :class="{ top: index < 3 }">{{ index + 1 }}</view>
          <view class="rank-main">
            <text class="rank-name">{{ item.name }}</text>
            <text class="rank-meta">{{ item.city }} {{ item.district }}</text>
            <text class="rank-summary">{{ item.summary || item.recommend_reason || '暂无简介' }}</text>
          </view>
          <view class="rank-score">
            <text class="score">{{ Number(item.avg_rating || 0).toFixed(1) }}</text>
            <text class="count">{{ Number(item.review_count || 0) }}评</text>
          </view>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">带娃更省心</text>
      </view>
      <view v-if="!familyFriendlyList.length" class="state">暂无数据</view>
      <view v-else class="list">
        <poi-card v-for="item in familyFriendlyList" :key="item._id" :poi="item" @click="goDetail" @map="openMap" />
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
import { hasFamilyFeature, openPoiMap, pickTop, sortByRating } from '@/utils/poi';

const loading = ref(false);
const list = ref([]);
const couponList = ref([]);

const hotList = computed(() => pickTop(sortByRating(list.value), 10));
const familyFriendlyList = computed(() => pickTop(
  sortByRating(list.value.filter((item) => hasFamilyFeature(item))),
  6,
));

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
  const result = await api.coupon.meituanCoupon();
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
  background: linear-gradient(180deg, #fff3ea 0%, #fff3ea 28%, #fffaf7 28%, #fffaf7 100%);
}
.hero,
.section {
  border-radius: 24rpx;
}
.hero {
  padding: 30rpx;
  color: #5d2400;
}
.hero-hot {
  background: linear-gradient(135deg, #ffd09c, #ffb66d);
}
.eyebrow,
.subtitle {
  font-size: 24rpx;
}
.title {
  display: block;
  margin: 10rpx 0 12rpx;
  font-size: 42rpx;
  font-weight: 700;
}
.hero-tabs {
  display: flex;
  gap: 12rpx;
  margin-top: 20rpx;
}
.hero-tab {
  padding: 12rpx 20rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.24);
  font-size: 22rpx;
}
.hero-tab.active {
  background: #fff;
  color: #d96a00;
}
.section {
  margin-top: 24rpx;
  padding: 24rpx;
  background: #fff;
}
.topic-card {
  margin-top: 24rpx;
  overflow: hidden;
  border-radius: 24rpx;
  background: #fff;
}
.topic-top {
  background: #ffcf97;
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
  background: #ffe2bf;
}
.topic-action {
  width: 100%;
  margin-top: 16rpx;
  padding: 24rpx;
  border-radius: 999rpx;
  background: #ff6100;
  font-size: 30rpx;
  font-weight: 600;
  color: #fff;
}
.topic-note {
  padding: 0 30rpx 28rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #8a5a39;
}
.section-head {
  margin-bottom: 14rpx;
}
.section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #5d2400;
}
.state {
  padding: 28rpx;
  border-radius: 18rpx;
  text-align: center;
  background: #fff7ef;
  color: #8a5a39;
}
.ranking,
.list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
.rank-card {
  display: flex;
  gap: 18rpx;
  align-items: flex-start;
  padding: 24rpx;
  border-radius: 20rpx;
  background: #fff8f2;
}
.rank-no {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  text-align: center;
  border-radius: 50%;
  background: #fff1e3;
  color: #d96a00;
  font-size: 26rpx;
  font-weight: 700;
}
.rank-no.top {
  background: #ffb66d;
  color: #fff;
}
.rank-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.rank-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #2f1600;
}
.rank-meta,
.rank-summary,
.count {
  font-size: 22rpx;
  line-height: 1.6;
  color: #8a5a39;
}
.rank-score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
}
.score {
  font-size: 36rpx;
  font-weight: 700;
  color: #d96a00;
}

.view-more {
  text-align: center;
  padding: 24rpx;
  color: #2563eb;
  font-size: 28rpx;
}
</style>
