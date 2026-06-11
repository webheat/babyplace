<template>
  <view class="route-card">
    <view class="section-head section-head-row">
      <text class="section-title">到店位置</text>
      <view class="map-actions">
        <text v-if="hasLocation" class="map-action" @click="handlePlanRoute">驾车路线</text>
        <text v-if="hasLocation" class="map-action" @click="openMapLocation">打开地图</text>
      </view>
    </view>
    <view v-if="hasLocation" class="map-wrap">
      <map
        class="map"
        :latitude="mapCenterLatitude"
        :longitude="mapCenterLongitude"
        :scale="16"
        :markers="mapMarkers"
        :include-points="includePoints"
        :polyline="mapPolyline"
        :show-location="showUserLocation"
        :enable-scroll="true"
        :enable-zoom="true"
        @markertap="handleMarkerTap"
      />
    </view>
    <view class="location-card">
      <text class="location-name">{{ name || '地点位置' }}</text>
      <text class="location-address">{{ addressText }}</text>
      <text v-if="!hasLocation" class="location-empty">当前地点未配置经纬度，暂不显示地图。</text>
    </view>
    <view v-if="hasLocation" class="planner-card">
      <view class="planner-head">
        <text class="planner-title">驾车路线规划</text>
        <text class="planner-subtitle">将使用当前位置到景点位置生成路线</text>
      </view>
      <button class="planner-button" size="mini" :loading="routeLoading" @click="handlePlanRoute">使用当前位置规划路线</button>
      <text v-if="routeError" class="planner-error">{{ routeError }}</text>
      <view v-else-if="routeSummary.distanceText || routeSummary.durationText" class="planner-summary">
        <text class="planner-summary-text">距离 {{ routeSummary.distanceText || '--' }}</text>
        <text class="planner-summary-text">预计 {{ routeSummary.durationText || '--' }}</text>
      </view>
      <view v-if="routeInstructions.length" class="planner-steps">
        <text v-for="(item, index) in routeInstructions" :key="`${index}-${item}`" class="planner-step">{{ index + 1 }}. {{ item }}</text>
      </view>
      <text v-else class="planner-tip">首次使用会申请定位权限，用于获取你的当前位置。</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { planDriveRoute } from '@/api/route';

const props = defineProps({
  name: {
    type: String,
    default: '',
  },
  city: {
    type: String,
    default: '',
  },
  district: {
    type: String,
    default: '',
  },
  address: {
    type: String,
    default: '',
  },
  latitude: {
    type: Number,
    default: 0,
  },
  longitude: {
    type: Number,
    default: 0,
  },
});

const routeLoading = ref(false);
const routeError = ref('');
const userLocation = ref(null);
const routeSummary = ref({
  distance: 0,
  distanceText: '',
  duration: 0,
  durationText: '',
  polyline: [],
  instructions: [],
});

const MAP_MARKER_ID = 1;
const USER_MARKER_ID = 2;

