<template>
  <view class="page">
    <view class="hero">
      <text class="title">意见反馈</text>
      <text class="subtitle">延续旧设置页的卡片式反馈流程，内容会优先写入当前云端反馈表。</text>
    </view>
    <view class="panel">
      <view class="tips-card">
        <text class="tips-title">建议填写</text>
        <text class="tips-text">问题现象、使用路径、设备环境、联系方式</text>
      </view>
      <textarea v-model="content" class="textarea" maxlength="300" placeholder="说说你遇到的问题或建议..." />
      <input v-model="contact" class="input" placeholder="联系方式（选填）" />
      <view class="count">{{ content.length }}/300</view>
      <button class="button" :loading="submitting" @click="submitFeedback">提交反馈</button>
      <view v-if="lastSubmittedAt" class="success-card">
        <text class="success-title">最近一次提交成功</text>
        <text class="success-time">{{ lastSubmittedAt }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import api from '@/common/api-util.js';
import utils from '@/common/utils.js';

const content = ref('');
const contact = ref('');
const submitting = ref(false);
const lastSubmittedAt = ref('');

async function submitFeedback() {
  if (!content.value.trim()) {
    uni.showToast({ title: '请填写反馈内容', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    const result = await api.common.feedback({
      content: content.value.trim(),
      contact: contact.value.trim(),
    });
    if (result.code !== api.SUCCESS) throw new Error(api.getErrorMessage(result.code));
    uni.showToast({ title: '提交成功', icon: 'success' });
    lastSubmittedAt.value = utils.formatFullDateTime(Date.now());
    content.value = '';
    contact.value = '';
  } catch (error) {
    uni.showToast({ title: error.message || '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 34%, #f8fafc 100%);
}

.hero {
  padding: 8rpx 4rpx 22rpx;
}

.panel {
  padding: 28rpx;
  border-radius: 20rpx;
  background: #fff;
}

.title {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: #1f2937;
}

.subtitle {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #64748b;
}

.tips-card {
  margin: 6rpx 0 18rpx;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: #f8fafc;
}

.tips-title {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #1f2937;
}

.tips-text {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #64748b;
}

.textarea,
.input {
  width: 100%;
  box-sizing: border-box;
  padding: 20rpx;
  border-radius: 16rpx;
  background: #f8fafc;
  border: 2rpx solid #e2e8f0;
  font-size: 26rpx;
}

.textarea {
  min-height: 260rpx;
  margin-bottom: 16rpx;
}

.count {
  text-align: right;
  font-size: 22rpx;
  color: #94a3b8;
}

.button {
  margin-top: 18rpx;
  border-radius: 16rpx;
  background: #2563eb;
  color: #fff;
}

.success-card {
  margin-top: 18rpx;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: #ecfdf3;
}

.success-title {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #15803d;
}

.success-time {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #166534;
}
</style>
