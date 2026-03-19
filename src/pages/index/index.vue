<template>
  <view class="page">
    <view class="hero">
      <view class="hero-top">
        <view>
          <text class="title">遛娃灵感</text>
          <text class="subtitle">把旧首页的资讯感和当前地点库结合起来，优先服务微信小程序浏览。</text>
        </view>
        <view class="hero-badge">NEW</view>
      </view>
      <view class="hero-actions">
        <view class="action-pill action-primary" @click="goPoiList">全部地点</view>
        <view class="action-pill" @click="goLifePage">按标签找</view>
        <view class="action-pill" @click="goArticleList">看资讯</view>
      </view>
    </view>

    <view v-if="bannerList.length" class="banner-section">
      <swiper class="banner-swiper" circular autoplay interval="4500" duration="500">
        <swiper-item v-for="item in bannerList" :key="item.id">
          <view class="banner-card" @click="onBannerClick(item)">
            <image class="banner-image" :src="item.image" mode="aspectFill" />
            <view class="banner-mask">
              <text class="banner-title">{{ item.title }}</text>
              <!-- #ifdef MP-WEIXIN -->
              <text class="banner-subtitle">地点精选 · 小程序优先展示</text>
              <!-- #endif -->
              <!-- #ifdef H5 -->
              <text class="banner-subtitle">地点精选</text>
              <!-- #endif -->
            </view>
          </view>
        </swiper-item>
      </swiper>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">精选推荐</text>
        <text class="section-more" @click="goPoiList">更多</text>
      </view>
      <view v-if="loading" class="state">加载中...</view>
      <view v-else-if="!homeData.featured.length" class="state">暂无推荐</view>
      <view v-else class="list">
        <poi-card v-for="item in homeData.featured" :key="item._id" :poi="item" @click="goDetail" @map="openMap" />
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">资讯热点</text>
        <text class="section-more" @click="goArticleList">更多</text>
      </view>
      <view v-if="!articleList.length" class="state">暂无资讯</view>
      <view v-else class="article-list">
        <view v-for="item in articleList" :key="item.id" class="article-card" @click="goArticle(item)">
          <view class="article-copy">
            <text class="article-title">{{ item.title }}</text>
            <view class="article-meta">
              <dx-tag v-if="item.cat_name && item.cat_name !== 'pending'" :text="item.cat_name" type="primary" font-size="20rpx" padding="8rpx 18rpx" border="none" />
              <text class="article-time">{{ formatMonthDate(item.publish_at) }}</text>
            </view>
          </view>
          <image class="article-cover" :src="item.image" mode="aspectFill" />
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">附近地点</text>
      </view>
      <view v-if="!homeData.nearby.length" class="state">进入详情页后使用“当前位置规划路线”可查看你的出行路线</view>
      <view v-else class="list">
        <poi-card v-for="item in homeData.nearby" :key="item._id" :poi="item" @click="goDetail" @map="openMap" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import PoiCard from '@/components/poi-card.vue';
import DxTag from '@/components/dx-tag/dx-tag.vue';
import { recommendHome } from '@/api/recommend';
import api from '@/common/api-util.js';
import utils from '@/common/utils.js';
import { openPoiMap } from '@/utils/poi';

const loading = ref(false);
const bannerList = ref([]);
const homeData = reactive({
  featured: [],
  nearby: [],
  latest: [],
});
const articleList = ref([]);

function goPoiList() {
  uni.navigateTo({ url: '/pages/poi/list' });
}

function goLifePage() {
  uni.switchTab({ url: '/pages/life/arrive/arrive' });
}

function goArticleList() {
  uni.navigateTo({ url: '/pages/common/article/list' });
}

function goArticle(item) {
  if (!item?.id) return;
  uni.navigateTo({ url: `/pages/common/article/article?articleId=${item.id}` });
}

function goDetail(item) {
  if (!item?._id) return;
  uni.navigateTo({ url: `/pages/life/shop/shop?id=${item._id}` });
}

function openMap(item) {
  openPoiMap(item);
}

