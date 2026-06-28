<template>
  <view class="page">
    <view class="hero-card">
      <view class="hero-bg hero-bg-left"></view>
      <view class="hero-bg hero-bg-right"></view>
      <view class="hero-main" @click="goUserInfo">
        <image class="avatar" :src="userInfo.avatar || '/static/images/icon-default-avatar.png'" mode="aspectFill" />
        <view class="hero-copy">
          <text class="name">{{ userInfo.nickname || '未登录用户' }}</text>
          <text class="phone">{{ hiddenPhone }}</text>
          <text class="desc">{{ userInfo.description || '保留旧版个人中心卡片样式，数据来自当前登录态与地点库。' }}</text>
        </view>
        <view class="hero-tag">VIP</view>
      </view>
      <view class="hero-actions">
        <button class="hero-btn primary" size="mini" @click.stop="handleLoginAction">{{ isLoggedIn ? '退出登录' : '立即登录' }}</button>
        <button class="hero-btn" size="mini" @click.stop="go('/pages/message/message/message')">消息中心</button>
      </view>
    </view>

    <view class="stats-card">
      <view class="stat-item">
        <text class="stat-value">{{ stats.total }}</text>
        <text class="stat-label">地点总数</text>
      </view>
      <view class="stat-item">
        <text class="stat-value">{{ stats.cityCount }}</text>
        <text class="stat-label">覆盖城市</text>
      </view>
      <view class="stat-item">
        <text class="stat-value">{{ stats.tagCount }}</text>
        <text class="stat-label">标签总数</text>
      </view>
    </view>

    <view class="notice-card">
      <view class="notice-item">
        <text class="notice-label">当前账号</text>
        <text class="notice-value">{{ userInfo.nickname || '游客模式' }}</text>
      </view>
      <view class="notice-item">
        <text class="notice-label">登录状态</text>
        <text class="notice-value">{{ isLoggedIn ? '已登录' : '未登录' }}</text>
      </view>
      <view class="notice-item">
        <text class="notice-label">推荐城市</text>
        <text class="notice-value">{{ topCity }}</text>
      </view>
    </view>

    <view class="quick-card">
      <view class="section-head">
        <text class="section-title">常用功能</text>
      </view>
      <view class="quick-grid">
        <view v-for="item in quickActions" :key="item.url" class="quick-item" @click="go(item.url)">
          <view class="quick-icon" :style="{ background: item.bg }">{{ item.icon }}</view>
          <text class="quick-text">{{ item.text }}</text>
        </view>
      </view>
    </view>

    <view class="menu-card">
      <view class="section-head menu-head">
        <text class="section-title">账号与服务</text>
      </view>
      <view v-for="item in accountItems" :key="item.url" class="menu-item" @click="go(item.url)">
        <view class="menu-left">
          <view class="menu-badge" :style="{ background: item.bg }">{{ item.icon }}</view>
          <view class="menu-copy">
            <text class="menu-title">{{ item.title }}</text>
            <text class="menu-desc">{{ item.desc }}</text>
          </view>
        </view>
        <text class="arrow">></text>
      </view>
    </view>

    <view class="menu-card">
      <view class="section-head menu-head">
        <text class="section-title">内容与消息</text>
      </view>
      <view v-for="item in menuItems" :key="item.url" class="menu-item" @click="go(item.url)">
        <view class="menu-left">
          <view class="menu-badge" :style="{ background: item.bg }">{{ item.icon }}</view>
          <view class="menu-copy">
            <text class="menu-title">{{ item.title }}</text>
            <text class="menu-desc">{{ item.desc }}</text>
          </view>
        </view>
        <text class="arrow">></text>
      </view>
    </view>

    <view class="section-card">
      <view class="section-head">
        <text class="section-title">最近更新</text>
        <text class="section-more" @click="go('/pages/common/article/list')">看资讯</text>
      </view>
      <view v-if="loading" class="state">加载中...</view>
      <view v-else-if="!latestList.length" class="state">暂无数据</view>
      <view v-else class="list">
        <poi-card v-for="item in latestList" :key="item._id" :poi="item" @click="goDetail" @map="openMap" />
      </view>
    </view>
    <contact-fab />
  </view>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import PoiCard from '@/components/poi-card.vue';
import { listPoi } from '@/api/poi';
import { extractTags, extractUniqueCities, openPoiMap, pickTop } from '@/utils/poi';
import ContactFab from '@/components/contact-fab.vue';
import auth from '@/common/auth.js';
import store from '@/store';

const loading = ref(false);
const list = ref([]);
const stats = reactive({
  total: 0,
  cityCount: 0,
  tagCount: 0,
});
const userInfo = ref({});

const quickActions = [
  { text: '个人信息', url: '/pages/user/mine/info/userinfo/userinfo', icon: '资', bg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)' },
  { text: '我的二维码', url: '/pages/user/mine/info/qrcode/qrcode', icon: '码', bg: 'linear-gradient(135deg, #dcfce7, #bbf7d0)' },
  { text: '分享海报', url: '/pages/common/poster/poster', icon: '报', bg: 'linear-gradient(135deg, #fef3c7, #fde68a)' },
  { text: '实名认证', url: '/pages/user/mine/info/idcard/idcard', icon: '证', bg: 'linear-gradient(135deg, #fae8ff, #f5d0fe)' },
];

const accountItems = [
  { title: '修改手机号', desc: '管理登录手机号与短信校验', url: '/pages/user/mine/info/changephone/changephone', icon: '机', bg: '#eff6ff' },
  { title: '意见反馈', desc: '提交建议与问题记录', url: '/pages/user/mine/feedback/feedback', icon: '反', bg: '#fff7ed' },
];

