<template>
  <view class="page">
    <view class="card">
      <text class="title">调试页</text>
      <text class="desc">旧版调试能力暂未迁移，页面路径已启用。</text>
      <button class="button" size="mini" @click="goHome">返回首页</button>
    </view>
  </view>
</template>

<script setup>
function goHome() {
  uni.switchTab({ url: '/pages/index/index' });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f8fafc;
}
.card {
  padding: 32rpx;
  border-radius: 20rpx;
  background: #fff;
}
.title {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: #1f2937;
}
.desc {
  display: block;
  margin: 16rpx 0 24rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #475569;
}
.button {
  margin: 0;
  border-radius: 12rpx;
  background: #2563eb;
  color: #fff;
}
</style>
