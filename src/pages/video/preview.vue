<template>
  <view class="video-preview">
    <!-- 渲染进度 -->
    <view v-if="!videoUrl" class="progress-container">
      <view class="progress-bar">
        <view class="progress-fill" :style="{ width: (progress * 100) + '%' }"></view>
      </view>
      <text class="progress-text">{{ statusText }}</text>
    </view>

    <!-- 视频播放器 -->
    <video
      v-if="videoUrl"
      :src="videoUrl"
      class="video-player"
      :autoplay="true"
      :loop="true"
      :show-fullscreen-btn="true"
      :show-play-btn="true"
    />

    <!-- 下载进度 -->
    <view v-if="videoUrl && isDownloading" class="download-progress">
      <text class="download-text">正在缓存视频... {{ Math.round(downloadProgress * 100) }}%</text>
      <view class="download-bar">
        <view class="download-fill" :style="{ width: (downloadProgress * 100) + '%' }"></view>
      </view>
    </view>

    <!-- 操作按钮：两个出口 -->
    <view v-if="videoUrl" class="action-buttons">
      <!-- 出口1：保存到本地，用户手工上传视频号 -->
      <button class="save-btn" @tap="saveVideo">
        <text class="btn-icon">💾</text>
        <text class="btn-text">保存到相册</text>
        <text class="btn-hint">手工上传视频号</text>
      </button>

      <!-- 出口2：直接上传小红书 -->
      <button class="upload-btn" @tap="uploadToXiaohongshu" :disabled="!canUploadXHS">
        <text class="btn-icon">📕</text>
        <text class="btn-text">发布到小红书</text>
        <text class="btn-hint">{{ canUploadXHS ? '一键发布' : '暂未开通' }}</text>
      </button>
    </view>

    <!-- 上传小红书弹窗 -->
    <view v-if="showXHSDialog" class="xhs-dialog-mask" @tap="showXHSDialog = false">
      <view class="xhs-dialog" @tap.stop>
        <view class="dialog-header">
          <text class="dialog-title">发布到小红书</text>
          <text class="dialog-close" @tap="showXHSDialog = false">×</text>
        </view>

        <view class="dialog-body">
          <view class="form-item">
            <text class="label">标题</text>
            <input v-model="xhsForm.title" placeholder="输入笔记标题" maxlength="20" />
          </view>

          <view class="form-item">
            <text class="label">描述</text>
            <textarea v-model="xhsForm.content" placeholder="输入笔记描述" maxlength="1000" />
          </view>

          <view class="form-item">
            <text class="label">话题标签</text>
            <view class="tags-input">
              <view v-for="(tag, index) in xhsForm.tags" :key="index" class="tag-item">
                <text>#{{ tag }}</text>
                <text class="tag-delete" @tap="xhsForm.tags.splice(index, 1)">×</text>
              </view>
              <input
                v-if="xhsForm.tags.length < 5"
                v-model="newTag"
                placeholder="添加标签"
                @confirm="addTag"
              />
            </view>
          </view>
        </view>

        <view class="dialog-footer">
          <button class="cancel-btn" @tap="showXHSDialog = false">取消</button>
          <button class="confirm-btn" @tap="confirmUploadXHS" :loading="isUploading">
            {{ isUploading ? '发布中...' : '立即发布' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { waitForRender } from '@/api/video'
import { getXHSStatus, getXHSAuthUrl, publishToXHS } from '@/api/xhs'

const renderId = ref('')
const poiName = ref('')
const videoUrl = ref('')
const videoPath = ref('')
const status = ref('pending')
const progress = ref(0)
const error = ref('')
const downloadProgress = ref(0)
const isDownloading = ref(false)

// 小红书上传相关
const showXHSDialog = ref(false)
const isUploading = ref(false)
const newTag = ref('')
const xhsConfigured = ref(false)
const xhsAuthorized = ref(false)
const xhsForm = reactive({
  title: '',
  content: '',
  tags: ['遛娃', '亲子'],
})

// 检查小红书授权状态
const canUploadXHS = computed(() => xhsConfigured.value && xhsAuthorized.value)

const statusText = computed(() => {
  if (error.value) return `错误: ${error.value}`
  if (status.value === 'processing') return `渲染中... ${Math.round(progress.value * 100)}%`
  if (status.value === 'queued') return '排队中...'
  return '准备中...'
})

onLoad(async (options) => {
  renderId.value = options.renderId || ''
  poiName.value = decodeURIComponent(options.poiName || '遛娃好去处')

  // 并行：等待渲染 + 检查小红书状态
  const promises = []

  if (renderId.value) {
    promises.push(
      waitForRender(renderId.value, ({ status: s, progress: p }) => {
        status.value = s
        progress.value = p
      }).then((result) => {
        if (result.success) {
          videoUrl.value = result.videoUrl
          downloadVideoTemp(result.videoUrl)
        } else {
          error.value = result.error
          uni.showToast({ title: result.error, icon: 'none' })
        }
      })
    )
  }

  // 检查小红书授权状态
  promises.push(
    getXHSStatus().then((res) => {
      xhsConfigured.value = !!res.configured
      xhsAuthorized.value = !!res.authorized
    }).catch(() => {
      xhsConfigured.value = false
      xhsAuthorized.value = false
    })
  )

  await Promise.all(promises)
})

// 预下载视频到临时目录
function downloadVideoTemp(url) {
  isDownloading.value = true
  downloadProgress.value = 0
  const downloadTask = uni.downloadFile({
    url,
    success: (res) => {
      if (res.statusCode === 200) {
        videoPath.value = res.tempFilePath
      }
    },
    fail: (e) => {
      console.error('预下载视频失败:', e)
    },
    complete: () => {
      isDownloading.value = false
    },
  })
  downloadTask.onProgressUpdate((res) => {
    downloadProgress.value = res.progress / 100
  })
}

// ========== 出口1：保存到本地 ==========
function saveVideo() {
  if (!videoPath.value && !videoUrl.value) return

  const doSave = (filePath) => {
    uni.saveVideoToPhotosAlbum({
      filePath,
      success: () => {
        uni.showToast({ title: '已保存到相册', icon: 'success' })
        uni.showModal({
          title: '保存成功',
          content: '视频已保存到相册，您可以打开微信视频号手动发布',
          confirmText: '去视频号',
          cancelText: '知道了',
          success: (res) => {
            if (res.confirm) {
              uni.showToast({ title: '请在微信中打开视频号发布', icon: 'none' })
            }
          },
        })
      },
      fail: (err) => {
        console.error('保存失败:', err)
        uni.showToast({ title: '保存失败', icon: 'none' })
      },
    })
  }

  if (videoPath.value) {
    doSave(videoPath.value)
  } else {
    isDownloading.value = true
    downloadProgress.value = 0
    const downloadTask = uni.downloadFile({
      url: videoUrl.value,
      success: (res) => {
        if (res.statusCode === 200) {
          doSave(res.tempFilePath)
        } else {
          uni.showToast({ title: '视频下载失败', icon: 'none' })
        }
      },
      fail: (err) => {
        console.error('下载视频失败:', err)
        uni.showToast({ title: '视频下载失败，请重试', icon: 'none' })
      },
      complete: () => {
        isDownloading.value = false
      },
    })
    downloadTask.onProgressUpdate((res) => {
      downloadProgress.value = res.progress / 100
    })
  }
}

// ========== 出口2：上传小红书 ==========
async function uploadToXiaohongshu() {
  // 未配置：提示管理员
  if (!xhsConfigured.value) {
    uni.showModal({
      title: '功能未开通',
      content: '小红书发布功能需要配置 API 密钥，如需使用请联系管理员',
      showCancel: false,
    })
    return
  }

  // 已配置但未授权：跳转授权
  if (!xhsAuthorized.value) {
    uni.showModal({
      title: '需要授权',
      content: '需要先授权小红书账号，是否立即授权？',
      confirmText: '去授权',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          const authRes = await getXHSAuthUrl()
          if (authRes.auth_url) {
            // #ifdef H5
            window.location.href = authRes.auth_url
            // #endif
            // #ifndef H5
            uni.setClipboardData({
              data: authRes.auth_url,
              success: () => {
                uni.showToast({ title: '授权链接已复制，请在浏览器中打开', icon: 'none' })
              },
            })
            // #endif
          }
        }
      },
    })
    return
  }

  // 已授权：打开发布弹窗
  xhsForm.title = `${poiName.value} - 遛娃好去处`
  xhsForm.content = `带小朋友来${poiName.value}玩，环境很好，推荐给大家！`
  xhsForm.tags = ['遛娃', '亲子', '周末去哪儿']

  showXHSDialog.value = true
}

