<template>
  <el-container class="layout-container">
    <el-aside width="220px" class="layout-aside">
      <div class="logo">
        <h3>遛娃宝地</h3>
        <span>管理后台</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item index="/">
          <el-icon><DataBoard /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/poi">
          <el-icon><Location /></el-icon>
          <span>POI 管理</span>
        </el-menu-item>
        <el-menu-item index="/article">
          <el-icon><Document /></el-icon>
          <span>文章管理</span>
        </el-menu-item>
        <el-menu-item index="/source">
          <el-icon><Connection /></el-icon>
          <span>来源关联</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="layout-header">
        <span class="page-title">{{ pageTitle }}</span>
        <el-button type="danger" text @click="handleLogout">退出登录</el-button>
      </el-header>
      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { DataBoard, Location, ChatDotRound, Document, Connection } from '@element-plus/icons-vue'
import { logout } from '../api.js'

const route = useRoute()
const router = useRouter()

const activeMenu = computed(() => route.path)
const pageTitle = computed(() => {
  const map = {
    '/': '仪表盘',
    '/poi': 'POI 管理',
    '/review': '评价管理',
    '/article': '文章管理',
    '/source': '来源关联',
  }
  return map[route.path] || '管理后台'
})

async function handleLogout() {
  await logout()
  ElMessage.success('已退出')
  router.push('/login')
}
</script>

<style scoped>
.layout-container {
  min-height: 100vh;
}
.layout-aside {
  background: #304156;
  overflow-y: auto;
}
.logo {
  padding: 20px;
  text-align: center;
  color: #fff;
  border-bottom: 1px solid #3a4a5b;
}
.logo h3 {
  margin: 0 0 4px 0;
  font-size: 18px;
}
.logo span {
  font-size: 12px;
  color: #bfcbd9;
}
.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #ebeef5;
  background: #fff;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.layout-main {
  background: #f5f7fa;
  min-height: 0;
}
</style>
