<template>
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <div class="login-header">
          <h2>遛娃宝地 · 管理后台</h2>
        </div>
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="handleLogin">
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入管理密码"
            show-password
            size="large"
            @keyup.enter="handleLogin"
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" style="width: 100%" @click="handleLogin">
            登 录
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <div class="icp-footer">
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">粤ICP备19112086号-1</a>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Lock } from '@element-plus/icons-vue'
import { login } from '../api.js'

const router = useRouter()
const formRef = ref(null)
const loading = ref(false)
const form = reactive({ password: '' })
const rules = { password: [{ required: true, message: '请输入密码', trigger: 'blur' }] }

async function handleLogin() {
  if (!formRef.value) return
  await formRef.value.validate()
  loading.value = true
  try {
    await login(form.password)
    ElMessage.success('登录成功')
    router.push('/')
  } catch (e) {
    ElMessage.error(e.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.login-card {
  width: 400px;
}
.login-header {
  text-align: center;
}
.login-header h2 {
  margin: 0;
  color: #303133;
  font-size: 20px;
}
.icp-footer {
  position: absolute;
  bottom: 20px;
  text-align: center;
  width: 100%;
}
.icp-footer a {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
}
.icp-footer a:hover {
  color: #fff;
}
</style>
