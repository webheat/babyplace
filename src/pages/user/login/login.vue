<template>
  <view class="page">
    <view class="hero">
      <text class="title">登录 / 注册</text>
      <text class="subtitle">沿用旧版小程序的蓝色卡片视觉，账号登录与微信登录都已接真实后端优先。</text>
    </view>

    <view class="panel">
      <view class="notice-card">
        <text class="notice-title">当前状态</text>
        <text class="notice-text">手机号登录优先走 `uni-id-co.login`，微信登录继续调用小程序登录并同步账户信息。</text>
      </view>
      <input v-model="phone" class="input" type="number" maxlength="11" placeholder="请输入手机号" />
      <input v-model="password" class="input" password placeholder="请输入密码" />
      <view class="helper-row">
        <text class="helper-item" @click="fillDemoAccount">填充演示账号</text>
        <text class="helper-item" @click="clearForm">清空输入</text>
      </view>

      <button class="button primary" :loading="submitting" @click="handlePhoneLogin">手机号登录</button>
      <button class="button secondary" :loading="wechatSubmitting" @click="handleWechatLogin">微信快捷登录</button>

      <view class="tips">
        <text class="tip" @click="goForgetPassword">忘记密码</text>
        <text class="tip" @click="goHome">先逛逛</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import auth from '@/common/auth.js';
import utils from '@/common/utils.js';

const phone = ref('');
const password = ref('');
const submitting = ref(false);
const wechatSubmitting = ref(false);

function fillDemoAccount() {
  phone.value = '13800138000';
  password.value = '123456';
}

function clearForm() {
  phone.value = '';
  password.value = '';
}

function goHome() {
  uni.switchTab({ url: '/pages/index/index' });
}

function goForgetPassword() {
  uni.navigateTo({ url: '/pages/user/setting/forget-password' });
}

async function handlePhoneLogin() {
  if (!utils.checkPhone(phone.value)) {
    utils.toast('请输入正确手机号');
    return;
  }
  if (!password.value) {
    utils.toast('请输入密码');
    return;
  }
  submitting.value = true;
  try {
    auth.phoneLogin(phone.value, password.value, () => {
      uni.switchTab({ url: '/pages/user/mine/mine' });
    });
  } finally {
    setTimeout(() => {
      submitting.value = false;
    }, 400);
  }
}

function handleWechatLogin() {
  wechatSubmitting.value = true;
  uni.login({
    provider: 'weixin',
    success: ({ code }) => {
      auth.codeLogin(code, () => {
        wechatSubmitting.value = false;
        uni.switchTab({ url: '/pages/user/mine/mine' });
      });
    },
    fail: () => {
      wechatSubmitting.value = false;
      utils.toast('微信登录失败');
    },
  });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 32rpx 24rpx;
  background: linear-gradient(180deg, #2563eb 0%, #2563eb 32%, #f8fafc 32%, #f8fafc 100%);
}

.hero {
  padding: 24rpx 12rpx 36rpx;
}

.title {
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  color: #fff;
}

.subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.88);
}

.panel {
  padding: 32rpx 28rpx;
  border-radius: 24rpx;
  background: #fff;
  box-shadow: 0 20rpx 40rpx rgba(37, 99, 235, 0.12);
}

.notice-card {
  margin-bottom: 18rpx;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: #f8fafc;
}

.notice-title {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #1f2937;
}

.notice-text {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #64748b;
}

.input {
  height: 88rpx;
  margin-bottom: 18rpx;
  padding: 0 24rpx;
  border-radius: 18rpx;
  background: #f8fafc;
  border: 2rpx solid #e2e8f0;
  font-size: 28rpx;
}

.helper-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4rpx;
}

.helper-item {
  font-size: 22rpx;
  color: #2563eb;
}

.button {
  margin-top: 14rpx;
  border-radius: 18rpx;
}

.button.primary {
  background: #2563eb;
  color: #fff;
}

.button.secondary {
  background: #ecfdf3;
  color: #15803d;
}

.tips {
  display: flex;
  justify-content: space-between;
  margin-top: 24rpx;
}

.tip {
  font-size: 24rpx;
  color: #64748b;
}
</style>
