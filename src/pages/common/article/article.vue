<template>
  <view class="page">
    <view v-if="loading" class="state">加载中...</view>
    <view v-else-if="!article.id" class="state">内容不存在</view>
    <view v-else class="content">
      <view class="headline-card">
        <text class="headline-tip">专题阅读</text>
        <text class="title">{{ article.title }}</text>
        <view class="meta">
          <text class="tag">{{ article.cat_name }}</text>
          <text class="time">{{ formatTime(article.publish_at) }}</text>
        </view>
      </view>

      <image class="cover" :src="article.image" mode="widthFix" />

      <view class="stats-card">
        <view class="stat-item">
          <text class="stat-value">{{ article.view_num || 0 }}</text>
          <text class="stat-label">浏览</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ article.collect_num || 0 }}</text>
          <text class="stat-label">收藏</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ article.author || 'babyplace' }}</text>
          <text class="stat-label">来源</text>
        </view>
      </view>

      <view class="article-body">
        <text class="paragraph">{{ article.content }}</text>
      </view>

      <view v-if="article.reviews?.length" class="section">
        <text class="section-title">最新评论</text>
        <view v-for="item in article.reviews" :key="item._id" class="review-item">
          <text class="review-name">{{ item.nickname || '匿名用户' }}</text>
          <text class="review-comment">{{ item.comment || '未填写评论' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import api from '@/common/api-util.js';
import utils from '@/common/utils.js';

const loading = ref(false);
const article = ref({});

function formatTime(value) {
  return utils.formatFullDateTime(value);
}

async function loadDetail(articleId) {
  if (!articleId) return;
  loading.value = true;
  try {
    const result = await api.article.getArticleDetail(articleId);
    if (result.code !== api.SUCCESS) throw new Error(api.getErrorMessage(result.code));
    article.value = result.data || {};
  } catch (error) {
    article.value = {};
    uni.showToast({ title: error.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onLoad((options) => {
  loadDetail(options?.articleId || '');
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f8fafc;
}

.state {
  padding: 28rpx;
  border-radius: 18rpx;
  background: #fff;
  text-align: center;
  color: #64748b;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}
.headline-card,
.stats-card,
.article-body,
.section {
  padding: 28rpx;
  border-radius: 20rpx;
  background: #fff;
}
.headline-tip {
  display: inline-block;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: #eff6ff;
  color: #2563eb;
  font-size: 22rpx;
}
.title {
  display: block;
  margin-top: 14rpx;
  font-size: 40rpx;
  font-weight: 700;
  color: #111827;
  line-height: 1.5;
}

.meta {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: 18rpx 0 24rpx;
}

.tag {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: #eff6ff;
  color: #2563eb;
  font-size: 22rpx;
}

.time,
.review-name {
  font-size: 24rpx;
  color: #64748b;
}

.cover {
  width: 100%;
  border-radius: 20rpx;
  background: #e5e7eb;
}
.stats-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
}
.stat-item {
  padding: 12rpx;
  border-radius: 16rpx;
  background: #f8fafc;
  text-align: center;
}
.stat-value {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #2563eb;
}
.stat-label {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #94a3b8;
}
.paragraph,
.review-comment {
  font-size: 28rpx;
  line-height: 1.8;
  color: #374151;
  white-space: pre-wrap;
}

.section {
  margin-top: 0;
}

.section-title {
  display: block;
  margin-bottom: 16rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
}

.review-item + .review-item {
  margin-top: 16rpx;
}
</style>
