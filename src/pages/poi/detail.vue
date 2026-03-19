<template>
  <view class="page">
    <view v-if="loading" class="state">加载中...</view>
    <view v-else-if="errorMessage" class="state error">{{ errorMessage }}</view>
    <view v-else-if="!poi._id" class="state">未找到地点</view>
    <view v-else class="content">
      <view class="head-card">
        <text class="title">{{ poi.name }}</text>
        <text class="address">{{ poi.city }} {{ poi.district }} {{ poi.address }}</text>
        <rating-stars :score="Number(poi.avg_rating || 0)" />
        <tag-list :tags="poi.tags || []" />
      </view>

      <view class="section">
        <text class="section-title">推荐理由</text>
        <text class="paragraph">{{ poi.recommend_reason || poi.summary || '暂无' }}</text>
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
        <text class="section-title">用户评价</text>
        <view class="review-form">
          <input v-model="reviewForm.nickname" class="input" placeholder="昵称（可选）" />
          <input v-model="reviewForm.comment" class="input" placeholder="说点真实体验..." />
          <picker mode="selector" :range="scoreOptions" @change="handleScoreChange">
            <view class="picker">评分：{{ reviewForm.rating }} 星</view>
          </picker>
          <button class="button" size="mini" :loading="submitting" @click="handleSubmitReview">提交评价</button>
        </view>

        <view v-if="!reviews.length" class="state small">暂无评价</view>
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
const scoreOptions = ['1', '2', '3', '4', '5'];
const reviewForm = reactive({
  nickname: '',
  comment: '',
  rating: 5,
});

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
  } catch (error) {
    poi.value = {};
    reviews.value = [];
    errorMessage.value = error.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function handleSubmitReview() {
  if (!poiId) return;
  submitting.value = true;
  try {
    const result = await createReview({
      poi_id: poiId,
      nickname: reviewForm.nickname,
      comment: reviewForm.comment,
      rating: reviewForm.rating,
    });
    if (result.code !== 0) throw new Error(result.message || '提交失败');
    uni.showToast({ title: '评价已提交', icon: 'success' });
    reviewForm.comment = '';
    await loadDetail();
  } catch (error) {
    uni.showToast({
      title: error.message || '提交失败',
      icon: 'none',
    });
  } finally {
    submitting.value = false;
  }
}

onLoad((options) => {
  poiId = options?.id || '';
  loadDetail();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f8fafc;
}

.state {
  text-align: center;
  padding: 30rpx;
  background: #fff;
  border-radius: 16rpx;
  color: #64748b;
}

.state.error {
  color: #dc2626;
}

.state.small {
  padding: 18rpx;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.head-card,
.section {
  background: #fff;
  border-radius: 16rpx;
  padding: 22rpx;
}

.title {
  display: block;
  font-size: 38rpx;
  font-weight: 700;
  color: #1f2937;
}

.address {
  display: block;
  margin: 8rpx 0 12rpx;
  font-size: 24rpx;
  color: #6b7280;
}

.section-title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
}

.paragraph {
  font-size: 24rpx;
  line-height: 1.6;
  color: #374151;
}

.review-form {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-bottom: 14rpx;
}

.input,
.picker {
  height: 74rpx;
  border-radius: 12rpx;
  border: 2rpx solid #dbe2ea;
  background: #fff;
  padding: 0 16rpx;
  font-size: 24rpx;
  display: flex;
  align-items: center;
}

.button {
  margin: 0;
  border-radius: 12rpx;
  background: #2563eb;
  color: #fff;
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.review-item {
  border: 2rpx solid #edf2f7;
  border-radius: 12rpx;
  padding: 14rpx;
}

.review-head {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
}

.name {
  font-size: 24rpx;
  color: #1f2937;
}

.comment {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #475569;
  line-height: 1.5;
}
</style>
