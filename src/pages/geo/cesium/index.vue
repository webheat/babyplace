<template>
  <view class="page">
    <view class="bar">
      <button size="mini" @tap="flyAlps">俯瞰阿尔卑斯</button>
      <button size="mini" @tap="playTour">沿路线巡航</button>
      <button size="mini" @tap="reset">重置</button>
      <text class="hint">{{ hint }}</text>
    </view>
    <view ref="mapEl" id="cesiumContainer" class="map"></view>
  </view>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useCesium } from '@/geo/cesium/useCesium.js';
import { PEAKS, TOUR_ROUTE, REGION_POLYGON, ALPS_CENTER } from '@/geo/cesium/samples.js';

const mapEl = ref(null);
const hint = ref('加载中…');
let cesium = null;

onMounted(async () => {
  cesium = useCesium();
  await cesium.initViewer(mapEl.value);

  PEAKS.forEach((p) => cesium.addPoint(p.lng, p.lat, p.height, { label: p.name }));
  cesium.addPolyline(TOUR_ROUTE, { width: 6 });
  cesium.addPolygon(REGION_POLYGON, { color: undefined, opacity: 0.18 });
  cesium.flyTo(ALPS_CENTER.lng, ALPS_CENTER.lat, ALPS_CENTER.height);

  hint.value = `已加载：真实地形 + ${PEAKS.length} 座山峰 + 路线 + 区域高亮`;
});

function flyAlps() {
  cesium && cesium.flyTo(ALPS_CENTER.lng, ALPS_CENTER.lat, ALPS_CENTER.height);
}
function playTour() {
  if (!cesium) return;
  cesium.animateAlongRoute(TOUR_ROUTE, { label: '巡航中' });
  cesium.flyToBoundingSphere(TOUR_ROUTE, { duration: 3 });
}
function reset() {
  cesium && cesium.flyTo(ALPS_CENTER.lng, ALPS_CENTER.lat, ALPS_CENTER.height);
}

onUnmounted(() => {
  cesium && cesium.destroy();
});
</script>

<style scoped>
.page { display: flex; flex-direction: column; height: 100vh; }
.bar { padding: 8px; display: flex; gap: 8px; align-items: center; background: #f5f5f5; flex-wrap: wrap; }
.hint { font-size: 12px; color: #666; }
.map { flex: 1; width: 100%; overflow: hidden; }
</style>
