import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/manage/',
  build: {
    outDir: '../static/manage',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/manage/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
      '/babyplace-admin': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
})
