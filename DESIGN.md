# 遛娃宝地设计规范

设计系统文档，定义项目的视觉语言和组件规范。

---

## 设计理念

- **简洁实用**：面向家长用户，信息清晰易读
- **温馨友好**：亲子场景，色彩柔和不刺眼
- **移动优先**：主要服务于微信小程序和 H5

---

## 颜色系统

### 主色

| 名称 | 色值 | 用途 |
|------|------|------|
| **Primary** | `#2563eb` | 主按钮、链接、强调元素 |
| **Primary Light** | `#dbeafe` | 主色浅底、选中态背景 |
| **Primary Dark** | `#1d4ed8` | 主色深色态 |

### 中性色

| 名称 | 色值 | 用途 |
|------|------|------|
| **Gray 900** | `#1f2937` | 标题文字 |
| **Gray 700** | `#374151` | 正文文字 |
| **Gray 600** | `#475569` | 次要文字 |
| **Gray 500** | `#6b7280` | 辅助文字 |
| **Gray 400** | `#94a3b8` | 占位符、禁用态 |
| **Gray 300** | `#d1d5db` | 分割线 |
| **Gray 200** | `#e5e7eb` | 边框 |
| **Gray 100** | `#f3f4f6` | 背景色 |
| **Gray 50** | `#f8fafc` | 页面背景 |

### 语义色

| 名称 | 色值 | 用途 |
|------|------|------|
| **Success** | `#10b981` | 成功状态 |
| **Warning** | `#f59e0b` | 警告状态 |
| **Error** | `#ef4444` / `#dc2626` | 错误状态、删除 |
| **Info** | `#3b82f6` | 信息提示 |

### 品牌色（第三方）

| 平台 | 色值 | 用途 |
|------|------|------|
| **饿了么** | `#11c296` | 饿了么入口 |
| **美团** | `#ff6100` | 美团入口 |

---

## 字体

### 字体栈

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
  'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
```

### 字号比例（rpx）

| 名称 | 字号 | 行高 | 用途 |
|------|------|------|------|
| **xs** | 20rpx | 1.4 | 标签、角标 |
| **sm** | 22rpx | 1.5 | 辅助文字、时间 |
| **base** | 24rpx | 1.5 | 正文 |
| **md** | 26rpx | 1.5 | 摘要 |
| **lg** | 28rpx | 1.4 | 小标题 |
| **xl** | 32rpx | 1.4 | 区块标题 |
| **2xl** | 34rpx | 1.3 | 卡片标题 |
| **3xl** | 46rpx | 1.2 | 页面标题 |

### 字重

| 名称 | 值 | 用途 |
|------|------|------|
| **Normal** | 400 | 正文 |
| **Medium** | 500 | 强调 |
| **Semibold** | 600 | 小标题 |
| **Bold** | 700 | 标题 |

---

## 间距

基于 4px（约 8rpx）基准的间距系统。

### 间距比例（rpx）

| Token | 值 | 用途 |
|-------|------|------|
| **1** | 4rpx | 微间距 |
| **2** | 8rpx | 紧凑间距 |
| **3** | 12rpx | 元素内间距 |
| **4** | 16rpx | 默认间距 |
| **5** | 20rpx | 舒适间距 |
| **6** | 24rpx | 卡片内边距 |
| **8** | 32rpx | 区块间距 |
| **10** | 40rpx | 大区块间距 |
| **12** | 48rpx | 页面边距 |

### 常用模式

```css
/* 卡片内边距 */
padding: 24rpx;

/* 区块底边距 */
margin-bottom: 26rpx;

/* 列表项间距 */
gap: 12rpx;

/* 页面内边距 */
padding: 24rpx;
```

---

## 圆角

| Token | 值 | 用途 |
|-------|------|------|
| **sm** | 8rpx | 小元素 |
| **md** | 12rpx | 按钮、输入框 |
| **lg** | 16rpx | 小卡片 |
| **xl** | 20rpx | 卡片、区块 |
| **2xl** | 22rpx | 大卡片、Banner |
| **full** | 999rpx | 胶囊按钮、标签 |

---

## 阴影

```css
/* 卡片阴影 */
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

