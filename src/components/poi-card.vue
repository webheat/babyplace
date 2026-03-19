<template>
  <view class="card" @click="handleClick">
    <view class="head">
      <text class="name">{{ poi.name || '未命名地点' }}</text>
      <text v-if="distanceText" class="distance">{{ distanceText }}</text>
    </view>
    <text class="meta">{{ locationText }}</text>
    <text class="summary">{{ poi.summary || poi.recommend_reason || '暂无简介' }}</text>
    <tag-list :tags="poi.tags || []" />
    <view class="footer">
      <view class="footer-left">
        <rating-stars :score="Number(poi.avg_rating || 0)" />
        <text class="count">{{ Number(poi.review_count || 0) }} 条评价</text>
      </view>
      <text v-if="hasLocation" class="map-link" @click.stop="handleMap">地图</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue';
import RatingStars from '@/components/rating-stars.vue';
import TagList from '@/components/tag-list.vue';
import { hasPoiLocation } from '@/utils/poi';

const props = defineProps({
  poi: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['click', 'map']);

const locationText = computed(() => {
  const city = props.poi.city || '';
  const district = props.poi.district || '';
  const address = props.poi.address || '';
  return [city, district, address].filter(Boolean).join(' ');
});

const distanceText = computed(() => {
  const distance = Number(props.poi.distance);
  if (!Number.isFinite(distance)) return '';
  if (distance < 1000) return `${Math.round(distance)}m`;
  return `${(distance / 1000).toFixed(1)}km`;
});

const hasLocation = computed(() => hasPoiLocation(props.poi));

function handleClick() {
  emit('click', props.poi);
}

function handleMap() {
  emit('map', props.poi);
}
</script>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: #fff;
  border: 2rpx solid #edf0f5;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.name {
  flex: 1;
  font-size: 32rpx;
  color: #1f2937;
  font-weight: 600;
}

.distance {
  font-size: 22rpx;
  color: #0f766e;
  background: #dffaf6;
  border-radius: 999rpx;
  padding: 4rpx 12rpx;
}

.meta {
  font-size: 24rpx;
  color: #6b7280;
}

.summary {
  font-size: 24rpx;
  line-height: 1.5;
  color: #374151;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.count {
  font-size: 22rpx;
  color: #6b7280;
}

.map-link {
  flex-shrink: 0;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: #e8f0ff;
  color: #1d4ed8;
  font-size: 22rpx;
}
</style>
