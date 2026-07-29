<template>
  <view class="page">
    <view class="hero">
      <text class="hero-kicker">商品搜索</text>
      <text class="hero-title">搜你想要的亲子好物</text>
      <text class="hero-subtitle">延续旧频道的橙色搜索页，点击热门词直接进入商品流。</text>
    </view>

    <view class="panel">
      <view class="search-row">
        <input v-model="keyword" class="input" confirm-type="search" placeholder="输入关键字" @confirm="submitSearch" />
        <button class="button" @click="submitSearch">搜索</button>
      </view>
      <view class="hot-box">
        <text class="hot-title">推荐搜索</text>
        <view class="hot-list">
          <text v-for="item in hotKeywords" :key="item" class="hot-item" @click="useKeyword(item)">{{ item }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';

const keyword = ref('');
const hotKeywords = ['亲子', '公园', '乐园', '周末', '露营', '绘本'];

function useKeyword(value) {
  keyword.value = value;
  submitSearch();
}

function submitSearch() {
  uni.navigateTo({ url: `/pages/taobao/tbk/search-goods-list/search-goods-list?keyword=${encodeURIComponent(keyword.value.trim())}` });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: linear-gradient(180deg, #fff1e8 0%, #fff7ed 42%, #fff7ed 100%);
}
.hero {
  padding: 30rpx;
  border-radius: 24rpx;
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
  font-size: 44rpx;
  font-weight: 700;
  color: #fff;
}
.hero-subtitle {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.9);
}
.panel {
  margin-top: 20rpx;
  padding: 28rpx;
  border-radius: 22rpx;
  background: #fff;
}
.search-row {
  display: flex;
  gap: 12rpx;
}
.input {
  flex: 1;
  height: 84rpx;
  padding: 0 20rpx;
  border-radius: 16rpx;
  background: #fff7ed;
  border: 2rpx solid #fed7aa;
}
.button {
  margin: 0;
  border-radius: 16rpx;
  background: #ea580c;
  color: #fff;
}
.hot-box {
  margin-top: 24rpx;
}
.hot-title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 24rpx;
  color: #78716c;
}
.hot-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.hot-item {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: #fff7ed;
  font-size: 22rpx;
  color: #c2410c;
}
</style>
