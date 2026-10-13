<template>
  <view class="page">
    <view class="search-box" @click="goSearch">
      <text class="search-placeholder">搜索想看的商品或地点</text>
    </view>

    <view class="section">
      <text class="section-title">热门好物</text>
      <view v-if="loading" class="state">加载中...</view>
      <view v-else-if="!list.length" class="state">暂无数据</view>
      <view v-else class="list">
        <view v-for="item in list" :key="item._id" class="item" @click="openDetail(item)">
          <text class="item-title">{{ item.name }}</text>
          <text class="item-desc">{{ item.address || '暂无描述' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { listGoods } from '@/api/goods';

const loading = ref(false);
const list = ref([]);

function goSearch() {
  uni.navigateTo({ url: '/pages/taobao/tbk/search/search' });
}

function openDetail(item) {
  if (!item?._id) return;
  uni.navigateTo({ url: `/pages/taobao/tbk/goods-details/goods-details?id=${item._id}` });
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
  background: #fff7ed;
}
.search-box {
  padding: 20rpx 24rpx;
  border-radius: 999rpx;
  background: #fff;
  color: #9ca3af;
}
.section {
  margin-top: 22rpx;
}
.section-title {
  display: block;
  margin-bottom: 14rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #9a3412;
}
.state {
  padding: 24rpx;
  border-radius: 16rpx;
  background: #fff;
  text-align: center;
  color: #78716c;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.item {
  padding: 22rpx;
  border-radius: 18rpx;
  background: #fff;
}
.item-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
}
.item-desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #6b7280;
}
</style>