function onBannerClick(item) {
  if (!item?.action_param) return;
  uni.navigateTo({ url: `/pages/life/shop/shop?id=${item.action_param}` });
}

function formatMonthDate(value) {
  return utils.formatMonthDate(value);
}

async function loadHome() {
  loading.value = true;
  try {
    const result = await recommendHome({
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

async function loadArticles() {
  const result = await api.article.getArticleList('all', 0, 1, 1);
  articleList.value = result.code === api.SUCCESS ? (result.data || []).slice(0, 3) : [];
}

async function loadBanners() {
  const result = await api.home.getBanner();
  bannerList.value = result.code === api.SUCCESS ? (result.data || []) : [];
}

onMounted(() => {
  loadHome();
  loadBanners();
  loadArticles();
});
</script>

<style scoped>
.page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24rpx;
  background: linear-gradient(180deg, #f3f8ff 0%, #f8fafc 40%, #f8fafc 100%);
}
/* #ifdef H5 */
.page {
  max-width: 840rpx;
  margin: 0 auto;
}
/* #endif */
.hero {
  margin-bottom: 24rpx;
  padding: 30rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #2563eb, #0ea5e9 58%, #38bdf8 100%);
}
.hero-top {
  display: flex;
  justify-content: space-between;
}
.hero-top > view + view {
  margin-left: 20rpx;
}
.title {
  display: block;
  font-size: 46rpx;
  font-weight: 700;
  color: #fff;
}
.subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.88);
  line-height: 1.6;
}
.hero-badge {
  align-self: flex-start;
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 22rpx;
}
.hero-actions {
  margin-top: 22rpx;
  display: flex;
  flex-wrap: wrap;
  margin-right: -12rpx;
  margin-bottom: -12rpx;
}
.hero-actions .action-pill {
  margin-right: 12rpx;
  margin-bottom: 12rpx;
}
.action-pill {
  padding: 14rpx 22rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 24rpx;
}
.action-pill.action-primary {
  background: #fff;
  color: #2563eb;
}
.banner-section {
  margin-bottom: 24rpx;
}
.banner-swiper {
  height: 280rpx;
}
.banner-card {
  position: relative;
  height: 280rpx;
  border-radius: 22rpx;
  overflow: hidden;
}
.banner-image {
  display: block;
  width: 100%;
  height: 100%;
  background: #dbeafe;
}
.banner-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 24rpx;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0.66) 100%);
}
.banner-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #fff;
}
.banner-subtitle {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.86);
}
.section {
  margin-bottom: 26rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: #fff;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14rpx;
}
.section-title {
  font-size: 32rpx;
  color: #1f2937;
  font-weight: 600;
}
.section-more {
  font-size: 24rpx;
  color: #2563eb;
}
.state {
  padding: 28rpx;
  border-radius: 16rpx;
  background: #f8fafc;
  color: #6b7280;
  text-align: center;
}
.list,
.article-list {
  display: flex;
  flex-direction: column;
}
.list > view + view,
.article-list > view + view {
  margin-top: 14rpx;
}
.article-card {
  display: flex;
  align-items: center;
  padding: 20rpx;
  border-radius: 18rpx;
  background: #f8fafc;
}
.article-copy + .article-cover {
  margin-left: 16rpx;
}
.article-copy {
  flex: 1;
  min-width: 0;
}
.article-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.5;
}
.article-card:first-child {
  background: linear-gradient(135deg, #eff6ff, #f8fafc);
}
.article-meta {
  display: flex;
  align-items: center;
  margin-top: 12rpx;
}
.article-meta > view + text,
.article-meta > text + view,
.article-meta > text + text,
.article-meta > view + view {
  margin-left: 10rpx;
}
.article-time {
  font-size: 22rpx;
  color: #94a3b8;
}
.article-cover {
  display: block;
  width: 150rpx;
  height: 150rpx;
  border-radius: 16rpx;
  background: #e5e7eb;
  flex-shrink: 0;
}
</style>
