---
name: openclaw-bridge
model: sonnet
workdir: /opt/babyplace
timeout: 300
notify: false
---

在 `/opt/babyplace/server/main.go` 中实现 OpenClaw 桥接层。

## 需求

新增 `POST /api/openclaw/chat` 路由，连接小程序请求与本机 OpenClaw CLI。

## 实现细节

### 1. 新增请求结构体

```go
type OpenClawRequest struct {
    Message    string `json:"message"`               // 必填
    AgentID    string `json:"agent_id,omitempty"`    // 可选, 默认 "main"
    SessionKey string `json:"session_key,omitempty"` // 可选, 多轮对话
    Model      string `json:"model,omitempty"`       // 可选, 默认 "deepseek-v4-pro"
    Timeout    int    `json:"timeout,omitempty"`     // 可选, 默认 300 秒
}
```

### 2. 新增响应结构体

```go
type OpenClawReply struct {
    Reply      string `json:"reply"`
    AgentID    string `json:"agent_id"`
    SessionKey string `json:"session_key,omitempty"`
    Model      string `json:"model,omitempty"`
    DurationMs int64  `json:"duration_ms"`
}
```

### 3. 新增 handler 函数 `handleOpenClawChat`

逻辑：
- 校验 POST 方法
- 解析 JSON body 到 OpenClawRequest
- 校验 message 非空
- 设置默认值：agent_id="main", model="deepseek-v4-pro", timeout=300
- 构建命令：`openclaw agent --agent <agent_id> --message <message> --json --timeout <timeout>`
- 如果有 session_key，加 `--session-key <session_key>`
- 用 `exec.CommandContext` 执行，超时用 context.WithTimeout
- 解析 stdout JSON 输出
- 从 JSON 中提取：
  - `payloads[0].text` → reply 内容
  - `meta.agentMeta.sessionId` → session_key
  - `meta.agentMeta.model` → 实际使用的 model
  - `meta.durationMs` → 耗时
- 返回 OpenClawResponse{Status: "ok", Data: OpenClawReply{...}}
- 错误时返回 OpenClawResponse{Status: "error", Message: "..."}

### 4. 注册路由

在 main() 函数中，和其他路由一起注册：
```go
http.HandleFunc("/api/openclaw/chat", corsMiddleware(handleOpenClawChat))
```

### 5. 环境变量

- `OPENCLAW_BIN`：openclaw 可执行文件路径，默认 "openclaw"
- 在 main() 中读取，存为包级变量 `openclawBin`

### 6. 新增 import

需要新增：`"context"`, `"os/exec"`, `"strings"`（已有）

## 约束

- 保持现有代码不变，只新增
- 遵循现有代码风格（writeJSON、corsMiddleware 等）
- 不引入新依赖（只用标准库）
- 错误处理参考现有 handleChat 的模式

## 验证

完成后运行：
```bash
cd /opt/babyplace/server && go build -o babyplace-server .
```
确保编译通过。
