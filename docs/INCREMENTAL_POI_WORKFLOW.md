# babyplace 增量导入标准流程

## 目标

这份文档用于固定 babyplace 的地点增量导入流程，覆盖以下场景：

- 清理旧测试数据后重新导入一版干净业务数据
- 从 `docs/网络数据源` 下同格式 JSON 中持续抽取地点
- 调用高德服务补齐坐标、标准地址、交通和停车信息
- 以“按名称增量更新”为主，不再走重复插入

当前稳定链路已经切到：

- 导入脚本：[scripts/enrich_azhen_poi.py](/C:/Users/Admin/babyplace/scripts/enrich_azhen_poi.py)
- 云函数：[babyplace-seed-v2/index.js](/C:/Users/Admin/babyplace/uniCloud-aliyun/cloudfunctions/babyplace-seed-v2/index.js)
- 主数据表：`babyplace-poi`

## 数据表关系

当前和地点导入直接相关的表如下：

- `babyplace-poi`
  这是主表。景点基础信息、坐标、交通、停车、设施等都落在这里。
- `babyplace-article`
  用于保存内容文章本身。
- `babyplace-content-source`
  用于保存文章和地点之间的证据关系。
- `babyplace-user-review`
  用户评价表。

更详细结构见 [DATABASE_RELATIONS.md](/C:/Users/Admin/babyplace/docs/DATABASE_RELATIONS.md)。

## 当前字段约定

本轮地点导入主要写入 `babyplace-poi` 的这些字段：

- `name`
- `canonical_name`
- `alias`
- `city`
- `district`
- `address`
- `location.lat`
- `location.lng`
- `transport`
- `transport_hint`
- `parking_tip`
- `facilities.stroller_friendly`
- `facilities.parking`
- `summary`
- `recommend_reason`
- `status`

## 依赖前提

执行机器需要满足：

1. 已安装项目依赖

```powershell
pnpm install
```

2. 已安装 HBuilderX CLI，且当前项目已关联正确的 uniCloud 阿里云空间

当前空间是：

- `spaceId`: `mp-55536281-ad8f-4f58-b590-ad515baf863a`
- `space name`: `pay5`

3. HBuilderX 已登录，且本机能读取到该空间的 `clientSecret`

脚本默认会自动从本机 HBuilderX 配置中读取，不需要手填。

4. 已准备高德 Web 服务 Key

当前可用 Key：

- `AMAP_WEB_KEY=abcef158da87a62e42e1fb968ed33dd4`

## 当前稳定技术方案

### 1. 导入方式

默认使用：

- 高德 Web 服务做地点检索和地址补全
- uniCloud 原生 `api.next.bspapp.com/client` 调用云函数
- 云函数 `babyplace-seed-v2`

### 2. 为什么不用旧 HTTP 路由

旧的：

- `https://byupload.aixifs.com/babyplace-admin`

虽然还能处理部分老 action，但线上版本更新不稳定，之前反复出现：

- `seed.upsertPoiBatch invalid action`

因此现在标准流程不再依赖它。

### 3. 增量更新规则

`babyplace-seed-v2` 的 `seed.upsertPoiBatch` 会按以下顺序匹配已有 POI：

1. `_id`
2. `name`
3. `canonical_name`
4. `alias`

命中后执行更新；未命中时执行创建。

这就是当前“稳定长期运行的增量流”。

## 标准操作流程

### 场景 A：先清空 `babyplace-poi`，再重新导入一版干净数据

适用于你后面“清档后重跑”的场景。

步骤：

1. 先 dry-run 看本次会准备多少条数据

```powershell
$env:AMAP_WEB_KEY='abcef158da87a62e42e1fb968ed33dd4'
pnpm run ingest:azhen:dry-run
```

2. 检查报告文件

输出目录：

- [seed/reports](/C:/Users/Admin/babyplace/seed/reports)

重点看：

- `azhen-poi-prepared-*.json`
- `azhen-poi-skipped-*.json`

3. 确认无误后，清空 `babyplace-poi` 并重跑正式导入

```powershell
$env:AMAP_WEB_KEY='abcef158da87a62e42e1fb968ed33dd4'
pnpm run ingest:azhen:reset
```

这条命令会做两件事：

- 先调用 `seed.clearCollections` 清空 `babyplace-poi`
- 再调用 `seed.upsertPoiBatch` 写入本次 prepared 数据

### 场景 B：不清库，直接做增量更新

适用于后续持续追加新资料。

步骤：

1. dry-run

```powershell
$env:AMAP_WEB_KEY='abcef158da87a62e42e1fb968ed33dd4'
pnpm run ingest:azhen:dry-run
```

2. 正式导入

```powershell
$env:AMAP_WEB_KEY='abcef158da87a62e42e1fb968ed33dd4'
pnpm run ingest:azhen
```

### 场景 C：不是阿珍这份 JSON，而是另一份同格式 JSON

可以直接指定源文件：

