<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { createAdminItem, listAdminItems, removeAdminItem, updateAdminItem } from '../../api/admin'
import { clearLoginState, getWechatLoginConfigStatus, hasValidUniIdToken, setLoginTime, startH5WeixinLogin } from '../../utils/auth'

const uniIdCo = uniCloud.importObject('uni-id-co', { customUI: true })

const MODULE_OPTIONS = [
  { key: 'poi', label: '地点' },
  { key: 'article', label: '文章' },
  { key: 'source', label: '内容来源' },
  { key: 'review', label: '用户评价' },
]

const loading = ref(false)
const submitting = ref(false)
const wechatLoggingIn = ref(false)
const wechatScriptLoading = ref(false)
const errorMessage = ref('')
const items = ref([])
const keyword = ref('')
const activeModule = ref('poi')
const editingId = ref('')
const isLoggedIn = ref(true)
const loginStatusText = computed(() => isLoggedIn.value ? '已登录' : '未登录')
const { webAppId } = getWechatLoginConfigStatus()

const isWeixinBrowser = computed(() => {
  // #ifdef H5
  return /MicroMessenger/i.test(window.navigator.userAgent || '')
  // #endif
  return false
})

const createEmptyForms = () => ({
  poi: {
    name: '',
    city: '',
    district: '',
    address: '',
    lat: '',
    lng: '',
    category: 'mixed',
    status: 'draft',
    summary: '',
  },
  article: {
    title: '',
    source_account: '',
    url: '',
    status: 'pending',
    parse_confidence: '0',
    extracted_poi_names: '',
  },
  source: {
    poi_id: '',
    article_id: '',
    source_type: 'article',
    confidence_score: '0.8',
    is_primary: 'false',
    status: 'active',
    quoted_text: '',
    support_fields: '',
  },
  review: {
    poi_id: '',
    nickname: '',
    rating: '5',
    status: 'pending',
    comment: '',
    tags: '',
  },
})
const forms = reactive(createEmptyForms())

