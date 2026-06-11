<template>
  <view class="page">
    <view class="hero">
      <text class="title">找回密码</text>
      <text class="subtitle">短信验证码 + 图形验证码流程已接入，优先走真实 `uni-id-co` 能力。</text>
    </view>
    <view class="card">
      <input v-model="phone" class="input" type="number" maxlength="11" placeholder="手机号" />
      <uni-captcha v-model="captcha" class="captcha" scene="reset-pwd-by-sms" />
      <view class="code-row">
        <input v-model="smsCode" class="input code-input" type="number" maxlength="6" placeholder="短信验证码" />
        <button class="code-button" :disabled="countdown > 0 || sendingCode" :loading="sendingCode" @click="sendCode">
          {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
        </button>
      </view>
      <input v-model="password" class="input" password placeholder="新密码（至少 6 位）" />
      <input v-model="confirmPassword" class="input" password placeholder="确认新密码" />
      <button class="button" :loading="submitting" @click="submit">确认重置</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import api from '@/common/api-util.js';
import utils from '@/common/utils.js';

const phone = ref('');
const captcha = ref('');
const smsCode = ref('');
const password = ref('');
const confirmPassword = ref('');
const sendingCode = ref(false);
const submitting = ref(false);
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
    const result = await api.common.getMsgCode(phone.value, captcha.value, 'reset-pwd-by-sms');
    if (result.code !== api.SUCCESS) throw new Error(api.getErrorMessage(result.code));
    uni.showToast({ title: '验证码已发送', icon: 'success' });
    startCountdown();
  } catch (error) {
    uni.showToast({ title: error.message || '发送失败', icon: 'none' });
  } finally {
    sendingCode.value = false;
  }
}

async function submit() {
  if (!utils.checkPhone(phone.value)) {
    uni.showToast({ title: '请输入正确手机号', icon: 'none' });
    return;
  }
  if (!captcha.value || !smsCode.value || !password.value || !confirmPassword.value) {
    uni.showToast({ title: '请填写完整', icon: 'none' });
    return;
  }
  if (password.value.length < 6) {
    uni.showToast({ title: '新密码至少 6 位', icon: 'none' });
    return;
  }
  if (password.value !== confirmPassword.value) {
    uni.showToast({ title: '两次密码不一致', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    const result = await api.user.resetPassword(phone.value, smsCode.value, password.value, captcha.value);
    if (result.code !== api.SUCCESS) throw new Error(api.getErrorMessage(result.code));
    uni.showToast({ title: '密码已重置', icon: 'success' });
    uni.navigateBack({ delta: 1 });
  } catch (error) {
    uni.showToast({ title: error.message || '重置失败', icon: 'none' });
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
