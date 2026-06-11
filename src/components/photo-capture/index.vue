<template>
  <view class="photo-capture">
    <view class="photo-grid">
      <view v-for="(photo, index) in photos" :key="index" class="photo-item">
        <image :src="photo.tempPath" mode="aspectFill" class="photo-img" />
        <view class="delete-btn" @tap="deletePhoto(index)">
          <text class="delete-icon">×</text>
        </view>
      </view>
      <view v-if="photos.length < maxCount" class="add-btn" @tap="takePhoto">
        <text class="icon">📷</text>
        <text class="hint">{{ photos.length }}/{{ maxCount }}</text>
      </view>
    </view>
    <view v-if="photos.length > 0" class="photo-tip">
      <text v-if="photos.length < 3" class="tip-text">还需拍摄 {{ 3 - photos.length }} 张照片才能生成视频</text>
      <text v-else class="tip-text tip-ok">已选择 {{ photos.length }} 张照片</text>
    </view>
    <button v-if="photos.length >= 3" class="generate-btn" @tap="onGenerate">
      🎬 生成遛娃视频
    </button>
  </view>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  maxCount: { type: Number, default: 5 },
  poiName: { type: String, default: '' },
  poiAddress: { type: String, default: '' },
})

const emit = defineEmits(['generate'])
const photos = ref([])

function takePhoto() {
  const remaining = props.maxCount - photos.value.length
  if (remaining <= 0) return

  uni.chooseImage({
    count: remaining,
    sourceType: ['camera'],
    sizeType: ['compressed'],
    success: (res) => {
      const newPhotos = (res.tempFiles || []).map(f => ({
        tempPath: f.path,
        size: f.size,
      }))
      photos.value.push(...newPhotos)
    },
  })
}

function deletePhoto(index) {
  photos.value.splice(index, 1)
}

function onGenerate() {
  if (photos.value.length < 3) {
    uni.showToast({ title: '请至少拍摄3张照片', icon: 'none' })
    return
  }
  emit('generate', {
    photos: photos.value,
    poiName: props.poiName,
    poiAddress: props.poiAddress,
  })
}
</script>

<style scoped>
.photo-capture {
  padding: 30rpx;
}

.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.photo-item {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  border-radius: 16rpx;
  overflow: hidden;
}

.photo-img {
  width: 100%;
  height: 100%;
}

.delete-btn {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.delete-icon {
  color: #fff;
  font-size: 28rpx;
  line-height: 1;
}

.add-btn {
  width: 200rpx;
  height: 200rpx;
  border-radius: 16rpx;
  border: 2rpx dashed #d1d5db;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
}

.add-btn .icon {
  font-size: 48rpx;
  margin-bottom: 10rpx;
}

.add-btn .hint {
  font-size: 22rpx;
  color: #9ca3af;
}

.photo-tip {
  margin-top: 20rpx;
  text-align: center;
}

.tip-text {
  font-size: 24rpx;
  color: #f59e0b;
}

.tip-ok {
  color: #10b981;
}

.generate-btn {
  margin-top: 30rpx;
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
  border: none;
}

.generate-btn::after {
  border: none;
}
</style>
