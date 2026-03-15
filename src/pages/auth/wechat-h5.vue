<template>
  <view class="page">
    <view class="hero">
      <text class="eyebrow">wechat h5 login</text>
      <text class="title">微信扫码登录</text>
      <text class="subtitle">H5 微信登录流程。微信内打开时走公众号授权，普通浏览器打开时会跳微信扫码页。</text>
    </view>

    <view class="panel">
      <text class="panel-title">当前环境</text>
      <text class="line">浏览器环境：{{ browserText }}</text>
      <text class="line">H5 公众号 AppID：{{ h5AppIdText }}</text>
      <text class="line">H5 网站应用 AppID：{{ webAppIdText }}</text>
      <text class="line">配置状态：{{ configReadyText }}</text>
    </view>

    <view class="panel">
      <text class="panel-title">登录动作</text>
      <button class="action" type="primary" @click="startLogin">开始微信登录</button>
      <text class="hint">如果你在 PC 浏览器里点击"开始微信登录"，页面会跳到微信开放平台二维码登录，并在成功后返回 `https://ds.aixifs.com/admin`。</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue';
import { getWechatLoginConfigStatus, startH5WeixinLogin } from '../../utils/auth';

const { h5AppId, webAppId, ready } = getWechatLoginConfigStatus();
const browserText = computed(() => {
  // #ifdef H5
  return /MicroMessenger/i.test(window.navigator.userAgent || '') ? '微信内浏览器' : '普通 H5 浏览器';
  // #endif
  return '非 H5 环境';
});
const h5AppIdText = computed(() => h5AppId || '未填写');
const webAppIdText = computed(() => webAppId || '未填写');
const configReadyText = computed(() => (ready ? '已填写前端 AppID' : '未完成前端微信配置'));

function startLogin() {
  startH5WeixinLogin({
    redirectPath: '/admin',
  });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 48rpx 28rpx 60rpx;
  background:
    radial-gradient(circle at top right, rgba(189, 244, 215, 0.88) 0%, rgba(189, 244, 215, 0) 32%),
    linear-gradient(180deg, #f7fff9 0%, #ffffff 100%);
}

.hero {
  margin-bottom: 32rpx;
}

.eyebrow {
  display: block;
  margin-bottom: 12rpx;
  font-size: 22rpx;
  color: #2e8452;
  text-transform: uppercase;
  letter-spacing: 4rpx;
}

.title {
  display: block;
  font-size: 52rpx;
  font-weight: 600;
  color: #18452b;
}

.subtitle {
  display: block;
  margin-top: 16rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: #4f755c;
}

.panel {
  margin-bottom: 24rpx;
  padding: 28rpx;
  border: 2rpx solid rgba(190, 230, 204, 0.95);
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 16rpx 40rpx rgba(34, 96, 53, 0.08);
}

.panel-title {
  display: block;
  margin-bottom: 18rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #225f38;
}

.line,
.hint {
  display: block;
  margin-bottom: 14rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #567464;
}

.action {
  margin-bottom: 16rpx;
  border-radius: 20rpx;
  background: #2f9a53;
}

.secondary {
  background: #edf8f0;
  color: #2c6e40;
}
</style>
