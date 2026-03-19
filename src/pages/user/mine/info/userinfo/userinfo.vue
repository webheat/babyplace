<template>
  <view class="page">
    <view class="hero">
      <text class="title">个人信息</text>
      <text class="subtitle">保留旧版资料页的头像 + 基础资料编辑方式。</text>
    </view>
    <view class="panel">
      <view class="avatar-row">
        <image class="avatar" :src="form.avatar || '/static/images/icon-default-avatar.png'" mode="aspectFill" />
      </view>
      <view class="avatar-tip">当前头像沿用本地登录资料，后续可接真实上传。</view>
      <input v-model="form.nickname" class="input" placeholder="昵称" />
      <input v-model="form.city" class="input" placeholder="所在城市" />
      <textarea v-model="form.description" class="textarea" maxlength="120" placeholder="个人简介" />
      <view class="count">{{ form.description.length }}/120</view>
      <button class="button" :loading="submitting" @click="saveProfile">保存信息</button>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { onMounted } from 'vue';
import api from '@/common/api-util.js';
import auth from '@/common/auth.js';
import store from '@/store';

const submitting = ref(false);
const form = reactive({
  avatar: '',
  nickname: '',
  city: '',
  description: '',
});

function syncForm() {
  const userInfo = auth.getLocalUserInfo() || {};
  form.avatar = userInfo.avatar || '';
  form.nickname = userInfo.nickname || '';
  form.city = userInfo.city || '';
  form.description = userInfo.description || '';
}

async function saveProfile() {
  submitting.value = true;
  try {
    await api.user.modifyUserStrInfo('nickname', form.nickname.trim());
    await api.user.modifyUserStrInfo('city', form.city.trim());
    const result = await api.user.modifyUserStrInfo('description', form.description.trim());
    if (result.code !== api.SUCCESS) throw new Error(api.getErrorMessage(result.code));
    store.commit('userInfo', result.data);
    uni.showToast({ title: '保存成功', icon: 'success' });
  } catch (error) {
    uni.showToast({ title: error.message || '保存失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  syncForm();
});
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

.avatar-row {
  display: flex;
  justify-content: center;
  margin-bottom: 20rpx;
}

.avatar {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
}

.avatar-tip {
  margin-bottom: 16rpx;
  text-align: center;
  font-size: 22rpx;
  color: #94a3b8;
}

.input,
.textarea {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 16rpx;
  padding: 20rpx;
  border-radius: 16rpx;
  background: #f8fafc;
  border: 2rpx solid #e2e8f0;
  font-size: 26rpx;
}

.textarea {
  min-height: 220rpx;
}

.count {
  text-align: right;
  font-size: 22rpx;
  color: #94a3b8;
}

.button {
  margin-top: 8rpx;
  border-radius: 16rpx;
  background: #2563eb;
  color: #fff;
}
</style>
