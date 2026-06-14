# AiToEarn 私有部署 + Relay 方案

## 背景

aitoearn.cn 托管版的 MCP API 始终返回 "Account not found"，Web 后台能看到绑定的 B站/抖音账号但 API 查不到，属于数据同步问题。

**解决方案**：私有部署 AiToEarn，通过 Relay 借用官方 OAuth 凭证，账号存在本地 MongoDB。

## 原理

| | aitoearn.cn 托管版 | 私有部署 + Relay |
|---|---|---|
| 账号数据库 | 共享实例（MCP 找不到账号） | **本地 MongoDB** |
| OAuth 凭证 | 官方提供 | 通过 Relay **借用官方** |
| MCP API | 共享端点（数据不同步） | **本地端点，数据一致** |

## 部署步骤

### 1. 克隆仓库

```bash
export https_proxy=http://127.0.0.1:7890
git clone https://github.com/yikart/AiToEarn.git /opt/AiToEarn
cd /opt/AiToEarn
```

### 2. 修改 docker-compose.yml

在 `aitoearn-server` 服务的 `environment` 中配置 Relay：

```yaml
# Relay 配置（国内版用 aitoearn.cn）
RELAY_SERVER_URL: https://aitoearn.cn/api    # 国内版！不是 aitoearn.ai
RELAY_API_KEY: ak_eREghUf8jv4P6A4omfroGt07n7gbPlGqnSA5iLFZhezERFF0
RELAY_CALLBACK_URL: http://localhost:8080/api/plat/relay-callback
```

> ⚠️ RELAY_SERVER_URL 必须和 API Key 版本匹配：
> - 国内版 Key → `https://aitoearn.cn/api`
> - 国际版 Key → `https://aitoearn.ai/api`
> - 不匹配会返回 401

### 3. 启动服务

```bash
docker compose up -d
```

启动后打开 http://localhost:8080 即可使用。

### 4. 绑定平台账号

在 Web 后台 → 设置 → 账号管理，绑定：
- B站（bilibili）
- 抖音（douyin）

OAuth 授权通过 Relay 走官方凭据，账号数据存在本地 MongoDB。

### 5. 获取本地 API Key

登录 Web 后台后，在设置中获取 API Key（与托管版的不同）。

## MCP API 使用

```bash
# 本地 MCP 端点
MCP_URL=http://localhost:8080/api/unified/mcp
API_KEY=<本地获取的API Key>

# 测试连接
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: $API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"getMyProfile","arguments":{}}}'

# 获取 B站分区列表（需要绑定后获得的 accountId）
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: $API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"listBilibiliChannelPlatformCategories","arguments":{"accountId":"<绑定后的ID>"}}}'
```

## 发布视频示例

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "createChannelPublishFlow",
    "arguments": {
      "content": {
        "title": "视频标题",
        "body": "视频描述",
        "media": [{"url": "https://公网视频URL.mp4"}]
      },
      "items": [{
        "platform": "bilibili",
        "accountId": "<本地绑定后的账号ID>",
        "option": {"tid": 21, "copyright": 1, "no_reprint": 1}
      }],
      "publishAt": "2026-06-15T10:00:00Z"
    }
  }
}
```

## 服务架构

```
nginx (8080)
  ├── aitoearn-web (3000)    # Next.js 前端
  ├── aitoearn-server (3002) # NestJS 后端 + MCP API
  └── aitoearn-ai (3010)     # AI 服务
mongodb (27017)              # 账号、任务等数据
redis (6379)                 # 缓存
rustfs (9000/9001)           # 对象存储（视频/图片）
```

## 与 babyplace 集成

私有部署稳定后，可将 MCP 调用集成到 babyplace 的发布流程中：

```javascript
// src/api/publish.js
const MCP_URL = 'http://<服务器IP>:8080/api/unified/mcp'
const API_KEY = '<本地API Key>'

export async function publishToBilibili({ title, body, videoUrl, accountId }) {
  const res = await uni.request({
    url: MCP_URL,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'x-api-key': API_KEY
    },
    data: {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'createChannelPublishFlow',
        arguments: {
          content: { title, body, media: [{ url: videoUrl }] },
          items: [{
            platform: 'bilibili',
            accountId,
            option: { tid: 21, copyright: 1, no_reprint: 1 }
          }]
        }
      }
    }
  })
  return res.data
}
```

## 相关资源

- GitHub: https://github.com/yikart/AiToEarn
- 国内版: https://aitoearn.cn
- 国际版: https://aitoearn.ai
- 调查记录: /opt/ob-vault/13.相关网络资源/aitoearn/aitoearn-B站发布集成调查记录.md
