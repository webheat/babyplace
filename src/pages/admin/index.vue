<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { createGoods, listGoods, removeGoods, updateGoods } from '../../api/goods';
import { clearLoginState, getWechatLoginConfigStatus, hasValidUniIdToken, setLoginTime, startH5WeixinLogin } from '../../utils/auth';

const uniIdCo = uniCloud.importObject('uni-id-co', {
  customUI: true,
});

const loading = ref(false);
const submitting = ref(false);
const wechatLoggingIn = ref(false);
const errorMessage = ref('');
const spots = ref([]);
const keyword = ref('');
const editingId = ref('');
const isLoggedIn = ref(true);
const loginStatusText = computed(() => isLoggedIn.value ? '已登录' : '未登录');
const { webAppId } = getWechatLoginConfigStatus();
const wechatScriptLoading = ref(false);
const isWeixinBrowser = computed(() => {
  // #ifdef H5
  return /MicroMessenger/i.test(window.navigator.userAgent || '');
  // #endif
  return false;
});
const createEmptyForm = () => ({
  name: '',
  lat: '',
  lng: '',
  address: '',
  suitable_ages: '',
  transport_hint: '',
  parking_tip: '',
  stroller_friendly: '',
});
const form = reactive(createEmptyForm());
function resetForm() {
  editingId.value = '';
  Object.assign(form, createEmptyForm());
}
function syncLoginState() {
  const valid = hasValidUniIdToken();
  isLoggedIn.value = valid;
  if (!valid) {
    clearLoginState();
  }
}
function fillForm(item) {
  editingId.value = item._id || '';
  Object.assign(form, {
    name: item.name || '',
    lat: item.lat ?? '',
    lng: item.lng ?? '',
    address: item.address || '',
    suitable_ages: item.suitable_ages || '',
    transport_hint: item.transport_hint || '',
    parking_tip: item.parking_tip || '',
    stroller_friendly: item.stroller_friendly || '',
  });
  uni.pageScrollTo({
    scrollTop: 0,
    duration: 180,
  });
}
function getPayload() {
  const latText = String(form.lat ?? '').trim();
  const lngText = String(form.lng ?? '').trim();
  return {
    name: String(form.name || '').trim(),
    lat: latText === '' ? null : Number(latText),
    lng: lngText === '' ? null : Number(lngText),
    address: String(form.address || '').trim(),
    suitable_ages: String(form.suitable_ages || '').trim(),
    transport_hint: String(form.transport_hint || '').trim(),
    parking_tip: String(form.parking_tip || '').trim(),
    stroller_friendly: String(form.stroller_friendly || '').trim(),
  };
}
function validateForm(payload) {
  if (!payload.name || payload.name.length < 2) {
    return '请填写至少 2 个字的景点名称';
  }
  if (!Number.isFinite(payload.lat) || payload.lat < -90 || payload.lat > 90) {
    return '请填写正确的纬度';
  }
  if (!Number.isFinite(payload.lng) || payload.lng < -180 || payload.lng > 180) {
    return '请填写正确的经度';
  }
  if (!payload.address || payload.address.length < 2) {
    return '请填写地址';
  }
  return '';
}
function formatCoord(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(6) : '--';
}
async function loadSpots() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await listGoods({
      keyword: keyword.value,
      page: 1,
      pageSize: 100,
    });
    if (result.code !== 0) {
      throw new Error(result.message || '加载失败');
    }
    spots.value = result.data.list || [];
  } catch (error) {
    spots.value = [];
    errorMessage.value = error.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function submitForm() {
  const payload = getPayload();
  const validationMessage = validateForm(payload);
  if (validationMessage) {
    uni.showToast({
      title: validationMessage,
      icon: 'none',
    })
    return
  }
  submitting.value = true
  try {
    const result = editingId.value
      ? await updateGoods(editingId.value, payload)
      : await createGoods(payload)
    if (result.code !== 0) {
      throw new Error(result.message || '保存失败')
    }
    uni.showToast({
      title: editingId.value ? '已保存' : '已新增',
      icon: 'success',
    })
    resetForm()
    await loadSpots()
  } catch (error) {
    uni.showModal({
      title: '保存失败',
      content: error.message || '请确认当前账号已分配 admin 角色',
      showCancel: false,
    })
  } finally {
    submitting.value = false
  }
}
function handleRemove(item) {
  uni.showModal({
    title: '删除景点',
    content: `确认删除「${item.name || '未命名景点'}」吗？`,
    success: async ({ confirm }) => {
      if (!confirm) {
        return
      }
      try {
        const result = await removeGoods(item._id)
        if (result.code !== 0) {
          throw new Error(result.message || '删除失败')
        }
        uni.showToast({
          title: '已删除',
          icon: 'success',
        })
        if (editingId.value === item._id) {
          resetForm()
        }
        await loadSpots()
      } catch (error) {
        uni.showModal({
          title: '删除失败',
          content: error.message || '请确认当前账号已分配 admin 角色',
          showCancel: false,
        })
      }
    },
  })
}
function openWechatLogin() {
  startH5WeixinLogin({ redirectPath: '/admin' })
}
function loadWechatLoginScript() {
  // #ifdef H5
  if (window.WxLogin) {
    return Promise.resolve()
  }
  if (wechatScriptLoading.value) {
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (window.WxLogin) {
          clearInterval(timer)
          resolve()
        }
      }, 150)
    })
  }
  wechatScriptLoading.value = true
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js'
    script.async = true
    script.onload = () => {
      wechatScriptLoading.value = false
      resolve()
    }
    script.onerror = () => {
      wechatScriptLoading.value = false
      reject(new Error('微信扫码脚本加载失败'))
    }
    document.body.appendChild(script)
  })
  // #endif
  return Promise.resolve()
}
async function renderWechatLoginWidget() {
  if (isLoggedIn.value || isWeixinBrowser.value) {
    return
  }
  // #ifdef H5
  try {
    await loadWechatLoginScript()
    await nextTick()
    const mountNode = document.getElementById('wx-login-qrcode')
    if (!mountNode || !window.WxLogin || !webAppId) {
      return
    }
    mountNode.innerHTML = ''
    const currentUrl = encodeURIComponent('https://ds.aixifs.com/?target=/admin')
    new window.WxLogin({
      self_redirect: false,
      id: 'wx-login-qrcode',
      appid: webAppId,
      scope: 'snsapi_login',
      redirect_uri: currentUrl,
      state: 'babyplace_admin',
      style: 'black',
      href: '',
    })
  } catch (error) {
    uni.showModal({
      title: '微信二维码加载失败',
      content: error.message || '请稍后重试',
      showCancel: false,
    })
  }
  // #endif
}
async function consumeWechatCode(code) {
  if (!code || wechatLoggingIn.value) {
    return
  }
  wechatLoggingIn.value = true
  uni.showLoading({
    title: '微信登录中',
    mask: true,
  })
  try {
    const result = await uniIdCo.loginByWeixin({
      code,
    })
    if (result.token) {
      uni.setStorageSync('uni_id_token', result.token)
      setLoginTime()
    }
    if (typeof result.tokenExpired !== 'undefined') {
      uni.setStorageSync('uni_id_token_expired', result.tokenExpired || 0)
    }
    if (result.refreshToken) {
      uni.setStorageSync('uni_id_refresh_token', result.refreshToken)
    }
    syncLoginState()
    uni.showToast({
      title: '登录成功',
      icon: 'success',
    })
    await loadSpots()
    // #ifdef H5
    window.location.replace('/#/pages/admin/index')
    // #endif
    // #ifndef H5
    uni.reLaunch({
      url: '/pages/admin/index',
    })
    // #endif
  } catch (error) {
    uni.showModal({
      title: '微信登录失败',
      content: error.message || '请检查微信开放平台回调域名与 uni-id 微信配置',
      showCancel: false,
    })
  } finally {
    wechatLoggingIn.value = false
    uni.hideLoading()
  }
}
onLoad((options) => {
  syncLoginState()
  if (options?.code) {
    consumeWechatCode(options.code)
  }
})
onMounted(() => {
  syncLoginState();
  loadSpots();
  if (!isLoggedIn.value) {
    renderWechatLoginWidget();
  }
});
function handleLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确认退出登录吗？',
    success: ({ confirm }) => {
      if (!confirm) return
      clearLoginState()
      isLoggedIn.value = false
      spots.value = []
      resetForm()
      renderWechatLoginWidget()
      uni.showToast({ title: '已退出', icon: 'success' })
    },
  })
}
</script>

