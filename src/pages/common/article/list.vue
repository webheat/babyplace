<template>
  <view class="page">
    <view class="head">
      <text class="title">资讯热点</text>
      <text class="subtitle">使用当前地点库数据生成内容流，保留旧首页资讯卡片风格。</text>
    </view>

    <view v-if="loading" class="state">加载中...</view>
    <view v-else-if="!list.length" class="state">暂无内容</view>
    <view v-else class="list">
      <view v-for="item in list" :key="item.id" class="article-card" @click="openDetail(item)">
        <view v-if="item.cover_type === 1" class="square-cover">
          <view class="card-copy">
            <text class="card-title two-line">{{ item.title }}</text>
            <view class="meta-row">
              <view class="meta-left">
                <text class="tag">{{ item.cat_name }}</text>
                <text class="time">{{ formatTime(item.publish_at) }}</text>
              </view>
            </view>
          </view>
          <image class="cover square" :src="item.image" mode="aspectFill" />
        </view>
        <view v-else-if="item.cover_type === 2" class="rect-cover">
          <image class="cover full" :src="item.image" mode="aspectFill" />
          <text class="card-title two-line">{{ item.title }}</text>
        </view>
        <view v-else class="no-cover">
          <text class="card-title two-line">{{ item.title }}</text>
        </view>
        <text class="card-summary">{{ item.sub_title || '暂无摘要' }}</text>
        <view class="meta">
          <view class="meta-left">
            <text class="tag">{{ item.cat_name }}</text>
            <text class="time">{{ formatTime(item.publish_at) }}</text>
          </view>
          <view class="meta-right">
            <text class="meta-num">浏览 {{ item.view_num || 0 }}</text>
            <text class="meta-num">收藏 {{ item.collect_num || 0 }}</text>
          </view>
        </view>
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
  return utils.formatMonthDate(value);
}

function openDetail(item) {
  uni.navigateTo({
    url: `/pages/common/article/article?articleId=${item.id}`,
  });
}

async function loadList() {
  loading.value = true;
  try {
    const result = await api.article.getArticleList('all', 0, 1, 1);
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
  gap: 16rpx;
}

.article-card {
  padding: 24rpx;
  border-radius: 20rpx;
  background: #fff;
}
.square-cover {
  display: flex;
  gap: 20rpx;
}
.rect-cover,
.no-cover {
  display: flex;
  flex-direction: column;
}
.card-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
}
.card-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.45;
}
.two-line {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.card-summary {
  display: block;
  margin-top: 14rpx;
  font-size: 24rpx;
  color: #64748b;
  line-height: 1.6;
}
.meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 18rpx;
  gap: 12rpx;
}
.meta-row,
.meta-left,
.meta-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.time,
.meta-num {
  font-size: 22rpx;
  color: #94a3b8;
}
.tag {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: #eff6ff;
  font-size: 22rpx;
  color: #2563eb;
}
.cover {
  border-radius: 16rpx;
  background: #e5e7eb;
}
.cover.square {
  width: 180rpx;
  height: 180rpx;
  flex-shrink: 0;
}
.cover.full {
  width: 100%;
  height: 320rpx;
  margin-bottom: 20rpx;
}
</style>
