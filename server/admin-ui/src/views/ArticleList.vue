<template>
  <div>
    <el-card class="search-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input v-model="search.keyword" placeholder="标题/来源/URL" clearable @clear="handleSearch" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button type="success" @click="openDialog(null)">新增文章</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 16px">
      <el-table :data="list" v-loading="loading" stripe border>
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'parsed' ? 'success' : 'info'" size="small">
              {{ row.status === 'parsed' ? 'done' : row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="parse_confidence" label="解析置信度" width="100">
          <template #default="{ row }">
            {{ row.parse_confidence ? (row.parse_confidence * 100).toFixed(0) + '%' : '-' }}
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

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑文章' : '新增文章'" width="600px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item label="封面图">
          <el-input v-model="form.cover_image" />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="form.content_text" type="textarea" :rows="6" />
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
import { articleApi } from '../api.js'

const loading = ref(false)
const saving = ref(false)
const list = ref([])
const dialogVisible = ref(false)
const editingId = ref(null)
const formRef = ref(null)

const search = reactive({ keyword: '' })
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const defaultForm = () => ({
  title: '', source_account: '', url: '', cover_image: '', status: 'parsed', content_text: '',
})
const form = reactive(defaultForm())
const rules = { title: [{ required: true, message: '请输入标题', trigger: 'blur' }] }

async function fetchList() {
  loading.value = true
  try {
    const res = await articleApi.list({
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
      title: row.title || '',
      source_account: row.source_account || '',
      url: row.url || '',
      cover_image: row.cover_image || '',
      status: row.status || 'parsed',
      content_text: row.content_text || '',
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
      ? await articleApi.update(editingId.value, { ...form })
      : await articleApi.create({ ...form })
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
    const res = await articleApi.remove(id)
    if (res.code === 0) { ElMessage.success('删除成功'); fetchList() }
    else ElMessage.error(res.message)
  } catch { ElMessage.error('删除失败') }
}

onMounted(fetchList)
</script>