function addTag() {
  if (newTag.value && xhsForm.tags.length < 5) {
    xhsForm.tags.push(newTag.value)
    newTag.value = ''
  }
}

async function confirmUploadXHS() {
  if (!xhsForm.title) {
    uni.showToast({ title: '请输入标题', icon: 'none' })
    return
  }

  isUploading.value = true

  try {
    const result = await publishToXHS({
      videoUrl: videoUrl.value,
      title: xhsForm.title,
      content: xhsForm.content,
      tags: xhsForm.tags,
    })

    if (result.status === 'ok') {
      uni.showToast({ title: '发布成功', icon: 'success' })
      showXHSDialog.value = false
    } else {
      throw new Error(result.message || '发布失败')
    }
  } catch (err) {
    uni.showToast({ title: err.message || '发布失败', icon: 'none' })
  } finally {
    isUploading.value = false
  }
}
</script>

<style scoped>
.video-preview {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #000;
}

.progress-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 40rpx;
}

.progress-bar {
  width: 80%;
  height: 12rpx;
  background: #333;
  border-radius: 6rpx;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2563eb, #60a5fa);
  transition: width 0.3s ease;
}

.progress-text {
  color: #fff;
  margin-top: 20rpx;
  font-size: 28rpx;
}

.video-player {
  width: 100%;
  height: 70vh;
}

