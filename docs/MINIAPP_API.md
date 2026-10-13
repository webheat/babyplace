# Babyplace 小程序 API 文档

> 基础域名：`https://byupload.aixifs.com`
> 所有数据接口统一使用 POST 方法，Content-Type: `application/json`

---

## 1. 通用说明

### 响应格式

所有接口返回统一结构：

```json
{
  "code": 0,        // 0=成功，非0=失败
  "message": "ok",  // 状态描述
  "data": {}        // 业务数据（失败时为 null）
}
```

### 分页参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | int | 1 | 页码，从 1 开始 |
| pageSize | int | 20 | 每页数量，最大 50 |
| keyword | string | "" | 搜索关键词（模糊匹配） |

### 分页响应

```json
{
  "code": 0,
  "data": {
    "list": [],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 2. 文章模块

### 2.1 文章列表

**接口：** `POST /babyplace-admin`

```json
{
  "action": "article.list",
  "page": 1,
  "pageSize": 20,
  "keyword": "户外"
}
```

**响应 data.list[] 字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 文章唯一 ID |
| title | string | 标题 |
| source_account | string | 来源公众号名称 |
| source_account_id | string | 公众号 ID |
| publish_time | int | 发布时间（毫秒时间戳） |
| url | string | 原文链接 |
| cover_image | string | 封面图 CDN URL（腾讯 CDN，小程序可直接使用） |
| local_cover_image | string | 封面图本地备份路径（服务端备份，非小程序使用） |
| content_text | string | 纯文本内容 |
| content_html | string | HTML 内容 |
| images | string[] | 文章内图片 CDN URL 列表（腾讯 CDN，小程序可直接使用） |
| local_images | string[] | 文章内图片本地备份路径（服务端备份，非小程序使用） |
| status | string | 状态：fetched / parsed |
| created_at | int | 入库时间（毫秒时间戳） |
| updated_at | int | 更新时间（毫秒时间戳） |

### 2.2 文章详情

```json
{
  "action": "article.detail",
  "id": "文章ID"
}
```

**响应 data：** 同列表项字段。

### 2.3 图片使用说明

文章中的图片 URL（`cover_image` 和 `images`）均为**腾讯 CDN 地址**（`https://mmbiz.qpic.cn/...`），小程序可直接使用。

**小程序中展示图片：**

```xml
<!-- 封面图 -->
<image src="{{article.cover_image}}" mode="aspectFill" />

<!-- 文章内图片轮播 -->
<swiper>
  <swiper-item wx:for="{{article.images}}" wx:key="*this">
    <image src="{{item}}" mode="widthFix" />
  </swiper-item>
</swiper>
```

**注意事项：**
- CDN URL 在小程序 `<image>` 组件中可直接加载，**无需配置 downloadFile 域名白名单**（微信已内置 `mmbiz.qpic.cn`）
- CDN URL 有时效性（通常几天内有效），如需长期展示建议将图片迁移到自己的 OSS
- `local_cover_image` 和 `local_images` 是服务端本地备份路径，**不用于小程序展示**

---

## 3. POI 地点模块

### 3.1 地点列表

```json
{
  "action": "poi.list",
  "page": 1,
  "pageSize": 20,
  "keyword": "公园"
}
```

**响应 data.list[] 字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id / _id | string | 地点唯一 ID |
| name | string | 名称 |
| canonical_name | string | 标准化名称 |
| alias | string | 别名 |
| city | string | 城市 |
| district | string | 区域 |
| address | string | 详细地址 |
| cover_image | string | 封面图（CDN URL，小程序可直接使用） |
| tags | string[] | 标签 |
| rating | float | 评分 |
| location | object | 坐标 `{lat, lng}` |
| transport | string[] | 交通方式 |
| parking_tip | string | 停车提示 |
| open_time | string | 营业时间（如"周一至周五 9:00-17:00"） |
| ticket_info | string | 票务信息（如"免费"、"成人50元"） |
| phone | string | 联系电话 |
| reservation_type | string | 预约类型：`webview` / `qrcode` / `phone` |
| reservation | object | 预约信息 `{ url: string, label: string }` |
| booking_url | string | 预约链接（冗余字段，同 `reservation.url`） |
| booking_qr_code | string | 预约二维码图片 URL |

