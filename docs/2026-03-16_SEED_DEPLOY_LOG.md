# 2026-03-16 Seed 与云端部署记录

## 目标

- 将 seed 能力挂到现有 `babyplace-admin` HTTP 入口，避免新增 URL。
- 将 `scripts/seed.py` 改造成一键运行脚本。
- 完成云函数与云表 schema 部署，并实际导入当前测试数据。

## 代码改动

### 1) `babyplace-admin` 增加 seed action

文件：`uniCloud-aliyun/cloudfunctions/babyplace-admin/index.js`

新增 action：

- `ping` / `seed.ping`
- `insertBatch` / `seed.insertBatch`
- `clearCollections` / `seed.clearCollections`

新增能力：

- 四表白名单写入：
  - `babyplace-poi`
  - `babyplace-article`
  - `babyplace-content-source`
  - `babyplace-user-review`
- 批量导入鉴权：`secret === babyplace2026`
- 批量清档（按传入集合）
- 统一字段补全（适配 schema 必填字段）

兼容处理：

- Aliyun 空间不支持 `db.serverDate()`，seed 写入时间改为 `Date.now()`，避免插入失败。

### 2) `seed.py` 一键化

文件：`scripts/seed.py`

主要调整：

- 默认 URL：`https://byupload.aixifs.com/babyplace-admin`
- 默认 secret：`babyplace2026`
- 直接 `python scripts/seed.py` 即可执行（默认先清空再导入）
- 增加批次重试：`--retry`（默认 3）
- 增加清档模式：`--clear-only`
- 支持 `--no-reset`（保留原数据）

执行顺序：

1. `ping`
2. 可选清档 `clearCollections`
3. 导入 `babyplace-poi`
4. 导入 `babyplace-article`
5. 构建并导入 `babyplace-content-source`
6. 构建并导入 `babyplace-user-review`

## 部署记录

已执行：

1. `pnpm run deploy:cloud:functions`
2. `pnpm run deploy:cloud:babyplace-db`
3. 逐个 schema 上传：
   - `babyplace.schema.json`
   - `babyplace-poi.schema.json`
   - `babyplace-article.schema.json`
   - `babyplace-content-source.schema.json`
   - `babyplace-user-review.schema.json`
4. 单函数强制上传：
   - `C:\\HBuilderX\\cli.exe cloud functions --upload cloudfunction --prj babyplace --provider aliyun --name babyplace-admin`

## 导入结果（本次）

命令：`python scripts/seed.py`

结果：

- POI：1000
- Article：300
- Content Source：1200
- Review：300

说明：

- 导入过程中出现过 SSL EOF 抖动，已由脚本重试机制自动恢复，最终全部导入成功。

## 运行说明（后续）

- 一键导入测试数据：`python scripts/seed.py`
- 仅清档不导入：`python scripts/seed.py --clear-only`
- 保留现有数据并增量导入：`python scripts/seed.py --no-reset`
