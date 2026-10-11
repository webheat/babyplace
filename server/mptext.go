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

const mptextBaseURL = "https://down.dwqjk.top/api/public"

var (
	mptextAuthKey string
	mptextClient  *http.Client
)

func initMptext() {
	// 优先从环境变量读取（godotenv 加载），回退到直接读 .env 文件
	mptextAuthKey = os.Getenv("down_mptext_top_key")
	if mptextAuthKey == "" {
		mptextAuthKey = os.Getenv("websit_key")
	}
	if mptextAuthKey == "" {
		mptextAuthKey = readEnvFromFile(".env", "down_mptext_top_key", "websit_key")
	}
	mptextClient = &http.Client{Timeout: 30 * time.Second}
	if mptextAuthKey == "" {
		log.Println("[warn] down_mptext_top_key/websit_key not set, mptext auth APIs disabled")
	} else {
		keyPrefix := mptextAuthKey
		if len(keyPrefix) > 8 {
			keyPrefix = keyPrefix[:8]
		}
		log.Printf("[mptext] auth key loaded (%s...)", keyPrefix)
	}
}

// readEnvFromFile 直接从 .env 文件读取指定 key 作为兜底
func readEnvFromFile(filePath string, keys ...string) string {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		for _, key := range keys {
			prefix := key + "="
			if strings.HasPrefix(line, prefix) {
				return strings.TrimSpace(line[len(prefix):])
			}
		}
	}
	return ""
}

func readMptextResponse(resp *http.Response) ([]byte, error) {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body failed: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		message := strings.TrimSpace(string(body))
		if len(message) > 512 {
			message = message[:512] + "..."
		}
		if message == "" {
			return nil, fmt.Errorf("mptext API returned HTTP %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("mptext API returned HTTP %d: %s", resp.StatusCode, message)
	}
	return body, nil
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

	body, err := readMptextResponse(resp)
	if err != nil {
		return nil, err
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

	body, err := readMptextResponse(resp)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse json failed: %w", err)
	}
	return result, nil
}

// mptextGetAuthorInfo 查询公众号主体信息（beta，可能需要认证）
func mptextGetAuthorInfo(fakeid string) (map[string]interface{}, error) {
	reqURL := fmt.Sprintf("%s/beta/authorinfo?fakeid=%s", mptextBaseURL, fakeid)

	req, _ := http.NewRequest("GET", reqURL, nil)
	if mptextAuthKey != "" {
		req.Header.Set("X-Auth-Key", mptextAuthKey)
	}

	resp, err := mptextClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := readMptextResponse(resp)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse json failed: %w", err)
	}
	return result, nil
}

// mptextSearchAccount 根据关键字搜索公众号（需要认证）
func mptextSearchAccount(keyword string, begin, size int) (map[string]interface{}, error) {
	if mptextAuthKey == "" {
		return nil, fmt.Errorf("auth key not configured")
	}

	reqURL := fmt.Sprintf("%s/v1/account?keyword=%s&begin=%d&size=%d",
		mptextBaseURL, url.QueryEscape(keyword), begin, size)

	req, _ := http.NewRequest("GET", reqURL, nil)
	req.Header.Set("X-Auth-Key", mptextAuthKey)

	resp, err := mptextClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := readMptextResponse(resp)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse json failed: %w", err)
	}
	return result, nil
}

// mptextGetAccountByURL 根据文章链接查询公众号（需要认证）
func mptextGetAccountByURL(articleURL string) (map[string]interface{}, error) {
	if mptextAuthKey == "" {
		return nil, fmt.Errorf("auth key not configured")
	}

	reqURL := fmt.Sprintf("%s/v1/accountbyurl?url=%s", mptextBaseURL, url.QueryEscape(articleURL))

	req, _ := http.NewRequest("GET", reqURL, nil)
	req.Header.Set("X-Auth-Key", mptextAuthKey)

	resp, err := mptextClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := readMptextResponse(resp)
	if err != nil {
		return nil, err
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
			images = ?, cover_image = ?, local_cover_image = ?, local_images = ?, updated_at = ?
			WHERE id = ?`,
			a.Title, a.SourceAccount, a.SourceAccountID,
			a.PublishTime, a.ContentText, a.ContentHTML,
			jsonMarshal(a.Images), a.CoverImage, a.LocalCoverImage, jsonMarshal(a.LocalImages), now, existingID)
		if err != nil {
			return "", fmt.Errorf("update failed: %w", err)
		}
		return existingID, nil
	}

	// 新增
	_, err = db.Exec(`INSERT INTO article (
		id, title, source_account, source_account_id, publish_time,
		url, cover_image, local_cover_image, content_text, content_html, images, local_images,
		extracted_poi_names, parse_result, status, parse_confidence,
		created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, a.Title, a.SourceAccount, a.SourceAccountID, a.PublishTime,
		a.URL, a.CoverImage, a.LocalCoverImage, a.ContentText, a.ContentHTML,
		jsonMarshal(a.Images), jsonMarshal(a.LocalImages),
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
	if _, err := exportArticleToObsidian(id, article); err != nil {
		log.Printf("[mptext.fetch] Obsidian export error: %v", err)
		return fail(500, "export article to Obsidian failed: "+err.Error())
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

func handleMptextSearch(params map[string]interface{}) AdminResponse {
	keyword := getString(params, "keyword")
	if keyword == "" {
		return fail(400, "keyword is required")
	}
	begin := getInt(params, "begin", 0)
	size := getInt(params, "size", 5)
	if size > 20 {
		size = 20
	}

	data, err := mptextSearchAccount(keyword, begin, size)
	if err != nil {
		log.Printf("[mptext.search] error: %v", err)
		return fail(502, "search account failed: "+err.Error())
	}

	return ok(data, "ok")
}

func handleMptextAccountByURL(params map[string]interface{}) AdminResponse {
	articleURL := getString(params, "url")
	if articleURL == "" {
		return fail(400, "url is required")
	}

	data, err := mptextGetAccountByURL(articleURL)
	if err != nil {
		log.Printf("[mptext.accountByURL] error: %v", err)
		return fail(502, "get account by url failed: "+err.Error())
	}

	return ok(data, "ok")
}
