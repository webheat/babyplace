<template>
  <div>
    <!-- 搜索栏 -->
    <el-card class="search-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input v-model="search.keyword" placeholder="名称/地址/城市" clearable @clear="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="search.includeDraft" clearable placeholder="全部" @change="handleSearch">
            <el-option :value="false" label="仅已发布" />
            <el-option :value="true" label="包含草稿" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button type="success" @click="openDialog(null)">新增 POI</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据表格 -->
    <el-card style="margin-top: 16px">
      <el-table :data="list" v-loading="loading" stripe border style="width: 100%">
        <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="city" label="城市" width="80" />
        <el-table-column prop="district" label="区域" width="80" />
        <el-table-column prop="category" label="分类" width="80" />
        <el-table-column prop="price_type" label="费用" width="70">
          <template #default="{ row }">
            <el-tag :type="row.price_type === 'free' ? 'success' : 'warning'" size="small">
              {{ row.price_type === 'free' ? '免费' : row.price_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="avg_rating" label="评分" width="70" />
        <el-table-column prop="review_count" label="评价数" width="70" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'published' ? 'success' : 'info'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDialog(row)">编辑</el-button>
            <el-popconfirm title="确认删除?" @confirm="handleDelete(row._id)">
              <template #reference>
                <el-button size="small" type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        style="margin-top: 16px; justify-content: flex-end"
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @size-change="fetchList"
        @current-change="fetchList"
      />
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑 POI' : '新增 POI'"
      width="700px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-tabs v-model="formTab">
          <el-tab-pane label="基本信息" name="basic">
            <el-form-item label="名称" prop="name">
              <el-input v-model="form.name" />
            </el-form-item>
            <el-form-item label="标准名">
              <el-input v-model="form.canonical_name" />
            </el-form-item>
            <el-form-item label="城市">
              <el-input v-model="form.city" />
            </el-form-item>
            <el-form-item label="区域">
              <el-input v-model="form.district" />
            </el-form-item>
            <el-form-item label="地址">
              <el-input v-model="form.address" />
            </el-form-item>
            <el-form-item label="分类">
              <el-select v-model="form.category" allow-create filterable>
                <el-option label="mixed" value="mixed" />
                <el-option label="park" value="park" />
                <el-option label="playground" value="playground" />
                <el-option label="museum" value="museum" />
                <el-option label="zoo" value="zoo" />
                <el-option label="library" value="library" />
                <el-option label="indoor" value="indoor" />
              </el-select>
            </el-form-item>
            <el-form-item label="费用类型">
              <el-select v-model="form.price_type">
                <el-option label="免费" value="free" />
                <el-option label="付费" value="paid" />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="form.status">
                <el-option label="published" value="published" />
                <el-option label="draft" value="draft" />
              </el-select>
            </el-form-item>
          </el-tab-pane>

          <el-tab-pane label="位置" name="location">
            <el-form-item label="纬度">
              <el-input-number v-model="form.lat" :precision="6" :step="0.001" />
            </el-form-item>
            <el-form-item label="经度">
              <el-input-number v-model="form.lng" :precision="6" :step="0.001" />
            </el-form-item>
          </el-tab-pane>

          <el-tab-pane label="设施" name="facilities">
            <el-form-item label="室内">
              <el-switch v-model="form.indoor" />
            </el-form-item>
            <el-form-item label="婴儿车友好">
              <el-switch v-model="form.stroller_friendly" />
            </el-form-item>
            <el-form-item label="洗手间">
              <el-switch v-model="form.restroom" />
            </el-form-item>
            <el-form-item label="餐饮">
              <el-switch v-model="form.food" />
            </el-form-item>
            <el-form-item label="遮阳">
              <el-switch v-model="form.shade" />
            </el-form-item>
            <el-form-item label="停车">
              <el-switch v-model="form.parking" />
            </el-form-item>
            <el-form-item label="雨天可玩">
              <el-switch v-model="form.rainy_day_ok" />
            </el-form-item>
          </el-tab-pane>

          <el-tab-pane label="描述" name="desc">
            <el-form-item label="简介">
              <el-input v-model="form.summary" type="textarea" :rows="3" />
            </el-form-item>
            <el-form-item label="推荐理由">
              <el-input v-model="form.recommend_reason" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="注意事项">
              <el-input v-model="form.notice" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="封面图">
              <el-input v-model="form.cover_image" placeholder="图片 URL" />
            </el-form-item>
          </el-tab-pane>

          <el-tab-pane label="标签/JSON" name="json">
            <el-form-item label="别名">
              <json-editor v-model="form.alias" placeholder='["别名1","别名2"]' />
            </el-form-item>
            <el-form-item label="标签">
              <json-editor v-model="form.tags" placeholder='["tag1","tag2"]' />
            </el-form-item>
            <el-form-item label="年龄范围">
              <json-editor v-model="form.age_range" placeholder='["0-3","3-6"]' />
            </el-form-item>
            <el-form-item label="图库">
              <json-editor v-model="form.gallery" placeholder='["url1","url2"]' />
            </el-form-item>
          </el-tab-pane>
        </el-tabs>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { poiApi } from '../api.js'
import JsonEditor from '../components/JsonEditor.vue'

const loading = ref(false)
const saving = ref(false)
const list = ref([])
const dialogVisible = ref(false)
const editingId = ref(null)
const formRef = ref(null)
const formTab = ref('basic')

const search = reactive({ keyword: '', includeDraft: false })
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const defaultForm = () => ({
  name: '', canonical_name: '', city: '', district: '', address: '',
  category: 'mixed', price_type: 'free', status: 'published',
  lat: 0, lng: 0, indoor: false,
  stroller_friendly: false, restroom: false, food: false,
  shade: false, parking: false, rainy_day_ok: false,
  summary: '', recommend_reason: '', notice: '', cover_image: '',
  alias: [], tags: [], age_range: [], gallery: [],
})

const form = reactive(defaultForm())
const rules = { name: [{ required: true, message: '请输入名称', trigger: 'blur' }] }

async function fetchList() {
  loading.value = true
  try {
    const res = await poiApi.list({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: search.keyword || undefined,
      includeDraft: search.includeDraft,
    })
    if (res.code === 0) {
      list.value = res.data.list || []
      pagination.total = res.data.total || 0
    }
  } catch (e) {
    ElMessage.error('加载失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.page = 1
  fetchList()
}

function openDialog(row) {
  formTab.value = 'basic'
  if (row) {
    editingId.value = row._id
    Object.assign(form, {
      name: row.name || '',
      canonical_name: row.canonical_name || '',
      city: row.city || '',
      district: row.district || '',
      address: row.address || '',
      category: row.category || 'mixed',
      price_type: row.price_type || 'free',
      status: row.status || 'published',
      lat: row.location?.lat || 0,
      lng: row.location?.lng || 0,
      indoor: row.indoor || false,
      stroller_friendly: row.facilities?.stroller_friendly || false,
      restroom: row.facilities?.restroom || false,
      food: row.facilities?.food || false,
      shade: row.facilities?.shade || false,
      parking: row.facilities?.parking || false,
      rainy_day_ok: row.facilities?.rainy_day_ok || false,
      summary: row.summary || '',
      recommend_reason: row.recommend_reason || '',
      notice: row.notice || '',
      cover_image: row.cover_image || '',
      alias: row.alias || [],
      tags: row.tags || [],
      age_range: row.age_range || [],
      gallery: row.gallery || [],
    })
  } else {
    editingId.value = null
    Object.assign(form, defaultForm())
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (!formRef.value) return
  await formRef.value.validate()
  saving.value = true

  const payload = {
    name: form.name,
    canonical_name: form.canonical_name,
    city: form.city,
    district: form.district,
    address: form.address,
    category: form.category,
    price_type: form.price_type,
    status: form.status,
    location: { lat: form.lat, lng: form.lng },
    indoor: form.indoor,
    facilities: {
      stroller_friendly: form.stroller_friendly,
      restroom: form.restroom,
      food: form.food,
      shade: form.shade,
      parking: form.parking,
      rainy_day_ok: form.rainy_day_ok,
    },
    summary: form.summary,
    recommend_reason: form.recommend_reason,
    notice: form.notice,
    cover_image: form.cover_image,
    alias: form.alias,
    tags: form.tags,
    age_range: form.age_range,
    gallery: form.gallery,
  }

  try {
    let res
    if (editingId.value) {
      res = await poiApi.update(editingId.value, payload)
    } else {
      res = await poiApi.create(payload)
    }
    if (res.code === 0) {
      ElMessage.success(editingId.value ? '更新成功' : '创建成功')
      dialogVisible.value = false
      fetchList()
    } else {
      ElMessage.error(res.message)
    }
  } catch (e) {
    ElMessage.error('保存失败: ' + e.message)
  } finally {
    saving.value = false
  }
}

async function handleDelete(id) {
  try {
    const res = await poiApi.remove(id)
    if (res.code === 0) {
      ElMessage.success('删除成功')
      fetchList()
    } else {
      ElMessage.error(res.message)
    }
  } catch (e) {
    ElMessage.error('删除失败: ' + e.message)
  }
}

onMounted(fetchList)
</script>

<style scoped>
.search-card {
  margin-bottom: 0;
}
</style>
