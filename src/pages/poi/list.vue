<template>
  <view class="page">
    <view class="toolbar">
      <input
        v-model="keyword"
        class="search"
        confirm-type="search"
        placeholder="搜索地点名称/地址"
        @confirm="loadList"
      />
      <button class="button" size="mini" @click="loadList">搜索</button>
    </view>
    <view v-if="loading" class="state">加载中...</view>
    <view v-else-if="errorMessage" class="state error">{{ errorMessage }}</view>
    <view v-else-if="!list.length" class="state">暂无数据</view>
    <view v-else class="list">
      <poi-card v-for="item in list" :key="item._id" :poi="item" @click="goDetail" @map="openMap" />
    </view>
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import PoiCard from '@/components/poi-card.vue';
import { listPoi } from '@/api/poi';
import { openPoiMap } from '@/utils/poi';

const loading = ref(false);
const errorMessage = ref('');
const keyword = ref('');
const list = ref([]);

function goDetail(item) {
  if (!item?._id) return;
  uni.navigateTo({ url: `/pages/poi/detail?id=${item._id}` });
}

function openMap(item) {
  openPoiMap(item);
}

async function loadList() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await listPoi({
      keyword: keyword.value,
      page: 1,
      pageSize: 20,
    });
    if (result.code !== 0) throw new Error(result.message || '加载失败');
    list.value = result.data?.list || [];
  } catch (error) {
    list.value = [];
    errorMessage.value = error.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadList();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f8fafc;
}

.toolbar {
  display: flex;
  gap: 12rpx;
  margin-bottom: 18rpx;
}

.search {
  flex: 1;
  height: 76rpx;
  border-radius: 14rpx;
  border: 2rpx solid #dbe2ea;
  background: #fff;
  padding: 0 20rpx;
}

.button {
  margin: 0;
  border-radius: 12rpx;
  background: #2563eb;
  color: #fff;
}

.state {
  text-align: center;
  padding: 30rpx;
  border-radius: 16rpx;
  background: #fff;
  color: #64748b;
}

.state.error {
  color: #dc2626;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
</style>
