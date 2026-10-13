<template>
  <view class="page">
    <view class="bar">
      <button size="mini" @tap="loadFolktales">中国民间故事</button>
      <button size="mini" @tap="loadWorldMyths">全球神话</button>
      <button size="mini" @tap="toggleLabels">标签</button>
      <button size="mini" @tap="fitCurrent">适配视图</button>
      <button size="mini" @tap="showSampleRoute">示例路线</button>
      <button size="mini" @tap="exportGeoJSON">导出GeoJSON</button>
    </view>
    <view class="legend">
      <text class="dot dot0"></text>神话
      <text class="dot dot1"></text>传说
      <text class="dot dot2"></text>民间故事
      <text class="dot dot3"></text>史诗
      <text class="hint">（圆面积≈知名度 · 点击圆点看简介）</text>
    </view>
    <view ref="mapEl" id="mapContainer" class="map"></view>
  </view>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useMapLibre } from '@/geo/maplibre/useMapLibre.js';
import chineseFolktales from '@/geo/data/chinese-folktales.json';
import worldMyths from '@/geo/data/world-myths.json';
import { routeGeoJSON } from '@/geo/maplibre/samples.js';

const mapEl = ref(null);
let ml = null;
let ready = false;
let labelsOn = false;
let currentData = null;

// 类别 → 颜色（含史诗绿）
const CATEGORY_STOPS = [
  [0, '#2980b9'], // 神话
  [1, '#f1c40f'], // 传说
  [2, '#e74c3c'], // 民间故事
  [3, '#27ae60'], // 史诗
];

onMounted(() => {
  ml = useMapLibre();
  ml.initMap(mapEl.value);
  ml.map.on('load', () => {
    ready = true;
    loadFolktales();
    setTimeout(fitCurrent, 300);
  });
});

// 数据驱动：半径随“知名度 value”，颜色按类别 catIndex（0蓝/1黄/2红/3绿）
function renderDataDriven(sourceId, data) {
  ml.addDataDriven(sourceId, data, {
    sizeProp: 'value', colorProp: 'catIndex',
    colorStops: CATEGORY_STOPS,
    radiusMin: 6, radiusMax: 22, opacity: 0.82,
  });
  // 点击弹窗：简介 + 原文链接
  ml.enableFeaturePopup(`${sourceId}-circle`, (p) => {
    const link = p.sourceUrl
      ? `<p><a href="${p.sourceUrl}" target="_blank" rel="noopener">📖 ${
          p.sourceType === 'wikisource' ? '维基文库原文' : '维基百科资料'
        }</a></p>`
      : '';
    return `
      <div style="font:13px/1.5 system-ui,sans-serif;max-width:260px">
        <h3 style="margin:0 0 4px">${p.name}</h3>
        <p style="margin:0 0 4px;color:#444">${p.summary || ''}</p>
        <p style="margin:0 0 4px;color:#666">类别：${p.category || ''}　${p.province || ''}·${p.site || ''}</p>
        <p style="margin:0 0 4px;color:#888;font-size:12px">出处：${p.source || ''}</p>
        ${link}
      </div>`;
  });
}

function loadFolktales() {
  if (!ready) return;
  currentData = chineseFolktales;
  // 源已存在则先重加（切回中国视图）
  if (ml.map.getSource('folktales')) {
    ml.map.removeLayer('folktales-circle');
    ml.map.removeSource('folktales');
  }
  if (ml.map.getSource('world-myths')) {
    ml.map.removeLayer('world-myths-circle');
    ml.map.removeSource('world-myths');
  }
  renderDataDriven('folktales', chineseFolktales);
  if (!labelsOn) toggleLabels();
}

function loadWorldMyths() {
  if (!ready) return;
  currentData = worldMyths;
  if (ml.map.getSource('folktales')) {
    ml.map.removeLayer('folktales-circle');
    ml.map.removeSource('folktales');
  }
  if (ml.map.getSource('world-myths')) {
    ml.map.removeLayer('world-myths-circle');
    ml.map.removeSource('world-myths');
  }
  renderDataDriven('world-myths', worldMyths);
  if (!labelsOn) toggleLabels();
}

function toggleLabels() {
  if (!ready) return;
  const id = 'folktales-labels-label';
  if (labelsOn) {
    if (ml.map.getLayer(id)) ml.map.removeLayer(id);
  } else {
    ml.addLabels('folktales-labels', currentData || chineseFolktales, {
      field: 'name', size: 12, color: '#222',
    });
  }
  labelsOn = !labelsOn;
}

function fitCurrent() {
  ready && currentData && ml.fitToGeoJSON(currentData);
}

function showSampleRoute() {
  ready && ml.addRoute('sample-route', routeGeoJSON, { color: '#ff5722', width: 5 });
}

// 把当前数据集导出为标准 GeoJSON 文件（浏览器下载）
function exportGeoJSON() {
  const data = currentData || chineseFolktales;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (currentData === worldMyths ? 'world-myths' : 'chinese-folktales') + '.geojson';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
.dot3 { background: #27ae60; }
.hint { color: #888; margin-left: 6px; }
.map { flex: 1; width: 100%; overflow: hidden; }
</style>
