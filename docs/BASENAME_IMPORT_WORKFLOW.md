# basename.csv 导入流程

## 用途

把 [basename.csv](/C:/Users/Admin/babyplace/docs/basename.csv) 中的基础景点名称补全成可用业务数据：

1. 从高德获取地址和坐标
2. 用大模型生成景点简介
3. 更新 `babyplace-poi`
4. 更新 `babyplace-article`
5. 重复地点只更新描述，不重复插入

## 脚本

- [import_basename_poi.py](/C:/Users/Admin/babyplace/scripts/import_basename_poi.py)

## 必要环境变量

```powershell
$env:AMAP_WEB_KEY='你的高德 Web 服务 Key'
$env:ZHIPU_API_KEY='你的智谱 API Key'
```

脚本会自动读取本机 HBuilderX 里的 uniCloud 空间配置。

## dry-run

```powershell
python scripts\import_basename_poi.py --dry-run
```

## 正式导入

```powershell
python scripts\import_basename_poi.py
```

## 输出报告

输出目录：

- [seed/reports](/C:/Users/Admin/babyplace/seed/reports)

会生成：

- `basename-prepared-*.json`
- `basename-skipped-*.json`
- `basename-upsert-result-*.json`

## 云端写入规则

- `babyplace-poi`
  按 `name / canonical_name / alias` 去重 upsert
- `babyplace-article`
  按 AI 文章标题或 `extracted_poi_names` 去重 upsert

## 说明

这条流程依赖：

- [babyplace-seed-v2/index.js](/C:/Users/Admin/babyplace/uniCloud-aliyun/cloudfunctions/babyplace-seed-v2/index.js)

如果你修改了云函数，记得重新上传：

```powershell
& 'C:\HBuilderX\cli.exe' cloud functions --upload cloudfunction --prj babyplace --provider aliyun --name babyplace-seed-v2
```