<template>
  <view class="page">
    <view class="toolbar">
      <text class="status">{{ loginStatusText }}</text>
      <button v-if="isLoggedIn" class="button logout" size="mini" @click="handleLogout">退出登录</button>
      <button v-else class="button" size="mini" @click="openWechatLogin">微信登录</button>
    </view>

    <view v-if="!isLoggedIn" class="login-panel">
      <view id="wx-login-qrcode" class="qrcode-container"></view>
      <text class="hint">请使用微信扫码登录</text>
    </view>

    <view v-else class="admin-content">
      <view class="form-section">
        <text class="section-title">{{ editingId ? '编辑景点' : '新增景点' }}</text>
        <view class="form-grid">
          <view class="form-item">
            <text class="label">名称</text>
            <input v-model="form.name" class="input" placeholder="景点名称" />
          </view>
          <view class="form-item">
            <text class="label">纬度</text>
            <input v-model="form.lat" class="input" placeholder="如 39.9042" type="digit" />
          </view>
          <view class="form-item">
            <text class="label">经度</text>
            <input v-model="form.lng" class="input" placeholder="如 116.4074" type="digit" />
          </view>
          <view class="form-item">
            <text class="label">地址</text>
            <input v-model="form.address" class="input" placeholder="详细地址" />
          </view>
          <view class="form-item">
            <text class="label">适合年龄</text>
            <input v-model="form.suitable_ages" class="input" placeholder="如 0-6岁" />
          </view>
          <view class="form-item">
            <text class="label">交通提示</text>
            <input v-model="form.transport_hint" class="input" placeholder="地铁/公交等" />
          </view>
          <view class="form-item">
            <text class="label">停车建议</text>
            <input v-model="form.parking_tip" class="input" placeholder="停车场信息" />
          </view>
          <view class="form-item">
            <text class="label">推车友好</text>
            <input v-model="form.stroller_friendly" class="input" placeholder="是/否/部分" />
          </view>
        </view>
        <view class="form-actions">
          <button v-if="editingId" class="button secondary" @click="resetForm">取消编辑</button>
          <button class="button primary" :loading="submitting" @click="submitForm">{{ editingId ? '保存' : '新增' }}</button>
        </view>
      </view>

      <view class="list-section">
        <view class="list-header">
          <text class="section-title">景点列表 ({{ spots.length }})</text>
          <input v-model="keyword" class="search" placeholder="搜索" @confirm="loadSpots" />
        </view>
        <view v-if="loading" class="state">加载中...</view>
        <view v-else-if="errorMessage" class="state error">{{ errorMessage }}</view>
        <view v-else-if="!spots.length" class="state">暂无数据</view>
        <view v-else class="spot-list">
          <view v-for="item in spots" :key="item._id" class="spot-card">
            <view class="spot-info">
              <text class="spot-name">{{ item.name || '未命名' }}</text>
              <text class="spot-address">{{ item.address || '无地址' }}</text>
              <text class="spot-coords">{{ formatCoord(item.lat) }}, {{ formatCoord(item.lng) }}</text>
            </view>
            <view class="spot-actions">
              <button class="action-btn" size="mini" @click="fillForm(item)">编辑</button>
              <button class="action-btn danger" size="mini" @click="handleRemove(item)">删除</button>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f5f5f5;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  margin-bottom: 24rpx;
  background: #fff;
  border-radius: 16rpx;
}

