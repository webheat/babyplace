// useEpisodeClock.js — 时间轴的唯一抽象。
//
// H5：自己驱动（rAF / 播放暂停 / 拖动）
// Remotion：由 useCurrentFrame() 传入 frame/fps
//
// 核心约束：地图相机的**结果**只取决于 t。时钟推进到 t=20 时，
// 无论哪个出口、无论中间渲染了多少帧，camAt(keys, 20) 必须给出同一个相机。
// 这是"H5 抽帧 == Remotion 抽帧"这条验收判据成立的前提。

import { ref, onUnmounted, computed } from 'vue';
import { camAt, beatAt, captionAt } from './camera.js';

export function useEpisodeClock(episode) {
  const t = ref(0);
  const playing = ref(false);
  let raf = null;
  let last = 0;

  function tick(now) {
    if (!last) last = now;
    // dt 上限 0.1s：标签页被挂起再恢复时不要一下跳进片尾
    t.value = Math.min(episode.duration_s, t.value + (now - last) / 1000);
    last = now;
    if (t.value >= episode.duration_s) {
      playing.value = false;
      raf = null;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function play() {
    if (playing.value || t.value >= episode.duration_s) return;
    playing.value = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    playing.value = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function toggle() { playing.value ? pause() : play(); }

  /** 拖动进度条。seek 时必须停播，否则会和 rAF 抢 t */
  function seek(v) {
    pause();
    t.value = Math.max(0, Math.min(episode.duration_s, v));
  }

  function restart() { seek(0); play(); }

  onUnmounted(pause);

  // 派生量全部是 computed 纯计算，依赖 t 的变化自然重算
  const camera = computed(() => camAt(episode.camera, t.value));
  const beat = computed(() => beatAt(episode.beats, t.value));
  const caption = computed(() => captionAt(episode.captions, t.value));
  const progress = computed(() =>
    episode.duration_s ? t.value / episode.duration_s : 0
  );

  return { t, playing, camera, beat, caption, progress, play, pause, toggle, seek, restart };
}

/**
 * Remotion 侧的无状态版本：帧号直接决定 t，不维护任何可变状态。
 * 与 useEpisodeClock 返回同构的字段，方便组件复用。
 */
export function useFrameClock(episode, frame, fps) {
  const t = frame / fps;
  return {
    t,
    playing: true,
    camera: camAt(episode.camera, t),
    beat: beatAt(episode.beats, t),
    caption: captionAt(episode.captions, t),
    progress: episode.duration_s ? t / episode.duration_s : 0,
    play() {}, pause() {}, toggle() {}, seek() {}, restart() {},
  };
}