function csvToArray(value) {
  return String(value || '')
    .split(/[,\n，]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function resetForm() {
  editingId.value = ''
  Object.assign(forms, createEmptyForms())
}

function syncLoginState() {
  const valid = hasValidUniIdToken()
  isLoggedIn.value = valid
  if (!valid) clearLoginState()
}

function buildPayload() {
  const moduleKey = activeModule.value
  if (moduleKey === 'poi') {
    return {
      name: String(forms.poi.name || '').trim(),
      city: String(forms.poi.city || '').trim(),
      district: String(forms.poi.district || '').trim(),
      address: String(forms.poi.address || '').trim(),
      location: {
        lat: Number(forms.poi.lat),
        lng: Number(forms.poi.lng),
      },
      category: String(forms.poi.category || 'mixed').trim(),
      status: String(forms.poi.status || 'draft').trim(),
      summary: String(forms.poi.summary || '').trim(),
    }
  }
  if (moduleKey === 'article') {
    return {
      title: String(forms.article.title || '').trim(),
      source_account: String(forms.article.source_account || '').trim(),
      url: String(forms.article.url || '').trim(),
      status: String(forms.article.status || 'pending').trim(),
      parse_confidence: Number(forms.article.parse_confidence),
      extracted_poi_names: csvToArray(forms.article.extracted_poi_names),
    }
  }
  if (moduleKey === 'source') {
    return {
      poi_id: String(forms.source.poi_id || '').trim(),
      article_id: String(forms.source.article_id || '').trim(),
      source_type: String(forms.source.source_type || 'article').trim(),
      confidence_score: Number(forms.source.confidence_score),
      is_primary: String(forms.source.is_primary || '').trim() === 'true',
      status: String(forms.source.status || 'active').trim(),
      quoted_text: String(forms.source.quoted_text || '').trim(),
      support_fields: csvToArray(forms.source.support_fields),
    }
  }
  return {
    poi_id: String(forms.review.poi_id || '').trim(),
    nickname: String(forms.review.nickname || '').trim(),
    rating: Number(forms.review.rating),
    status: String(forms.review.status || 'pending').trim(),
    comment: String(forms.review.comment || '').trim(),
    tags: csvToArray(forms.review.tags),
  }
}

function validatePayload(payload) {
  if (activeModule.value === 'poi') {
    if (!payload.name || !payload.city || !payload.district) return '请填写地点名称、城市、行政区'
    if (!Number.isFinite(payload.location.lat) || !Number.isFinite(payload.location.lng)) return '请填写正确经纬度'
    return ''
  }
  if (activeModule.value === 'article') {
    if (!payload.title || !payload.source_account) return '请填写文章标题和公众号名称'
    return ''
  }
  if (activeModule.value === 'source') {
    if (!payload.poi_id || !payload.article_id) return '请填写地点ID和文章ID'
    return ''
  }
  if (!payload.poi_id) return '请填写地点ID'
  if (!Number.isInteger(payload.rating) || payload.rating < 1 || payload.rating > 5) return '评分需为 1-5'
  return ''
}

function formatPoiLocation(item) {
  const lat = Number(item?.location?.lat)
  const lng = Number(item?.location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '--'
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

function getItemTitle(item) {
  if (activeModule.value === 'poi') return item.name || '未命名地点'
  if (activeModule.value === 'article') return item.title || '未命名文章'
  if (activeModule.value === 'source') return `${item.poi_id || '-'} -> ${item.article_id || '-'}`
  return `${item.nickname || '匿名用户'} ${item.rating || 0}星`
}

function getItemMeta(item) {
  if (activeModule.value === 'poi') return `${item.city || '-'} ${item.district || '-'} | ${formatPoiLocation(item)}`
  if (activeModule.value === 'article') return `${item.source_account || '-'} | 状态: ${item.status || '-'}`
  if (activeModule.value === 'source') return `${item.source_type || '-'} | 置信度: ${item.confidence_score ?? '-'}`
  return `${item.poi_id || '-'} | 状态: ${item.status || '-'}`
}

function fillForm(item) {
  editingId.value = item._id || ''
  const moduleKey = activeModule.value
  if (moduleKey === 'poi') {
    Object.assign(forms.poi, {
      name: item.name || '',
      city: item.city || '',
      district: item.district || '',
      address: item.address || '',
      lat: item.location?.lat ?? '',
      lng: item.location?.lng ?? '',
      category: item.category || 'mixed',
      status: item.status || 'draft',
      summary: item.summary || '',
    })
  } else if (moduleKey === 'article') {
    Object.assign(forms.article, {
      title: item.title || '',
      source_account: item.source_account || '',
      url: item.url || '',
      status: item.status || 'pending',
      parse_confidence: item.parse_confidence ?? '0',
      extracted_poi_names: (item.extracted_poi_names || []).join(','),
    })
  } else if (moduleKey === 'source') {
    Object.assign(forms.source, {
      poi_id: item.poi_id || '',
      article_id: item.article_id || '',
      source_type: item.source_type || 'article',
      confidence_score: item.confidence_score ?? '0.8',
      is_primary: String(Boolean(item.is_primary)),
      status: item.status || 'active',
      quoted_text: item.quoted_text || '',
      support_fields: (item.support_fields || []).join(','),
    })
  } else {
    Object.assign(forms.review, {
      poi_id: item.poi_id || '',
      nickname: item.nickname || '',
      rating: item.rating ?? '5',
      status: item.status || 'pending',
      comment: item.comment || '',
      tags: (item.tags || []).join(','),
    })
  }
  uni.pageScrollTo({ scrollTop: 0, duration: 180 })
}

async function loadItems() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await listAdminItems(activeModule.value, { keyword: keyword.value, page: 1, pageSize: 100 })
    if (result.code !== 0) throw new Error(result.message || '加载失败')
    items.value = result.data.list || []
  } catch (error) {
    items.value = []
    errorMessage.value = error.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function submitForm() {
  const payload = buildPayload()
  const error = validatePayload(payload)
  if (error) return uni.showToast({ title: error, icon: 'none' })
  submitting.value = true
  try {
    const result = editingId.value
      ? await updateAdminItem(activeModule.value, editingId.value, payload)
      : await createAdminItem(activeModule.value, payload)
    if (result.code !== 0) throw new Error(result.message || '保存失败')
    uni.showToast({ title: editingId.value ? '已保存' : '已新增', icon: 'success' })
    resetForm()
    await loadItems()
  } catch (e) {
    uni.showModal({ title: '保存失败', content: e.message || '请稍后重试', showCancel: false })
  } finally {
    submitting.value = false
  }
}

function handleRemove(item) {
  uni.showModal({
    title: '确认删除',
    content: `确认删除「${getItemTitle(item)}」吗？`,
    success: async ({ confirm }) => {
      if (!confirm) return
      try {
        const result = await removeAdminItem(activeModule.value, item._id)
        if (result.code !== 0) throw new Error(result.message || '删除失败')
        if (editingId.value === item._id) resetForm()
        uni.showToast({ title: '已删除', icon: 'success' })
        await loadItems()
      } catch (e) {
        uni.showModal({ title: '删除失败', content: e.message || '请稍后重试', showCancel: false })
      }
    },
  })
}

function switchModule(moduleKey) {
  if (activeModule.value === moduleKey) return
  activeModule.value = moduleKey
  keyword.value = ''
  resetForm()
  loadItems()
}

function openWechatLogin() {
  startH5WeixinLogin({ redirectPath: '/admin' })
}

function openEventDashboard() {
  uni.navigateTo({ url: '/pages/admin/events' })
}

function loadWechatLoginScript() {
  // #ifdef H5
  if (window.WxLogin) return Promise.resolve()
  if (wechatScriptLoading.value) {
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (window.WxLogin) {
          clearInterval(timer)
          resolve()
        }
      }, 150)
    })
  }
  wechatScriptLoading.value = true
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js'
    script.async = true
    script.onload = () => { wechatScriptLoading.value = false; resolve() }
    script.onerror = () => { wechatScriptLoading.value = false; reject(new Error('微信扫码脚本加载失败')) }
    document.body.appendChild(script)
  })
  // #endif
  return Promise.resolve()
}