const hasLocation = computed(() => Number(props.latitude) > 0 && Number(props.longitude) > 0);
const addressText = computed(() => [props.city, props.district, props.address].filter(Boolean).join(' '));
const showUserLocation = computed(() => Boolean(userLocation.value?.lat && userLocation.value?.lng));
const mapCenterLatitude = computed(() => Number(userLocation.value?.lat || props.latitude || 0));
const mapCenterLongitude = computed(() => Number(userLocation.value?.lng || props.longitude || 0));
const mapMarkers = computed(() => {
  if (!hasLocation.value) return [];
  const markers = [{
    id: MAP_MARKER_ID,
    latitude: Number(props.latitude),
    longitude: Number(props.longitude),
    width: 30,
    height: 30,
    callout: {
      content: props.name || '地点位置',
      display: 'ALWAYS',
      borderRadius: 8,
      padding: 8,
      fontSize: 12,
      bgColor: '#ffffff',
      color: '#1f2937',
    },
  }];
  if (userLocation.value?.lat && userLocation.value?.lng) {
    markers.push({
      id: USER_MARKER_ID,
      latitude: Number(userLocation.value.lat),
      longitude: Number(userLocation.value.lng),
      width: 26,
      height: 26,
      iconPath: '/static/tab/home-selected.png',
      callout: {
        content: '我的位置',
        display: 'BYCLICK',
        borderRadius: 8,
        padding: 8,
        fontSize: 12,
        bgColor: '#ffffff',
        color: '#1f2937',
      },
    });
  }
  return markers;
});
const includePoints = computed(() => {
  const points = [];
  if (hasLocation.value) {
    points.push({
      latitude: Number(props.latitude),
      longitude: Number(props.longitude),
    });
  }
  if (userLocation.value?.lat && userLocation.value?.lng) {
    points.push({
      latitude: Number(userLocation.value.lat),
      longitude: Number(userLocation.value.lng),
    });
  }
  (routeSummary.value.polyline || []).forEach((item) => {
    if (!item) return;
    points.push({
      latitude: Number(item.latitude || 0),
      longitude: Number(item.longitude || 0),
    });
  });
  return points;
});
const mapPolyline = computed(() => {
  if (!(routeSummary.value.polyline || []).length) return [];
  return [{
    points: routeSummary.value.polyline,
    color: '#2563eb',
    width: 8,
    dottedLine: false,
  }];
});
const routeInstructions = computed(() => (routeSummary.value.instructions || []).slice(0, 5));

function resetRouteSummary() {
  routeError.value = '';
  routeSummary.value = {
    distance: 0,
    distanceText: '',
    duration: 0,
    durationText: '',
    polyline: [],
    instructions: [],
  };
}

function openLocationSetting() {
  // #ifdef MP-WEIXIN
  uni.openSetting({});
  // #endif
  // #ifdef APP-PLUS
  uni.showModal({
    title: '需要定位权限',
    content: '请在系统设置中允许位置权限后重试路线规划。',
    showCancel: false,
  });
  // #endif
  // #ifdef H5
  uni.showModal({
    title: '需要定位权限',
    content: '请在浏览器地址栏开启定位权限后重试路线规划。',
    showCancel: false,
  });
  // #endif
}

function normalizeLocationError(error) {
  const message = String(error?.errMsg || error?.message || '').toLowerCase();
  if (!message) return '当前位置获取失败';
  if (message.includes('privacy')) return '未完成隐私授权';
  if (message.includes('auth deny') || message.includes('auth denied') || message.includes('permission') || message.includes('authorize')) {
    return '未获得定位权限';
  }
  if (message.includes('getlocation:fail')) return '当前位置获取失败';
  return '当前位置获取失败';
}

function getMpPrivacySetting() {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || typeof wx.getPrivacySetting !== 'function') {
      resolve({ needAuthorization: false });
      return;
    }
    wx.getPrivacySetting({
      success: (result) => resolve(result || { needAuthorization: false }),
      fail: (error) => reject(error),
    });
  });
  // #endif
  return Promise.resolve({ needAuthorization: false });
}

function requestPrivacyAuthorize() {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || typeof wx.requirePrivacyAuthorize !== 'function') {
      resolve();
      return;
    }
    wx.requirePrivacyAuthorize({
      success: () => resolve(),
      fail: (error) => reject(error),
    });
  });
  // #endif
  return Promise.resolve();
}

function authorizeLocationScope() {
  return new Promise((resolve, reject) => {
    uni.authorize({
      scope: 'scope.userLocation',
      success: () => resolve(),
      fail: (error) => reject(error),
    });
  });
}

async function ensureLocationPermission() {
  // #ifdef MP-WEIXIN
  const privacySetting = await getMpPrivacySetting();
  if (privacySetting?.needAuthorization) {
    await requestPrivacyAuthorize();
  }
  // #endif
  await authorizeLocationScope();
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    uni.getLocation({
      type: 'gcj02',
      success: ({ latitude, longitude }) => resolve({ lat: latitude, lng: longitude }),
      fail: (error) => reject(error),
    });
  });
}

