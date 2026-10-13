import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './',                 // 静态产物丢到任意目录都能跑（nginx 子路径 / CDN）
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',        // esbuild 能处理 MapLibre 的现代语法
    chunkSizeWarningLimit: 1600,
  },
  server: { host: '0.0.0.0', port: 5188 },
});