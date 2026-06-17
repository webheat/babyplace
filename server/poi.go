package main

import (
	"database/sql"
	"fmt"
	"log"
	"math"
	"strings"
)

const poiColumns = `id, name, canonical_name, alias, city, district, address,
	lat, lng, category, age_range, indoor, price_type, recommended_duration,
	transport, transport_hint, parking_tip,
	stroller_friendly, restroom, food, shade, parking, rainy_day_ok,
	summary, recommend_reason, notice, cover_image, gallery, tags,
	source_count, review_count, avg_rating, status, created_at, updated_at`

// POI 列表
func handlePoiList(params map[string]interface{}) AdminResponse {
	page := getInt(params, "page", 1)
	pageSize := getInt(params, "pageSize", 20)
	keyword := getString(params, "keyword")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	where := "WHERE status = 'published'"
	var args []interface{}
	if keyword != "" {
		where += " AND (name LIKE ? OR canonical_name LIKE ? OR address LIKE ? OR city LIKE ? OR district LIKE ?)"
		kw := "%" + keyword + "%"
		args = append(args, kw, kw, kw, kw, kw)
	}

	// 总数
	var total int
	countSQL := "SELECT COUNT(*) FROM poi " + where
	if err := db.QueryRow(countSQL, args...).Scan(&total); err != nil {
		log.Printf("[poi.list] count error: %v", err)
		return fail(500, "query failed")
	}

	// 分页数据
	offset := (page - 1) * pageSize
	querySQL := fmt.Sprintf("SELECT %s FROM poi %s ORDER BY updated_at DESC, created_at DESC LIMIT ? OFFSET ?", poiColumns, where)
	args = append(args, pageSize, offset)

	rows, err := db.Query(querySQL, args...)
	if err != nil {
		log.Printf("[poi.list] query error: %v", err)
		return fail(500, "query failed")
	}
	defer rows.Close()

	list := make([]POI, 0)
	for rows.Next() {
		p, err := poiFromRow(rows)
		if err != nil {
			log.Printf("[poi.list] scan error: %v", err)
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

// POI 详情
func handlePoiDetail(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}

	row := db.QueryRow(fmt.Sprintf("SELECT %s FROM poi WHERE id = ?", poiColumns), id)
	p, err := poiFromRow(row)
	if err == sql.ErrNoRows {
		return fail(404, "poi not found")
	}
	if err != nil {
		log.Printf("[poi.detail] error: %v", err)
		return fail(500, "query failed")
	}

	return ok(p, "ok")
}

// 附近 POI 搜索
func handlePoiNearby(params map[string]interface{}) AdminResponse {
	lat := getFloat(params, "lat", math.NaN())
	lng := getFloat(params, "lng", math.NaN())
	if math.IsNaN(lat) || math.IsNaN(lng) {
		return fail(400, "lat/lng is required")
	}

	radius := getInt(params, "radius", 3000)
	if radius < 100 {
		radius = 100
	}
	if radius > 50000 {
		radius = 50000
	}
	page := getInt(params, "page", 1)
	pageSize := getInt(params, "pageSize", 20)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	// 查询所有 published POI，在内存中计算距离（数据量不大时可行）
	rows, err := db.Query(fmt.Sprintf("SELECT %s FROM poi WHERE status = 'published' LIMIT 500", poiColumns))
	if err != nil {
		log.Printf("[poi.nearby] query error: %v", err)
		return fail(500, "query failed")
	}
	defer rows.Close()

	type poiWithDist struct {
		POI
		Distance float64 `json:"distance"`
	}
	var results []poiWithDist

	for rows.Next() {
		p, err := poiFromRow(rows)
		if err != nil {
			continue
		}
		dist := haversineDistance(lat, lng, p.Location.Lat, p.Location.Lng)
		if dist <= float64(radius) {
			results = append(results, poiWithDist{POI: *p, Distance: dist})
		}
	}

	// 按距离排序
	for i := 1; i < len(results); i++ {
		for j := i; j > 0 && results[j].Distance < results[j-1].Distance; j-- {
			results[j], results[j-1] = results[j-1], results[j]
		}
	}

	total := len(results)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	return ok(map[string]interface{}{
		"list":     results[start:end],
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
		"radius":   radius,
	}, "ok")
}

// POI 创建
func handlePoiCreate(params map[string]interface{}) AdminResponse {
	payload := getPayload(params)
	now := nowMillis()
	id := generateID()

	name := getString(payload, "name")
	if name == "" {
		return fail(400, "name is required")
	}

	location, _ := payload["location"].(map[string]interface{})
	lat := 0.0
	lng := 0.0
	if location != nil {
		lat = getFloat(location, "lat", 0)
		lng = getFloat(location, "lng", 0)
	}

	facilities, _ := payload["facilities"].(map[string]interface{})

	_, err := db.Exec(`INSERT INTO poi (
		id, name, canonical_name, alias, city, district, address,
		lat, lng, category, age_range, indoor, price_type, recommended_duration,
		transport, transport_hint, parking_tip,
		stroller_friendly, restroom, food, shade, parking, rainy_day_ok,
		summary, recommend_reason, notice, cover_image, gallery, tags,
		source_count, review_count, avg_rating, status, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id,
		name,
		getString(payload, "canonical_name"),
		jsonMarshal(toStringArray(payload["alias"])),
		getString(payload, "city"),
		getString(payload, "district"),
		getString(payload, "address"),
		lat, lng,
		getString(payload, "category"),
		jsonMarshal(toStringArray(payload["age_range"])),
		boolToInt(getBool(payload, "indoor")),
		getString(payload, "price_type"),
		getString(payload, "recommended_duration"),
		jsonMarshal(toStringArray(payload["transport"])),
		getString(payload, "transport_hint"),
		getString(payload, "parking_tip"),
		boolToInt(getFacilityBool(facilities, "stroller_friendly")),
		boolToInt(getFacilityBool(facilities, "restroom")),
		boolToInt(getFacilityBool(facilities, "food")),
		boolToInt(getFacilityBool(facilities, "shade")),
		boolToInt(getFacilityBool(facilities, "parking")),
		boolToInt(getFacilityBool(facilities, "rainy_day_ok")),
		getString(payload, "summary"),
		getString(payload, "recommend_reason"),
		getString(payload, "notice"),
		getString(payload, "cover_image"),
		jsonMarshal(toStringArray(payload["gallery"])),
		jsonMarshal(toStringArray(payload["tags"])),
		getInt(payload, "source_count", 0),
		getInt(payload, "review_count", 0),
		getFloat(payload, "avg_rating", 0),
		getStringDefault(payload, "status", "draft"),
		now, now,
	)
	if err != nil {
		log.Printf("[poi.create] error: %v", err)
		return fail(500, "create failed")
	}

	return ok(map[string]interface{}{"id": id}, "created")
}

// POI 更新
func handlePoiUpdate(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}

	payload := getPayload(params)
	if len(payload) == 0 {
		return fail(400, "payload is required")
	}

	// 构建动态 UPDATE
	setClauses := []string{}
	args := []interface{}{}

	if v, ok := payload["name"]; ok {
		setClauses = append(setClauses, "name = ?")
		args = append(args, v)
	}
	if v, ok := payload["canonical_name"]; ok {
		setClauses = append(setClauses, "canonical_name = ?")
		args = append(args, v)
	}
	if v, ok := payload["alias"]; ok {
		setClauses = append(setClauses, "alias = ?")
		args = append(args, jsonMarshal(toStringArray(v)))
	}
	if v, ok := payload["city"]; ok {
		setClauses = append(setClauses, "city = ?")
		args = append(args, v)
	}
	if v, ok := payload["district"]; ok {
		setClauses = append(setClauses, "district = ?")
		args = append(args, v)
	}
	if v, ok := payload["address"]; ok {
		setClauses = append(setClauses, "address = ?")
		args = append(args, v)
	}
	if loc, ok := payload["location"].(map[string]interface{}); ok {
		setClauses = append(setClauses, "lat = ?, lng = ?")
		args = append(args, getFloat(loc, "lat", 0), getFloat(loc, "lng", 0))
	}
	if v, ok := payload["category"]; ok {
		setClauses = append(setClauses, "category = ?")
		args = append(args, v)
	}
	if v, ok := payload["status"]; ok {
		setClauses = append(setClauses, "status = ?")
		args = append(args, v)
	}
	if v, ok := payload["summary"]; ok {
		setClauses = append(setClauses, "summary = ?")
		args = append(args, v)
	}
	if v, ok := payload["recommend_reason"]; ok {
		setClauses = append(setClauses, "recommend_reason = ?")
		args = append(args, v)
	}
	if v, ok := payload["notice"]; ok {
		setClauses = append(setClauses, "notice = ?")
		args = append(args, v)
	}
	if v, ok := payload["cover_image"]; ok {
		setClauses = append(setClauses, "cover_image = ?")
		args = append(args, v)
	}
	if v, ok := payload["tags"]; ok {
		setClauses = append(setClauses, "tags = ?")
		args = append(args, jsonMarshal(toStringArray(v)))
	}
	if f, ok := payload["facilities"].(map[string]interface{}); ok {
		setClauses = append(setClauses, "stroller_friendly = ?, restroom = ?, food = ?, shade = ?, parking = ?, rainy_day_ok = ?")
		args = append(args,
			boolToInt(getFacilityBool(f, "stroller_friendly")),
			boolToInt(getFacilityBool(f, "restroom")),
			boolToInt(getFacilityBool(f, "food")),
			boolToInt(getFacilityBool(f, "shade")),
			boolToInt(getFacilityBool(f, "parking")),
			boolToInt(getFacilityBool(f, "rainy_day_ok")),
		)
	}

	if len(setClauses) == 0 {
		return fail(400, "no valid fields to update")
	}

	setClauses = append(setClauses, "updated_at = ?")
	args = append(args, nowMillis())
	args = append(args, id)

	query := fmt.Sprintf("UPDATE poi SET %s WHERE id = ?", strings.Join(setClauses, ", "))
	result, err := db.Exec(query, args...)
	if err != nil {
		log.Printf("[poi.update] error: %v", err)
		return fail(500, "update failed")
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fail(404, "poi not found")
	}

	return ok(map[string]interface{}{"id": id, "updated": affected}, "updated")
}

// POI 删除
func handlePoiRemove(params map[string]interface{}) AdminResponse {
	id := getString(params, "id")
	if id == "" {
		return fail(400, "id is required")
	}

	result, err := db.Exec("DELETE FROM poi WHERE id = ?", id)
	if err != nil {
		log.Printf("[poi.remove] error: %v", err)
		return fail(500, "remove failed")
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fail(404, "poi not found")
	}

	return ok(map[string]interface{}{"id": id, "deleted": affected}, "removed")
}

// Haversine 距离计算（米）
func haversineDistance(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadius = 6371000.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return earthRadius * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

type poiWithDistSlice []struct {
	POI
	Distance float64 `json:"distance"`
}

func sortByDistance(s poiWithDistSlice) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j].Distance < s[j-1].Distance; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}

// 辅助函数
func toStringArray(v interface{}) []string {
	if v == nil {
		return []string{}
	}
	arr, ok := v.([]interface{})
	if !ok {
		return []string{}
	}
	result := make([]string, 0, len(arr))
	for _, item := range arr {
		if s, ok := item.(string); ok {
			result = append(result, s)
		}
	}
	return result
}

func getBool(params map[string]interface{}, key string) bool {
	v, ok := params[key]
	if !ok {
		return false
	}
	switch b := v.(type) {
	case bool:
		return b
	case string:
		return b == "true"
	}
	return false
}

func getFacilityBool(f map[string]interface{}, key string) bool {
	if f == nil {
		return false
	}
	return getBool(f, key)
}

func getStringDefault(params map[string]interface{}, key, def string) string {
	v := getString(params, key)
	if v == "" {
		return def
	}
	return v
}
