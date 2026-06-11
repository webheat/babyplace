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
        <view class="section-head section-head-inline">
          <view>
            <text class="section-title">附近美食</text>
            <text class="section-subtitle">围绕当前地点推荐适合带娃补给的附近餐厅</text>
          </view>
          <text class="section-badge">{{ restaurantMetaText }}</text>
        </view>
        <view v-if="restaurantLoading" class="empty-line">正在匹配附近餐厅...</view>
        <view v-else-if="!restaurantList.length" class="empty-line">附近餐厅数据暂未准备好</view>
        <view v-else class="restaurant-list">
          <view v-for="item in restaurantList" :key="item._id" class="restaurant-card">
            <view class="restaurant-main">
              <view class="restaurant-top">
                <text class="restaurant-name">{{ item.name }}</text>
                <text class="restaurant-score">{{ Number(item.rating || 0).toFixed(1) }}</text>
              </view>
              <text class="restaurant-meta">
                {{ item.category || '附近餐厅' }}
                <text v-if="Number(item.avg_price || 0) > 0"> · 人均{{ Math.round(Number(item.avg_price || 0)) }}</text>
                <text v-if="Number(item.distance || 0) > 0"> · {{ formatDistance(item.distance) }}</text>
              </text>
              <text class="restaurant-address">{{ item.address || '暂无地址信息' }}</text>
              <tag-list :tags="item.tags || []" />
              <text v-if="item.coupon_info" class="restaurant-coupon">{{ item.coupon_info }}</text>
              <text v-if="item.note && item.source === 'fallback'" class="restaurant-note">{{ item.note }}</text>
            </view>
            <view class="restaurant-actions">
              <button class="ghost-button" size="mini" @click="openRestaurantLocation(item)">看位置</button>
              <button class="action-button" size="mini" :loading="jumpingRestaurantId === item._id" @click="handleRestaurantAction(item)">
                去美团看看
              </button>
            </view>
          </view>
        </view>
      </view>

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

      <view class="section contact-section" @click="openCustomerService">
        <view class="contact-btn">
          <text class="contact-icon">服</text>
          <text class="contact-text">联系客服</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import RoutePlannerCard from '@/components/RoutePlannerCard.vue';
import RatingStars from '@/components/rating-stars.vue';
import TagList from '@/components/tag-list.vue';
import { detailPoi } from '@/api/poi';
import { getRestaurantLink, listRestaurantByPlace, trackRestaurantEvent } from '@/api/restaurant';
import { createReview } from '@/api/review';

const loading = ref(false);
const submitting = ref(false);
const restaurantLoading = ref(false);
const jumpingRestaurantId = ref('');
const errorMessage = ref('');
const poi = ref({});
const reviews = ref([]);
const sources = ref([]);
const restaurantList = ref([]);
const restaurantSource = ref('');
const scoreOptions = ['1', '2', '3', '4', '5'];
const reviewForm = reactive({ nickname: '', comment: '', rating: 5 });

let poiId = '';

const restaurantMetaText = computed(() => {
  if (restaurantSource.value === 'cache') return '缓存命中';
  if (restaurantSource.value === 'gaode') return '高德实时';
  if (restaurantSource.value === 'fallback') return '本地兜底';
  if (restaurantSource.value === 'stale-cache') return '旧缓存';
  return '附近推荐';
});

const CURRENT_PLATFORM = (() => {
  // #ifdef MP-WEIXIN
  return 'mp-weixin';
  // #endif
  // #ifdef H5
  return 'h5';
  // #endif
  return 'other';
})();

function handleScoreChange(event) {
  const index = Number(event.detail.value || 0);
  reviewForm.rating = Number(scoreOptions[index] || 5);
}

