<template>
  <view class="page">
    <view class="hero">
      <text class="title">修改密码</text>
      <text class="subtitle">保留旧设置页的单任务表单，已接真实密码修改接口优先。</text>
    </view>
    <view class="card">
      <input v-model="oldPassword" class="input" password placeholder="当前密码" />
      <input v-model="newPassword" class="input" password placeholder="新密码（至少 6 位）" />
      <input v-model="confirmPassword" class="input" password placeholder="确认新密码" />
      <button class="button" :loading="submitting" @click="submit">确认修改</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import api from '@/common/api-util.js';

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const submitting = ref(false);

async function submit() {
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    uni.showToast({ title: '请填写完整', icon: 'none' });
    return;
  }
  if (newPassword.value.length < 6) {
    uni.showToast({ title: '新密码至少 6 位', icon: 'none' });
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    uni.showToast({ title: '两次密码不一致', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    const result = await api.user.modifyPassword(oldPassword.value, newPassword.value);
    if (result.code !== api.SUCCESS) throw new Error(api.getErrorMessage(result.code));
    uni.showToast({ title: '修改成功', icon: 'success' });
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (error) {
    uni.showToast({ title: error.message || '修改失败', icon: 'none' });
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
.card {
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
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #64748b;
}
.input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 16rpx;
  padding: 20rpx;
  border-radius: 16rpx;
  background: #f8fafc;
  border: 2rpx solid #e2e8f0;
  font-size: 26rpx;
}
.button {
  margin-top: 8rpx;
  border-radius: 16rpx;
  background: #2563eb;
  color: #fff;
}
</style>
