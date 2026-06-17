package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
)

// 标准响应格式（与 uniCloud 一致）
type AdminResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
}

func ok(data interface{}, message string) AdminResponse {
	if message == "" {
		message = "ok"
	}
	return AdminResponse{Code: 0, Message: message, Data: data}
}

func fail(code int, message string) AdminResponse {
	return AdminResponse{Code: code, Message: message, Data: nil}
}

// POST /babyplace-admin
func handleBabyplaceAdmin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, fail(405, "Method not allowed"))
		return
	}

	// 读取 body，兼容 base64 编码
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1MB limit
	if err != nil {
		writeJSON(w, http.StatusBadRequest, fail(400, "read body failed"))
		return
	}

	var params map[string]interface{}
	if err := json.Unmarshal(body, &params); err != nil {
		writeJSON(w, http.StatusBadRequest, fail(400, "invalid JSON body"))
		return
	}

	action, _ := params["action"].(string)
	action = strings.TrimSpace(action)
	if action == "" {
		writeJSON(w, http.StatusBadRequest, fail(400, "action is required"))
		return
	}

	log.Printf("[admin] action=%s", action)

	var resp AdminResponse

	switch {
	// POI 操作
	case action == "poi.list":
		resp = handlePoiList(params)
	case action == "poi.detail":
		resp = handlePoiDetail(params)
	case action == "poi.create":
		resp = handlePoiCreate(params)
	case action == "poi.update":
		resp = handlePoiUpdate(params)
	case action == "poi.remove":
		resp = handlePoiRemove(params)
	case action == "poi.nearby":
		resp = handlePoiNearby(params)

	// 评价操作
	case action == "review.list":
		resp = handleReviewList(params)
	case action == "review.detail":
		resp = handleReviewDetail(params)
	case action == "review.create":
		resp = handleReviewCreate(params)
	case action == "review.update":
		resp = handleReviewUpdate(params)
	case action == "review.remove":
		resp = handleReviewRemove(params)
	case action == "review.listByPoi":
		resp = handleReviewListByPoi(params)

	// 推荐
	case action == "recommend.home":
		resp = handleRecommendHome(params)

	// 文章操作
	case action == "article.list":
		resp = handleArticleList(params)
	case action == "article.detail":
		resp = handleArticleDetail(params)
	case action == "article.create":
		resp = handleArticleCreate(params)
	case action == "article.update":
		resp = handleArticleUpdate(params)
	case action == "article.remove":
		resp = handleArticleRemove(params)

	// 来源关联操作
	case action == "source.list":
		resp = handleSourceList(params)
	case action == "source.detail":
		resp = handleSourceDetail(params)
	case action == "source.create":
		resp = handleSourceCreate(params)
	case action == "source.update":
		resp = handleSourceUpdate(params)
	case action == "source.remove":

	// mptext 公众号文章抓取
	case action == "mptext.fetch":
		resp = handleMptextFetch(params)
	case action == "mptext.articles":
		resp = handleMptextArticles(params)
	case action == "mptext.author":
		resp = handleMptextAuthor(params)
		resp = handleSourceRemove(params)

	// mptext 公众号文章抓取
	case action == "mptext.fetch":
		resp = handleMptextFetch(params)
	case action == "mptext.articles":
		resp = handleMptextArticles(params)
	case action == "mptext.author":
		resp = handleMptextAuthor(params)

	// 路线规划
	case action == "route.drive":
		resp = handleRouteDrive(params)

	// Seed 操作（数据导入）
	case action == "seed.ping", action == "ping":
		resp = ok(map[string]int64{"now": nowMillis()}, "pong")
	case action == "seed.insertBatch", action == "insertBatch":
		resp = handleSeedInsertBatch(params)
	case action == "seed.clearCollections", action == "clearCollections":
		resp = handleSeedClearCollections(params)
	case action == "seed.upsertPoiBatch":
		resp = handleSeedUpsertPoiBatch(params)
	case action == "seed.listPoiByNames":
		resp = handleSeedListPoiByNames(params)

	// 旧版无前缀 goods 操作（goods.js 使用 action: 'list' 而非 'poi.list'）
	case action == "list":
		resp = handleGoodsList(params)
	case action == "detail":
		resp = handleGoodsDetail(params)
	case action == "create":
		resp = handleGoodsCreate(params)
	case action == "update":
		resp = handleGoodsUpdate(params)
	case action == "remove":
		resp = handleGoodsRemove(params)
	case action == "batchImport":
		resp = handleGoodsBatchImport(params)

	default:
		resp = fail(400, "invalid action: "+action)
	}

	writeJSON(w, http.StatusOK, resp)
}


// 参数提取辅助函数
func getString(params map[string]interface{}, key string) string {
	v, _ := params[key].(string)
	return strings.TrimSpace(v)
}

func getInt(params map[string]interface{}, key string, fallback int) int {
	v, ok := params[key]
	if !ok {
		return fallback
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case json.Number:
		i, _ := n.Int64()
		return int(i)
	}
	return fallback
}

func getFloat(params map[string]interface{}, key string, fallback float64) float64 {
	v, ok := params[key]
	if !ok {
		return fallback
	}
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	}
	return fallback
}

func getPayload(params map[string]interface{}) map[string]interface{} {
	p, _ := params["payload"].(map[string]interface{})
	if p == nil {
		return map[string]interface{}{}
	}
	return p
}