function formatDistance(distance) {
  const value = Number(distance || 0);
  if (!value) return '';
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}km`;
  }
  return `${Math.round(value)}m`;
}

function openRestaurantLocation(item) {
  const latitude = Number(item?.lat || 0);
  const longitude = Number(item?.lng || 0);
  if (!latitude || !longitude) {
    uni.showToast({ title: '暂无餐厅定位信息', icon: 'none' });
    return;
  }
  uni.openLocation({
    latitude,
    longitude,
    name: item?.name || '附近餐厅',
    address: item?.address || '',
    scale: 16,
  });
}

async function loadRestaurants() {
  if (!poiId) return;
  restaurantLoading.value = true;
  try {
    const result = await listRestaurantByPlace(poiId, { limit: 8, radius: 2000 });
    if (result.code !== 0) throw new Error(result.message || '附近餐厅加载失败');
    restaurantList.value = result.data?.list || [];
    restaurantSource.value = result.data?.source || '';
  } catch (error) {
    restaurantList.value = [];
    restaurantSource.value = '';
    uni.showToast({ title: error.message || '附近餐厅加载失败', icon: 'none' });
  } finally {
    restaurantLoading.value = false;
  }
}

async function handleRestaurantAction(item) {
  if (!item?._id) return;
  jumpingRestaurantId.value = item._id;
  try {
    await trackRestaurantEvent({
      event_name: 'restaurant_click',
      poi_id: poiId,
      restaurant_id: item._id,
      restaurant_name: item.name || '',
      platform: CURRENT_PLATFORM,
      scene: 'shop_detail',
      target_type: 'restaurant_card',
      target_value: item.name || '',
      meta: {
        source: item.source || '',
        category: item.category || '',
      },
    });

    const result = await getRestaurantLink(item._id);
    if (result.code !== 0) throw new Error(result.message || '获取跳转链接失败');

    const jumpUrl = result.data?.jump_url || '';
    const keyword = result.data?.keyword || item.name || '';
    const appId = result.data?.app_id || '';
    const pagePath = result.data?.page_path || '';
    const sid = result.data?.sid || '';

    if (appId && pagePath) {
      await trackRestaurantEvent({
        event_name: 'meituan_jump_click',
        poi_id: poiId,
        restaurant_id: item._id,
        restaurant_name: item.name || '',
        platform: CURRENT_PLATFORM,
        scene: 'shop_detail',
        target_type: 'mini_program',
        target_value: `${appId}:${pagePath}`,
        meta: {
          sid,
          source: result.data?.source || item.source || '',
        },
      });
      // #ifdef MP-WEIXIN
      uni.navigateToMiniProgram({
        appId,
        path: pagePath,
        fail: () => {
          uni.setClipboardData({
            data: keyword || item.name || '',
            success: () => {
              uni.showToast({ title: '跳转失败，已复制餐厅名', icon: 'none' });
            },
          });
        },
      });
      return;
      // #endif
    }

    if (jumpUrl) {
      await trackRestaurantEvent({
        event_name: 'meituan_jump_click',
        poi_id: poiId,
        restaurant_id: item._id,
        restaurant_name: item.name || '',
        platform: CURRENT_PLATFORM,
        scene: 'shop_detail',
        target_type: 'h5',
        target_value: jumpUrl,
        meta: {
          sid,
          source: result.data?.source || item.source || '',
        },
      });
      // #ifdef H5
      window.open(jumpUrl, '_blank');
      // #endif
      // #ifndef H5
      uni.setClipboardData({
        data: keyword || item.name || '',
        success: () => {
          uni.showModal({
            title: '联盟链接待接入',
            content: `已复制“${keyword || item.name || '餐厅名称'}”，请在美团内搜索查看。`,
            showCancel: false,
          });
        },
      });
      // #endif
      return;
    }

    uni.setClipboardData({
      data: keyword || item.name || '',
      success: () => {
        uni.showToast({ title: '已复制餐厅名称', icon: 'none' });
      },
    });
  } catch (error) {
    uni.showToast({ title: error.message || '操作失败', icon: 'none' });
  } finally {
    jumpingRestaurantId.value = '';
  }
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

function openCustomerService() {
  uni.showToast({ title: 'AI 客服即将上线', icon: 'none' });
}

onLoad((options) => {
  poiId = options?.id || options?.shopId || '';
  loadDetail();
  loadRestaurants();
});

onShareAppMessage(() => ({
  title: poi.value?.name ? `${poi.value.name} | 亲子出行地点` : '亲子出行地点推荐',
  path: poiId ? `/pages/life/shop/shop?id=${poiId}` : '/pages/index/index',
  imageUrl: poi.value?.cover_image || '',
}));

onShareTimeline(() => ({
  title: poi.value?.name ? `${poi.value.name} | 亲子出行地点` : '亲子出行地点推荐',
  query: poiId ? `id=${poiId}` : '',
  imageUrl: poi.value?.cover_image || '',
}));
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
.section-head-inline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}
.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
}
.section-subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #64748b;
}
.section-badge {
  flex-shrink: 0;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  background: #eff6ff;
  color: #2563eb;
  font-size: 20rpx;
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
 .source-list,
 .restaurant-list {
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
.restaurant-card {
  padding: 18rpx;
  border-radius: 18rpx;
  background: linear-gradient(135deg, #fff8f2 0%, #ffffff 100%);
  border: 2rpx solid #ffedd5;
}
.restaurant-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}
.restaurant-name {
  flex: 1;
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
}
.restaurant-score {
  font-size: 30rpx;
  font-weight: 700;
  color: #ea580c;
}
.restaurant-meta,
.restaurant-address,
.restaurant-coupon,
.restaurant-note {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
}
.restaurant-meta,
.restaurant-address,
.restaurant-note {
  color: #64748b;
}
.restaurant-coupon {
  color: #c2410c;
}
.restaurant-note {
  font-style: italic;
}
.restaurant-actions {
  display: flex;
  gap: 12rpx;
  margin-top: 14rpx;
}
.action-button,
.ghost-button {
  margin: 0;
  flex: 1;
  border-radius: 12rpx;
}
.action-button {
  background: #ea580c;
  color: #fff;
}
.ghost-button {
  background: #fff;
  color: #ea580c;
  border: 2rpx solid #fdba74;
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
.contact-section {
  padding: 24rpx;
  border-radius: 20rpx;
  background: #fff;
}
.contact-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  width: 100%;
  height: 88rpx;
  margin: 0;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
}
.contact-btn::after {
  border: none;
}
.contact-icon {
  font-size: 30rpx;
  font-weight: 700;
}
.contact-text {
  font-size: 30rpx;
}
</style>
