<template>
  <view v-if="items.length" class="tag-list">
    <text v-for="(tag, index) in items" :key="`${tag}-${index}`" class="tag">{{ tag }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  tags: {
    type: Array,
    default: () => [],
  },
});

const items = computed(() => (props.tags || []).filter(Boolean).slice(0, 8));
</script>

<style scoped>
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.tag {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: #eef6ff;
  color: #2b5fb8;
  font-size: 22rpx;
}
</style>
