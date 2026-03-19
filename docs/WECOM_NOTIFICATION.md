# 企业微信个人通知接入

## 用途

用于在任务完成后，通过企业微信自建应用消息，把通知直接发给你本人。

当前脚本：

- [send_wecom_notice.py](/C:/Users/Admin/babyplace/scripts/send_wecom_notice.py)

## 当前接入方式

采用企业微信自建应用消息，流程是：

1. 用 `CorpID + Secret` 获取 `access_token`
2. 调用企业微信消息接口
3. 用 `AgentId` 把文本消息发送给指定 `UserID`

## 本地使用方式

先在当前终端设置环境变量：

```powershell
$env:WECOM_CORP_ID='你的CorpID'
$env:WECOM_AGENT_ID='你的AgentId'
$env:WECOM_SECRET='你的Secret'
$env:WECOM_USER_ID='你的企业微信UserID'
```

然后发送测试消息：

```powershell
python scripts\send_wecom_notice.py --title "任务通知" --message "企业微信通知链路已打通"
```

## 任务完成后调用方式

以后任何任务结束后，只要执行：

```powershell
python scripts\send_wecom_notice.py --title "任务完成" --message "这里写任务结果摘要"
```

就会向当前用户发送一条企业微信消息。

## 推荐的通知内容

建议消息正文控制在简短可读的范围内，适合手机和手表通知查看，例如：

```text
增量导入已完成
prepared: 69
failed: 0
报告: seed/reports/azhen-poi-upsert-result-xxxx.json
```

## 故障排查

### 1. 收不到消息

优先检查：

- 自建应用是否已启用
- 该应用是否可见给当前用户
- `WECOM_USER_ID` 是否正确
- 手机企业微信是否开启通知

### 2. `gettoken failed`

优先检查：

- `CorpID` 是否正确
- `Secret` 是否正确
- Secret 是否对应当前 `AgentId` 所属应用

### 3. `message send failed`

优先检查：

- `AgentId` 是否正确
- `touser` 是否在应用可见范围内

## 安全要求

不要把以下值直接写进仓库源码：

- `WECOM_SECRET`
- `CorpID`
- `UserID`

统一通过环境变量传入。
