package main

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
)

const articleColumns = `id, title, source_account, source_account_id, publish_time,
	url, cover_image, content_text, content_html, images, extracted_poi_names,
	parse_result, status, parse_confidence, created_at, updated_at`

const sourceColumns = `id, poi_id, article_id, source_type, quoted_text,
	support_fields, confidence_score, is_primary, status, created_at, updated_at`

// Article CRUD
func handleArticleList(params map[string]interface{}) AdminResponse {
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
		where += " AND (title LIKE ? OR source_account LIKE ? OR url LIKE ?)"
		kw := "%" + keyword + "%"
		args = append(args, kw, kw, kw)
	}

	var total int
	db.QueryRow("SELECT COUNT(*) FROM article "+where, args...).Scan(&total)

	offset := (page - 1) * pageSize
	rows, err := db.Query(fmt.Sprintf("SELECT %s FROM article %s ORDER BY publish_time DESC, updated_at DESC LIMIT ? OFFSET ?", articleColumns, where), append(args, pageSize, offset)...)
	if err != nil {
		log.Printf("[article.list] error: %v", err)
		return fail(500, "query failed")
	}
	defer rows.Close()

	list := make([]Article, 0)
	for rows.Next() {
		a, err := articleFromRow(rows)
		if err != nil {
			continue
		}
		list = append(list, *a)
	}

	return ok(map[string]interface{}{
		"list": list, "total": total, "page": page, "pageSize": pageSize,
	}, "ok")
}

func handleArticleDetail(params map[string]interface{}) AdminResponse {
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
		return fail(500, "query failed")
	}
	return ok(a, "ok")
}

