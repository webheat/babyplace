<template>
  <view class="page">
    <view class="hero">
      <text class="hero-title">吃喝玩乐</text>
      <text class="hero-subtitle">保留旧版筛选页的信息密度，直接按地点库标签、城市和距离做筛选。</text>
      <view class="search-card">
        <input
          v-model="keyword"
          class="search"
          confirm-type="search"
          placeholder="搜索地点、区域或标签"
          @confirm="applyFilter"
        />
        <button class="search-button" size="mini" @click="applyFilter">搜索</button>
      </view>
    </view>

    <scroll-view class="filter-row" scroll-x>
      <view class="chip-list">
        <view class="chip" :class="{ active: selectedCity === '' }" @click="setCity('')">全部城市</view>
        <view v-for="city in cityList" :key="city" class="chip" :class="{ active: selectedCity === city }" @click="setCity(city)">
          {{ city }}
        </view>
      </view>
    </scroll-view>

    <scroll-view class="filter-row" scroll-x>
      <view class="chip-list">
        <view class="chip" :class="{ active: selectedTag === '' }" @click="setTag('')">全部标签</view>
        <view v-for="tag in tagList" :key="tag" class="chip" :class="{ active: selectedTag === tag }" @click="setTag(tag)">
          {{ tag }}
        </view>
      </view>
    </scroll-view>

    <view class="toolbar">
      <view class="switcher" :class="{ active: indoorOnly }" @click="toggleIndoorOnly">仅看雨天友好</view>
      <view class="switcher" :class="{ active: sortMode === 'nearby' }" @click="toggleNearbySort">附近优先</view>
    </view>

    <view class="summary-card">
      <text class="summary-title">当前结果</text>
      <text class="summary-value">{{ displayList.length }} 个地点</text>
    </view>

    <view v-if="loading" class="state">加载中...</view>
    <view v-else-if="!displayList.length" class="state">暂无符合条件的地点</view>
    <view v-else class="list">
      <poi-card v-for="item in displayList" :key="item._id" :poi="item" @click="goDetail" @map="openMap" />
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import PoiCard from '@/components/poi-card.vue';
import { listPoi, nearbyPoi } from '@/api/poi';
import { extractTags, extractUniqueCities, filterPoiList, openPoiMap, sortByRating } from '@/utils/poi';

const loading = ref(false);
const rawList = ref([]);
const nearbyList = ref([]);
const keyword = ref('');
const selectedKeyword = ref('');
const selectedCity = ref('');
const selectedTag = ref('');
const indoorOnly = ref(false);
const sortMode = ref('rating');

const cityList = computed(() => extractUniqueCities(rawList.value));
const tagList = computed(() => extractTags(rawList.value));

const filteredList = computed(() => filterPoiList(rawList.value, {
  keyword: selectedKeyword.value,
  city: selectedCity.value,
  tag: selectedTag.value,
  indoorOnly: indoorOnly.value,
}));

const displayList = computed(() => {
  if (sortMode.value === 'nearby' && nearbyList.value.length) {
    return filterPoiList(nearbyList.value, {
      keyword: selectedKeyword.value,
      city: selectedCity.value,
      tag: selectedTag.value,
      indoorOnly: indoorOnly.value,
    });
  }
  return sortByRating(filteredList.value);
});

function goDetail(item) {
  if (!item?._id) return;
  uni.navigateTo({ url: `/pages/life/shop/shop?id=${item._id}` });
}

function openMap(item) {
  openPoiMap(item);
}

function setCity(city) {
  selectedCity.value = city;
}

function setTag(tag) {
  selectedTag.value = tag;
}

function toggleIndoorOnly() {
  indoorOnly.value = !indoorOnly.value;
}

function applyFilter() {
  selectedKeyword.value = keyword.value.trim();
}

async function toggleNearbySort() {
  if (sortMode.value === 'nearby') {
    sortMode.value = 'rating';
    return;
  }
  if (!nearbyList.value.length) {
    await loadNearby();
  }
  if (nearbyList.value.length) {
    sortMode.value = 'nearby';
  }
}

function getLocation() {
  return new Promise((resolve) => {
    uni.getLocation({
      type: 'gcj02',
      success: ({ latitude, longitude }) => resolve({ lat: latitude, lng: longitude }),
      fail: () => resolve(null),
    });
  });
}

async function loadNearby() {
  const location = await getLocation();
  if (!location) {
    uni.showToast({ title: '未获取到定位', icon: 'none' });
    nearbyList.value = [];
    return;
  }
  const result = await nearbyPoi({ lat: location.lat, lng: location.lng, radius: 10000, page: 1, pageSize: 50 });
  if (result.code !== 0) {
    nearbyList.value = [];
    uni.showToast({ title: result.message || '附近地点加载失败', icon: 'none' });
    return;
  }
  nearbyList.value = result.data?.list || [];
}

async function loadList() {
  loading.value = true;
  try {
    const result = await listPoi({ page: 1, pageSize: 50 });
    if (result.code !== 0) throw new Error(result.message || '加载失败');
    rawList.value = result.data?.list || [];
  } catch (error) {
    rawList.value = [];
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
  background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 28%, #f8fafc 100%);
}
.hero {
  padding: 28rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #2563eb, #3b82f6 60%, #60a5fa 100%);
}
.hero-title {
  display: block;
  font-size: 42rpx;
  font-weight: 700;
  color: #fff;
}
.hero-subtitle {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.88);
}
.search-card {
  display: flex;
  gap: 12rpx;
  margin-top: 20rpx;
}
.search {
  flex: 1;
  height: 76rpx;
  padding: 0 20rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.94);
}
.search-button {
  margin: 0;
  border-radius: 16rpx;
  background: #0f172a;
  color: #fff;
}
.filter-row {
  margin-top: 14rpx;
  white-space: nowrap;
}
.chip-list {
  display: inline-flex;
  gap: 12rpx;
}
.chip,
.switcher {
  padding: 12rpx 22rpx;
  border-radius: 999rpx;
  background: #fff;
  color: #475569;
  font-size: 24rpx;
  border: 2rpx solid #e2e8f0;
}
.chip.active,
.switcher.active {
  background: #e8f0ff;
  color: #1d4ed8;
  border-color: #bfd2ff;
}
.toolbar {
  display: flex;
  gap: 12rpx;
  margin: 16rpx 0;
}
.summary-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18rpx;
  padding: 20rpx 24rpx;
  border-radius: 18rpx;
  background: #fff;
}
.summary-title {
  font-size: 24rpx;
  color: #64748b;
}
.summary-value {
  font-size: 30rpx;
  font-weight: 700;
  color: #1d4ed8;
}
.state {
  padding: 30rpx;
  border-radius: 18rpx;
  text-align: center;
  background: #fff;
  color: #64748b;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
</style>