async function requestCurrentLocation() {
  try {
    await ensureLocationPermission();
    const location = await getCurrentLocation();
    userLocation.value = location;
    return location;
  } catch (error) {
    const message = normalizeLocationError(error);
    if (message === '未获得定位权限' || message === '未完成隐私授权') {
      openLocationSetting();
    }
    throw new Error(message);
  }
}

async function handlePlanRoute() {
  if (!hasLocation.value) {
    uni.showToast({ title: '暂无地点坐标', icon: 'none' });
    return;
  }
  routeLoading.value = true;
  routeError.value = '';
  try {
    const location = await requestCurrentLocation();
    const result = await planDriveRoute({
      originLat: location.lat,
      originLng: location.lng,
      destLat: Number(props.latitude),
      destLng: Number(props.longitude),
      style: '0',
    });
    if (result.code !== 0) throw new Error(result.message || '路线规划失败');
    routeSummary.value = {
      distance: Number(result.data?.distance || 0),
      distanceText: result.data?.distanceText || '',
      duration: Number(result.data?.duration || 0),
      durationText: result.data?.durationText || '',
      polyline: Array.isArray(result.data?.polyline) ? result.data.polyline : [],
      instructions: Array.isArray(result.data?.instructions) ? result.data.instructions : [],
    };
    uni.showToast({ title: '路线已生成', icon: 'success' });
  } catch (error) {
    resetRouteSummary();
    routeError.value = error.message || '路线规划失败';
    uni.showToast({ title: routeError.value, icon: 'none' });
  } finally {
    routeLoading.value = false;
  }
}

function openMapLocation() {
  if (!hasLocation.value) {
    uni.showToast({ title: '暂无地图坐标', icon: 'none' });
    return;
  }
  uni.openLocation({
    latitude: Number(props.latitude),
    longitude: Number(props.longitude),
    name: props.name || '地点位置',
    address: addressText.value,
    scale: 16,
  });
}

function handleMarkerTap() {
  openMapLocation();
}
</script>

<style scoped>
.route-card {
  padding: 24rpx;
  border-radius: 22rpx;
  overflow: hidden;
  background: #fff;
}
.section-head {
  margin-bottom: 12rpx;
}
.section-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
}
.map-actions {
  display: flex;
  gap: 18rpx;
}
.map-action {
  font-size: 22rpx;
  color: #2563eb;
}
.map-wrap {
  overflow: hidden;
  border-radius: 18rpx;
  background: #e2e8f0;
}
.map {
  width: 100%;
  height: 360rpx;
}
.location-card {
  margin-top: 14rpx;
  padding: 18rpx;
  border-radius: 16rpx;
  background: #f8fafc;
}
.location-name {
  display: block;
  margin-bottom: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #1f2937;
}
.location-address,
.location-empty {
  font-size: 24rpx;
  line-height: 1.7;
  color: #475569;
}
.planner-card {
  margin-top: 14rpx;
  padding: 18rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
}
.planner-head {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.planner-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #1e3a8a;
}
.planner-subtitle,
.planner-tip,
.planner-error,
.planner-summary-text,
.planner-step {
  font-size: 22rpx;
  line-height: 1.6;
}
.planner-subtitle,
.planner-tip {
  color: #64748b;
}
.planner-button {
  margin: 16rpx 0 0;
  border-radius: 14rpx;
  background: #1d4ed8;
  color: #fff;
}
.planner-summary,
.planner-steps {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-top: 14rpx;
}
.planner-summary-text {
  color: #1e293b;
}
.planner-error {
  display: block;
  margin-top: 14rpx;
  color: #dc2626;
}
.planner-step {
  color: #334155;
}
</style>
