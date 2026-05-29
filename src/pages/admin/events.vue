<script setup>
import { computed, onMounted, ref } from 'vue'
import { getRestaurantDashboard } from '@/api/restaurant'

const loading = ref(false)
const errorMessage = ref('')
const rangeDays = ref(7)
const eventFilter = ref('')
const dashboard = ref({
  days: 7,
  summary: {
    total: 0,
    restaurant_click: 0,
    meituan_jump_click: 0,
    conversion_rate: 0,
  },
  by_day: [],
  by_platform: [],
  top_restaurants: [],
  top_pois: [],
  recent: [],
})

const rangeOptions = [
  { label: '近7天', value: 7 },
  { label: '近30天', value: 30 },
]

const filterOptions = [
  { label: '全部事件', value: '' },
  { label: '餐厅点击', value: 'restaurant_click' },
  { label: '联盟跳转', value: 'meituan_jump_click' },
]

const metricCards = computed(() => ([
  { label: '总事件数', value: dashboard.value.summary?.total || 0 },
  { label: '餐厅点击', value: dashboard.value.summary?.restaurant_click || 0 },
  { label: '联盟跳转', value: dashboard.value.summary?.meituan_jump_click || 0 },
  { label: '跳转率', value: `${Number(dashboard.value.summary?.conversion_rate || 0).toFixed(2)}%` },
]))

function formatDateTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

async function loadDashboard() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await getRestaurantDashboard({
      days: rangeDays.value,
      event_name: eventFilter.value,
      page_size: 200,
    })
    if (result.code !== 0) throw new Error(result.message || '加载失败')
    dashboard.value = result.data || dashboard.value
  } catch (error) {
    errorMessage.value = error.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function handleRangeChange(days) {
  if (rangeDays.value === days) return
  rangeDays.value = days
  loadDashboard()
}

function handleFilterChange(value) {
  if (eventFilter.value === value) return
  eventFilter.value = value
  loadDashboard()
}

onMounted(() => {
  loadDashboard()
})
</script>

<template>
  <view class="page">
    <view class="toolbar">
      <view>
        <text class="page-title">联盟埋点看板</text>
        <text class="page-subtitle">查看最近点击量、跳转量和热点餐厅</text>
      </view>
      <button class="refresh-btn" size="mini" :loading="loading" @click="loadDashboard">刷新</button>
    </view>

    <view class="panel">
      <text class="section-title">时间范围</text>
      <view class="chip-row">
        <view
          v-for="item in rangeOptions"
          :key="item.value"
          class="chip"
          :class="{ active: rangeDays === item.value }"
          @click="handleRangeChange(item.value)"
        >
          {{ item.label }}
        </view>
      </view>

      <text class="section-title">事件筛选</text>
      <view class="chip-row">
        <view
          v-for="item in filterOptions"
          :key="item.value || 'all'"
          class="chip"
          :class="{ active: eventFilter === item.value }"
          @click="handleFilterChange(item.value)"
        >
          {{ item.label }}
        </view>
      </view>
    </view>

    <view v-if="errorMessage" class="state error">{{ errorMessage }}</view>

    <view class="metrics-grid">
      <view v-for="item in metricCards" :key="item.label" class="metric-card">
        <text class="metric-label">{{ item.label }}</text>
        <text class="metric-value">{{ item.value }}</text>
      </view>
    </view>

    <view class="panel">
      <text class="section-title">按天趋势</text>
      <view v-if="!dashboard.by_day?.length" class="state">暂无数据</view>
      <view v-else class="list">
        <view v-for="item in dashboard.by_day" :key="item.day" class="list-row">
          <text class="list-title">{{ item.day }}</text>
          <text class="list-meta">点击 {{ item.restaurant_click }} / 跳转 {{ item.meituan_jump_click }} / 总计 {{ item.total }}</text>
        </view>
      </view>
    </view>

    <view class="panel">
      <text class="section-title">热点餐厅</text>
      <view v-if="!dashboard.top_restaurants?.length" class="state">暂无数据</view>
      <view v-else class="list">
        <view v-for="item in dashboard.top_restaurants" :key="`${item.restaurant_id}-${item.restaurant_name}`" class="list-row">
          <text class="list-title">{{ item.restaurant_name || '未命名餐厅' }}</text>
          <text class="list-meta">点击 {{ item.count }} / 跳转 {{ item.jump_count }}</text>
        </view>
      </view>
    </view>

    <view class="panel">
      <text class="section-title">热点地点</text>
      <view v-if="!dashboard.top_pois?.length" class="state">暂无数据</view>
      <view v-else class="list">
        <view v-for="item in dashboard.top_pois" :key="item.poi_id" class="list-row">
          <text class="list-title">{{ item.poi_id }}</text>
          <text class="list-meta">点击 {{ item.count }} / 跳转 {{ item.jump_count }}</text>
        </view>
      </view>
    </view>

    <view class="panel">
      <text class="section-title">最近事件</text>
      <view v-if="!dashboard.recent?.length" class="state">暂无数据</view>
      <view v-else class="list">
        <view v-for="item in dashboard.recent" :key="item._id" class="list-row recent-row">
          <text class="list-title">{{ item.event_name }} · {{ item.restaurant_name || item.restaurant_id || '未命名对象' }}</text>
          <text class="list-meta">{{ item.platform || 'unknown' }} · {{ item.target_type || 'unknown' }} · {{ formatDateTime(item.created_at) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.page { min-height: 100vh; padding: 24rpx; background: #f5f7fb; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-bottom: 20rpx; }
.page-title { display: block; font-size: 36rpx; font-weight: 700; color: #1f2937; }
.page-subtitle { display: block; margin-top: 6rpx; font-size: 24rpx; color: #64748b; }
.refresh-btn { margin: 0; border-radius: 12rpx; background: #2563eb; color: #fff; }
.panel { margin-bottom: 20rpx; padding: 22rpx; border-radius: 18rpx; background: #fff; }
.section-title { display: block; margin-bottom: 14rpx; font-size: 28rpx; font-weight: 600; color: #1f2937; }
.chip-row { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 18rpx; }
.chip { padding: 12rpx 20rpx; border-radius: 999rpx; background: #e5e7eb; color: #4b5563; font-size: 24rpx; }
.chip.active { background: #dbeafe; color: #1d4ed8; }
.metrics-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16rpx; margin-bottom: 20rpx; }
.metric-card { padding: 22rpx; border-radius: 18rpx; background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%); border: 2rpx solid #dbeafe; }
.metric-label { display: block; font-size: 24rpx; color: #64748b; }
.metric-value { display: block; margin-top: 10rpx; font-size: 40rpx; font-weight: 700; color: #1d4ed8; }
.list { display: flex; flex-direction: column; gap: 12rpx; }
.list-row { padding: 18rpx; border-radius: 14rpx; background: #f8fafc; }
.recent-row { background: #fff7ed; }
.list-title { display: block; font-size: 26rpx; font-weight: 600; color: #1f2937; }
.list-meta { display: block; margin-top: 8rpx; font-size: 22rpx; line-height: 1.6; color: #64748b; }
.state { padding: 32rpx 0; text-align: center; font-size: 26rpx; color: #94a3b8; }
.state.error { color: #dc2626; }
</style>
