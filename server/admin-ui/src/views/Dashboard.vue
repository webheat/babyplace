<template>
  <div class="dashboard">
    <el-row :gutter="20" class="stat-cards">
      <el-col :span="6" v-for="card in statCards" :key="card.label">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ card.value ?? '-' }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card>
          <template #header><span>最近更新的 POI</span></template>
          <el-table :data="recentPois" size="small" stripe>
            <el-table-column prop="name" label="名称" />
            <el-table-column prop="city" label="城市" width="100" />
            <el-table-column prop="category" label="分类" width="100" />
            <el-table-column prop="avg_rating" label="评分" width="80" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header><span>最近更新的文章</span></template>
          <el-table :data="recentArticles" size="small" stripe>
            <el-table-column prop="title" label="标题" show-overflow-tooltip />
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'parsed' ? 'success' : 'info'" size="small">
                  {{ row.status === 'parsed' ? 'done' : row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { poiApi, reviewApi, articleApi, sourceApi } from '../api.js'

const statCards = ref([
  { label: 'POI 数量', value: null },
  { label: '评价数量', value: null },
  { label: '文章数量', value: null },
  { label: '来源关联数', value: null },
])
const recentPois = ref([])
const recentArticles = ref([])

onMounted(async () => {
  const [poiRes, reviewRes, articleRes, sourceRes] = await Promise.allSettled([
    poiApi.list({ page: 1, pageSize: 5, includeDraft: true }),
    reviewApi.list({ page: 1, pageSize: 1 }),
    articleApi.list({ page: 1, pageSize: 5 }),
    sourceApi.list({ page: 1, pageSize: 1 }),
  ])

  if (poiRes.status === 'fulfilled' && poiRes.value.code === 0) {
    statCards.value[0].value = poiRes.value.data.total
    recentPois.value = poiRes.value.data.list || []
  }
  if (reviewRes.status === 'fulfilled' && reviewRes.value.code === 0) {
    statCards.value[1].value = reviewRes.value.data.total
  }
  if (articleRes.status === 'fulfilled' && articleRes.value.code === 0) {
    statCards.value[2].value = articleRes.value.data.total
    recentArticles.value = articleRes.value.data.list || []
  }
  if (sourceRes.status === 'fulfilled' && sourceRes.value.code === 0) {
    statCards.value[3].value = sourceRes.value.data.total
  }
})
</script>

<style scoped>
.stat-card {
  text-align: center;
}
.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: #409eff;
}
.stat-label {
  margin-top: 8px;
  font-size: 14px;
  color: #909399;
}
</style>
