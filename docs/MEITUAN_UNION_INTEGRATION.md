# 美团联盟接入说明

## 目标

为 `babyplace` 项目补齐“地点详情页 -> 附近餐厅 -> 美团联盟跳转”的可运行链路。

当前已完成：

- 小程序端生成美团小程序跳转路径
- H5 端生成联盟 H5 跳转链接
- 后端按 `AppKey + sid + 活动链接` 拼接联盟投放链接
- 前端详情页按钮已接入该后端逻辑

---

## 已知参数来源

当前项目使用的参数和线索来自：

- `docs/meituan.json`
- 美团联盟帮助中心：
  - `https://union.meituan.com/single/helpCenter`
- 官方 PDF：
  - `https://s3plus.meituan.net/v1/mss_5017c592a8a946d2a54eb62a76ba299c/nebulafile/%E7%BE%8E%E5%9B%A2%E8%81%94%E7%9B%9FCPS%E5%90%88%E4%BD%9C%E6%8E%A5%E5%8F%A3%E6%96%87%E6%A1%A3V4-20201027.pdf`

当前确认可用的参数：

- `AppKey`
  - `5ef645b72a4d2aa516edc2cfe9a8f85b`
- 美团外卖小程序 `AppID`
  - `wxde8ac0a21135c07d`
- 优选小程序 `AppID`
  - `wx77af438b3505c00e`

---

## 当前实现结论

本次接入采用的是美团官方文档中的：

- `方式 1：H5 领券`
- `方式 4：从其他小程序跳转美团小程序`

也就是：

1. 先拿一个“活动推广链接”
2. 在活动推广链接尾部拼接 `appkey=appkey:sid`
3. 再把整条链接 urlencode 一次
4. 拼到 `runion.meituan.com/url`
5. H5 直接打开 `runion` 链接
6. 小程序则将 `runion` 链接再次 urlencode，拼到美团小程序 path 上

本次实现里，`AppSecret` 没有使用。

原因：

- 当前官方文档所描述的小程序跳转规则，核心参数是 `appkey + sid + 活动链接`
- 你当前提供的材料也没有给到 `AppSecret`
- 在现阶段，已经足够先跑通联盟跳转链路

---

## 当前使用的默认配置

配置文件：

- [config.json](/C:/Users/Admin/babyplace/uniCloud-aliyun/cloudfunctions/common/uni-config-center/meituan/config.json)

当前配置内容含义：

- `appKey`
  - 联盟渠道识别参数
- `waimaiMiniAppId`
  - 美团外卖小程序 AppID
- `youxuanMiniAppId`
  - 预留的优选小程序 AppID
- `defaultSidPrefix`
  - 渠道前缀，当前为 `babyplace`
- `defaultActivityUrl`
  - 默认活动推广链接
- `runionUrl`
  - 统一跳转服务地址
- `enableToken`
  - 是否拼接免登录参数，当前为 `false`

当前默认活动链接为：

```text
https://i.meituan.com/awp/hfe/block/d96243aa3d49acef70d9/81974/index.html
```

说明：

- 这个链接是根据官方 PDF 中的示例规则选用的默认会场
- 它用于先跑通联盟链路
- 后续如果你从 `mediaList` 或联盟后台拿到你自己的正式活动推广链接，只需要替换这个值即可

---

## 链接生成规则

### 1. 生成 sid

当前实现会根据餐厅 ID / 地点 ID / 名称生成一个稳定的 `sid`：

- 规则：`babyplace + seed`
- 仅保留小写字母和数字
- 最大长度 64

示例：

```text
babyplacerestaurant123
```

---

### 2. 生成活动投放链接

在原始活动链接后拼接：

```text
?appkey={appKey}:{sid}
```

示例：

```text
https://i.meituan.com/awp/hfe/block/d96243aa3d49acef70d9/81974/index.html?appkey=5ef645b72a4d2aa516edc2cfe9a8f85b:babyplacerestaurant123
```

---

### 3. 生成 runion 跳转链接

将上一步完整 URL urlencode 一次后，拼接：

```text
https://runion.meituan.com/url?key={appKey}&url={urlencoded_activity_url}&sid={sid}
```

用途：

- H5 页面直接跳这个链接
- 小程序 path 的 `weburl` 也使用这个链接

---

### 4. 生成微信小程序跳转 path

根据官方 PDF：

```text
/index/pages/h5/h5?weburl={urlencoded_runion_link}
```

如果以后启用免登录，可额外追加：

```text
&f_token=1&f_userId=1
```

当前项目默认不启用这两个参数。

---

## 代码落点

### 云端配置

- [config.json](/C:/Users/Admin/babyplace/uniCloud-aliyun/cloudfunctions/common/uni-config-center/meituan/config.json)

### 云端生成逻辑

- [index.obj.js](/C:/Users/Admin/babyplace/uniCloud-aliyun/cloudfunctions/restaurant/index.obj.js)

关键函数：

- `buildSid`
- `buildMeituanPromoLinks`
- `getLink`

### 前端 API

- [restaurant.js](/C:/Users/Admin/babyplace/src/api/restaurant.js)

### 前端详情页入口

- [shop.vue](/C:/Users/Admin/babyplace/src/pages/life/shop/shop.vue)

按钮逻辑：

1. 前端调用 `getRestaurantLink`
2. 如果返回 `app_id + page_path`
   - 小程序中使用 `uni.navigateToMiniProgram`
3. 如果没有小程序参数但有 `jump_url`
   - H5 中打开联盟链接
4. 如果都失败
   - 回退为复制餐厅名称

---

## 当前运行策略

### 小程序

优先使用：

- `app_id = wxde8ac0a21135c07d`
- `page_path = /index/pages/h5/h5?weburl=...`

也就是从本小程序跳转到美团外卖小程序。

### H5

直接打开：

- `https://runion.meituan.com/url?...`

---

## 当前边界

当前接入已经可运行，但仍有一个边界：

- 当前 `defaultActivityUrl` 使用的是默认会场链接
- 它不一定是你在联盟后台最终要投放的专属媒体位链接

这意味着：

- 现在联盟链路已经能跳
- 但后续最好替换成你在联盟后台正式配置的活动推广链接

---

## 后续如何切正式链接

当你从美团联盟后台拿到正式活动推广链接后，只需要修改：

- [config.json](/C:/Users/Admin/babyplace/uniCloud-aliyun/cloudfunctions/common/uni-config-center/meituan/config.json)

把：

- `defaultActivityUrl`

替换为你的正式活动链接，然后重新上传：

```powershell
C:\HBuilderX\cli.exe cloud functions --upload common --prj babyplace --provider aliyun --name uni-config-center
C:\HBuilderX\cli.exe cloud functions --upload cloudfunction --prj babyplace --provider aliyun --name restaurant
```

---

## 已完成的部署动作

本次已经执行并成功：

- 上传 `uni-config-center`
- 上传 `restaurant` 云对象

并已验证：

- `pnpm run build:mp-weixin`
- `pnpm run build:h5`

均通过。

---

## 建议

下一步优先做：

1. 从 `https://union.meituan.com/v2/mediaList` 拿到正式活动推广链接
2. 替换 `defaultActivityUrl`
3. 再补联盟点击埋点和跳转成功埋点

