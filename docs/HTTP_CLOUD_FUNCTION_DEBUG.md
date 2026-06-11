# 云函数 HTTP 访问与批量导入调试记录

## 背景

为 babyplace 数据表增加批量导入接口，允许外部应用通过 HTTP API 批量导入数据。

## 实现内容

1. 云函数新增 `batchImport` action
2. 支持 HTTP URL 化访问
3. Python 脚本从 JSONPlaceholder 生成测试数据并导入

---

## 调试过程

### 问题 1: 云函数重命名

**现象**: 原云函数名为 `goods-admin`，与数据表名 `babyplace` 不一致。

**解决**: 
- 将 `uniCloud-aliyun/cloudfunctions/goods-admin` 重命名为 `babyplace-admin`
- 更新 `package.json` 中的 name 字段
- 更新 `src/api/goods.js` 中的云函数调用名称

### 问题 2: 云函数 URL 化返回 404

**现象**: 
```
HTTP Error 404: {"success":false,"error":{"code":"InternalBizError","message":"no_matching_function_for_path /babyplace-admin"}}
```

**原因**: 云函数未配置 HTTP 访问路径。

**解决**:
1. 登录 uniCloud 控制台: https://unicloud.dcloud.net.cn
2. 进入云空间 → 云函数 → babyplace-admin → 详情
3. 配置"云函数URL化"，设置访问路径为 `/babyplace-admin`
4. 保存配置

### 问题 3: 云函数部署后代码未更新

**现象**: 部署成功但返回旧代码结果 `{"code":400,"message":"invalid action"}`。

**原因**: HBuilderX CLI 的 `--upload allcloudfunctions` 命令可能未正确上传单个云函数。

**解决**: 使用单函数上传命令:
```bash
"C:\HBuilderX\cli.exe" cloud functions --upload cloudfunction --prj babyplace --provider aliyun --name babyplace-admin
```

输出应包含:
```
[阿里云:xxx] 正在上传云函数babyplace-admin...
[阿里云:xxx] 云函数babyplace-admin上传完成
```

### 问题 4: HTTP 请求参数解析

**现象**: 云函数收到 HTTP 请求但无法解析 action。

**原因**: uniCloud HTTP 访问时，请求体在 `event.body` 字符串中，而非直接在 `event` 对象上。

**解决**: 在云函数入口解析 body:
```javascript
exports.main = async (event, context) => {
  let params = event;

  // HTTP 请求时解析 body
  if (event.httpMethod && event.body) {
    try {
      let body = event.body;
      if (event.isBase64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf8');
      }
      params = JSON.parse(body);
    } catch (e) {
      return { code: 400, message: 'invalid JSON body' };
    }
  }

  // 使用 params.action 而非 event.action
  const action = sanitizeString(params.action);
  // ...
};
```

### 问题 5: 调试技巧 - 极简验证

**现象**: 复杂代码难以定位问题。

**解决**: 使用极简代码验证云函数是否正确部署:
```javascript
'use strict';

exports.main = async (event, context) => {
  return {
    code: 0,
    message: 'hello from babyplace-admin v1',
    data: {
      keys: Object.keys(event),
      action: event.action,
      body: event.body
    }
  };
};
```

部署后测试:
```bash
curl -X POST https://byupload.aixifs.com/babyplace-admin \
  -H "Content-Type: application/json" \
  -d '{"action": "list"}'
```

返回正确则说明云函数已正确部署，可逐步添加业务代码。

---

## 最终方案

### 1. 云函数代码结构

```
uniCloud-aliyun/cloudfunctions/babyplace-admin/
├── index.js      # 主逻辑
└── package.json  # 依赖配置
```

### 2. HTTP 请求格式

```bash
POST https://byupload.aixifs.com/babyplace-admin
Content-Type: application/json

{
  "action": "batchImport",
  "secret": "babyplace2026",
  "items": [
    {
      "name": "景点名称",
      "lat": 31.2304,
      "lng": 121.4737,
      "address": "详细地址"
    }
  ]
}
```

### 3. 支持的 Actions

| Action | 权限 | 说明 |
|--------|------|------|
| `list` | 公开 | 列表查询 |
| `detail` | 公开 | 详情查询 |
| `create` | Admin | 创建记录 |
| `update` | Admin | 更新记录 |
| `remove` | Admin | 删除记录 |
| `batchImport` | Admin 或 Secret | 批量导入 |

### 4. 批量导入认证

两种方式:

**方式一**: uni-id Token (Admin 角色)
```json
{
  "action": "batchImport",
  "items": [...]
}
```

**方式二**: 密钥认证
```json
{
  "action": "batchImport",
  "secret": "babyplace2026",
  "items": [...]
}
```

### 5. Python 导入脚本

```bash
# 干运行 (仅生成数据)
python scripts/import_test_data.py --dry-run

# 保存到文件
python scripts/import_test_data.py --output test_data.json

# 导入到云端
python scripts/import_test_data.py --url https://byupload.aixifs.com/babyplace-admin --count 50
```

---

## 常用命令

```bash
# 部署单个云函数
"C:\HBuilderX\cli.exe" cloud functions --upload cloudfunction --prj babyplace --provider aliyun --name babyplace-admin

# 部署所有云函数
pnpm run deploy:cloud:functions

# 测试 HTTP 访问
curl -X POST https://byupload.aixifs.com/babyplace-admin \
  -H "Content-Type: application/json" \
  -d '{"action": "list", "page": 1, "pageSize": 10}'
```

---

## 关键经验总结

1. **云函数部署验证**: 部署后用极简代码验证，确认代码已更新
2. **HTTP body 解析**: uniCloud HTTP 访问时参数在 `event.body` 字符串中
3. **单函数上传**: 使用 `--upload cloudfunction --name xxx` 确保单个函数正确上传
4. **调试输出**: 在云函数中返回 `event` 对象结构可快速定位问题
5. **控制台配置**: HTTP 路径需要在 uniCloud 控制台手动配置

---

## 参考文档

- [uniCloud 云函数 URL 化](https://doc.dcloud.net.cn/uniCloud/http.html)
- [JSONPlaceholder 测试数据](https://jsonplaceholder.typicode.com)
