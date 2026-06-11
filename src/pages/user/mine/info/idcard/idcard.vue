<template>
  <view class="page">
    <view class="panel">
      <text class="title">实名认证</text>
      <text class="subtitle">当前先恢复表单流程，信息本地保存，后续可替换为真实 OCR/实名接口。</text>
      <input v-model="form.name" class="input" placeholder="真实姓名" />
      <input v-model="form.idNumber" class="input" maxlength="18" placeholder="身份证号" />
      <input v-model="form.address" class="input" placeholder="证件地址" />
      <button class="button" :loading="submitting" @click="submitIdcard">保存信息</button>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue';

const submitting = ref(false);
const form = reactive({
  name: uni.getStorageSync('babyplace-idcard-name') || '',
  idNumber: uni.getStorageSync('babyplace-idcard-number') || '',
  address: uni.getStorageSync('babyplace-idcard-address') || '',
});

async function submitIdcard() {
  if (!form.name.trim() || !form.idNumber.trim()) {
    uni.showToast({ title: '请填写完整信息', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    uni.setStorageSync('babyplace-idcard-name', form.name.trim());
    uni.setStorageSync('babyplace-idcard-number', form.idNumber.trim());
    uni.setStorageSync('babyplace-idcard-address', form.address.trim());
    uni.showToast({ title: '保存成功', icon: 'success' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f8fafc;
}
.panel {
  padding: 28rpx;
  border-radius: 22rpx;
  background: #fff;
}
.title {
  display: block;
  font-size: 38rpx;
  font-weight: 700;
  color: #1f2937;
}
.subtitle {
  display: block;
  margin: 10rpx 0 20rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #64748b;
}
.input {
  width: 100%;
  box-sizing: border-box;
  height: 86rpx;
  margin-bottom: 14rpx;
  padding: 0 20rpx;
  border-radius: 16rpx;
  background: #f8fafc;
  border: 2rpx solid #e2e8f0;
}
.button {
  margin-top: 10rpx;
  border-radius: 16rpx;
  background: #2563eb;
  color: #fff;
}
</style>
