<template>
  <div class="stage" ref="el">
    <div ref="mapEl" class="map" />

    <!-- 字幕：给 4-6 岁读，字要大 -->
    <div class="caption" :class="{ show: captionText }">{{ captionText }}</div>

    <!-- 当前这一幕的标题（朝代 + 器物） -->
    <transition name="fade">
      <div v-if="beat && beat.title" class="era-card" :style="{ '--c': beat.color || '#f59e0b' }">
        <div class="era-label">{{ beat.title }}</div>
        <div v-if="beat.ask_kid" class="ask">💬 {{ beat.ask_kid }}</div>
      </div>
    </transition>

    <!-- 底图署名：真实底图带使用条款，必须常驻 -->
    <div class="credit">{{ episode.credit }}</div>

    <!-- 控制条：幼儿操作，按钮做到 56px -->
    <div class="controls">
      <button class="btn big" @click="restart" aria-label="重头看">⏮</button>
      <button class="btn big play" @click="toggle" aria-label="播放暂停">
        {{ playing ? '⏸' : '▶' }}
      </button>
      <input
        class="scrub" type="range" min="0" :max="episode.duration_s" step="0.1"
        :value="t" @input="seek(+$event.target.value)"
      />
      <div class="time">{{ fmt(t) }} / {{ fmt(episode.duration_s) }}</div>
    </div>

    <div v-if="!ready" class="loading">正在打开地球…</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEpisodeClock } from './useEpisodeClock.js';

const props = defineProps({ episode: { type: Object, required: true } });
const ep = props.episode;
const clock = useEpisodeClock(ep);
const { t, playing, camera, beat, caption, progress, toggle, seek, restart } = clock;

const el = ref(null);
const mapEl = ref(null);
const ready = ref(false);
let map = null;
let raf = null;
let pending = null;          // 下一个要应用的相机
// 调试钩子：验收要能在无头浏览器里定位到任意时刻（seek 后暂停）
window.__seek = (v) => clock.seek(v);
window.__pause = () => clock.pause();

const fmt = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

const captionText = computed(() => caption.value?.text || '');

/**
 * 用 jumpTo 而不是 flyTo。
 * flyTo 是异步动画、由引擎接管时序，同一个 t 两次调用可能落在不同中间态；
 * jumpTo 是瞬时赋值，配合自己算好的 camAt 才能保证「抽第 20 秒 = 同一个画面」。
 */
function applyCamera(c) {
  if (!map) return;
  const wantProj = c.projection || 'mercator';
  if (map.getProjection?.()?.type !== wantProj) {
    map.setProjection({ type: wantProj });
  }
  map.jumpTo({
    center: c.center,
    zoom: c.zoom,
    pitch: c.pitch,
    bearing: c.bearing,
  });
}

/** 时间轴推进 → 重算相机。这是纯函数 t→camera 的唯一消费者。 */
function frame() {
  applyCamera(camera.value);
  raf = requestAnimationFrame(frame);
}

onMounted(() => {
  map = new maplibregl.Map({
    container: mapEl.value,
    style: 'https://tiles.openfreemap.org/styles/dark',
    center: ep.center,
    zoom: 1.6,
    pitch: 0,
    bearing: 0,
    interactive: false,        // 幼儿不需要拖拽，避免误触
    attributionControl: false,
    fadeDuration: 0,
  });
  map.on('load', () => {
    ready.value = true;
    // 调试钩子：无头浏览器里没法从 Vue 内部拿实例，验收要靠它读投影/缩放/俯仰。
    window.__map = map;
    applyCamera(camera.value);
    raf = requestAnimationFrame(frame);
    clock.play();
  });
});

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf);
  map?.remove();
});

// 朝代变化时给一个短暂高亮脉冲（纯 CSS，不进时间轴计算）
watch(beat, (b) => {
  el.value?.setAttribute('data-era', b?.era_order ?? '');
});
</script>

<style scoped>
.stage { position: relative; width: 100vw; height: 100dvh; overflow: hidden; background: #05070d; font-family: -apple-system, "PingFang SC", "Noto Sans SC", sans-serif; }
.map { position: absolute; inset: 0; }

/* 字幕：占屏宽 88%，最小 22px，孩子在手机上也看得清 */
.caption {
  position: absolute; left: 6%; right: 6%; bottom: 96px;
  font-size: clamp(20px, 4.6vw, 34px); line-height: 1.5; font-weight: 600;
  text-align: center; color: #fff; opacity: 0; transition: opacity .22s;
  text-shadow: 0 2px 10px rgba(0,0,0,.95), 0 0 3px rgba(0,0,0,.9);
}
.caption.show { opacity: 1; }

.era-card {
  position: absolute; top: 5%; left: 50%; transform: translateX(-50%);
  padding: 12px 22px; border-radius: 999px;
  background: color-mix(in srgb, var(--c) 26%, #0b1020);
  border: 2px solid var(--c); max-width: 88%; text-align: center;
}
.era-label { font-size: clamp(17px, 3.6vw, 26px); font-weight: 700; color: #fff; }
.ask { margin-top: 6px; font-size: clamp(14px, 3vw, 19px); color: rgba(255,255,255,.88); }

.credit { position: absolute; left: 10px; bottom: 62px; z-index: 5;
  font-size: 11px; color: rgba(255,255,255,.55); text-shadow: 0 1px 3px #000; }

.controls {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 6;
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(to top, rgba(5,7,13,.92), rgba(5,7,13,0));
}
.btn {
  border: 0; background: rgba(255,255,255,.14); color: #fff;
  border-radius: 14px; cursor: pointer; flex: none;
}
.btn.big { width: 56px; height: 56px; font-size: 22px; }
.btn.play { background: #f59e0b; color: #1a1205; }
.scrub { flex: 1; height: 40px; accent-color: #f59e0b; }
.time { font-size: 13px; color: rgba(255,255,255,.75); font-variant-numeric: tabular-nums; flex: none; }

.loading { position: absolute; inset: 0; display: grid; place-items: center;
  color: #fff; font-size: 18px; background: #05070d; z-index: 9; }

.fade-enter-active, .fade-leave-active { transition: opacity .3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>