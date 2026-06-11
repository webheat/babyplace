<template>
  <view class="page">
    <view class="hero">
      <text class="title">修改手机号</text>
      <text class="subtitle">保持旧设置页的单任务流程，优先走短信验证码绑定手机号。</text>
    </view>
    <view class="panel">
      <view class="notice-card">
        <text class="notice-title">说明</text>
        <text class="notice-text">短信验证码通过后，会刷新当前登录用户手机号；云端不可用时才回退到本地资料。</text>
      </view>
      <input v-model="phone" class="input" type="number" maxlength="11" placeholder="新手机号" />
      <uni-captcha v-model="captcha" class="captcha" scene="bind-mobile-by-sms" />
      <view class="code-row">
        <input v-model="smsCode" class="input code-input" type="number" maxlength="6" placeholder="短信验证码" />
        <button class="code-button" :disabled="countdown > 0 || sendingCode" :loading="sendingCode" @click="sendCode">
          {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
        </button>
      </view>
      <button class="button" :loading="submitting" @click="submitPhone">确认修改</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import api from '@/common/api-util.js';
import utils from '@/common/utils.js';
import store from '@/store';

const phone = ref('');
const captcha = ref('');
const smsCode = ref('');
const submitting = ref(false);
const sendingCode = ref(false);
const countdown = ref(0);

let countdownTimer = null;

function startCountdown() {
  countdown.value = 60;
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
}

async function sendCode() {
  if (!utils.checkPhone(phone.value)) {
    uni.showToast({ title: '请输入正确手机号', icon: 'none' });
    return;
  }
  if (!captcha.value || captcha.value.length < 4) {
    uni.showToast({ title: '请输入图形验证码', icon: 'none' });
    return;
  }
  sendingCode.value = true;
  try {
    const result = await api.common.getMsgCode(phone.value, captcha.value, 'bind-mobile-by-sms');
    if (result.code !== api.SUCCESS) throw new Error(api.getErrorMessage(result.code));
    uni.showToast({ title: '验证码已发送', icon: 'success' });
    startCountdown();
  } catch (error) {
    uni.showToast({ title: error.message || '发送失败', icon: 'none' });
  } finally {
    sendingCode.value = false;
  }
}

async function submitPhone() {
  if (!utils.checkPhone(phone.value)) {
    uni.showToast({ title: '请输入正确手机号', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    const result = await api.user.changPhone(phone.value, smsCode.value, captcha.value);
    if (result.code !== api.SUCCESS) throw new Error(api.getErrorMessage(result.code));
    store.commit('userInfo', result.data.user);
    uni.showToast({ title: '修改成功', icon: 'success' });
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
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #64748b;
}

.notice-card {
  margin: 6rpx 0 18rpx;
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
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 16rpx;
  padding: 20rpx;
  border-radius: 16rpx;
  background: #f8fafc;
  border: 2rpx solid #e2e8f0;
  font-size: 26rpx;
}

.captcha {
  margin-bottom: 16rpx;
}

.code-row {
  display: flex;
  gap: 16rpx;
  align-items: center;
}

.code-input {
  flex: 1;
  margin-bottom: 0;
}

.code-button {
  min-width: 200rpx;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 16rpx;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 24rpx;
}

.button {
  margin-top: 18rpx;
  border-radius: 16rpx;
  background: #2563eb;
  color: #fff;
}
</style>
