# mptext 公众号文章抓取 API 集成文档

> 内部使用文档 — 基于 [mptext](https://down.mptext.top) 平台的微信公众号文章抓取服务

## 概述

mptext 是一个公众号文章下载服务，提供公众号文章内容抓取、公众号搜索、文章列表获取等功能。本文档描述如何集成 mptext API，供其他应用直接复用。

## 基础信息

| 项目 | 值 |
|------|-----|
| Base URL | `https://down.mptext.top/api/public` |
| 认证方式 | 请求头 `X-Auth-Key: <your_key>` |
| 认证密钥 | 环境变量 `websit_key` |
| 数据格式 | JSON |
| 超时时间 | 30 秒 |

## 认证说明

- **部分接口需要认证**（标记为 🔒），部分接口无需认证（标记为 🌐）
- 认证通过环境变量 `websit_key` 获取密钥，请求时放在 `X-Auth-Key` 请求头中
- 如果未配置 `websit_key`，需要认证的接口将不可用

```bash
# 设置环境变量
export websit_key="your_api_key_here"
```

---

## API 接口列表

### 1. 获取文章内容（🌐 无需认证）

下载并解析单篇公众号文章的完整内容。

**请求：**

```
GET /v1/download?url={article_url}&format=json
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | ✅ | 公众号文章完整 URL（需 URL 编码） |
| format | string | ❌ | 返回格式：`json`（默认）或 `html`/`text` |

**请求示例：**

```bash
curl "https://down.mptext.top/api/public/v1/download?url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Fxxxxx&format=json"
```

**JSON 响应结构：**

```jsonc
{
  "title": "文章标题",
  "nick_name": "公众号名称",
  "user_name": "gh_xxxxx",           // 公众号原始ID
  "link": "https://mp.weixin.qq.com/s/xxxxx",
  "content_noencode": "<div>...</div>", // 文章 HTML 内容
  "create_time": "2026-03-13 20:18",   // 发布时间
  "cdn_url": "https://mmbiz.qpic.cn/...", // 封面图 CDN 地址
  "picture_page_info_list": [           // 文章内图片列表
    {
      "cdn_url": "https://mmbiz.qpic.cn/..."
    }
  ],
  "base_resp": {
    "ret": 0                           // 0 表示成功
  }
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| title | string | 文章标题 |
| nick_name | string | 公众号名称 |
| user_name | string | 公众号原始 ID（gh_ 开头） |
| link | string | 文章原始链接 |
| content_noencode | string | 文章 HTML 正文（未编码） |
| create_time | string | 发布时间，格式 `YYYY-MM-DD HH:mm` |
| cdn_url | string | 封面图 CDN 地址 |
| picture_page_info_list | array | 文章内嵌图片列表，每项含 `cdn_url` |
| base_resp.ret | int | 返回码，0 = 成功 |

**错误处理：**

- 检查 `base_resp.ret` 是否为 0，非 0 表示 mptext API 返回错误
- HTTP 状态码非 200 表示请求本身失败

---

### 2. 获取公众号文章列表（🔒 需要认证）

获取指定公众号的历史文章列表。

**请求：**

```
GET /v1/article?fakeid={fakeid}&begin={begin}&size={size}
Headers:
  X-Auth-Key: {your_key}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fakeid | string | ✅ | 公众号 fakeid（从搜索接口获取） |
| begin | int | ❌ | 起始位置，默认 0 |
| size | int | ❌ | 返回数量，默认 5，最大 20 |

**请求示例：**

```bash
curl -H "X-Auth-Key: your_key" \
  "https://down.mptext.top/api/public/v1/article?fakeid=MzIxNTU4MDA4MA%3D%3D&begin=0&size=10"
```

**响应结构：**

```jsonc
{
  "base_resp": { "ret": 0 },
  "general_msg_list": [
    {
      "title": "文章标题",
      "link": "https://mp.weixin.qq.com/s/xxxxx",
      "create_time": 1679000000,
      "digest": "文章摘要..."
      // ... 其他字段
    }
  ]
}
```

---

### 3. 查询公众号主体信息（🌐 无需认证）

根据 fakeid 查询公众号的基本信息。

**请求：**

```
GET /beta/authorinfo?fakeid={fakeid}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fakeid | string | ✅ | 公众号 fakeid |

**请求示例：**

```bash
curl "https://down.mptext.top/api/public/beta/authorinfo?fakeid=MzIxNTU4MDA4MA%3D%3D"
```

---

### 4. 搜索公众号（🔒 需要认证）

按关键词搜索公众号。

**请求：**

```
GET /v1/account?keyword={keyword}&begin={begin}&size={size}
Headers:
  X-Auth-Key: {your_key}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | ✅ | 搜索关键词（需 URL 编码） |
| begin | int | ❌ | 起始位置，默认 0 |
| size | int | ❌ | 返回数量，默认 5，最大 20 |

**请求示例：**

```bash
curl -H "X-Auth-Key: your_key" \
  "https://down.mptext.top/api/public/v1/account?keyword=%E7%9C%9F%E7%9A%84%E5%8F%AB%E9%98%BF%E7%8F%8D&begin=0&size=5"
```

---

### 5. 根据文章链接查公众号（🔒 需要认证）

通过一篇文章的 URL 反查其所属公众号信息。

**请求：**

```
GET /v1/accountbyurl?url={article_url}
Headers:
  X-Auth-Key: {your_key}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | ✅ | 公众号文章完整 URL（需 URL 编码） |

**请求示例：**

```bash
curl -H "X-Auth-Key: your_key" \
  "https://down.mptext.top/api/public/v1/accountbyurl?url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Fxxxxx"
```

---

## 集成示例

### Go 语言

```go
package main

import (
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "net/url"
    "os"
    "time"
)

const mptextBaseURL = "https://down.mptext.top/api/public"

var (
    mptextAuthKey string
    mptextClient  *http.Client
)

func init() {
    mptextAuthKey = os.Getenv("websit_key")
    mptextClient = &http.Client{Timeout: 30 * time.Second}
}

// FetchArticle 获取文章内容（无需认证）
func FetchArticle(articleURL string) (map[string]interface{}, error) {
    reqURL := fmt.Sprintf("%s/v1/download?url=%s&format=json",
        mptextBaseURL, url.QueryEscape(articleURL))

    resp, err := mptextClient.Get(reqURL)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    var result map[string]interface{}
    if err := json.Unmarshal(body, &result); err != nil {
        return nil, err
    }
    return result, nil
}

// SearchAccount 搜索公众号（需要认证）
func SearchAccount(keyword string, begin, size int) (map[string]interface{}, error) {
    if mptextAuthKey == "" {
        return nil, fmt.Errorf("websit_key not configured")
    }

    reqURL := fmt.Sprintf("%s/v1/account?keyword=%s&begin=%d&size=%d",
        mptextBaseURL, url.QueryEscape(keyword), begin, size)

    req, _ := http.NewRequest("GET", reqURL, nil)
    req.Header.Set("X-Auth-Key", mptextAuthKey)

    resp, err := mptextClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    var result map[string]interface{}
    if err := json.Unmarshal(body, &result); err != nil {
        return nil, err
    }
    return result, nil
}

// GetArticleList 获取公众号文章列表（需要认证）
func GetArticleList(fakeid string, begin, size int) (map[string]interface{}, error) {
    if mptextAuthKey == "" {
        return nil, fmt.Errorf("websit_key not configured")
    }

    reqURL := fmt.Sprintf("%s/v1/article?fakeid=%s&begin=%d&size=%d",
        mptextBaseURL, fakeid, begin, size)

    req, _ := http.NewRequest("GET", reqURL, nil)
    req.Header.Set("X-Auth-Key", mptextAuthKey)

    resp, err := mptextClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    var result map[string]interface{}
    if err := json.Unmarshal(body, &result); err != nil {
        return nil, err
    }
    return result, nil
}

// GetAuthorInfo 查询公众号主体信息
func GetAuthorInfo(fakeid string) (map[string]interface{}, error) {
    reqURL := fmt.Sprintf("%s/beta/authorinfo?fakeid=%s", mptextBaseURL, fakeid)

    req, _ := http.NewRequest("GET", reqURL, nil)
    if mptextAuthKey != "" {
        req.Header.Set("X-Auth-Key", mptextAuthKey)
    }

    resp, err := mptextClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    var result map[string]interface{}
    if err := json.Unmarshal(body, &result); err != nil {
        return nil, err
    }
    return result, nil
}

// GetAccountByURL 根据文章链接查公众号（需要认证）
func GetAccountByURL(articleURL string) (map[string]interface{}, error) {
    if mptextAuthKey == "" {
        return nil, fmt.Errorf("websit_key not configured")
    }

    reqURL := fmt.Sprintf("%s/v1/accountbyurl?url=%s",
        mptextBaseURL, url.QueryEscape(articleURL))

    req, _ := http.NewRequest("GET", reqURL, nil)
    req.Header.Set("X-Auth-Key", mptextAuthKey)

    resp, err := mptextClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    var result map[string]interface{}
    if err := json.Unmarshal(body, &result); err != nil {
        return nil, err
    }
    return result, nil
}
```

### Python

```python
import os
import requests
from urllib.parse import quote

MPTTEXT_BASE_URL = "https://down.mptext.top/api/public"
AUTH_KEY = os.environ.get("websit_key", "")

def fetch_article(article_url: str) -> dict:
    """获取文章内容（无需认证）"""
    resp = requests.get(f"{MPTTEXT_BASE_URL}/v1/download", params={
        "url": article_url,
        "format": "json"
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()

def search_account(keyword: str, begin: int = 0, size: int = 5) -> dict:
    """搜索公众号（需要认证）"""
    if not AUTH_KEY:
        raise ValueError("websit_key not configured")
    resp = requests.get(f"{MPTTEXT_BASE_URL}/v1/account", params={
        "keyword": keyword,
        "begin": begin,
        "size": size
    }, headers={"X-Auth-Key": AUTH_KEY}, timeout=30)
    resp.raise_for_status()
    return resp.json()

def get_article_list(fakeid: str, begin: int = 0, size: int = 5) -> dict:
    """获取公众号文章列表（需要认证）"""
    if not AUTH_KEY:
        raise ValueError("websit_key not configured")
    resp = requests.get(f"{MPTTEXT_BASE_URL}/v1/article", params={
        "fakeid": fakeid,
        "begin": begin,
        "size": size
    }, headers={"X-Auth-Key": AUTH_KEY}, timeout=30)
    resp.raise_for_status()
    return resp.json()

def get_author_info(fakeid: str) -> dict:
    """查询公众号主体信息"""
    headers = {"X-Auth-Key": AUTH_KEY} if AUTH_KEY else {}
    resp = requests.get(f"{MPTTEXT_BASE_URL}/beta/authorinfo", params={
        "fakeid": fakeid
    }, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()

def get_account_by_url(article_url: str) -> dict:
    """根据文章链接查公众号（需要认证）"""
    if not AUTH_KEY:
        raise ValueError("websit_key not configured")
    resp = requests.get(f"{MPTTEXT_BASE_URL}/v1/accountbyurl", params={
        "url": article_url
    }, headers={"X-Auth-Key": AUTH_KEY}, timeout=30)
    resp.raise_for_status()
    return resp.json()
```

### Node.js

```javascript
const BASE_URL = "https://down.mptext.top/api/public";
const AUTH_KEY = process.env.websit_key || "";

async function fetchArticle(articleUrl) {
  const url = `${BASE_URL}/v1/download?url=${encodeURIComponent(articleUrl)}&format=json`;
  const resp = await fetch(url);
  return resp.json();
}

async function searchAccount(keyword, begin = 0, size = 5) {
  if (!AUTH_KEY) throw new Error("websit_key not configured");
  const url = `${BASE_URL}/v1/account?keyword=${encodeURIComponent(keyword)}&begin=${begin}&size=${size}`;
  const resp = await fetch(url, { headers: { "X-Auth-Key": AUTH_KEY } });
  return resp.json();
}

async function getArticleList(fakeid, begin = 0, size = 5) {
  if (!AUTH_KEY) throw new Error("websit_key not configured");
  const url = `${BASE_URL}/v1/article?fakeid=${fakeid}&begin=${begin}&size=${size}`;
  const resp = await fetch(url, { headers: { "X-Auth-Key": AUTH_KEY } });
  return resp.json();
}

async function getAuthorInfo(fakeid) {
  const headers = AUTH_KEY ? { "X-Auth-Key": AUTH_KEY } : {};
  const url = `${BASE_URL}/beta/authorinfo?fakeid=${fakeid}`;
  const resp = await fetch(url, { headers });
  return resp.json();
}

async function getAccountByUrl(articleUrl) {
  if (!AUTH_KEY) throw new Error("websit_key not configured");
  const url = `${BASE_URL}/v1/accountbyurl?url=${encodeURIComponent(articleUrl)}`;
  const resp = await fetch(url, { headers: { "X-Auth-Key": AUTH_KEY } });
  return resp.json();
}
```

---

## 典型使用流程

### 流程一：抓取单篇文章并保存

```
输入文章 URL
    ↓
调用 GET /v1/download?url=xxx&format=json
    ↓
解析返回的 JSON（title, content_noencode, nick_name 等）
    ↓
存入本地数据库
```

### 流程二：批量抓取某公众号所有文章

```
公众号名称或已知文章 URL
    ↓
（如有 URL）调用 GET /v1/accountbyurl → 获取 fakeid
（如只有名称）调用 GET /v1/account → 搜索获取 fakeid
    ↓
循环调用 GET /v1/article?fakeid=xxx&begin=0&size=20
    ↓
对每篇文章 URL 调用 GET /v1/download 获取完整内容
    ↓
存入本地数据库
```

---

## 注意事项

1. **URL 编码**：所有作为参数传入的 URL 必须进行 URL 编码（`encodeURIComponent` / `url.QueryEscape` / `quote`）
2. **频率限制**：mptext 可能有频率限制，批量抓取时建议加适当延时（如每次请求间隔 1-2 秒）
3. **错误检查**：JSON 响应中的 `base_resp.ret` 非 0 表示业务错误，需单独处理
4. **内容格式**：`content_noencode` 为 HTML 格式，如需纯文本需自行去除 HTML 标签
5. **图片地址**：`cdn_url` 和 `picture_page_info_list` 中的图片地址为微信 CDN，可能有时效性

---

## 附录：HTML 标签清理函数

如果需要将 `content_noencode` 转为纯文本，可使用以下简单方法：

**Go：**

```go
func stripHTML(s string) string {
    // 去 style/script 块
    s = strings.ReplaceAll(s, "<style>", "")
    s = strings.ReplaceAll(s, "</style>", "")
    s = strings.ReplaceAll(s, "<script>", "")
    s = strings.ReplaceAll(s, "</script>", "")
    // 去标签
    for {
        start := strings.Index(s, "<")
        if start == -1 { break }
        end := strings.Index(s[start:], ">")
        if end == -1 { break }
        s = s[:start] + s[start+end+1:]
    }
    // 清理空白
    s = strings.ReplaceAll(s, "&nbsp;", " ")
    s = strings.ReplaceAll(s, "\n", " ")
    s = strings.ReplaceAll(s, "\t", " ")
    for strings.Contains(s, "  ") {
        s = strings.ReplaceAll(s, "  ", " ")
    }
    return strings.TrimSpace(s)
}
```

**Python：**

```python
import re

def strip_html(html: str) -> str:
    text = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&nbsp;', ' ')
    text = re.sub(r'\s+', ' ', text)
    return text.strip()
```
