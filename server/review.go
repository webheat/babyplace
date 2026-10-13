package main

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
)

const reviewColumns = `id, poi_id, user_id, nickname, avatar, rating, comment,
	visit_date, tags, images, status, created_at, updated_at`

// 评价列表
func handleReviewList(params map[string]interface{}) AdminResponse {
	page := getInt(params, "page", 1)
	pageSize := getInt(params, "pageSize", 20)
	keyword := getString(params, "keyword")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	where := "WHERE 1=1"
	var args []interface{}
	if keyword != "" {
		where += " AND (nickname LIKE ? OR comment LIKE ?)"
		kw := "%" + keyword + "%"
		args = append(args, kw, kw)
	}

	var total int
	db.QueryRow("SELECT COUNT(*) FROM review "+where, args...).Scan(&total)

	offset := (page - 1) * pageSize
	rows, err := db.Query(fmt.Sprintf("SELECT %s FROM review %s ORDER BY created_at DESC LIMIT ? OFFSET ?", reviewColumns, where), append(args, pageSize, offset)...)
	if err != nil {
		log.Printf("[review.list] error: %v", err)
		return fail(500, "query failed")
	}
	defer rows.Close()

	list := make([]Review, 0)
	for rows.Next() {
		r, err := reviewFromRow(rows)
		if err != nil {
			continue
		}
		list = append(list, *r)
	}

	return ok(map[string]interface{}{
		"list":     list,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	}, "ok")
}

// 评价详情
func handleReviewDetail(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}

	row := db.QueryRow(fmt.Sprintf("SELECT %s FROM review WHERE id = ?", reviewColumns), id)
	r, err := reviewFromRow(row)
	if err == sql.ErrNoRows {
		return fail(404, "review not found")
	}
	if err != nil {
		return fail(500, "query failed")
	}

	return ok(r, "ok")
}

// 按 POI 查评价
func handleReviewListByPoi(params map[string]interface{}) AdminResponse {
	poiID := getString(params, "poi_id")
	if poiID == "" {
		return fail(400, "poi_id is required")
	}

	page := getInt(params, "page", 1)
	pageSize := getInt(params, "pageSize", 20)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	var total int
	db.QueryRow("SELECT COUNT(*) FROM review WHERE poi_id = ? AND status = 'approved'", poiID).Scan(&total)

	offset := (page - 1) * pageSize
	rows, err := db.Query(
		fmt.Sprintf("SELECT %s FROM review WHERE poi_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT ? OFFSET ?", reviewColumns),
		poiID, pageSize, offset,
	)
	if err != nil {
		log.Printf("[review.listByPoi] error: %v", err)
		return fail(500, "query failed")
	}
	defer rows.Close()

	list := make([]Review, 0)
	for rows.Next() {
		r, err := reviewFromRow(rows)
		if err != nil {
			continue
		}
		list = append(list, *r)
	}

	return ok(map[string]interface{}{
		"list":     list,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	}, "ok")
}

// 创建评价
func handleReviewCreate(params map[string]interface{}) AdminResponse {
	payload := getPayload(params)
	poiID := getString(payload, "poi_id")
	if poiID == "" {
		return fail(400, "poi_id is required")
	}

	now := nowMillis()
	id := generateID()

	_, err := db.Exec(`INSERT INTO review (
		id, poi_id, user_id, nickname, avatar, rating, comment,
		visit_date, tags, images, status, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id,
		poiID,
		getString(payload, "user_id"),
		getString(payload, "nickname"),
		getString(payload, "avatar"),
		getInt(payload, "rating", 5),
		getString(payload, "comment"),
		now,
		jsonMarshal(toStringArray(payload["tags"])),
		jsonMarshal(toStringArray(payload["images"])),
		getStringDefault(payload, "status", "approved"),
		now, now,
	)
	if err != nil {
		log.Printf("[review.create] error: %v", err)
		return fail(500, "create failed")
	}

	// 更新 POI 的评价统计
	updatePOIReviewStats(poiID)

	return ok(map[string]interface{}{"id": id}, "created")
}

// 更新评价
func handleReviewUpdate(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}

	payload := getPayload(params)
	setClauses := []string{}
	args := []interface{}{}

	if v, ok := payload["nickname"]; ok {
		setClauses = append(setClauses, "nickname = ?")
		args = append(args, v)
	}
	if v, ok := payload["comment"]; ok {
		setClauses = append(setClauses, "comment = ?")
		args = append(args, v)
	}
	if v, ok := payload["rating"]; ok {
		setClauses = append(setClauses, "rating = ?")
		args = append(args, v)
	}
	if v, ok := payload["status"]; ok {
		setClauses = append(setClauses, "status = ?")
		args = append(args, v)
	}
	if v, ok := payload["tags"]; ok {
		setClauses = append(setClauses, "tags = ?")
		args = append(args, jsonMarshal(toStringArray(v)))
	}

	if len(setClauses) == 0 {
		return fail(400, "no valid fields")
	}

	setClauses = append(setClauses, "updated_at = ?")
	args = append(args, nowMillis(), id)

	query := fmt.Sprintf("UPDATE review SET %s WHERE id = ?", strings.Join(setClauses, ", "))
	result, err := db.Exec(query, args...)
	if err != nil {
		return fail(500, "update failed")
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fail(404, "review not found")
	}

	return ok(map[string]interface{}{"id": id, "updated": affected}, "updated")
}

// 删除评价
func handleReviewRemove(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}

	// 先获取 poi_id
	var poiID string
	db.QueryRow("SELECT poi_id FROM review WHERE id = ?", id).Scan(&poiID)

	result, err := db.Exec("DELETE FROM review WHERE id = ?", id)
	if err != nil {
		return fail(500, "remove failed")
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fail(404, "review not found")
	}

	// 更新 POI 评价统计
	if poiID != "" {
		updatePOIReviewStats(poiID)
	}

	return ok(map[string]interface{}{"id": id, "deleted": affected}, "removed")
}

// 更新 POI 的评价统计
func updatePOIReviewStats(poiID string) {
	var count int
	var avgRating float64
	db.QueryRow("SELECT COUNT(*) FROM review WHERE poi_id = ? AND status = 'approved'", poiID).Scan(&count)
	db.QueryRow("SELECT COALESCE(AVG(rating), 0) FROM review WHERE poi_id = ? AND status = 'approved'", poiID).Scan(&avgRating)
	db.Exec("UPDATE poi SET review_count = ?, avg_rating = ?, updated_at = ? WHERE id = ?",
		count, avgRating, nowMillis(), poiID)
}
