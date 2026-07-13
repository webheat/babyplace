<template>
  <div>
    <el-card class="search-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input v-model="search.keyword" placeholder="POI ID / Article ID" clearable @clear="handleSearch" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button type="success" @click="openDialog(null)">新增关联</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 16px">
      <el-table :data="list" v-loading="loading" stripe border>
        <el-table-column prop="poi_id" label="POI ID" width="140" show-overflow-tooltip />
        <el-table-column prop="article_id" label="Article ID" width="140" show-overflow-tooltip />
        <el-table-column prop="source_type" label="类型" width="80" />
        <el-table-column prop="confidence_score" label="置信度" width="80">
          <template #default="{ row }">
            {{ row.confidence_score ? (row.confidence_score * 100).toFixed(0) + '%' : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="is_primary" label="主要来源" width="80">
          <template #default="{ row }">
            <el-tag :type="row.is_primary ? 'success' : 'info'" size="small">
              {{ row.is_primary ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80" />
        <el-table-column prop="quoted_text" label="引用文本" min-width="200" show-overflow-tooltip />
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

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑关联' : '新增关联'" width="500px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="POI ID" prop="poi_id">
          <el-input v-model="form.poi_id" />
        </el-form-item>
        <el-form-item label="Article ID" prop="article_id">
          <el-input v-model="form.article_id" />
        </el-form-item>
        <el-form-item label="类型">
          <el-input v-model="form.source_type" />
        </el-form-item>
        <el-form-item label="引用文本">
          <el-input v-model="form.quoted_text" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="置信度">
          <el-input-number v-model="form.confidence_score" :min="0" :max="1" :step="0.1" :precision="2" />
        </el-form-item>
        <el-form-item label="主要来源">
          <el-switch v-model="form.is_primary" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status">
            <el-option label="active" value="active" />
            <el-option label="inactive" value="inactive" />
          </el-select>
        </el-form-item>
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
import { sourceApi } from '../api.js'

const loading = ref(false)
const saving = ref(false)
const list = ref([])
const dialogVisible = ref(false)
const editingId = ref(null)
const formRef = ref(null)

const search = reactive({ keyword: '' })
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const defaultForm = () => ({
  poi_id: '', article_id: '', source_type: 'article',
  quoted_text: '', confidence_score: 0, is_primary: false, status: 'active',
})
const form = reactive(defaultForm())
const rules = {
  poi_id: [{ required: true, message: '请输入 POI ID', trigger: 'blur' }],
  article_id: [{ required: true, message: '请输入 Article ID', trigger: 'blur' }],
}

async function fetchList() {
  loading.value = true
  try {
    const res = await sourceApi.list({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: search.keyword || undefined,
    })
    if (res.code === 0) {
      list.value = res.data.list || []
      pagination.total = res.data.total || 0
    }
  } catch (e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() { pagination.page = 1; fetchList() }

function openDialog(row) {
  if (row) {
    editingId.value = row._id
    Object.assign(form, {
      poi_id: row.poi_id || '',
      article_id: row.article_id || '',
      source_type: row.source_type || 'article',
      quoted_text: row.quoted_text || '',
      confidence_score: row.confidence_score || 0,
      is_primary: row.is_primary || false,
      status: row.status || 'active',
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
  try {
    const res = editingId.value
      ? await sourceApi.update(editingId.value, { ...form })
      : await sourceApi.create({ ...form })
    if (res.code === 0) {
      ElMessage.success('保存成功')
      dialogVisible.value = false
      fetchList()
    } else {
      ElMessage.error(res.message)
    }
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(id) {
  try {
    const res = await sourceApi.remove(id)
    if (res.code === 0) { ElMessage.success('删除成功'); fetchList() }
    else ElMessage.error(res.message)
  } catch { ElMessage.error('删除失败') }
}

onMounted(fetchList)
</script>
