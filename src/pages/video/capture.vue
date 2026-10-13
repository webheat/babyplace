<template>
  <view class="capture-page">
    <view class="header">
      <text class="poi-name">{{ poiName }}</text>
      <text class="poi-address">{{ poiAddress }}</text>
    </view>

    <photo-capture
      :max-count="5"
      :poi-name="poiName"
      :poi-address="poiAddress"
      @generate="handleGenerate"
    />

    <!-- AI 风格选择 -->
    <view class="style-section">
      <text class="section-title">选择风格</text>
      <scroll-view scroll-x class="style-list">
        <view
          v-for="style in styles"
          :key="style.id"
          :class="['style-item', { active: selectedStyle === style.id }]"
          @tap="selectedStyle = style.id"
        >
          <text class="style-icon">{{ style.icon }}</text>
          <text class="style-name">{{ style.name }}</text>
        </view>
      </scroll-view>
    </view>

    <!-- AI 增强进度弹窗 -->
    <view v-if="enhancing" class="enhance-mask">
      <view class="enhance-dialog">
        <text class="enhance-title">{{ enhancePhase }}</text>
        <view class="enhance-progress-bar">
          <view class="enhance-progress-fill" :style="{ width: (enhanceProgress * 100) + '%' }"></view>
        </view>
        <text class="enhance-progress-text">{{ Math.round(enhanceProgress * 100) }}%</text>
        <text class="enhance-detail">{{ enhanceDetail }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import PhotoCapture from '@/components/photo-capture/index.vue'
import { uploadImage, uploadAndEnhance, renderVideo } from '@/api/video'

const poiId = ref('')
const poiName = ref('')
const poiAddress = ref('')
const selectedStyle = ref('enhance')

// AI 增强进度状态
const enhancing = ref(false)
const enhancePhase = ref('')
const enhanceProgress = ref(0)
const enhanceDetail = ref('')

const styles = [
  { id: 'enhance', name: '高清增强', icon: '✨' },
  { id: 'cartoon', name: '卡通风格', icon: '🎨' },
  { id: 'watercolor', name: '水彩风格', icon: '🖌️' },
  { id: 'sketch', name: '素描风格', icon: '✏️' },
]

onLoad((options) => {
  poiId.value = options.poiId || ''
  poiName.value = decodeURIComponent(options.poiName || '')
  poiAddress.value = decodeURIComponent(options.poiAddress || '')
})

// 带进度的图片增强：逐张处理
async function enhanceWithProgress(imageUrls, style) {
  const enhancedImages = []
  const total = imageUrls.length

  for (let i = 0; i < total; i++) {
    enhancePhase.value = 'AI 增强中'
    enhanceProgress.value = (i + 0.5) / total  // 开始处理时显示一半进度
    enhanceDetail.value = `正在处理第 ${i + 1}/${total} 张图片...`

    const result = await uploadAndEnhance([imageUrls[i]], style)

    if (result.code !== 0) {
      throw new Error(result.message || `第 ${i + 1} 张图片增强失败`)
    }

    enhancedImages.push(...result.data.images)

    enhanceProgress.value = (i + 1) / total  // 完成后显示完整进度
    enhanceDetail.value = `已完成 ${i + 1}/${total} 张图片`
  }

  return enhancedImages
}

async function handleGenerate({ photos }) {
  if (photos.length < 3) {
    uni.showToast({ title: '请至少拍摄3张照片', icon: 'none' })
    return
  }

  enhancing.value = true

  try {
    // 1. 上传照片到云存储
    enhancePhase.value = '上传照片中'
    enhanceProgress.value = 0
    enhanceDetail.value = `正在上传 ${photos.length} 张照片...`

    const uploadedUrls = []
    for (let i = 0; i < photos.length; i++) {
      enhanceProgress.value = (i + 0.5) / photos.length
      enhanceDetail.value = `正在上传第 ${i + 1}/${photos.length} 张...`

      const result = await uploadImage(photos[i].tempPath)
      if (result.code !== 0) {
        throw new Error(result.message || `第 ${i + 1} 张图片上传失败`)
      }
      uploadedUrls.push(result.data.url)

      enhanceProgress.value = (i + 1) / photos.length
      enhanceDetail.value = `已上传 ${i + 1}/${photos.length} 张`
    }

    // 2. AI 增强图片（逐张，有进度）
    const enhancedImages = await enhanceWithProgress(uploadedUrls, selectedStyle.value)

    // 3. 提交渲染
    enhancePhase.value = '提交渲染任务'
    enhanceProgress.value = 0.9
    enhanceDetail.value = '正在提交到渲染服务器...'

    const renderResult = await renderVideo({
      images: enhancedImages,
      poiName: poiName.value,
      poiAddress: poiAddress.value,
      tags: ['亲子', '遛娃', '推荐'],
    })

    if (renderResult.code !== 0) {
      throw new Error(renderResult.message)
    }

    enhanceProgress.value = 1
    enhanceDetail.value = '完成！正在跳转...'

    // 4. 跳转到预览页
    setTimeout(() => {
      uni.redirectTo({
        url: `/pages/video/preview?renderId=${renderResult.data.renderId}&poiName=${encodeURIComponent(poiName.value)}`,
      })
    }, 500)

  } catch (error) {
    uni.showToast({ title: error.message || '处理失败', icon: 'none' })
    enhancing.value = false
  }
}
</script>

<style scoped>
.capture-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  padding: 30rpx;
  background: #fff;
  border-bottom: 1rpx solid #e5e7eb;
}

.poi-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #1f2937;
  display: block;
}

.poi-address {
  font-size: 26rpx;
  color: #6b7280;
  margin-top: 10rpx;
  display: block;
}

.style-section {
  padding: 30rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #374151;
  margin-bottom: 20rpx;
  display: block;
}

.style-list {
  white-space: nowrap;
}

.style-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 30rpx;
  margin-right: 20rpx;
  background: #fff;
  border-radius: 16rpx;
  border: 2rpx solid #e5e7eb;
}

.style-item.active {
  border-color: #2563eb;
  background: #eff6ff;
}

.style-icon {
  font-size: 40rpx;
  margin-bottom: 10rpx;
}

.style-name {
  font-size: 24rpx;
  color: #374151;
}

/* AI 增强进度弹窗 */
.enhance-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.enhance-dialog {
  width: 80%;
  background: #fff;
  border-radius: 24rpx;
  padding: 50rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.enhance-title {
  font-size: 34rpx;
  font-weight: bold;
  color: #1f2937;
  margin-bottom: 40rpx;
}

.enhance-progress-bar {
  width: 100%;
  height: 16rpx;
  background: #e5e7eb;
  border-radius: 8rpx;
  overflow: hidden;
}

.enhance-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2563eb, #60a5fa);
  transition: width 0.3s ease;
  border-radius: 8rpx;
}

.enhance-progress-text {
  font-size: 48rpx;
  font-weight: bold;
  color: #2563eb;
  margin-top: 24rpx;
}

.enhance-detail {
  font-size: 26rpx;
  color: #6b7280;
  margin-top: 16rpx;
}
</style>
