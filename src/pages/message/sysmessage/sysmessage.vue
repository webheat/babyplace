<template>
  <view class="page">
    <view class="head">
      <text class="title">系统消息</text>
      <text class="subtitle">消息内容先基于地点更新生成，保持旧项目的消息列表入口。</text>
    </view>

    <view v-if="loading" class="state">加载中...</view>
    <view v-else-if="!list.length" class="state">暂无系统消息</view>
    <view v-else class="list">
      <view v-for="item in list" :key="item.id" class="message-item">
        <view class="message-dot"></view>
        <view class="message-head">
          <text class="message-title">{{ item.title }}</text>
          <text class="message-tag">通知</text>
        </view>
        <text class="message-content">{{ item.content }}</text>
        <text class="message-time">{{ formatTime(item.created_at) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '@/common/api-util.js';
import utils from '@/common/utils.js';

const loading = ref(false);
const list = ref([]);

function formatTime(value) {
  return utils.formatDateTime(value);
}

async function loadList() {
  loading.value = true;
  try {
    const result = await api.message.getSysMessageList();
    if (result.code !== api.SUCCESS) throw new Error(api.getErrorMessage(result.code));
    list.value = result.data || [];
  } catch (error) {
    list.value = [];
    uni.showToast({ title: error.message || '加载失败', icon: 'none' });
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

.head {
  margin-bottom: 18rpx;
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
  color: #64748b;
}

.state {
  padding: 28rpx;
  border-radius: 18rpx;
  background: #fff;
  text-align: center;
  color: #64748b;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.message-item {
  position: relative;
  padding: 24rpx;
  border-radius: 18rpx;
  background: #fff;
  border-left: 8rpx solid #dbeafe;
}

.message-dot {
  position: absolute;
  top: 28rpx;
  right: 28rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #2563eb;
}

.message-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
}
.message-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}
.message-tag {
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  background: #eff6ff;
  font-size: 20rpx;
  color: #2563eb;
}

.message-content {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #475569;
}

.message-time {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  color: #94a3b8;
}
</style>
