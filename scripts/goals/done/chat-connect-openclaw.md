---
name: chat-connect-openclaw
model: sonnet
workdir: /opt/babyplace
timeout: 300
notify: false
---

将小程序聊天页的 AI 请求从 Dify 切换到本机 Go 后端的 OpenClaw 端点。

## 背景

- 后端 `/api/openclaw/chat` 已在 `server/main.go` 中实现，可调用本机 OpenClaw CLI
- 前端 `src/pages/chat/chat.vue` 当前直连 Dify API，需要改为走 Go 后端

## 需求

修改 `src/pages/chat/chat.vue` 和 `src/config/config.js`，让聊天请求走 Go 后端的 `/api/openclaw/chat`。

## 实现细节

### 1. 在 `src/config/config.js` 中新增 Go 后端地址配置

```js
// Go 后端（OpenClaw 桥接）
openclawApi: 'http://localhost:8080/api/openclaw/chat',
```

如果已经有类似的 serverBase 配置，复用它，拼接 `/api/openclaw/chat` 路径即可。

### 2. 修改 `src/pages/chat/chat.vue`

将 `sendMessage` 函数中的 `uni.request` 改为调用 Go 后端：

- URL 改为 config 中的 openclawApi
- 请求方法仍为 POST
- 请求体改为：
  ```json
  {
    "message": "用户输入的文本",
    "agent_id": "main",
    "model": "deepseek-v4-pro",
    "timeout": 300
  }
  ```
- 如果有 session_key（多轮对话），在请求体中带上 `session_key`
- 响应解析改为从 Go 后端返回的格式中取：
  - `res.data.data.reply` → bot 回复文本
  - `res.data.data.session_key` → 保存为下一轮的 session_key
  - `res.data.status` === "ok" 表示成功
- 移除 Dify 相关的 conversationId 逻辑，改用 session_key 管理多轮对话
- 保留现有的 UI 和样式不变

### 3. 多轮对话管理

- 新增 `const sessionKey = ref('')`
- 首次请求不传 session_key
- 后续请求带上上一次返回的 session_key
- 用户点击清空对话时重置 session_key

## 约束

- 保持现有 UI/样式不变
- 遵循 Vue3 Composition API + `<script setup>` 风格
- 错误处理保持现有的 toast 提示模式
- 注意：Go 后端运行在 localhost:8080，小程序真机可能无法直接访问 localhost，但 H5 开发模式可以

## 验证

完成后检查：
1. `pnpm run dev:h5` 启动无报错
2. 聊天页发送消息能收到 OpenClaw 的回复
