<template>
  <div>
    <el-card class="search-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input v-model="search.keyword" placeholder="昵称/评论内容" clearable @clear="handleSearch" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button type="success" @click="openDialog(null)">新增评价</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 16px">
      <el-table :data="list" v-loading="loading" stripe border>
        <el-table-column prop="nickname" label="昵称" width="100" />
        <el-table-column prop="poi_id" label="POI ID" width="140" show-overflow-tooltip />
        <el-table-column prop="rating" label="评分" width="80">
          <template #default="{ row }">
            <span>{{ '⭐'.repeat(row.rating) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="comment" label="评论" min-width="200" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'approved' ? 'success' : 'warning'" size="small">
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

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑评价' : '新增评价'" width="500px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="POI ID" prop="poi_id">
          <el-input v-model="form.poi_id" :disabled="!!editingId" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="form.nickname" />
        </el-form-item>
        <el-form-item label="评分">
          <el-rate v-model="form.rating" :max="5" />
        </el-form-item>
        <el-form-item label="评论">
          <el-input v-model="form.comment" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status">
            <el-option label="approved" value="approved" />
            <el-option label="pending" value="pending" />
            <el-option label="rejected" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签">
          <json-editor v-model="form.tags" />
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
import { reviewApi } from '../api.js'
import JsonEditor from '../components/JsonEditor.vue'

const loading = ref(false)
const saving = ref(false)
const list = ref([])
const dialogVisible = ref(false)
const editingId = ref(null)
const formRef = ref(null)

const search = reactive({ keyword: '' })
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const defaultForm = () => ({
  poi_id: '', nickname: '', rating: 5, comment: '', status: 'approved', tags: [],
})
const form = reactive(defaultForm())
const rules = { poi_id: [{ required: true, message: '请输入 POI ID', trigger: 'blur' }] }

async function fetchList() {
  loading.value = true
  try {
    const res = await reviewApi.list({
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
      nickname: row.nickname || '',
      rating: row.rating || 5,
      comment: row.comment || '',
      status: row.status || 'approved',
      tags: row.tags || [],
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
  const payload = { ...form }
  try {
    const res = editingId.value
      ? await reviewApi.update(editingId.value, payload)
      : await reviewApi.create(payload)
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
    const res = await reviewApi.remove(id)
    if (res.code === 0) { ElMessage.success('删除成功'); fetchList() }
    else ElMessage.error(res.message)
  } catch { ElMessage.error('删除失败') }
}

onMounted(fetchList)
</script>
