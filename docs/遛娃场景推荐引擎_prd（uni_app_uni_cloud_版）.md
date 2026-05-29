# 一、项目背景

当前已有：
- UniApp + Vue3 前端
- UniCloud 后端
- 已有遛娃场所基础数据（含经纬度）

目标升级：
构建“遛娃场景驱动推荐 + 附近餐饮引流 + 美团联盟变现”的一体化系统。

---

# 二、产品目标

## 核心目标

1. 帮用户快速决策：今天带娃去哪 + 吃什么
2. 提升点击率：餐厅点击 → 美团跳转
3. 实现变现：美团联盟 CPS

---

# 三、系统整体架构

## 3.1 数据流

遛娃场所（已有数据）
    ↓
附近餐厅（高德 API + 缓存）
    ↓
推荐引擎（规则 + 标签）
    ↓
前端展示
    ↓
美团联盟跳转

---

# 四、核心模块设计

## 4.1 遛娃场所模块

### 数据结构（play_place）

字段：
- id
- name
- lat (GCJ02)
- lng (GCJ02)
- city
- district
- tags（数组）
- age_range（如："0-3,3-6"）
- indoor（bool）
- parking（bool）
- description
- cover_image

---

## 4.2 餐厅POI缓存模块

### 数据来源
- 高德 POI（主）
- 腾讯 POI（补）

### 表结构（restaurant_poi）

字段：
- id
- name
- lat
- lng
- address
- tel
- category
- avg_price
- rating
- source（gaode/tencent）
- place_id（关联遛娃场所）
- distance
- tags（自定义）
- created_at
- updated_at

---

## 4.3 POI获取逻辑

### 云函数：getNearbyRestaurants(place_id)

逻辑：
1. 查询本地缓存
2. 若存在且未过期（7天）→ 返回
3. 否则调用高德 API
4. 若结果 < 10 → 调腾讯补充
5. 去重（name + 地址相似）
6. 写入数据库
7. 返回结果

---

## 4.4 去重规则

规则：
- 名称相似度 > 0.8
- 经纬度距离 < 50m

保留策略：
- 优先保留高德数据

---

## 4.5 亲子标签系统（核心）

字段（restaurant_tags）：
- kid_friendly（是否亲子友好）
- baby_chair（宝宝椅）
- stroller_ok（可推车）
- quiet（安静）
- kids_menu（儿童餐）
- space_large（空间大）

标签来源：
- 初期：规则推断
- 后期：用户反馈

---

## 4.6 推荐排序引擎

### 排序公式

score =
    0.4 * distance_score +
    0.2 * rating_score +
    0.2 * kid_score +
    0.2 * coupon_score

---

### 子项定义

distance_score = 距离越近越高
rating_score = 评分归一化
kid_score = 标签权重
coupon_score = 是否有优惠（联盟）

---

## 4.7 美团联盟接入模块

### 功能

- 获取推广链接（后端调用）
- 返回跳转 URL

### 云函数：getMeituanLink(poi_id)

返回：
- jump_url
- coupon_info

---

## 4.8 页面结构设计

### 首页

模块：
- 今日推荐
- 附近遛娃场所
- 按年龄筛选
- 按天气推荐

---

### 场所详情页

模块：
1. 场所信息
2. 附近美食（核心）
3. 推荐方案（可选）

---

### 餐厅卡片

字段：
- 名称
- 距离
- 评分
- 人均
- 标签

按钮：
- 去美团看看
- 今日优惠（高亮）

---

# 五、接口设计

## 5.1 获取场所列表
GET /places

## 5.2 获取场所详情
GET /place/:id

## 5.3 获取附近餐厅
GET /restaurants?place_id=xxx

## 5.4 获取美团链接
GET /meituan/link?poi_id=xxx

---

# 六、缓存策略

- 缓存粒度：place_id
- 过期时间：7天
- 更新方式：懒更新

---

# 七、前端技术实现

框架：
- UniApp + Vue3

组件：
- place-list
- place-detail
- restaurant-list
- restaurant-card

---

# 八、后端技术实现

平台：
- UniCloud

模块：
- 云函数（API）
- 云数据库（POI缓存）

---

# 九、埋点与数据分析

需要埋点：

- 点击餐厅
- 点击美团跳转
- 场所浏览

---

# 十、开发优先级

P0：
- 场所展示
- 附近餐厅
- 美团跳转

P1：
- 标签系统
- 排序优化

P2：
- 推荐路线
- 用户反馈

---

# 十一、未来扩展

- 商家合作
- 团购系统
- 用户评分

---

# 十二、关键成功指标（KPI）

- 餐厅点击率
- 跳转率
- 成交转化率

---

# 结束