.download-progress {
  padding: 16rpx 30rpx;
}

.download-text {
  color: #aaa;
  font-size: 24rpx;
  display: block;
  margin-bottom: 8rpx;
  text-align: center;
}

.download-bar {
  height: 8rpx;
  background: #333;
  border-radius: 4rpx;
  overflow: hidden;
}

.download-fill {
  height: 100%;
  background: linear-gradient(90deg, #2563eb, #60a5fa);
  transition: width 0.3s ease;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 30rpx;
}

.save-btn, .upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 120rpx;
  border-radius: 16rpx;
  font-size: 30rpx;
  border: none;
}

.save-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
}

.upload-btn {
  background: linear-gradient(135deg, #ff2442, #ff6b81);
  color: #fff;
}

.upload-btn[disabled] {
  background: #666;
  opacity: 0.6;
}

.btn-icon {
  font-size: 36rpx;
}

.btn-text {
  font-size: 30rpx;
  font-weight: bold;
}

.btn-hint {
  font-size: 22rpx;
  opacity: 0.8;
}

/* 小红书上传弹窗 */
.xhs-dialog-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 999;
}

.xhs-dialog {
  width: 100%;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding: 30rpx;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 20rpx;
  border-bottom: 1rpx solid #eee;
}

.dialog-title {
  font-size: 34rpx;
  font-weight: bold;
}

.dialog-close {
  font-size: 40rpx;
  color: #999;
}

.dialog-body {
  padding: 30rpx 0;
}

.form-item {
  margin-bottom: 30rpx;
}

.form-item .label {
  font-size: 28rpx;
  color: #333;
  margin-bottom: 10rpx;
  display: block;
}

.form-item input, .form-item textarea {
  width: 100%;
  padding: 20rpx;
  background: #f5f5f5;
  border-radius: 12rpx;
  font-size: 28rpx;
}

.form-item textarea {
  height: 200rpx;
}

.tags-input {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.tag-item {
  display: flex;
  align-items: center;
  padding: 10rpx 20rpx;
  background: #fff0f0;
  color: #ff2442;
  border-radius: 20rpx;
  font-size: 24rpx;
}

.tag-delete {
  margin-left: 10rpx;
  color: #999;
}

.dialog-footer {
  display: flex;
  gap: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #eee;
}

.cancel-btn, .confirm-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: 30rpx;
  border: none;
}

.cancel-btn {
  background: #f5f5f5;
  color: #333;
}

.confirm-btn {
  background: #ff2442;
  color: #fff;
}
</style>
