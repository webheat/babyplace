package main

import (
	"database/sql"
	"fmt"
	"log"
)

// 旧版无前缀 goods 操作（goods.js 使用 action: 'list' 等）
// 复用 poi 表，因为 goods 和 poi 是同一数据

func handleGoodsList(params map[string]interface{}) AdminResponse {
	page := getInt(params, "page", 1)
	pageSize := getInt(params, "pageSize", 10)
	keyword := getString(params, "keyword")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 10
	}

	where := "WHERE 1=1"
	var args []interface{}
	if keyword != "" {
		where += " AND (name LIKE ? OR address LIKE ?)"
		kw := "%" + keyword + "%"
		args = append(args, kw, kw)
	}

	var total int
	db.QueryRow("SELECT COUNT(*) FROM poi "+where, args...).Scan(&total)

	offset := (page - 1) * pageSize
	rows, err := db.Query(
		fmt.Sprintf("SELECT %s FROM poi %s ORDER BY updated_at DESC LIMIT ? OFFSET ?", poiColumns, where),
		append(args, pageSize, offset)...,
	)
	if err != nil {
		log.Printf("[goods.list] error: %v", err)
		return fail(500, "query failed")
	}
	defer rows.Close()

	list := make([]POI, 0)
	for rows.Next() {
		p, err := poiFromRow(rows)
		if err != nil {
			continue
		}
		list = append(list, *p)
	}

	return ok(map[string]interface{}{
		"list":     list,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	}, "ok")
}

func handleGoodsDetail(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}

	row := db.QueryRow(fmt.Sprintf("SELECT %s FROM poi WHERE id = ?", poiColumns), id)
	p, err := poiFromRow(row)
	if err == sql.ErrNoRows {
		return fail(404, "not found")
	}
	if err != nil {
		return fail(500, "query failed")
	}

	return ok(p, "ok")
}

func handleGoodsCreate(params map[string]interface{}) AdminResponse {
	// 复用 poi.create 逻辑
	return handlePoiCreate(params)
}

func handleGoodsUpdate(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}
	// 将 payload 和 id 合并到 params 中
	payload := getPayload(params)
	payload["id"] = id
	params["payload"] = payload
	return handlePoiUpdate(params)
}

func handleGoodsRemove(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}
	params["id"] = id
	return handlePoiRemove(params)
}

func handleGoodsBatchImport(params map[string]interface{}) AdminResponse {
	items, _ := params["items"].([]interface{})
	if len(items) == 0 {
		return fail(400, "items is required")
	}
	if len(items) > 100 {
		return fail(400, "max 100 items per batch")
	}

	succeeded := 0
	failed := 0
	for _, item := range items {
		m, ok := item.(map[string]interface{})
		if !ok {
			failed++
			continue
		}
		// 包装成 poi.create 格式
		result := handlePoiCreate(map[string]interface{}{"payload": m})
		if result.Code == 0 {
			succeeded++
		} else {
			failed++
		}
	}

	return ok(map[string]interface{}{
		"total":     len(items),
		"succeeded": succeeded,
		"failed":    failed,
	}, fmt.Sprintf("imported %d/%d items", succeeded, len(items)))
}
