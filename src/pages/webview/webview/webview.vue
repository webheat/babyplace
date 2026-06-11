<template>
  <web-view :src="url" @message="onMessage" @load="onWebviewLoad" @error="onError"></web-view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const url = ref('')

onLoad((options) => {
  url.value = decodeURIComponent(options.url || '')
})

function onMessage(e) {
  // 接收 web-view 内页面 postMessage 发送的数据
  console.log('[webview] onMessage:', e.detail?.data)
}

function onWebviewLoad() {
  console.log('[webview] loaded:', url.value)
}

function onError(e) {
  console.error('[webview] error:', e.detail)
  uni.showToast({ title: '页面加载失败', icon: 'none' })
  setTimeout(() => {
    uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/index/index' }) })
  }, 1500)
}
</script>

<style scoped>
/* web-view 组件默认占满全屏，无需额外样式 */
</style>
