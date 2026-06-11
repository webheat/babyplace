<template>
  <view class="page">
    <view class="hero">
      <text class="eyebrow">uni-id access</text>
      <text class="title">登录接入中心</text>
      <text class="subtitle">这里提供 uni-id 的入口、状态检测和接入说明。</text>
    </view>

    <view class="panel status-panel">
      <text class="panel-title">当前状态</text>
      <text class="status-line">登录态：{{ loginStatusText }}</text>
      <text class="status-line">token 过期时间：{{ tokenExpiredText }}</text>
      <text class="status-line">管理页地址：ds.aixifs.com/admin</text>
      <text class="status-line">管理员写接口：依赖云端 `admin` 角色</text>
    </view>

    <view class="panel action-panel">
      <text class="panel-title">账户入口</text>
      <button class="action secondary" @click="openWechatH5Login">H5 微信扫码登录</button>
      <button class="action secondary" @click="openAdminPage">打开管理页</button>
    </view>

    <view class="panel checklist-panel">
      <text class="panel-title">接入检查清单</text>
      <text class="check-item">1. 导入 `uni-id-co` 官方模块</text>
      <text class="check-item">2. 上传 `uni-id-users`、`opendb-verify-codes` 等数据表</text>
      <text class="check-item">3. 填写云端 `uni-config-center/uni-id/config.json` 的 secret 与微信参数</text>
      <text class="check-item">4. 小程序在 `manifest.json` 配置 AppID</text>
      <text class="check-item">5. 微信扫码登录的回跳地址填写 `https://ds.aixifs.com/admin`</text>
      <text class="check-item">6. 给后台运营账号配置 `admin` 角色</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue';
import { formatTokenExpired, hasValidUniIdToken } from '../../utils/auth';

const loginStatusText = computed(() => (hasValidUniIdToken() ? '已检测到本地 token' : '尚未登录'));
const tokenExpiredText = computed(() => formatTokenExpired());

function openWechatH5Login() {
  uni.navigateTo({
    url: '/pages/auth/wechat-h5',
  });
}

function openAdminPage() {
  uni.navigateTo({
    url: '/pages/admin/index',
  });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 48rpx 28rpx 60rpx;
  background:
    radial-gradient(circle at right top, rgba(197, 232, 255, 0.9) 0%, rgba(197, 232, 255, 0) 32%),
    linear-gradient(180deg, #f6fbff 0%, #ffffff 100%);
}

.hero {
  margin-bottom: 32rpx;
}

.eyebrow {
  display: block;
  margin-bottom: 12rpx;
  font-size: 22rpx;
  color: #2d6ea3;
  text-transform: uppercase;
  letter-spacing: 4rpx;
}

.title {
  display: block;
  font-size: 52rpx;
  font-weight: 600;
  color: #183b5b;
}

.subtitle {
  display: block;
  margin-top: 16rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: #53738f;
}

.panel {
  margin-bottom: 24rpx;
  padding: 28rpx;
  border: 2rpx solid rgba(178, 211, 233, 0.9);
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 16rpx 40rpx rgba(17, 67, 110, 0.08);
}

.panel-title {
  display: block;
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #214e73;
}

.status-line,
.check-item {
  display: block;
  margin-bottom: 14rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #547089;
}

.action {
  margin-bottom: 16rpx;
  border-radius: 20rpx;
  background: #edf5fb;
  color: #2f5f87;
}
</style>
