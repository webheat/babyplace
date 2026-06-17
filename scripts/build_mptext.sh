#!/bin/bash
# babyplace mptext 集成 - 明早3点由cron触发
# 步骤：写代码 → 编译 → 验证

set -e
cd /opt/babyplace/server
LOG="/tmp/babyplace-mptext-build.log"
echo "[$(date)] === mptext 集成构建开始 ===" > "$LOG"

# 1. 写入 mptext.go
cat > mptext.go << 'GOEOF'
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const mptextBaseURL = "https://down.mptext.top/api/public"

var (
	mptextAuthKey string
	mptextClient  *http.Client
)

func initMptext() {
	mptextAuthKey = os.Getenv("websit_key")
	mptextClient = &http.Client{Timeout: 30 * time.Second}
	if mptextAuthKey == "" {
		log.Println("[warn] websit_key not set, mptext auth APIs disabled")
	}
}

// --- API 调用 ---

// mptextFetchArticle 获取文章内容（无需认证）
func mptextFetchArticle(articleURL, format string) (map[string]interface{}, error) {
	encodedURL := url.QueryEscape(articleURL)
	reqURL := fmt.Sprintf("%s/v1/download?url=%s&format=%s", mptextBaseURL, encodedURL, format)

	resp, err := mptextClient.Get(reqURL)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body failed: %w", err)
	}

	if format == "json" {
		var result map[string]interface{}
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("parse json failed: %w", err)
		}
		return result, nil
	}

	// 非 json 格式返回 raw content
	return map[string]interface{}{
		"content": string(body),
		"format":  format,
	}, nil
}

// mptextGetArticleList 获取公众号文章列表（需要认证）
func mptextGetArticleList(fakeid string, begin, size int) (map[string]interface{}, error) {
	if mptextAuthKey == "" {
		return nil, fmt.Errorf("auth key not configured")
	}

	reqURL := fmt.Sprintf("%s/v1/article?fakeid=%s&begin=%d&size=%d",
		mptextBaseURL, fakeid, begin, size)

	req, _ := http.NewRequest("GET", reqURL, nil)
	req.Header.Set("X-Auth-Key", mptextAuthKey)

	resp, err := mptextClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body failed: %w", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse json failed: %w", err)
	}
	return result, nil
}

// mptextGetAuthorInfo 查询公众号主体信息（无需认证）
func mptextGetAuthorInfo(fakeid string) (map[string]interface{}, error) {
	reqURL := fmt.Sprintf("%s/beta/authorinfo?fakeid=%s", mptextBaseURL, fakeid)

	resp, err := mptextClient.Get(reqURL)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body failed: %w", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse json failed: %w", err)
	}
	return result, nil
}

// --- 数据解析 ---

// parseMptextArticle 将 API 返回的 JSON 解析并存入 article 表
func parseMptextArticle(data map[string]interface{}) (*Article, error) {
	a := &Article{}

	// 基本字段
	a.Title, _ = data["title"].(string)
	a.SourceAccount, _ = data["nick_name"].(string)
	a.SourceAccountID, _ = data["user_name"].(string)
	a.URL, _ = data["link"].(string)

	// 内容
	if content, ok := data["content_noencode"].(string); ok {
		a.ContentHTML = content
		// 提取纯文本（去 HTML 标签）
		a.ContentText = stripHTML(content)
	}

	// 创建时间解析: "2026-03-13 20:18" → unix timestamp
	if createTime, ok := data["create_time"].(string); ok {
		if t, err := time.ParseInLocation("2006-01-02 15:04", createTime, time.Local); err == nil {
			a.PublishTime = t.UnixMilli()
		}
	}

	// 封面图
	if cdnURL, ok := data["cdn_url"].(string); ok {
		a.CoverImage = cdnURL
	}

	// 图片列表
	if picList, ok := data["picture_page_info_list"].([]interface{}); ok {
		images := make([]string, 0, len(picList))
		for _, pic := range picList {
			if picMap, ok := pic.(map[string]interface{}); ok {
				if cdn, ok := picMap["cdn_url"].(string); ok {
					images = append(images, cdn)
				}
			}
		}
		a.Images = images
	}

	return a, nil
}

