<template>
  <view class="page">
    <!-- Hero -->
    <view class="hero">
      <view class="hero-top">
        <view>
          <text class="title">今天带娃去哪</text>
          <text class="subtitle">先按场景缩小范围，再决定去哪玩、去哪吃。首页现在优先服务"带娃去哪 + 附近吃什么"的决策链路。</text>
        </view>
        <view class="hero-badge">{{ currentWeatherLabel }}</view>
      </view>
      <view class="hero-actions">
        <view class="action-pill action-primary" @click="goPoiList">全部地点</view>
        <view class="action-pill" @click="useCurrentLocation">定位附近</view>
        <view class="action-pill" @click="goArticleList">看资讯</view>
      </view>
    </view>

    <!-- Today Pick (featured) -->
    <view class="section section--featured">
      <view class="section-head">
        <text class="section-title">今日精选</text>
        <text class="section-more" @click="goPoiList">更多</text>
      </view>
      <view class="scenario-panel">
        <view class="scenario-card featured" @click="openTodayPick">
          <view class="stamp">今日精选</view>
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

    <!-- Age filter -->
    <view class="section">
      <view class="section-head">
        <text class="section-title">按年龄筛选</text>
        <text class="section-more" @click="goPoiList">更多</text>
      </view>
      <text class="section-subtitle">先缩小适龄范围，再看今天适合去哪一类地点。</text>
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
        <view v-for="item in ageFilteredList" :key="item._id" class="poi-item poi-item--terracotta" @click="goDetail(item)">
          <poi-card :poi="item" @map="openMap" />
        </view>
      </view>
    </view>

    <!-- Weather filter -->
    <view class="section">
      <view class="section-head">
        <text class="section-title">按天气推荐</text>
        <text class="section-more" @click="goPoiList">更多</text>
      </view>
      <text class="section-subtitle">不用先查攻略，先按今天的出门条件切一遍。</text>
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
        <view v-for="item in weatherFilteredList" :key="item._id" class="poi-item poi-item--sage" @click="goDetail(item)">
          <poi-card :poi="item" @map="openMap" />
        </view>
      </view>
    </view>

    <!-- Banner -->
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

    <!-- Nearby -->
    <view class="section">
      <view class="section-head">
        <text class="section-title">附近遛娃场所</text>
        <text class="section-more" @click="useCurrentLocation">刷新</text>
      </view>
      <view v-if="loading" class="state">加载中...</view>
      <view v-else-if="!homeData.nearby.length" class="state">点击"定位附近"后，这里会优先展示离你最近的遛娃地点。</view>
      <view v-else class="list">
        <view v-for="item in homeData.nearby" :key="item._id" class="poi-item poi-item--sky" @click="goDetail(item)">
          <poi-card :poi="item" @map="openMap" />
        </view>
      </view>
    </view>

    <!-- Featured -->
    <view class="section">
      <view class="section-head">
        <text class="section-title">精选地点</text>
        <text class="section-more" @click="goPoiList">更多</text>
      </view>
      <view v-if="!homeData.featured.length" class="state">暂无推荐</view>
      <view v-else class="list">
        <view v-for="item in homeData.featured" :key="item._id" class="poi-item poi-item--terracotta" @click="goDetail(item)">
          <poi-card :poi="item" @map="openMap" />
        </view>
      </view>
    </view>

    <!-- News -->
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

<style scoped lang="scss">
/* ========================================
   Field Journal — 遛娃宝地 Home Page
   Warm paper, serif headlines, category color bars
   ======================================== */

/* -- Design tokens -- */
$paper: #FAF7F2;
$card: #FFFFFF;
$ink: #2C2420;
$body: #5C554D;
$muted: #9B938A;
$terracotta: #C4704B;
$terracotta-light: #FDF0E9;
$sage: #6B8F71;
$sage-light: #EDF3EE;
$sky: #5B8FA8;
$sky-light: #EBF2F6;
$gold: #B8924A;
$divider: #E8E3DC;

/* -- Entrance animation -- */
@keyframes fj-rise {
  from { opacity: 0; transform: translateY(16rpx); }
  to   { opacity: 1; transform: translateY(0); }
}

/* -- Page -- */
.page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24rpx;
  background: $paper;
}
/* #ifdef H5 */
.page {
  max-width: 840rpx;
  margin: 0 auto;
}
/* #endif */