```powershell
$env:AMAP_WEB_KEY='abcef158da87a62e42e1fb968ed33dd4'
python scripts\enrich_azhen_poi.py --transport native --source "你的源文件.json" --dry-run
python scripts\enrich_azhen_poi.py --transport native --source "你的源文件.json"
```

如果要清空 `babyplace-poi` 后再导入：

```powershell
$env:AMAP_WEB_KEY='abcef158da87a62e42e1fb968ed33dd4'
python scripts\enrich_azhen_poi.py --transport native --source "你的源文件.json" --clear-poi-before-run
```

## 每一步实际发生了什么

### dry-run

脚本会：

1. 读取源 JSON
2. 从内容里抽取明确地点名
3. 用高德补地址和经纬度
4. 从正文抽取 `transport_hint` 和 `parking_tip`
5. 过滤低置信或明显不在目标范围的数据
6. 生成 prepared/skipped 报告
7. 不写库

### 正式导入

在 dry-run 的基础上，再做：

1. 调用 uniCloud 原生接口鉴权
2. 调用 `babyplace-seed-v2`
3. 执行 `seed.upsertPoiBatch`
4. 生成 `azhen-poi-upsert-result-*.json`

## 报告文件说明

目录：

- [seed/reports](/C:/Users/Admin/babyplace/seed/reports)

文件类型：

- `azhen-poi-prepared-*.json`
  这次准备写库的数据
- `azhen-poi-skipped-*.json`
  这次被跳过的数据，以及原因
- `azhen-poi-upsert-result-*.json`
  实际写库结果，包含成功和失败明细

## 云函数验证方法

如果你怀疑云函数没更新，可以用下面的思路验证：

1. 确认云端已存在 `babyplace-seed-v2`

```powershell
& 'C:\HBuilderX\cli.exe' cloud functions --list cloudfunction --prj babyplace --provider aliyun --cloud
```

2. 如有修改，显式上传这个函数

```powershell
& 'C:\HBuilderX\cli.exe' cloud functions --upload cloudfunction --prj babyplace --provider aliyun --name babyplace-seed-v2
```

不要只依赖旧的 `allcloudfunctions` 命令。

## 当前推荐发布命令

项目里已经调整过：

- [package.json](/C:/Users/Admin/babyplace/package.json)

当前云函数发布命令为：

```powershell
pnpm run deploy:cloud:functions
```

底层实际执行的是：

```powershell
C:\HBuilderX\cli.exe cloud functions --upload all --prj babyplace --provider aliyun
```

如果只是改了增量导入云函数，推荐直接单独上传：

```powershell
& 'C:\HBuilderX\cli.exe' cloud functions --upload cloudfunction --prj babyplace --provider aliyun --name babyplace-seed-v2
```

## 常见问题

### 1. 报 `missing --amap-web-key or AMAP_WEB_KEY`

说明没有设置高德 Key。

执行前先设置：

```powershell
$env:AMAP_WEB_KEY='abcef158da87a62e42e1fb968ed33dd4'
```

### 2. 旧 HTTP 接口返回 `invalid action`

这是旧链路的问题，不影响当前标准流程。

处理方式：

- 不要再把旧 HTTP 接口作为主链路
- 改用当前脚本默认的 `--transport native`

### 3. HBuilderX 上传单函数时报错

优先检查：

- 函数目录下是否有 `index.js`
- 函数目录下是否有合法 `package.json`

当前这两个函数已经补齐：

- [babyplace-seed-v2/index.js](/C:/Users/Admin/babyplace/uniCloud-aliyun/cloudfunctions/babyplace-seed-v2/index.js)
- [demo/index.js](/C:/Users/Admin/babyplace/uniCloud-aliyun/cloudfunctions/demo/index.js)

### 4. 如何确认增量更新真的生效

最直接的判断是：

- 同一个 `name/canonical_name/alias` 再次导入时，应该走 `mode=update`
- 而不是新增重复记录

结果会写在：

- `azhen-poi-upsert-result-*.json`

## 推荐日常操作

以后如果你拿到一份新的同格式地点资料，日常就按下面做：

1. 放入 `docs/网络数据源` 或指定路径
2. 执行 dry-run
3. 先看 prepared/skipped 报告
4. 确认后执行正式导入
5. 检查 upsert 结果报告

对应命令：

```powershell
$env:AMAP_WEB_KEY='abcef158da87a62e42e1fb968ed33dd4'
python scripts\enrich_azhen_poi.py --transport native --source "你的源文件.json" --dry-run
python scripts\enrich_azhen_poi.py --transport native --source "你的源文件.json"
```

## 当前结论

截至 `2026-03-19`，稳定可用的标准链路是：

- 源数据 JSON
- [enrich_azhen_poi.py](/C:/Users/Admin/babyplace/scripts/enrich_azhen_poi.py)
- 高德 Web 服务
- `babyplace-seed-v2`
- `babyplace-poi`

后面你如果要先清档，再重新跑一遍真实业务数据，就按这份文档执行即可。
