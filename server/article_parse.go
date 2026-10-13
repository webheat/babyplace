package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
)

const parseSystemPrompt = `你是一个专业的亲子地点信息提取助手。从公众号文章中提取提到的具体地点（POI）名称。
只提取真实的、可定位的地点（如公园、景区、商场、餐厅、游乐场、博物馆、图书馆、游泳馆等），不要提取泛指（如"公园"、"商场"这种没有具体名称的词）。
输出严格的 JSON 格式，不要包含 markdown 代码块标记。`

const parseUserPromptTpl = `文章标题: %s
公众号: %s
文章内容:
%s

请输出 JSON:
{
  "poi_names": ["具体地点1", "具体地点2"],
  "confidence": 0.85,
  "summary": "一句话摘要"
}

说明:
- poi_names: 文章中提到的具体可定位地点名称数组，如果没有则为空数组
- confidence: 你对提取结果的置信度（0-1）
- summary: 文章的一句话摘要（20-40字）`

// parseArticleResult LLM 返回的解析结果
type parseArticleResult struct {
	POINames   []string `json:"poi_names"`
	Confidence float64  `json:"confidence"`
	Summary    string   `json:"summary"`
}

// parseArticle 用 LLM 解析单篇文章，提取 POI 名称
func parseArticle(a *Article) (*parseArticleResult, error) {
	content := a.ContentText
	if content == "" {
		// 如果没有纯文本，尝试从 HTML 简单提取
		content = stripHTML(a.ContentHTML)
	}
	if content == "" {
		return &parseArticleResult{POINames: []string{}, Confidence: 0, Summary: ""}, nil
	}

	// 截取前 2000 字符，避免 token 过多
	if len(content) > 2000 {
		content = content[:2000]
	}

	userPrompt := fmt.Sprintf(parseUserPromptTpl, a.Title, a.SourceAccount, content)

	raw, err := llmChat(parseSystemPrompt, userPrompt)
	if err != nil {
		return nil, fmt.Errorf("llm call: %w", err)
	}

	// 清理可能的 markdown 代码块标记
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "```") {
		parts := strings.SplitN(raw, "\n", 2)
		if len(parts) == 2 {
			raw = parts[1]
		}
	}
	if strings.HasSuffix(raw, "```") {
		raw = strings.TrimSuffix(raw, "```")
	}
	raw = strings.TrimSpace(raw)

	var result parseArticleResult
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		snippet := len(raw)
		if snippet > 300 {
			snippet = 300
		}
		log.Printf("[article.parse] json parse error: %v, raw: %s", err, raw[:snippet])
		return nil, fmt.Errorf("parse llm response: %w", err)
	}

	// 防御: nil 切片转为空切片
	if result.POINames == nil {
		result.POINames = []string{}
	}
	// 防御: 置信度范围
	if result.Confidence < 0 {
		result.Confidence = 0
	}
	if result.Confidence > 1 {
		result.Confidence = 1
	}

	return &result, nil
}

// updateArticleParseResult 将解析结果写回数据库
func updateArticleParseResult(id string, result *parseArticleResult) error {
	poiNamesJSON, _ := json.Marshal(result.POINames)
	parseResultJSON, _ := json.Marshal(map[string]interface{}{
		"summary": result.Summary,
	})

	_, err := db.Exec(`UPDATE article SET
		extracted_poi_names = ?, parse_result = ?, parse_confidence = ?,
		status = 'parsed', updated_at = ?
		WHERE id = ?`,
		string(poiNamesJSON), string(parseResultJSON), result.Confidence,
		nowMillis(), id)
	return err
}

// handleArticleParse 解析单篇文章
func handleArticleParse(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}

	row := db.QueryRow(fmt.Sprintf("SELECT %s FROM article WHERE id = ?", articleColumns), id)
	a, err := articleFromRow(row)
	if err == sql.ErrNoRows {
		return fail(404, "article not found")
	}
	if err != nil {
		log.Printf("[article.parse] query error: %v", err)
		return fail(500, "query failed")
	}

	result, err := parseArticle(a)
	if err != nil {
		log.Printf("[article.parse] parse error for %s: %v", id, err)
		return fail(500, "parse failed: "+err.Error())
	}

	if err := updateArticleParseResult(id, result); err != nil {
		log.Printf("[article.parse] update error: %v", err)
		return fail(500, "update failed")
	}

	return ok(map[string]interface{}{
		"id":             id,
		"poi_names":      result.POINames,
		"confidence":     result.Confidence,
		"summary":        result.Summary,
		"status":         "parsed",
	}, "parsed")
}

// handleArticleParseAll 批量解析所有 fetched 状态的文章
func handleArticleParseAll(params map[string]interface{}) AdminResponse {
	limit := getInt(params, "limit", 10)
	if limit < 1 || limit > 50 {
		limit = 10
	}

	rows, err := db.Query(fmt.Sprintf(
		"SELECT %s FROM article WHERE status = 'fetched' ORDER BY publish_time DESC LIMIT ?",
		articleColumns), limit)
	if err != nil {
		log.Printf("[article.parseAll] query error: %v", err)
		return fail(500, "query failed")
	}
	defer rows.Close()

	var articles []Article
	for rows.Next() {
		a, err := articleFromRow(rows)
		if err != nil {
			continue
		}
		articles = append(articles, *a)
	}

	if len(articles) == 0 {
		return ok(map[string]interface{}{
			"total":   0,
			"success": 0,
			"failed":  0,
			"results": []interface{}{},
		}, "no articles to parse")
	}

	type parseItem struct {
		ID        string   `json:"id"`
		Title     string   `json:"title"`
		POINames  []string `json:"poi_names"`
		Confidence float64 `json:"confidence"`
		Status    string   `json:"status"`
		Error     string   `json:"error,omitempty"`
	}

	var results []parseItem
	successCount := 0
	failCount := 0

	for _, a := range articles {
		item := parseItem{
			ID:    a.ID,
			Title: a.Title,
		}

		result, err := parseArticle(&a)
		if err != nil {
			item.Status = "error"
			item.Error = err.Error()
			failCount++
			log.Printf("[article.parseAll] failed to parse %s (%s): %v", a.ID, a.Title, err)
		} else {
			if err := updateArticleParseResult(a.ID, result); err != nil {
				item.Status = "error"
				item.Error = "update failed: " + err.Error()
				failCount++
			} else {
				item.POINames = result.POINames
				item.Confidence = result.Confidence
				item.Status = "parsed"
				successCount++
			}
		}

		results = append(results, item)
	}

	return ok(map[string]interface{}{
		"total":   len(articles),
		"success": successCount,
		"failed":  failCount,
		"results": results,
	}, fmt.Sprintf("parsed %d/%d", successCount, len(articles)))
}
