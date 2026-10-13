<template>
  <view class="page">
    <view class="bar">
      <button size="mini" @tap="loadFolktales">故事点（按类别着色）</button>
      <button size="mini" @tap="toggleLabels">标签</button>
      <button size="mini" @tap="fitChina">适配中国</button>
      <button size="mini" @tap="showSampleRoute">示例路线</button>
    </view>
    <view class="legend">
      <text class="dot dot0"></text>神话
      <text class="dot dot1"></text>传说
      <text class="dot dot2"></text>民间故事
      <text class="hint">（圆面积≈知名度）</text>
    </view>
    <view ref="mapEl" id="mapContainer" class="map"></view>
  </view>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useMapLibre } from '@/geo/maplibre/useMapLibre.js';
import chineseFolktales from '@/geo/data/chinese-folktales.json';
import { routeGeoJSON } from '@/geo/maplibre/samples.js';

const mapEl = ref(null);
let ml = null;
let ready = false;
let labelsOn = false;

onMounted(() => {
  ml = useMapLibre();
  ml.initMap(mapEl.value);
  ml.map.on('load', () => {
    ready = true;
    loadFolktales();
    setTimeout(fitChina, 300);
  });
});

// 数据驱动：半径随“知名度 value”变化，颜色按类别 catIndex（0 蓝/1 黄/2 红）
function loadFolktales() {
  if (!ready) return;
  ml.addDataDriven('folktales', chineseFolktales, {
    sizeProp: 'value', colorProp: 'catIndex',
    cMin: 0, cMid: 1, cMax: 2,
    radiusMin: 6, radiusMax: 22, opacity: 0.82,
  });
  if (!labelsOn) toggleLabels();
}

function toggleLabels() {
  if (!ready) return;
  if (labelsOn) {
    // 简单去标签：移除图层（源保留，下次可重加）
    const id = 'folktales-labels-label';
    if (ml.map.getLayer(id)) ml.map.removeLayer(id);
  } else {
    ml.addLabels('folktales-labels', chineseFolktales, {
      field: 'name', size: 12, color: '#222',
    });
  }
  labelsOn = !labelsOn;
}

function fitChina() {
  ready && ml.fitToGeoJSON(chineseFolktales);
}

function showSampleRoute() {
  ready && ml.addRoute('sample-route', routeGeoJSON, { color: '#ff5722', width: 5 });
}

onUnmounted(() => {
  ml && ml.destroy();
});
</script>

<style scoped>
.page { display: flex; flex-direction: column; height: 100vh; }
.bar { padding: 8px; display: flex; gap: 6px; flex-wrap: wrap; background: #f5f5f5; }
.legend { padding: 4px 8px; font-size: 12px; color: #444; background: #fafafa; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin: 0 3px 0 10px; vertical-align: middle; }
.dot0 { background: #2980b9; }
.dot1 { background: #f1c40f; }
.dot2 { background: #e74c3c; }
.hint { color: #888; margin-left: 6px; }
.map { flex: 1; width: 100%; overflow: hidden; }
</style>
