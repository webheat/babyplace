<template>
  <view class="page">
    <view v-if="loading" class="state">加载中...</view>
    <view v-else-if="errorMessage" class="state error">{{ errorMessage }}</view>
    <view v-else-if="!poi._id" class="state">未找到地点</view>
    <view v-else class="content">
      <view class="hero">
        <image class="hero-cover" :src="poi.cover_image || '/static/logo.png'" mode="aspectFill" />
        <view class="hero-mask">
          <text class="title">{{ poi.name }}</text>
          <text class="meta">{{ poi.city }} {{ poi.district }} {{ poi.address }}</text>
          <view class="hero-bottom">
            <rating-stars :score="Number(poi.avg_rating || 0)" />
            <text class="score-text">{{ Number(poi.avg_rating || 0).toFixed(1) }}分 · {{ Number(poi.review_count || 0) }}条评价</text>
          </view>
        </view>
      </view>

      <view class="section tags-section">
        <tag-list :tags="poi.tags || []" />
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">推荐理由</text>
        </view>
        <text class="paragraph">{{ poi.recommend_reason || poi.summary || '暂无推荐理由' }}</text>
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">带娃信息</text>
        </view>
        <view class="facts-grid">
          <view class="fact-card"><text class="fact-label">适龄</text><text class="fact-value">{{ (poi.age_range || []).join(' / ') || '未标注' }}</text></view>
          <view class="fact-card"><text class="fact-label">建议时长</text><text class="fact-value">{{ poi.recommended_duration || '未标注' }}</text></view>
          <view class="fact-card"><text class="fact-label">推车友好</text><text class="fact-value">{{ poi.facilities?.stroller_friendly ? '是' : '否' }}</text></view>
          <view class="fact-card"><text class="fact-label">洗手间</text><text class="fact-value">{{ poi.facilities?.restroom ? '有' : '未知' }}</text></view>
          <view class="fact-card"><text class="fact-label">餐饮</text><text class="fact-value">{{ poi.facilities?.food ? '有' : '未知' }}</text></view>
          <view class="fact-card"><text class="fact-label">停车</text><text class="fact-value">{{ poi.facilities?.parking ? '有' : '未知' }}</text></view>
        </view>
      </view>

      <route-planner-card
        :name="poi.name || ''"
        :city="poi.city || ''"
        :district="poi.district || ''"
        :address="poi.address || ''"
        :latitude="Number(poi.location?.lat || 0)"
        :longitude="Number(poi.location?.lng || 0)"
      />

      <view class="section">
        <view class="section-head">
          <text class="section-title">评价</text>
        </view>
        <view class="review-form">
          <input v-model="reviewForm.nickname" class="input" placeholder="昵称（可选）" />
          <input v-model="reviewForm.comment" class="input" placeholder="说说体验..." />
          <picker mode="selector" :range="scoreOptions" @change="handleScoreChange">
            <view class="input picker-input">评分：{{ reviewForm.rating }} 星</view>
          </picker>
          <button class="button" size="mini" :loading="submitting" @click="submitReview">提交评价</button>
        </view>

        <view v-if="!reviews.length" class="empty-line">暂无评价</view>
        <view v-else class="review-list">
          <view v-for="item in reviews" :key="item._id" class="review-item">
            <view class="review-head">
              <text class="name">{{ item.nickname || '匿名用户' }}</text>
              <rating-stars :score="Number(item.rating || 0)" />
            </view>
            <text class="comment">{{ item.comment || '未填写评论' }}</text>
          </view>
        </view>
      </view>

      <view v-if="sources.length" class="section">
        <view class="section-head">
          <text class="section-title">内容来源</text>
        </view>
        <view class="source-list">
          <view v-for="item in sources" :key="item._id" class="source-item">
            <text class="source-type">{{ item.source_type || 'source' }}</text>
            <text class="source-text">文章ID：{{ item.article_id || '未关联' }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import RoutePlannerCard from '@/components/RoutePlannerCard.vue';
import RatingStars from '@/components/rating-stars.vue';
import TagList from '@/components/tag-list.vue';
import { detailPoi } from '@/api/poi';
import { createReview } from '@/api/review';

const loading = ref(false);
const submitting = ref(false);
const errorMessage = ref('');
const poi = ref({});
const reviews = ref([]);
const sources = ref([]);
const scoreOptions = ['1', '2', '3', '4', '5'];
const reviewForm = reactive({ nickname: '', comment: '', rating: 5 });

let poiId = '';

function handleScoreChange(event) {
  const index = Number(event.detail.value || 0);
  reviewForm.rating = Number(scoreOptions[index] || 5);
}

async function loadDetail() {
  if (!poiId) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await detailPoi(poiId);
    if (result.code !== 0) throw new Error(result.message || '加载失败');
    poi.value = result.data?.poi || {};
    reviews.value = result.data?.reviews || [];
    sources.value = result.data?.sources || [];
  } catch (error) {
    poi.value = {};
    reviews.value = [];
    sources.value = [];
    errorMessage.value = error.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function submitReview() {
  if (!poiId) return;
  submitting.value = true;
  try {
    const result = await createReview({ poi_id: poiId, nickname: reviewForm.nickname, comment: reviewForm.comment, rating: reviewForm.rating });
    if (result.code !== 0) throw new Error(result.message || '提交失败');
    reviewForm.comment = '';
    uni.showToast({ title: '评价已提交', icon: 'success' });
    await loadDetail();
  } catch (error) {
    uni.showToast({ title: error.message || '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

onLoad((options) => {
  poiId = options?.id || options?.shopId || '';
  loadDetail();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: linear-gradient(180deg, #f1f5f9 0%, #f8fafc 100%);
}
.state {
  padding: 30rpx;
  border-radius: 18rpx;
  text-align: center;
  background: #fff;
  color: #64748b;
}
.state.error {
  color: #dc2626;
}
.content {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.hero,
.section {
  border-radius: 22rpx;
  overflow: hidden;
  background: #fff;
}
.hero {
  position: relative;
  min-height: 420rpx;
}
.hero-cover {
  width: 100%;
  height: 420rpx;
  background: #dbeafe;
}
.hero-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 28rpx;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0.72) 100%);
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
}
.meta {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.88);
}
.hero-bottom {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 14rpx;
}
.score-text {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.82);
}
.tags-section {
  padding: 20rpx 24rpx;
}
.section {
  padding: 24rpx;
}
.section-head {
  margin-bottom: 12rpx;
}
.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
}
.paragraph,
.comment,
.source-text,
.empty-line,
.fact-value,
.location-address {
  font-size: 24rpx;
  line-height: 1.7;
  color: #475569;
}
.facts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
}
.fact-card {
  padding: 18rpx;
  border-radius: 16rpx;
  background: #f8fafc;
}
.fact-label {
  display: block;
  margin-bottom: 8rpx;
  font-size: 22rpx;
  color: #94a3b8;
}
.review-form,
.review-list,
.source-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.input {
  min-height: 78rpx;
  padding: 0 16rpx;
  border-radius: 14rpx;
  border: 2rpx solid #e2e8f0;
  background: #fff;
  display: flex;
  align-items: center;
  font-size: 24rpx;
}
.picker-input {
  color: #1f2937;
}
.button {
  margin: 0;
  border-radius: 14rpx;
  background: #2563eb;
  color: #fff;
}
.review-item,
.source-item {
  padding: 16rpx;
  border-radius: 14rpx;
  background: #f8fafc;
}
.review-head {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 8rpx;
}
.name,
.source-type {
  font-size: 24rpx;
  color: #1f2937;
}
</style>
