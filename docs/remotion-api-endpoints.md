# Remotion 视频渲染服务 API 端点清单

**服务地址**: `http://lanes.ymxt.top:3010`

**实现位置**: `/opt/video_web/remotion-server`

---

## 必需端点

### 1. 健康检查

```
GET /health
```

**返回**:
```json
{ "status": "ok", "timestamp": "2026-06-11T..." }
```

**状态**: ✅ 已实现

---

### 2. 获取模板列表

```
GET /api/templates
```

**返回**:
```json
{
  "templates": [
    {
      "id": "ChineseDecoration",
      "name": "中式装修行业视频",
      "description": "热点新闻 + 中式装修图片 + 声音旁白",
      "previewUrl": null,
      "duration": 15,
      "fps": 30,
      "width": 1080,
      "height": 1920,
      "inputProps": {
        "newsTitle": { "type": "string", "description": "热点新闻标题" },
        "newsContent": { "type": "string", "description": "热点新闻内容" },
        "images": { "type": "array", "description": "中式装修图片URL数组，5张" },
        "audioSrc": { "type": "string", "description": "音频文件URL（MiniMax克隆声音）" },
        "narration": { "type": "string", "description": "旁白文本" }
      }
    },
    {
      "id": "WireframeVideo",
      "name": "景点介绍",
      "description": "图片轮播 + 地点名称 + 标签",
      "previewUrl": null,
      "duration": 18,
      "fps": 30,
      "width": 1080,
      "height": 1920,
      "inputProps": {
        "scenes": { "type": "array", "description": "场景数据数组" }
      }
    }
  ]
}
```

**状态**: ✅ 已实现

---

### 3. 上传素材图片

```
POST /api/assets/upload
Content-Type: multipart/form-data
```

**参数**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| file | File | 是 | 图片文件（jpg/png/gif/webp），最大50MB |

**返回**:
```json
{
  "assetId": "asset_xxx",
  "url": "http://lanes.ymxt.top:3010/uploads/asset_xxx.jpg"
}
```

**状态**: ✅ 已实现

---

### 4. 提交渲染任务

```
POST /api/renders
Content-Type: application/json
```

**参数**:

```json
{
  "templateId": "ChineseDecoration",
  "inputProps": {
    "newsTitle": "装修行业新趋势",
    "newsContent": "...",
    "images": ["https://...img1.jpg", "https://...img2.jpg"],
    "audioSrc": "https://...audio.mp3",
    "narration": "..."
  }
}
```

**返回**:
```json
{
  "renderId": "render_xxx",
  "status": "queued"
}
```

**状态**: ✅ 已实现

---

### 5. 查询渲染状态

```
GET /api/renders/{renderId}
```

**返回**:

```json
{
  "renderId": "render_xxx",
  "status": "processing",
  "progress": 0.75,
  "videoUrl": null,
  "error": null
}
```

**status 枚举值**:

| 值 | 说明 |
|------|------|
| `queued` | 排队中 |
| `processing` | 渲染中 |
| `done` | 完成 |
| `failed` | 失败 |

**完成时返回**:
```json
{
  "renderId": "render_xxx",
  "status": "done",
  "progress": 1,
  "videoUrl": "http://lanes.ymxt.top:3010/api/renders/render_xxx/video",
  "error": null
}
```

**失败时返回**:
```json
{
  "renderId": "render_xxx",
  "status": "failed",
  "progress": 0,
  "videoUrl": null,
  "error": "渲染超时"
}
```

**状态**: ✅ 已实现

---

### 6. 获取渲染结果视频

```
GET /api/renders/{renderId}/video
```

**返回**: 视频文件流（Content-Type: video/mp4）

**状态**: ✅ 已实现

---

## 可选端点

### 7. 取消渲染任务

```
DELETE /api/renders/{renderId}
```

**返回**:
```json
{ "success": true }
```

**状态**: ✅ 已实现

### 8. 获取模板预览

```
GET /api/templates/{templateId}/preview
```

**返回**: 预览视频或 GIF 文件流

**状态**: ⏳ 未实现（返回 501）

---

## 旧版端点（向后兼容）

以下端点保留用于兼容现有客户端：

| 端点 | 说明 |
|------|------|
| `POST /render` | 通用渲染接口 |
| `POST /render/chinese-decoration` | 中式装修工作流渲染 |
| `GET /render/:id` | 查询渲染状态 |
| `GET /render/:id/download` | 下载渲染视频 |
| `GET /jobs` | 列出所有任务 |

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3010 | 服务端口 |
| `MAX_CONCURRENT` | 3 | 最大并发渲染数 |
| `DB_PATH` | `./data/jobs.db` | SQLite 数据库路径 |
| `UPLOAD_DIR` | `./uploads` | 上传文件存储目录 |
| `OUTPUT_DIR` | `/output` | 渲染输出目录 |
| `COMPOSITIONS_DIR` | `/composer` | Remotion 组件目录 |
| `CORS_ORIGINS` | `*` | 允许的跨域来源（逗号分隔） |

---

## 部署

```bash
# 开发模式
cd /opt/video_web/remotion-server
npm run dev

# 生产模式（Docker）
cd /opt/video_web
docker compose up -d remotion-server
```

---

## 确认事项

- [x] 端点路径已实现
- [x] 请求/返回格式已匹配
- [ ] 是否需要鉴权（API Key / Token）— 当前无鉴权
- [x] 图片上传限制：50MB
- [ ] 渲染任务超时限制：未设置
- [ ] 视频文件 CDN 加速：未配置
- [ ] 自定义模板参数（背景音乐、字体、颜色）：部分支持
