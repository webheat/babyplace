// camera.js — 相机插值。H5 与 Remotion 共用的**纯函数**。
//
// 为什么必须纯：两个出口读同一份 episode.json，用同一套插值算相机，
// 抽同一秒的一帧必须像素级一致。这里一旦引入 rAF / 定时器 / 全局状态，
// 同步保证就没了。传入 t，拿到 camera，结束。

/**
 * @param {number} t 当前时间（秒）
 * @param {Array}  keys episode.camera，已按 t 升序
 * @returns {{center:[number,number], zoom:number, pitch:number, bearing:number, projection:string}}
 */
export function camAt(keys, t) {
  if (!keys || !keys.length) {
    throw new Error('camAt: episode.camera 为空');
  }
  if (t <= keys[0].t) return keys[0];
  const last = keys[keys.length - 1];
  if (t >= last.t) return last;

  // 找到 t 落在哪两个关键帧之间
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const p = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
  const k = easeInOutCubic(p);

  // 投影只能切一次。MapLibre 的 globe↔mercator 是全局重投影，中途切换会让
  // 同一 center 的屏幕位置突变；所以取 a 的投影直到该段走完。
  const proj = k > 0.5 ? b.projection : a.projection;

  return {
    center: [lerp(a.center[0], b.center[0], k), lerp(a.center[1], b.center[1], k)],
    zoom: lerp(a.zoom, b.zoom, k),
    pitch: lerp(a.pitch, b.pitch, k),
    bearing: lerp(a.bearing, b.bearing, k),
    projection: proj || 'mercator',
  };
}

/** easeInOutCubic —— 与 Remotion 的 interpolate + Easing.inOut(Easing.cubic) 等价 */
export function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * 当前时间落在哪个 beat 上。没有则返回 null。
 * beat 的 t/dur 由 tts_episode.py 按真实音频时长回填，不以初值为准。
 */
export function beatAt(beats, t) {
  if (!beats || !beats.length) return null;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const end = i + 1 < beats.length ? beats[i + 1].t : Infinity;
    if (t >= b.t && t < end) return b;
  }
  return t >= beats[beats.length - 1].t ? beats[beats.length - 1] : null;
}

/** 当前时间该显示哪句字幕。没有则 null。 */
export function captionAt(captions, t) {
  if (!captions) return null;
  for (const c of captions) if (t >= c.start && t < c.end) return c;
  return null;
}