async function renderWechatLoginWidget() {
  if (isLoggedIn.value || isWeixinBrowser.value) return
  // #ifdef H5
  try {
    await loadWechatLoginScript()
    await nextTick()
    const mountNode = document.getElementById('wx-login-qrcode')
    if (!mountNode || !window.WxLogin || !webAppId) return
    mountNode.innerHTML = ''
    const currentUrl = encodeURIComponent('https://ds.aixifs.com/?target=/admin')
    new window.WxLogin({ self_redirect: false, id: 'wx-login-qrcode', appid: webAppId, scope: 'snsapi_login', redirect_uri: currentUrl, state: 'babyplace_admin', style: 'black', href: '' })
  } catch (error) {
    uni.showModal({ title: '微信二维码加载失败', content: error.message || '请稍后重试', showCancel: false })
  }
  // #endif
}

async function consumeWechatCode(code) {
  if (!code || wechatLoggingIn.value) return
  wechatLoggingIn.value = true
  uni.showLoading({ title: '微信登录中', mask: true })
  try {
    const result = await uniIdCo.loginByWeixin({ code })
    if (result.token) { uni.setStorageSync('uni_id_token', result.token); setLoginTime() }
    if (typeof result.tokenExpired !== 'undefined') uni.setStorageSync('uni_id_token_expired', result.tokenExpired || 0)
    if (result.refreshToken) uni.setStorageSync('uni_id_refresh_token', result.refreshToken)
    syncLoginState()
    uni.showToast({ title: '登录成功', icon: 'success' })
    await loadItems()
    // #ifdef H5
    window.location.replace('/#/pages/admin/index')
    // #endif
    // #ifndef H5
    uni.reLaunch({ url: '/pages/admin/index' })
    // #endif
  } catch (error) {
    uni.showModal({ title: '微信登录失败', content: error.message || '请检查微信配置', showCancel: false })
  } finally {
    wechatLoggingIn.value = false
    uni.hideLoading()
  }
}

function handleLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确认退出登录吗？',
    success: ({ confirm }) => {
      if (!confirm) return
      clearLoginState()
      isLoggedIn.value = false
      items.value = []
      resetForm()
      renderWechatLoginWidget()
      uni.showToast({ title: '已退出', icon: 'success' })
    },
  })
}

