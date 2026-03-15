# uni-id 接入说明

本仓库已完成 uni-id 的最小接入骨架，并且现在已经引入官方模块。当前项目还需要完成的，是**配置填充、云端上传和管理员角色分配**，而不是继续手写登录页。

## 当前仓库已完成

- 官方模块已导入：`uni-id-pages`、`uni-id-common`、`uni-config-center`、`x-uni-id-co`
- `App.vue` 已执行 `uni-id-pages/init.js`
- 新增云端配置模板：`uniCloud-aliyun/cloudfunctions/common/uni-config-center/uni-id/config.json`
- 新增前端登录状态工具：`src/utils/auth.js`
- 新增登录接入页：`src/pages/auth/index.vue`
- 首页增加登录中心入口：`src/pages/index/index.vue`
- `goods-admin` 云函数已按 `uni-id-common` 预留管理员鉴权入口

## 还需要完成的配置

### 1. 上传官方 uniCloud 资源

把这些模块带的云对象、公共模块和数据表上传到当前服务空间：

- `uni-id-pages`
- `uni-id-common`
- `uni-config-center`
- `x-uni-id-co`

如果你是通过 HBuilderX 导入的，通常在 uniCloud 资源管理器里上传即可。

### 2. 上传数据表

至少需要：

- `uni-id-users`
- `opendb-verify-codes`

如果后续启用角色权限后台，再补 `uni-id-roles`、`uni-id-permissions` 等。

### 3. 替换云端 secret

编辑：`uniCloud-aliyun/cloudfunctions/common/uni-config-center/uni-id/config.json`

必须替换：

- `passwordSecret`
- `tokenSecret`
- `requestAuthSecret`

不要把模板值直接用于生产环境。

### 4. 配置微信登录

#### 微信小程序

- 在 `src/manifest.json` 的 `mp-weixin.appid` 填入小程序 AppID
- 在云端 `config.json` 的 `mp-weixin.oauth.weixin` 填入：
  - `appid`
  - `appsecret`

#### 公众号 / H5

- 在 `src/uni_modules/uni-id-pages/config.js` 的 `appid.weixin.h5 / web` 填入对应值
- 在云端 `config.json` 的 `web.oauth.weixin` 填入：
  - `appid`
  - `appsecret`

如果未来要打通“小程序 + 公众号”同一用户，建议把两者绑定到同一个微信开放平台账号下，使用 UnionID 统一身份。

### 5. 创建管理员账号

商品管理云函数 `goods-admin` 要求当前用户 `role` 中包含 `admin`。

建议流程：

- 用 `uni-id-pages` 注册一个后台账号
- 在 `uni-id-users` 或后台管理工具中给该用户加上 `admin` 角色
- 再调用商品 `create/update/remove`

## 验收标准

- 应用启动时 `uni-id-pages/init.js` 执行成功
- 能打开官方登录页并登录成功
- 本地存在 `uni_id_token`
- `goods-admin` 的 `list/detail` 可匿名访问
- 普通用户调用写接口返回无权限
- `admin` 用户调用写接口成功
