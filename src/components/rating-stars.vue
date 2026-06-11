<template>
  <view class="stars">
    <text v-for="index in 5" :key="index" class="star" :class="{ active: index <= roundedScore }">★</text>
    <text class="score">{{ displayScore }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  score: {
    type: Number,
    default: 0,
  },
});

const roundedScore = computed(() => Math.round(Math.max(0, Math.min(5, Number(props.score) || 0))));
const displayScore = computed(() => Number(props.score || 0).toFixed(1));
</script>

<style scoped>
.stars {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.star {
  color: #d9d9d9;
  font-size: 26rpx;
}

.star.active {
  color: #ff9f1a;
}

.score {
  margin-left: 6rpx;
  font-size: 22rpx;
  color: #666;
}
</style>