/* -- Hero -- */
.hero {
  margin-bottom: 24rpx;
  padding: 36rpx 32rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, $terracotta 0%, $terracotta 48%, #B85A38 100%);
  animation: fj-rise 500ms ease-out both;
}
.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.hero-top > view + view {
  margin-left: 20rpx;
}
.title {
  display: block;
  font-family: 'Songti SC', 'STSong', 'SimSun', 'Noto Serif SC', serif;
  font-size: 46rpx;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.02em;
}
.subtitle {
  display: block;
  margin-top: 14rpx;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.88);
  line-height: 1.7;
}
.hero-badge {
  align-self: flex-start;
  flex-shrink: 0;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 22rpx;
  font-weight: 500;
  backdrop-filter: blur(4rpx);
}
.hero-actions {
  margin-top: 26rpx;
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
  padding: 14rpx 26rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 24rpx;
  font-weight: 500;
  transition: transform 150ms ease-out;
}
.action-pill:active {
  transform: scale(0.97);
}
.action-pill.action-primary {
  background: #fff;
  color: $terracotta;
}

/* -- Section (white card) -- */
.section {
  margin-bottom: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: $card;
  animation: fj-rise 500ms ease-out both;
}
.section:nth-child(2)  { animation-delay: 60ms; }
.section:nth-child(3)  { animation-delay: 120ms; }
.section:nth-child(4)  { animation-delay: 180ms; }
.section:nth-child(5)  { animation-delay: 240ms; }
.section:nth-child(6)  { animation-delay: 300ms; }
.section:nth-child(7)  { animation-delay: 360ms; }
.section:nth-child(8)  { animation-delay: 420ms; }

/* -- Section head -- */
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6rpx;
}
.section-title {
  font-family: 'Songti SC', 'STSong', 'SimSun', 'Noto Serif SC', serif;
  font-size: 32rpx;
  font-weight: 700;
  color: $ink;
  letter-spacing: 0.03em;
}
.section-subtitle {
  display: block;
  margin-bottom: 18rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: $muted;
}
.section-more {
  font-size: 24rpx;
  color: $sky;
  font-weight: 500;
}

/* -- Divider (inline, with label) -- */
.divider {
  display: flex;
  align-items: center;
  margin: 10rpx 0 20rpx;
  color: $muted;
  font-size: 22rpx;
}
.divider-line {
  flex: 1;
  height: 1rpx;
  background: $divider;
}
.divider-label {
  padding: 0 20rpx;
  white-space: nowrap;
}

/* -- Today Pick: scenario-card -- */
.scenario-panel {
  display: grid;
  gap: 14rpx;
}
/* #ifdef H5 */
.scenario-panel {
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
}
/* #endif */
.scenario-grid {
  display: grid;
  gap: 14rpx;
}
.scenario-card {
  position: relative;
  border-radius: 20rpx;
  padding: 26rpx 24rpx;
  overflow: hidden;
}
.scenario-card.featured {
  min-height: 280rpx;
  background: linear-gradient(145deg, $terracotta 0%, #A85D3C 100%);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.scenario-card.soft {
  background: $terracotta-light;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

/* -- Rubber-stamp badge -- */
.stamp {
  position: absolute;
  top: 22rpx;
  right: -28rpx;
  padding: 8rpx 40rpx;
  transform: rotate(8deg);
  font-size: 20rpx;
  font-weight: 600;
  letter-spacing: 0.12em;
  border: 2rpx dashed rgba(255, 255, 255, 0.55);
  border-radius: 999rpx;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.12);
  pointer-events: none;
  z-index: 1;
}

.scenario-eyebrow {
  display: block;
  font-size: 20rpx;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 8rpx;
}
.scenario-card.featured .scenario-eyebrow,
.scenario-card.featured .scenario-title,
.scenario-card.featured .scenario-copy,
.scenario-card.featured .scenario-meta {
  color: #fff;
}
.scenario-card.soft .scenario-eyebrow {
  color: $terracotta;
}
.scenario-title {
  display: block;
  font-family: 'Songti SC', 'STSong', 'SimSun', 'Noto Serif SC', serif;
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1.4;
}
.scenario-title.small {
  font-size: 28rpx;
}
.scenario-card.soft .scenario-title {
  color: $ink;
}
.scenario-copy {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  line-height: 1.7;
}
.scenario-card.featured .scenario-copy {
  color: rgba(255, 255, 255, 0.86);
}
.scenario-card.soft .scenario-copy {
  color: $body;
}
.scenario-meta {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  line-height: 1.6;
  font-family: ui-monospace, 'SF Mono', 'Menlo', 'Consolas', monospace;
  color: rgba(255, 255, 255, 0.78);
}

/* -- Chips / pills -- */
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
  padding: 14rpx 24rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 500;
  transition: transform 150ms ease-out, opacity 150ms ease-out;
}
.filter-chip:active,
.weather-pill:active {
  transform: scale(0.97);
}
.filter-chip {
  background: $terracotta-light;
  color: $terracotta;
}
.filter-chip.active {
  background: $terracotta;
  color: #fff;
}
.weather-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 18rpx;
}
.weather-pill {
  background: $sage-light;
  color: $sage;
}
.weather-pill.active {
  background: $sage;
  color: #fff;
}