### 3.2 地点详情

```json
{
  "action": "poi.detail",
  "id": "地点ID"
}
```

**响应 data：**

```json
{
  "poi": { ... },
  "reviews": [ ... ],
  "sources": [ ... ]
}
```

### 3.3 附近地点

```json
{
  "action": "poi.nearby",
  "lat": 23.1291,
  "lng": 113.2644,
  "pageSize": 20
}
```

---

## 4. 评价模块

### 4.1 按地点查评价

```json
{
  "action": "review.listByPoi",
  "poi_id": "地点ID",
  "page": 1,
  "pageSize": 20
}
```

**响应 data.list[] 字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 评价 ID |
| poi_id | string | 关联地点 ID |
| user_name | string | 用户名 |
| rating | int | 评分（1-5） |
| content | string | 评价内容 |
| images | string[] | 评价图片（CDN URL，小程序可直接使用） |
| created_at | int | 创建时间 |

### 4.2 创建评价

```json
{
  "action": "review.create",
  "payload": {
    "poi_id": "地点ID",
    "user_name": "用户昵称",
    "rating": 5,
    "content": "很好玩！",
    "images": ["https://mmbiz.qpic.cn/..."]
  }
}
```

---

## 5. 推荐模块

### 5.1 首页推荐

```json
{
  "action": "recommend.home",
  "lat": 23.1291,
  "lng": 113.2644,
  "radius": 5000
}
```

**响应 data：**

```json
{
  "radius": 5000,
  "featured": [ ... ],
  "nearby": [ ... ],
  "latest": [ ... ]
}
```

---

## 6. 微信登录

**接口：** `POST /api/wx-login`

```json
{
  "code": "wx.login() 获取的 code"
}
```

**响应：**

```json
{
  "status": "ok",
  "data": {
    "openid": "oXXXXXX",
    "session_key": "XXXXXX"
  }
}
```

---

## 7. AI 对话

**接口：** `POST /api/chat`

```json
{
  "message": "广州有什么适合遛娃的地方？",
  "session_id": "可选，用于多轮对话"
}
```

**响应：**

```json
{
  "status": "ok",
  "message": "AI 回复内容",
  "data": { ... }
}
```

> 超时设置：120 秒（AI 回复较慢，建议前端设置较长超时）

---

## 8. 健康检查

**接口：** `GET /health`

```json
{ "status": "ok" }
```

---

## 9. 公众号抓取（管理用）

> 以下接口用于触发 mptext API 抓取，通常由后台定时任务自动执行，小程序端一般不需要调用。

### 9.1 搜索公众号

```json
{
  "action": "mptext.search",
  "keyword": "广州旅游",
  "begin": 0,
  "size": 5
}
```

### 9.2 获取公众号文章列表（实时）

```json
{
  "action": "mptext.articles",
  "fakeid": "MzkxMzcyMjczNg==",
  "begin": 0,
  "size": 10
}
```

### 9.3 抓取并入库单篇文章

```json
{
  "action": "mptext.fetch",
  "url": "https://mp.weixin.qq.com/s/XXXXX"
}
```

### 9.4 作者信息

```json
{
  "action": "mptext.author",
  "fakeid": "MzkxMzcyMjczNg=="
}
```

### 9.5 通过文章 URL 反查公众号

```json
{
  "action": "mptext.accountByURL",
  "url": "https://mp.weixin.qq.com/s/XXXXX"
}
```

---

## 附录：小程序调用示例

```js
const BASE = 'https://byupload.aixifs.com';

// 封装请求
function admin(action, data = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE}/babyplace-admin`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { action, ...data },
      success: res => resolve(res.data),
      fail: err => reject(err)
    });
  });
}

// 使用示例
const articles = await admin('article.list', { page: 1, pageSize: 10 });
const poi = await admin('poi.detail', { id: 'xxx' });
const nearby = await admin('poi.nearby', { lat: 23.13, lng: 113.26 });
```