onLoad((options) => {
  syncLoginState()
  if (options?.code) consumeWechatCode(options.code)
})

onMounted(() => {
  syncLoginState()
  loadItems()
  if (!isLoggedIn.value) renderWechatLoginWidget()
})
</script>

<template>
  <view class="page">
    <view class="toolbar">
      <text class="status">{{ loginStatusText }}</text>
      <button v-if="isLoggedIn" class="button logout" size="mini" @click="handleLogout">退出登录</button>
      <button v-else class="button" size="mini" @click="openWechatLogin">微信登录</button>
    </view>

    <view v-if="!isLoggedIn" class="login-panel">
      <view id="wx-login-qrcode" class="qrcode-container"></view>
      <text class="hint">请使用微信扫码登录</text>
    </view>

    <view v-else class="admin-content">
      <view class="quick-actions">
        <button class="button analytics-btn" size="mini" @click="openEventDashboard">查看联盟埋点</button>
      </view>

      <scroll-view class="module-tabs" scroll-x enable-flex>
        <view v-for="module in MODULE_OPTIONS" :key="module.key" class="tab-item" :class="{ active: activeModule === module.key }" @click="switchModule(module.key)">{{ module.label }}</view>
      </scroll-view>

      <view class="form-section">
        <text class="section-title">{{ editingId ? '编辑' : '新增' }}{{ MODULE_OPTIONS.find(x => x.key === activeModule)?.label }}</text>
        <view class="form-grid">
          <template v-if="activeModule === 'poi'">
            <input v-model="forms.poi.name" class="input" placeholder="地点名称" />
            <input v-model="forms.poi.city" class="input" placeholder="城市" />
            <input v-model="forms.poi.district" class="input" placeholder="行政区" />
            <input v-model="forms.poi.address" class="input" placeholder="地址" />
            <input v-model="forms.poi.lat" class="input" placeholder="纬度" type="digit" />
            <input v-model="forms.poi.lng" class="input" placeholder="经度" type="digit" />
            <input v-model="forms.poi.category" class="input" placeholder="分类: park/mall/..." />
            <input v-model="forms.poi.status" class="input" placeholder="状态: draft/published/archived" />
            <input v-model="forms.poi.summary" class="input full" placeholder="摘要" />
          </template>
          <template v-else-if="activeModule === 'article'">
            <input v-model="forms.article.title" class="input full" placeholder="文章标题" />
            <input v-model="forms.article.source_account" class="input" placeholder="公众号名称" />
            <input v-model="forms.article.status" class="input" placeholder="状态: pending/parsed/review/discarded" />
            <input v-model="forms.article.parse_confidence" class="input" placeholder="置信度 0-1" type="digit" />
            <input v-model="forms.article.url" class="input full" placeholder="原文链接" />
            <input v-model="forms.article.extracted_poi_names" class="input full" placeholder="提取地点，逗号分隔" />
          </template>
          <template v-else-if="activeModule === 'source'">
            <input v-model="forms.source.poi_id" class="input" placeholder="地点ID" />
            <input v-model="forms.source.article_id" class="input" placeholder="文章ID" />
            <input v-model="forms.source.source_type" class="input" placeholder="类型: article/review/manual" />
            <input v-model="forms.source.status" class="input" placeholder="状态: active/inactive" />
            <input v-model="forms.source.confidence_score" class="input" placeholder="置信度 0-1" type="digit" />
            <input v-model="forms.source.is_primary" class="input" placeholder="主来源 true/false" />
            <input v-model="forms.source.quoted_text" class="input full" placeholder="引用摘要" />
            <input v-model="forms.source.support_fields" class="input full" placeholder="支撑字段，逗号分隔" />
          </template>
          <template v-else>
            <input v-model="forms.review.poi_id" class="input" placeholder="地点ID" />
            <input v-model="forms.review.nickname" class="input" placeholder="昵称" />
            <input v-model="forms.review.rating" class="input" placeholder="评分 1-5" type="number" />
            <input v-model="forms.review.status" class="input" placeholder="状态: pending/approved/rejected" />
            <input v-model="forms.review.comment" class="input full" placeholder="评论内容" />
            <input v-model="forms.review.tags" class="input full" placeholder="标签，逗号分隔" />
          </template>
        </view>
        <view class="form-actions">
          <button v-if="editingId" class="button secondary" @click="resetForm">取消编辑</button>
          <button class="button primary" :loading="submitting" @click="submitForm">{{ editingId ? '保存' : '新增' }}</button>
        </view>
      </view>

      <view class="list-section">
        <view class="list-header">
          <text class="section-title">列表 ({{ items.length }})</text>
          <input v-model="keyword" class="search" placeholder="搜索" @confirm="loadItems" />
        </view>
        <view v-if="loading" class="state">加载中...</view>
        <view v-else-if="errorMessage" class="state error">{{ errorMessage }}</view>
        <view v-else-if="!items.length" class="state">暂无数据</view>
        <view v-else class="item-list">
          <view v-for="item in items" :key="item._id" class="item-card">
            <view class="item-info">
              <text class="item-title">{{ getItemTitle(item) }}</text>
              <text class="item-meta">{{ getItemMeta(item) }}</text>
            </view>
            <view class="item-actions">
              <button class="action-btn" size="mini" @click="fillForm(item)">编辑</button>
              <button class="action-btn danger" size="mini" @click="handleRemove(item)">删除</button>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.page { min-height: 100vh; padding: 24rpx; background: #f5f5f5; }
.toolbar { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 24rpx; margin-bottom: 24rpx; background: #fff; border-radius: 16rpx; }
.status { font-size: 28rpx; color: #333; }
.button { padding: 12rpx 24rpx; font-size: 26rpx; border-radius: 8rpx; }
.logout { background: #ff4d4f; color: #fff; }
.login-panel { display: flex; flex-direction: column; align-items: center; padding: 60rpx 0; }
.qrcode-container { width: 300rpx; height: 300rpx; margin-bottom: 24rpx; }
.hint { font-size: 28rpx; color: #666; }
.admin-content { display: flex; flex-direction: column; gap: 24rpx; }
.quick-actions { display: flex; justify-content: flex-end; }
.analytics-btn { margin: 0; background: #2563eb; color: #fff; }
.module-tabs { display: flex; white-space: nowrap; background: #fff; border-radius: 16rpx; padding: 10rpx; }
.tab-item { display: inline-flex; align-items: center; justify-content: center; min-width: 160rpx; padding: 14rpx 20rpx; margin-right: 10rpx; border-radius: 10rpx; background: #f2f2f2; color: #666; font-size: 26rpx; }
.tab-item.active { background: #1890ff; color: #fff; }
.form-section, .list-section { padding: 24rpx; background: #fff; border-radius: 16rpx; }
.section-title { display: block; margin-bottom: 20rpx; font-size: 32rpx; font-weight: 600; color: #333; }
.form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16rpx; }
.input { padding: 16rpx; font-size: 26rpx; border: 2rpx solid #e8e8e8; border-radius: 8rpx; background: #fff; }
.full { grid-column: span 2; }
.form-actions { display: flex; gap: 16rpx; margin-top: 24rpx; }
.primary { background: #1890ff; color: #fff; }
.secondary { background: #f0f0f0; color: #666; }
.list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx; }
.search { width: 240rpx; padding: 12rpx 16rpx; font-size: 26rpx; border: 2rpx solid #e8e8e8; border-radius: 8rpx; }
.state { padding: 40rpx; text-align: center; font-size: 28rpx; color: #999; }
.error { color: #ff4d4f; }
.item-list { display: flex; flex-direction: column; gap: 16rpx; }
.item-card { display: flex; align-items: center; justify-content: space-between; padding: 20rpx; background: #fafafa; border-radius: 12rpx; }
.item-info { display: flex; flex-direction: column; gap: 6rpx; flex: 1; }
.item-title { font-size: 28rpx; font-weight: 500; color: #333; }
.item-meta { font-size: 24rpx; color: #666; }
.item-actions { display: flex; gap: 12rpx; }
.action-btn { padding: 8rpx 16rpx; font-size: 24rpx; background: #1890ff; color: #fff; border-radius: 6rpx; }
.danger { background: #ff4d4f; }
</style>