/* -- Banner -- */
.banner-section {
  margin-bottom: 24rpx;
  animation: fj-rise 500ms ease-out both;
  animation-delay: 200ms;
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
  background: $divider;
}
.banner-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 24rpx;
  background: linear-gradient(180deg, rgba(44, 36, 32, 0.04) 0%, rgba(44, 36, 32, 0.64) 100%);
}
.banner-title {
  font-family: 'Songti SC', 'STSong', 'SimSun', 'Noto Serif SC', serif;
  font-size: 34rpx;
  font-weight: 700;
  color: #fff;
}
.banner-subtitle {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.86);
}

/* -- Empty / loading state -- */
.state {
  padding: 32rpx;
  border-radius: 16rpx;
  background: $paper;
  color: $muted;
  text-align: center;
  font-size: 24rpx;
  line-height: 1.6;
}

/* -- POI card wrappers (left-edge color bar) -- */
.list {
  display: flex;
  flex-direction: column;
}
.list.compact > view + view {
  margin-top: 12rpx;
}
.list > view + view {
  margin-top: 14rpx;
}
.poi-item {
  border-radius: 18rpx;
  overflow: hidden;
  transition: transform 150ms ease-out;
}
.poi-item:active {
  transform: scale(0.985);
}
/* Override poi-card's own border when wrapped */
.poi-item :deep(.card) {
  border: none;
  border-radius: 18rpx;
}
.poi-item--terracotta {
  border-left: 6rpx solid $terracotta;
  background: $terracotta-light;
}
.poi-item--sage {
  border-left: 6rpx solid $sage;
  background: $sage-light;
}
.poi-item--sky {
  border-left: 6rpx solid $sky;
  background: $sky-light;
}

/* -- Article list -- */
.article-list {
  display: flex;
  flex-direction: column;
}
.article-list > view + view {
  margin-top: 0;
}
.article-card {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-radius: 12rpx;
}
.article-card + .article-card {
  border-top: 1rpx solid $divider;
}
.article-copy + .article-cover {
  margin-left: 18rpx;
}
.article-copy {
  flex: 1;
  min-width: 0;
}
.article-title {
  display: block;
  font-family: 'Songti SC', 'STSong', 'SimSun', 'Noto Serif SC', serif;
  font-size: 28rpx;
  font-weight: 600;
  color: $ink;
  line-height: 1.55;
}
.article-meta {
  display: flex;
  align-items: center;
  margin-top: 10rpx;
}
.article-meta > view + text,
.article-meta > text + view,
.article-meta > text + text,
.article-meta > view + view {
  margin-left: 10rpx;
}
.article-time {
  font-size: 22rpx;
  color: $muted;
}
.article-cover {
  display: block;
  width: 150rpx;
  height: 150rpx;
  border-radius: 16rpx;
  background: $divider;
  flex-shrink: 0;
}

/* -- Reduced motion -- */
@media (prefers-reduced-motion: reduce) {
  .section,
  .banner-section,
  .hero {
    animation: none;
  }
  .poi-item:active,
  .filter-chip:active,
  .weather-pill:active,
  .action-pill:active {
    transform: none;
  }
}

/* #ifdef H5 */
.scenario-panel {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
/* #endif */
</style>
