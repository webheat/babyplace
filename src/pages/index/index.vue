<template>
  <view class="page">
    <view class="hero">
      <view class="hero-top">
        <view>
          <text class="title">今天带娃去哪</text>
          <text class="subtitle">先按场景缩小范围，再决定去哪玩、去哪吃。首页现在优先服务“带娃去哪 + 附近吃什么”的决策链路。</text>
        </view>
        <view class="hero-badge">{{ currentWeatherLabel }}</view>
      </view>
      <view class="hero-actions">
        <view class="action-pill action-primary" @click="goPoiList">全部地点</view>
        <view class="action-pill" @click="useCurrentLocation">定位附近</view>
        <view class="action-pill" @click="goArticleList">看资讯</view>
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">今日推荐</text>
        <text class="section-more" @click="goPoiList">更多</text>
      </view>
      <view class="scenario-panel">
        <view class="scenario-card primary" @click="openTodayPick">
          <text class="scenario-eyebrow">Today Pick</text>
          <text class="scenario-title">{{ todayPick.name || '正在生成今日推荐' }}</text>
          <text class="scenario-copy">{{ todayPick.recommend_reason || todayPick.summary || '结合评分、带娃友好度和天气场景给出第一站建议。' }}</text>
          <text class="scenario-meta">{{ todayPickMeta }}</text>
        </view>
        <view class="scenario-grid">
          <view class="scenario-card soft" @click="setWeatherMode('sunny')">
            <text class="scenario-eyebrow">晴天</text>
            <text class="scenario-title small">{{ sunnyPick.name || '优先户外草地 / 公园' }}</text>
            <text class="scenario-copy">{{ sunnyPick.summary || sunnyPick.recommend_reason || '适合放电、散步、骑行。' }}</text>
          </view>
          <view class="scenario-card soft" @click="setWeatherMode('rainy')">
            <text class="scenario-eyebrow">雨天</text>
            <text class="scenario-title small">{{ rainyPick.name || '优先室内 / 雨天友好' }}</text>
            <text class="scenario-copy">{{ rainyPick.summary || rainyPick.recommend_reason || '优先考虑室内、可推车、补给更方便。' }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-head stacked">
        <view>
          <text class="section-title">按年龄筛选</text>
          <text class="section-subtitle">先缩小适龄范围，再看今天适合去哪一类地点。</text>
        </view>
      </view>
      <scroll-view class="chip-scroll" scroll-x enable-flex show-scrollbar="false">
        <view class="chip-row">
          <view
            v-for="item in ageOptions"
            :key="item.value"
            class="filter-chip"
            :class="{ active: selectedAge === item.value }"
            @click="setAgeFilter(item.value)"
          >
            {{ item.label }}
          </view>
        </view>
      </scroll-view>
      <view v-if="!ageFilteredList.length" class="state">当前年龄段暂无更合适的推荐</view>
      <view v-else class="list compact">
        <poi-card v-for="item in ageFilteredList" :key="item._id" :poi="item" @click="goDetail" @map="openMap" />
      </view>
    </view>

    <view class="section">
      <view class="section-head stacked">
        <view>
          <text class="section-title">按天气推荐</text>
          <text class="section-subtitle">不用先查攻略，先按今天的出门条件切一遍。</text>
        </view>
      </view>
      <view class="weather-switch">
        <view
          v-for="item in weatherOptions"
          :key="item.value"
          class="weather-pill"
          :class="{ active: weatherMode === item.value }"
          @click="setWeatherMode(item.value)"
        >
          {{ item.label }}
        </view>
      </view>
      <view v-if="!weatherFilteredList.length" class="state">当前天气条件下暂无推荐</view>
      <view v-else class="list compact">
        <poi-card v-for="item in weatherFilteredList" :key="item._id" :poi="item" @click="goDetail" @map="openMap" />
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
        <text class="section-title">附近遛娃场所</text>
        <text class="section-more" @click="useCurrentLocation">刷新</text>
      </view>
      <view v-if="loading" class="state">加载中...</view>
      <view v-else-if="!homeData.nearby.length" class="state">点击“定位附近”后，这里会优先展示离你最近的遛娃地点。</view>
      <view v-else class="list">
        <poi-card v-for="item in homeData.nearby" :key="item._id" :poi="item" @click="goDetail" @map="openMap" />
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">精选地点</text>
        <text class="section-more" @click="goPoiList">更多</text>
      </view>
      <view v-if="!homeData.featured.length" class="state">暂无推荐</view>
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
              <dx-tag
                v-if="item.cat_name && item.cat_name !== 'pending'"
                :text="item.cat_name"
                type="primary"
                font-size="20rpx"
                padding="8rpx 18rpx"
                border="none"
              />
              <text class="article-time">{{ formatMonthDate(item.publish_at) }}</text>
            </view>
          </view>
          <image class="article-cover" :src="item.image" mode="aspectFill" />
        </view>
      </view>
    </view>
    <contact-fab />
  </view>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import PoiCard from '@/components/poi-card.vue';
import DxTag from '@/components/dx-tag/dx-tag.vue';
import { recommendHome } from '@/api/recommend';
import api from '@/common/api-util.js';
import utils from '@/common/utils.js';
import { openPoiMap } from '@/utils/poi';
import ContactFab from '@/components/contact-fab.vue';

const loading = ref(false);
const bannerList = ref([]);
const homeData = reactive({
  featured: [],
  nearby: [],
  latest: [],
});
const articleList = ref([]);
const selectedAge = ref('all');
const weatherMode = ref('all');
const userLocation = ref(null);

const ageOptions = [
  { label: '全部年龄', value: 'all' },
  { label: '0-3岁', value: '0-3' },
  { label: '3-6岁', value: '3-6' },
  { label: '6岁+', value: '6+' },
];

const weatherOptions = [
  { label: '不限天气', value: 'all' },
  { label: '晴天放电', value: 'sunny' },
  { label: '雨天友好', value: 'rainy' },
];

function includesAge(item, ageValue) {
  if (!ageValue || ageValue === 'all') return true;
  const ageRange = Array.isArray(item?.age_range) ? item.age_range : [];
  if (ageValue === '6+') {
    return ageRange.some((value) => String(value).includes('6'));
  }
  return ageRange.some((value) => String(value).includes(ageValue));
}

function isRainyFriendly(item) {
  return Boolean(item?.indoor || item?.facilities?.rainy_day_ok);
}

function isSunnyFriendly(item) {
  return !item?.indoor || item?.facilities?.shade || item?.facilities?.parking;
}

const allScenarioList = computed(() => {
  const merged = []
    .concat(homeData.featured || [])
    .concat(homeData.latest || [])
    .concat(homeData.nearby || []);
  const map = new Map();
  let sunnyPick = {};
  let rainyPick = {};
  merged.forEach((item) => {
    if (item?._id && !map.has(item._id)) {
      map.set(item._id, item);
      if (!sunnyPick._id && isSunnyFriendly(item)) sunnyPick = item;
      if (!rainyPick._id && isRainyFriendly(item)) rainyPick = item;
    }
  });
  return { list: Array.from(map.values()), sunnyPick, rainyPick };
});

const ageFilteredList = computed(() => {
  return allScenarioList.value.list
    .filter((item) => includesAge(item, selectedAge.value))
    .slice(0, 6);
});

const weatherFilteredList = computed(() => {
  return allScenarioList.value.list
    .filter((item) => {
      if (weatherMode.value === 'rainy') return isRainyFriendly(item);
      if (weatherMode.value === 'sunny') return isSunnyFriendly(item);
      return true;
    })
    .slice(0, 6);
});

const todayPick = computed(() => weatherFilteredList.value[0] || ageFilteredList.value[0] || allScenarioList.value.list[0] || {});
const sunnyPick = computed(() => allScenarioList.value.sunnyPick);
const rainyPick = computed(() => allScenarioList.value.rainyPick);
const currentWeatherLabel = computed(() => {
  if (weatherMode.value === 'rainy') return '雨天模式';
  if (weatherMode.value === 'sunny') return '晴天模式';
  return '场景首页';
});
const todayPickMeta = computed(() => {
  const item = todayPick.value || {};
  const parts = [];
  if (item.city || item.district) parts.push([item.city, item.district].filter(Boolean).join(' '));
  if (Array.isArray(item.age_range) && item.age_range.length) parts.push(item.age_range.join(' / '));
  if (item.indoor || item?.facilities?.rainy_day_ok) parts.push('雨天友好');
  return parts.join(' · ') || '优先从高评分、亲子友好的地点开始';
});

function goPoiList() {
  uni.navigateTo({ url: '/pages/poi/list' });
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

function openTodayPick() {
  if (!todayPick.value?._id) return;
  goDetail(todayPick.value);
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

function setAgeFilter(value) {
  selectedAge.value = value;
}

function setWeatherMode(value) {
  weatherMode.value = value;
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
    const location = userLocation.value || await getCurrentLocation();
    userLocation.value = location;
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

async function useCurrentLocation() {
  userLocation.value = await getCurrentLocation();
  if (!userLocation.value) {
    uni.showToast({ title: '定位失败，已回退默认推荐', icon: 'none' });
  } else {
    uni.showToast({ title: '已刷新附近地点', icon: 'none' });
  }
  loadHome();
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

onShareAppMessage(() => {
  const featured = todayPick.value?._id ? todayPick.value : homeData.featured[0];
  const path = featured?._id ? `/pages/life/shop/shop?id=${featured._id}` : '/pages/index/index';
  return {
    title: featured?.name ? `带娃去哪玩？试试 ${featured.name}` : '带娃去哪玩？先看今天的场景推荐',
    path,
    imageUrl: bannerList.value[0]?.image || featured?.cover_image || '',
  };
});

onShareTimeline(() => {
  const featured = todayPick.value?._id ? todayPick.value : homeData.featured[0];
  return {
    title: featured?.name ? `带娃去哪玩？试试 ${featured.name}` : '带娃去哪玩？先看今天的场景推荐',
    query: featured?._id ? `id=${featured._id}` : '',
    imageUrl: bannerList.value[0]?.image || featured?.cover_image || '',
  };
});
</script>

<style scoped>
.page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24rpx;
  background: linear-gradient(180deg, #f3f8ff 0%, #f8fafc 34%, #f8fafc 100%);
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
.section-head.stacked {
  flex-direction: column;
  align-items: flex-start;
}
.section-title {
  font-size: 32rpx;
  color: #1f2937;
  font-weight: 600;
}
.section-subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #64748b;
}
.section-more {
  font-size: 24rpx;
  color: #2563eb;
}
.scenario-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 16rpx;
}
.scenario-grid {
  display: grid;
  gap: 16rpx;
}
.scenario-card {
  border-radius: 20rpx;
  padding: 24rpx;
}
.scenario-card.primary {
  min-height: 290rpx;
  background: linear-gradient(135deg, #1d4ed8 0%, #0f766e 100%);
}
.scenario-card.soft {
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
}
.scenario-eyebrow {
  display: block;
  font-size: 20rpx;
  letter-spacing: 1rpx;
  text-transform: uppercase;
}
.scenario-card.primary .scenario-eyebrow,
.scenario-card.primary .scenario-title,
.scenario-card.primary .scenario-copy,
.scenario-card.primary .scenario-meta {
  color: #fff;
}
.scenario-title {
  display: block;
  margin-top: 10rpx;
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1.4;
  color: #0f172a;
}
.scenario-title.small {
  font-size: 28rpx;
}
.scenario-copy {
  display: block;
  margin-top: 12rpx;
  font-size: 23rpx;
  line-height: 1.7;
  color: #475569;
}
.scenario-meta {
  display: block;
  margin-top: 18rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.86);
}
.chip-scroll {
  white-space: nowrap;
  margin-bottom: 18rpx;
}
.chip-row {
  display: inline-flex;
  gap: 12rpx;
}
.filter-chip,
.weather-pill {
  padding: 14rpx 22rpx;
  border-radius: 999rpx;
  background: #eef2ff;
  color: #475569;
  font-size: 24rpx;
}
.filter-chip.active,
.weather-pill.active {
  background: #2563eb;
  color: #fff;
}
.weather-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 18rpx;
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
.list.compact > view + view {
  margin-top: 12rpx;
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
/* #ifdef H5 */
.scenario-panel {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
/* #endif */
</style>
