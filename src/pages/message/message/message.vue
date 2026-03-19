<template>
  <view class="page">
    <view class="hero">
      <text class="title">消息中心</text>
      <text class="subtitle">把系统通知和内容更新合并成一个入口，保持旧版消息页的聚合感。</text>
    </view>

    <view class="tabs">
      <view class="tab" :class="{ active: currentTab === 'system' }" @click="currentTab = 'system'">系统消息</view>
      <view class="tab" :class="{ active: currentTab === 'updates' }" @click="currentTab = 'updates'">内容更新</view>
    </view>

    <view class="summary-card">
      <view class="summary-item">
        <text class="summary-value">{{ systemList.length }}</text>
        <text class="summary-label">系统通知</text>
      </view>
      <view class="summary-item">
        <text class="summary-value">{{ updateList.length }}</text>
        <text class="summary-label">内容更新</text>
      </view>
    </view>

    <view v-if="loading" class="state">加载中...</view>
    <view v-else-if="!displayList.length" class="state">暂无消息</view>
    <view v-else class="list">
      <view v-for="item in displayList" :key="item.id" class="item" @click="openItem(item)">
        <view class="item-head">
          <text class="item-title">{{ item.title }}</text>
          <text class="item-badge">{{ currentTab === 'system' ? '系统' : '更新' }}</text>
        </view>
        <text class="item-content">{{ item.content }}</text>
        <view class="item-foot">
          <text class="item-time">{{ formatTime(item.created_at || item.publish_at) }}</text>
          <text class="item-link">查看详情 ></text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '@/common/api-util.js';
import utils from '@/common/utils.js';

const loading = ref(false);
const currentTab = ref('system');
const systemList = ref([]);
const updateList = ref([]);

const displayList = computed(() => (currentTab.value === 'system' ? systemList.value : updateList.value));

function formatTime(value) {
  return utils.formatDateTime(value);
}

function openItem(item) {
  if (currentTab.value === 'updates' && item.id) {
    uni.navigateTo({ url: `/pages/common/article/article?articleId=${item.id}` });
    return;
  }
  uni.navigateTo({ url: '/pages/message/sysmessage/sysmessage' });
}

async function loadData() {
  loading.value = true;
  try {
    const [messageResult, articleResult] = await Promise.all([
      api.message.getSysMessageList(),
      api.article.getArticleList('all', 0, 1, 1),
    ]);
    systemList.value = messageResult.code === api.SUCCESS ? (messageResult.data || []) : [];
    updateList.value = articleResult.code === api.SUCCESS
      ? (articleResult.data || []).map((item) => ({
        id: item.id,
        title: item.title,
        content: item.sub_title || item.content || '',
        publish_at: item.publish_at,
      }))
      : [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f8fafc;
}
.hero {
  padding: 28rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #ecfeff, #eef2ff);
}
.title {
  display: block;
  font-size: 38rpx;
  font-weight: 700;
  color: #1f2937;
}
.subtitle {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #64748b;
}
.tabs {
  display: flex;
  gap: 12rpx;
  margin: 18rpx 0;
}
.summary-card {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12rpx;
  margin-bottom: 18rpx;
}
.summary-item {
  padding: 20rpx;
  border-radius: 18rpx;
  background: #fff;
}
.summary-value {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #2563eb;
}
.summary-label {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #64748b;
}
.tab {
  padding: 14rpx 22rpx;
  border-radius: 999rpx;
  background: #fff;
  color: #64748b;
  font-size: 24rpx;
}
.tab.active {
  background: #2563eb;
  color: #fff;
}
.state {
  padding: 26rpx;
  border-radius: 18rpx;
  background: #fff;
  text-align: center;
  color: #64748b;
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
  border: 2rpx solid #eef2ff;
}
.item-head,
.item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}
.item-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
}
.item-badge {
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  background: #eef2ff;
  font-size: 20rpx;
  color: #2563eb;
}
.item-content {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #475569;
}
.item-time,
.item-link {
  margin-top: 10rpx;
  font-size: 22rpx;
}
.item-time {
  color: #94a3b8;
}
.item-link {
  color: #2563eb;
}
</style>
