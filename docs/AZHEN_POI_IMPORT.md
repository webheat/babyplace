# 阿珍资料地点导入

## 当前目标

- 从 `docs/真的叫阿珍/真的叫阿珍.json` 中识别明确景点。
- 用高德 Web 服务补齐坐标和标准地址。
- 抽取正文里的交通和停车提示。
- 通过 uniCloud 原生调用 `babyplace-seed-v2` upsert 到 `babyplace-poi`。

## 当前库表关系

- 主表：`babyplace-poi`
- 内容源：`babyplace-article`
- 关联表：`babyplace-content-source`
- 用户评价：`babyplace-user-review`

详细说明见 [DATABASE_RELATIONS.md](/C:/Users/Admin/babyplace/docs/DATABASE_RELATIONS.md)。

## 导入脚本

- 脚本：`scripts/enrich_azhen_poi.py`
- 默认策略：
  - 只自动处理 `appmsg_album_infos` 中能识别出明确景点名的文章
  - 仅导入目标城市范围内的数据
  - 高德接口带重试
  - 输出 prepared / skipped / upsert 报告
  - 默认走 uniCloud 原生 `seed.upsertPoiBatch`
  - 本机会自动从 HBuilderX 配置读取 `spaceId / clientSecret`
  - 如明确指定 `--transport http`，才会走旧的 HTTP 入口

## 用法

先 dry-run：

```bash
set AMAP_WEB_KEY=你的高德Web服务Key
python scripts/enrich_azhen_poi.py --dry-run
```

确认报告后正式导入：

```bash
set AMAP_WEB_KEY=你的高德Web服务Key
python scripts/enrich_azhen_poi.py
```

如果要先清空 `babyplace-poi` 再重跑：

```bash
set AMAP_WEB_KEY=你的高德Web服务Key
python scripts/enrich_azhen_poi.py --clear-poi-before-run
```

也可以直接用 package script：

```bash
set AMAP_WEB_KEY=你的高德Web服务Key
pnpm run ingest:azhen:dry-run
pnpm run ingest:azhen
pnpm run ingest:azhen:reset
```

## 报告输出

输出目录：`seed/reports`

- `azhen-poi-prepared-*.json`
- `azhen-poi-skipped-*.json`
- `azhen-poi-upsert-result-*.json`

## 注意

- 当前自动入库只做高置信数据，模糊文章会进入 skipped 报告，避免错误坐标写库。
- 如果后续要扩大覆盖率，可以再增加大模型抽取兜底，但不应放宽当前高置信规则。
- 当前稳定增量链路依赖 `babyplace-seed-v2`；如果要换机器执行，需保证该机器的 HBuilderX 已登录并关联当前 uniCloud 空间，或手动提供 `UNICLOUD_SPACE_ID / UNICLOUD_CLIENT_SECRET`。