.status {
  font-size: 28rpx;
  color: #333;
}

.button {
  padding: 12rpx 24rpx;
  font-size: 26rpx;
  border-radius: 8rpx;
}

.logout {
  background: #ff4d4f;
  color: #fff;
}

.login-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 0;
}

.qrcode-container {
  width: 300rpx;
  height: 300rpx;
  margin-bottom: 24rpx;
}

.hint {
  font-size: 28rpx;
  color: #666;
}

.admin-content {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.form-section,
.list-section {
  padding: 24rpx;
  background: #fff;
  border-radius: 16rpx;
}

.section-title {
  display: block;
  margin-bottom: 20rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.label {
  font-size: 26rpx;
  color: #666;
}

.input {
  padding: 16rpx;
  font-size: 28rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 8rpx;
}

.form-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}

.primary {
  background: #1890ff;
  color: #fff;
}

.secondary {
  background: #f0f0f0;
  color: #666;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.search {
  width: 200rpx;
  padding: 12rpx 16rpx;
  font-size: 26rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 8rpx;
}

.state {
  padding: 40rpx;
  text-align: center;
  font-size: 28rpx;
  color: #999;
}

.error {
  color: #ff4d4f;
}

.spot-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.spot-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx;
  background: #fafafa;
  border-radius: 12rpx;
}

.spot-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  flex: 1;
}

.spot-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
}

.spot-address {
  font-size: 24rpx;
  color: #666;
}

.spot-coords {
  font-size: 22rpx;
  color: #999;
}

.spot-actions {
  display: flex;
  gap: 12rpx;
}

.action-btn {
  padding: 8rpx 16rpx;
  font-size: 24rpx;
  background: #1890ff;
  color: #fff;
  border-radius: 6rpx;
}

.danger {
  background: #ff4d4f;
}
</style>