/* 悬浮阴影 */
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

/* 弹窗阴影 */
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
```

---

## 组件规范

### 按钮

#### 主要按钮
```css
.btn-primary {
  padding: 14rpx 28rpx;
  background: #2563eb;
  color: #fff;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 500;
}
```

#### 次要按钮
```css
.btn-secondary {
  padding: 14rpx 28rpx;
  background: #fff;
  color: #2563eb;
  border-radius: 999rpx;
  font-size: 28rpx;
  border: 2rpx solid #2563eb;
}
```

#### 胶囊标签
```css
.pill {
  padding: 10rpx 16rpx;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  border-radius: 999rpx;
  font-size: 22rpx;
}
```

### 卡片

```css
.card {
  padding: 24rpx;
  background: #fff;
  border-radius: 20rpx;
  border: 2rpx solid #edf0f5;
}

.card-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
}

.card-meta {
  font-size: 24rpx;
  color: #6b7280;
}

.card-summary {
  font-size: 24rpx;
  line-height: 1.5;
  color: #374151;
}
```

### 区块

```css
.section {
  margin-bottom: 26rpx;
  padding: 24rpx;
  background: #fff;
  border-radius: 20rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 14rpx;
}

.section-more {
  font-size: 24rpx;
  color: #2563eb;
}
```

### Banner

```css
.banner {
  height: 280rpx;
  border-radius: 22rpx;
  overflow: hidden;
}

.banner-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #fff;
}

.banner-subtitle {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.86);
}
```

### 标签

```css
.tag {
  padding: 8rpx 18rpx;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 999rpx;
  font-size: 20rpx;
}
```

### 地图链接

```css
.map-link {
  padding: 6rpx 14rpx;
  background: #e8f0ff;
  color: #1d4ed8;
  border-radius: 999rpx;
  font-size: 22rpx;
}
```

---

## 交互状态

### Hover/Active
```css
/* 按钮按下态 */
.btn:active {
  opacity: 0.8;
  transform: scale(0.98);
}

/* 链接悬浮 */
.link:hover {
  color: #1d4ed8;
}
```

### 禁用态
```css
.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

### 加载态
```css
.loading {
  opacity: 0.6;
  pointer-events: none;
}
```

---

## 动效

### 时长
- **快速**: 150ms（按钮反馈）
- **正常**: 250ms（页面过渡）
- **慢速**: 400ms（复杂动画）

### 缓动
```css
/* 进入 */
ease-out

/* 退出 */
ease-in

/* 移动 */
ease-in-out
```

---

## 响应式

### 断点（H5）
| 名称 | 宽度 | 用途 |
|------|------|------|
| **sm** | 375px | 手机 |
| **md** | 768px | 平板 |
| **lg** | 1024px | 桌面 |
| **xl** | 1280px | 大屏 |

### 安全区域
```css
/* 适配刘海屏 */
padding-bottom: env(safe-area-inset-bottom);
```

---

## 无障碍

- 颜色对比度 ≥ 4.5:1（正文）
- 可点击区域 ≥ 44px
- 不依赖颜色传递信息
- 表单关联 label

---

## 图标

使用 iconfont 字体图标，位于 `src/common/iconfont.css`

---

## 文件结构

```
src/
├── App.vue              # 全局样式
├── uni.scss             # SCSS 变量
├── common/
│   └── iconfont.css     # 图标字体
└── components/
    ├── poi-card.vue     # POI 卡片组件
    ├── rating-stars.vue # 评分组件
    └── tag-list.vue     # 标签列表组件
```

---

## 使用示例

### 引用颜色变量

uni-app 中使用 SCSS 变量（定义于 `uni.scss`）：

```scss
// uni.scss
$uni-color-primary: #2563eb;
$uni-text-color: #1f2937;
```

### 组件间距

```vue
<style scoped>
.section {
  margin-bottom: 26rpx;
  padding: 24rpx;
}

.section + .section {
  margin-top: 26rpx;
}
</style>
```

---

## 更新日志

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-03-19 | 1.0.0 | 初始版本，从现有页面提取设计系统 |