// saveArticleToDB 将文章存入数据库（INSERT OR REPLACE）
func saveArticleToDB(a *Article) (string, error) {
	now := nowMillis()
	id := a.ID
	if id == "" {
		id = generateID()
	}

	// 检查是否已存在（按 URL 去重）
	var existingID string
	err := db.QueryRow("SELECT id FROM article WHERE url = ?", a.URL).Scan(&existingID)
	if err == nil && existingID != "" {
		// 已存在，更新
		_, err = db.Exec(`UPDATE article SET
			title = ?, source_account = ?, source_account_id = ?,
			publish_time = ?, content_text = ?, content_html = ?,
			images = ?, cover_image = ?, updated_at = ?
			WHERE id = ?`,
			a.Title, a.SourceAccount, a.SourceAccountID,
			a.PublishTime, a.ContentText, a.ContentHTML,
			jsonMarshal(a.Images), a.CoverImage, now, existingID)
		if err != nil {
			return "", fmt.Errorf("update failed: %w", err)
		}
		return existingID, nil
	}

	// 新增
	_, err = db.Exec(`INSERT INTO article (
		id, title, source_account, source_account_id, publish_time,
		url, cover_image, content_text, content_html, images,
		extracted_poi_names, parse_result, status, parse_confidence,
		created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, a.Title, a.SourceAccount, a.SourceAccountID, a.PublishTime,
		a.URL, a.CoverImage, a.ContentText, a.ContentHTML,
		jsonMarshal(a.Images),
		"[]", "{}", "fetched", 0,
		now, now,
	)
	if err != nil {
		return "", fmt.Errorf("insert failed: %w", err)
	}
	return id, nil
}

// stripHTML 简单去除 HTML 标签
func stripHTML(s string) string {
	// 去 style/script 块
	s = strings.ReplaceAll(s, "<style>", "")
	s = strings.ReplaceAll(s, "</style>", "")
	s = strings.ReplaceAll(s, "<script>", "")
	s = strings.ReplaceAll(s, "</script>", "")
	// 去标签
	for {
		start := strings.Index(s, "<")
		if start == -1 {
			break
		}
		end := strings.Index(s[start:], ">")
		if end == -1 {
			break
		}
		s = s[:start] + s[start+end+1:]
	}
	// 清理空白
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\t", " ")
	// 合并多余空格
	for strings.Contains(s, "  ") {
		s = strings.ReplaceAll(s, "  ", " ")
	}
	return strings.TrimSpace(s)
}

// --- HTTP Handlers ---

func handleMptextFetch(params map[string]interface{}) AdminResponse {
	articleURL := getString(params, "url")
	if articleURL == "" {
		return fail(400, "url is required")
	}

	// 1. 获取文章内容
	data, err := mptextFetchArticle(articleURL, "json")
	if err != nil {
		log.Printf("[mptext.fetch] fetch error: %v", err)
		return fail(502, "fetch article failed: "+err.Error())
	}

	// 检查 API 返回
	if baseResp, ok := data["base_resp"].(map[string]interface{}); ok {
		if ret, ok := baseResp["ret"].(float64); ok && ret != 0 {
			return fail(502, fmt.Sprintf("mptext API error: ret=%v", ret))
		}
	}

	// 2. 解析文章
	article, err := parseMptextArticle(data)
	if err != nil {
		log.Printf("[mptext.fetch] parse error: %v", err)
		return fail(500, "parse article failed: "+err.Error())
	}

	// 3. 存入数据库
	id, err := saveArticleToDB(article)
	if err != nil {
		log.Printf("[mptext.fetch] save error: %v", err)
		return fail(500, "save article failed: "+err.Error())
	}

	return ok(map[string]interface{}{
		"id":     id,
		"title":  article.Title,
		"author": article.SourceAccount,
		"url":    article.URL,
	}, "fetched")
}

func handleMptextArticles(params map[string]interface{}) AdminResponse {
	fakeid := getString(params, "fakeid")
	if fakeid == "" {
		return fail(400, "fakeid is required")
	}
	begin := getInt(params, "begin", 0)
	size := getInt(params, "size", 5)
	if size > 20 {
		size = 20
	}

	data, err := mptextGetArticleList(fakeid, begin, size)
	if err != nil {
		log.Printf("[mptext.articles] error: %v", err)
		return fail(502, "get article list failed: "+err.Error())
	}

	return ok(data, "ok")
}

func handleMptextAuthor(params map[string]interface{}) AdminResponse {
	fakeid := getString(params, "fakeid")
	if fakeid == "" {
		return fail(400, "fakeid is required")
	}

	data, err := mptextGetAuthorInfo(fakeid)
	if err != nil {
		log.Printf("[mptext.author] error: %v", err)
		return fail(502, "get author info failed: "+err.Error())
	}

	return ok(data, "ok")
}
GOEOF
echo "[$(date)] mptext.go written" >> "$LOG"

# 2. 修改 main.go - 添加 initMptext() 调用
sed -i 's/initDify()/initDify()\n\tinitMptext()/' main.go
echo "[$(date)] main.go patched" >> "$LOG"

# 3. 修改 admin.go - 添加路由
sed -i '/case action == "source.remove":/a\\n\t// mptext 公众号文章抓取\n\tcase action == "mptext.fetch":\n\t\tresp = handleMptextFetch(params)\n\tcase action == "mptext.articles":\n\t\tresp = handleMptextArticles(params)\n\tcase action == "mptext.author":\n\t\tresp = handleMptextAuthor(params)' admin.go
echo "[$(date)] admin.go patched" >> "$LOG"

# 4. 编译
echo "[$(date)] building..." >> "$LOG"
/usr/local/go/bin/go build -o babyplace-server . 2>> "$LOG"
BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ]; then
    echo "[$(date)] ✅ build SUCCESS" >> "$LOG"
else
    echo "[$(date)] ❅ build FAILED (exit $BUILD_EXIT)" >> "$LOG"
    exit 1
fi

echo "[$(date)] === mptext 集成构建完成 ===" >> "$LOG"