func handleArticleCreate(params map[string]interface{}) AdminResponse {
	payload := getPayload(params)
	now := nowMillis()
	id := generateID()

	_, err := db.Exec(`INSERT INTO article (
		id, title, source_account, source_account_id, publish_time,
		url, cover_image, content_text, content_html, images, extracted_poi_names,
		parse_result, status, parse_confidence, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id,
		getString(payload, "title"),
		getString(payload, "source_account"),
		getString(payload, "source_account_id"),
		now,
		getString(payload, "url"),
		getString(payload, "cover_image"),
		getString(payload, "content_text"),
		getString(payload, "content_html"),
		jsonMarshal(toStringArray(payload["images"])),
		jsonMarshal(toStringArray(payload["extracted_poi_names"])),
		"{}",
		getStringDefault(payload, "status", "parsed"),
		getFloat(payload, "parse_confidence", 0),
		now, now,
	)
	if err != nil {
		log.Printf("[article.create] error: %v", err)
		return fail(500, "create failed")
	}
	return ok(map[string]interface{}{"id": id}, "created")
}

func handleArticleUpdate(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}
	payload := getPayload(params)
	setClauses := []string{}
	args := []interface{}{}

	if v, ok := payload["title"]; ok {
		setClauses = append(setClauses, "title = ?")
		args = append(args, v)
	}
	if v, ok := payload["source_account"]; ok {
		setClauses = append(setClauses, "source_account = ?")
		args = append(args, v)
	}
	if v, ok := payload["url"]; ok {
		setClauses = append(setClauses, "url = ?")
		args = append(args, v)
	}
	if v, ok := payload["status"]; ok {
		setClauses = append(setClauses, "status = ?")
		args = append(args, v)
	}
	if v, ok := payload["content_text"]; ok {
		setClauses = append(setClauses, "content_text = ?")
		args = append(args, v)
	}
	if v, ok := payload["parse_confidence"]; ok {
		setClauses = append(setClauses, "parse_confidence = ?")
		args = append(args, v)
	}

	if len(setClauses) == 0 {
		return fail(400, "no valid fields")
	}
	setClauses = append(setClauses, "updated_at = ?")
	args = append(args, nowMillis(), id)

	query := fmt.Sprintf("UPDATE article SET %s WHERE id = ?", strings.Join(setClauses, ", "))
	result, err := db.Exec(query, args...)
	if err != nil {
		return fail(500, "update failed")
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fail(404, "article not found")
	}
	return ok(map[string]interface{}{"id": id, "updated": affected}, "updated")
}

func handleArticleRemove(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}
	result, err := db.Exec("DELETE FROM article WHERE id = ?", id)
	if err != nil {
		return fail(500, "remove failed")
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fail(404, "article not found")
	}
	return ok(map[string]interface{}{"id": id, "deleted": affected}, "removed")
}

// ContentSource CRUD
func handleSourceList(params map[string]interface{}) AdminResponse {
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
		where += " AND (poi_id LIKE ? OR article_id LIKE ? OR quoted_text LIKE ?)"
		kw := "%" + keyword + "%"
		args = append(args, kw, kw, kw)
	}

	var total int
	db.QueryRow("SELECT COUNT(*) FROM content_source "+where, args...).Scan(&total)

	offset := (page - 1) * pageSize
	rows, err := db.Query(fmt.Sprintf("SELECT %s FROM content_source %s ORDER BY updated_at DESC LIMIT ? OFFSET ?", sourceColumns, where), append(args, pageSize, offset)...)
	if err != nil {
		return fail(500, "query failed")
	}
	defer rows.Close()

	list := make([]ContentSource, 0)
	for rows.Next() {
		s, err := sourceFromRow(rows)
		if err != nil {
			continue
		}
		list = append(list, *s)
	}

	return ok(map[string]interface{}{
		"list": list, "total": total, "page": page, "pageSize": pageSize,
	}, "ok")
}

func handleSourceDetail(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}
	row := db.QueryRow(fmt.Sprintf("SELECT %s FROM content_source WHERE id = ?", sourceColumns), id)
	s, err := sourceFromRow(row)
	if err == sql.ErrNoRows {
		return fail(404, "source not found")
	}
	if err != nil {
		return fail(500, "query failed")
	}
	return ok(s, "ok")
}

func handleSourceCreate(params map[string]interface{}) AdminResponse {
	payload := getPayload(params)
	now := nowMillis()
	id := generateID()

	_, err := db.Exec(`INSERT INTO content_source (
		id, poi_id, article_id, source_type, quoted_text,
		support_fields, confidence_score, is_primary, status, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id,
		getString(payload, "poi_id"),
		getString(payload, "article_id"),
		getStringDefault(payload, "source_type", "article"),
		getString(payload, "quoted_text"),
		jsonMarshal(toStringArray(payload["support_fields"])),
		getFloat(payload, "confidence_score", 0),
		boolToInt(getBool(payload, "is_primary")),
		getStringDefault(payload, "status", "active"),
		now, now,
	)
	if err != nil {
		return fail(500, "create failed")
	}
	return ok(map[string]interface{}{"id": id}, "created")
}

func handleSourceUpdate(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}
	payload := getPayload(params)
	setClauses := []string{}
	args := []interface{}{}

	if v, ok := payload["poi_id"]; ok {
		setClauses = append(setClauses, "poi_id = ?")
		args = append(args, v)
	}
	if v, ok := payload["article_id"]; ok {
		setClauses = append(setClauses, "article_id = ?")
		args = append(args, v)
	}
	if v, ok := payload["status"]; ok {
		setClauses = append(setClauses, "status = ?")
		args = append(args, v)
	}
	if v, ok := payload["confidence_score"]; ok {
		setClauses = append(setClauses, "confidence_score = ?")
		args = append(args, v)
	}

	if len(setClauses) == 0 {
		return fail(400, "no valid fields")
	}
	setClauses = append(setClauses, "updated_at = ?")
	args = append(args, nowMillis(), id)

	query := fmt.Sprintf("UPDATE content_source SET %s WHERE id = ?", strings.Join(setClauses, ", "))
	result, err := db.Exec(query, args...)
	if err != nil {
		return fail(500, "update failed")
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fail(404, "source not found")
	}
	return ok(map[string]interface{}{"id": id, "updated": affected}, "updated")
}

func handleSourceRemove(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}
	result, err := db.Exec("DELETE FROM content_source WHERE id = ?", id)
	if err != nil {
		return fail(500, "remove failed")
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fail(404, "source not found")
	}
	return ok(map[string]interface{}{"id": id, "deleted": affected}, "removed")
}