const menuItems = [
  { title: '亲子资讯', desc: '查看基于地点库生成的资讯内容', url: '/pages/common/article/list', icon: '文', bg: '#ecfeff' },
  { title: '消息中心', desc: '系统通知和内容更新统一查看', url: '/pages/message/message/message', icon: '消', bg: '#eef2ff' },
];

const latestList = computed(() => pickTop(list.value, 4));
const isLoggedIn = computed(() => Boolean(store.getters.checkLogin));
const topCity = computed(() => extractUniqueCities(list.value)[0] || '全国');
const hiddenPhone = computed(() => {
  const phone = userInfo.value?.phone || '';
  return phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '未绑定手机号';
});

function syncUserInfo() {
  userInfo.value = auth.getLocalUserInfo() || {};
}

function go(url) {
  uni.navigateTo({ url });
}

function goDetail(item) {
  if (!item?._id) return;
  uni.navigateTo({ url: `/pages/life/shop/shop?id=${item._id}` });
}

function openMap(item) {
  openPoiMap(item);
}

function goUserInfo() {
  uni.navigateTo({ url: '/pages/user/mine/info/userinfo/userinfo' });
}

function handleLoginAction() {
  if (isLoggedIn.value) {
    auth.loginOut();
    syncUserInfo();
    return;
  }
  uni.navigateTo({ url: '/pages/user/login/login' });
}

async function loadPage() {
  loading.value = true;
  syncUserInfo();
  try {
    const result = await listPoi({ page: 1, pageSize: 50 });
    if (result.code !== 0) throw new Error(result.message || '加载失败');
    list.value = result.data?.list || [];
    stats.total = Number(result.data?.total || list.value.length || 0);
    stats.cityCount = extractUniqueCities(list.value).length;
    stats.tagCount = extractTags(list.value, 50).length;
  } catch (error) {
    list.value = [];
    stats.total = 0;
    stats.cityCount = 0;
    stats.tagCount = 0;
    uni.showToast({ title: error.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onMounted(loadPage);
onShow(syncUserInfo);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: linear-gradient(180deg, #f4f8ff 0%, #f8fafc 36%, #f8fafc 100%);
}

.hero-card,
.stats-card,
.notice-card,
.quick-card,
.menu-card,
.section-card {
  position: relative;
  overflow: hidden;
  border-radius: 24rpx;
  background: #fff;
  box-shadow: 0 16rpx 36rpx rgba(15, 23, 42, 0.05);
}

.hero-card {
  padding: 28rpx;
  background: linear-gradient(135deg, #1d4ed8, #3b82f6 58%, #60a5fa 100%);
}

.hero-bg {
  position: absolute;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.12);
}

.hero-bg-left {
  top: -70rpx;
  left: -30rpx;
  width: 220rpx;
  height: 220rpx;
}

.hero-bg-right {
  right: -60rpx;
  bottom: -90rpx;
  width: 260rpx;
  height: 260rpx;
}

.hero-main {
  position: relative;
  display: flex;
  gap: 20rpx;
  align-items: center;
}

.avatar {
  width: 128rpx;
  height: 128rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
}

.hero-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.name {
  font-size: 38rpx;
  font-weight: 700;
  color: #fff;
}

.phone,
.desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.88);
}

.hero-tag {
  align-self: flex-start;
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.18);
  font-size: 22rpx;
  color: #fff;
}

.hero-actions {
  position: relative;
  display: flex;
  gap: 14rpx;
  margin-top: 24rpx;
}

.hero-btn {
  margin: 0;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.hero-btn.primary {
  background: #fff;
  color: #1d4ed8;
}

.stats-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rpx;
  margin-top: 18rpx;
  padding: 10rpx;
}

.stat-item {
  padding: 22rpx 12rpx;
  border-radius: 18rpx;
  text-align: center;
  background: #f8fbff;
}

.stat-value {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #1d4ed8;
}

.stat-label {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #64748b;
}

.notice-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-top: 18rpx;
}

.notice-item {
  padding: 18rpx;
  border-radius: 20rpx;
  background: #fff;
}

.notice-label {
  display: block;
  font-size: 22rpx;
  color: #94a3b8;
}

.notice-value {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #1f2937;
}

.quick-card,
.menu-card,
.section-card {
  margin-top: 18rpx;
  padding: 24rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #1f2937;
}

.section-more {
  font-size: 24rpx;
  color: #2563eb;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18rpx 12rpx;
}

.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.quick-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  border-radius: 26rpx;
  font-size: 30rpx;
  font-weight: 700;
  color: #1e3a8a;
}

.quick-text {
  font-size: 22rpx;
  color: #475569;
}

.menu-card {
  padding-top: 10rpx;
  padding-bottom: 10rpx;
}

.menu-head {
  margin-bottom: 6rpx;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 0;
  border-bottom: 2rpx solid #f1f5f9;
}

.menu-item:last-child {
  border-bottom: 0;
}

.menu-left {
  display: flex;
  gap: 18rpx;
  align-items: center;
}

.menu-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  font-size: 28rpx;
  color: #1d4ed8;
}

.menu-copy {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.menu-title {
  font-size: 28rpx;
  color: #1f2937;
}

.menu-desc {
  font-size: 22rpx;
  color: #94a3b8;
}

.arrow {
  color: #94a3b8;
  font-size: 28rpx;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.state {
  padding: 24rpx;
  border-radius: 18rpx;
  background: #f8fafc;
  font-size: 24rpx;
  color: #64748b;
  text-align: center;
}
</style>
