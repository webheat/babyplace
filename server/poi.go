package main

import (
	"database/sql"
	"encoding/json"
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
	source_count, review_count, avg_rating, status, created_at, updated_at,
	open_time, ticket_info, phone, booking_url, booking_qr_code, reservation_type, reservation`

// POI 列表（兼容 poi 云对象：支持 city/district/includeDraft 过滤）
func handlePoiList(params map[string]interface{}) AdminResponse {
	page := getInt(params, "page", 1)
	pageSize := getInt(params, "pageSize", 20)
	keyword := getString(params, "keyword")
	city := getString(params, "city")
	district := getString(params, "district")
	includeDraft := getBool(params, "includeDraft")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	// 状态过滤：默认只看 published，除非 includeDraft=true
	where := "WHERE 1=1"
	var args []interface{}
	if !includeDraft {
		where += " AND status = 'published'"
	}
	if city != "" {
		where += " AND city = ?"
		args = append(args, city)
	}
	if district != "" {
		where += " AND district = ?"
		args = append(args, district)
	}
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

// POI 详情（直接返回 POI 对象，前端会单独调 review.listByPoi 获取评价）
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

	// 直接返回 POI 对象（与原 babyplace-admin 行为一致）
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

// POI 创建（兼容 poi 云对象：自动去重，名称相似度>0.85 + 距离<500m → 合并）
func handlePoiCreate(params map[string]interface{}) AdminResponse {
	payload := getPayload(params)
	now := nowMillis()

	name := getString(payload, "name")
	if name == "" {
		return fail(400, "name is required")
	}

	city := getString(payload, "city")
	district := getString(payload, "district")
	location, _ := payload["location"].(map[string]interface{})
	lat := 0.0
	lng := 0.0
	if location != nil {
		lat = getFloat(location, "lat", 0)
		lng = getFloat(location, "lng", 0)
	}

	// 去重检查：同城市同区域，名称相似度>0.85 且距离<500m → 合并
	if city != "" && district != "" {
		dedupRows, err := db.Query(
			fmt.Sprintf("SELECT %s FROM poi WHERE city = ? AND district = ?", poiColumns),
			city, district,
		)
		if err == nil {
			defer dedupRows.Close()
			var bestMatch *POI
			var bestSimilarity float64
			for dedupRows.Next() {
				existing, err := poiFromRow(dedupRows)
				if err != nil {
					continue
				}
				similarity := calcNameSimilarity(name, existing.Name)
				dist := haversineDistance(lat, lng, existing.Location.Lat, existing.Location.Lng)
				if similarity > 0.85 && dist < 500 {
					if bestMatch == nil || similarity > bestSimilarity {
						bestMatch = existing
						bestSimilarity = similarity
					}
				}
			}
			if bestMatch != nil {
				// 合并：更新 source_count，合并 alias
				mergedAlias := mergeAlias(bestMatch.Alias, name)
				db.Exec(`UPDATE poi SET alias = ?, source_count = source_count + 1, updated_at = ? WHERE id = ?`,
					jsonMarshal(mergedAlias), now, bestMatch.ID)
				log.Printf("[poi.create] dedup merge: %s → %s (similarity=%.2f)", name, bestMatch.Name, bestSimilarity)
				return ok(map[string]interface{}{
					"id":        bestMatch.ID,
					"deduped":   true,
					"similarity": bestSimilarity,
				}, "merged")
			}
		}
	}

	id := generateID()
	facilities, _ := payload["facilities"].(map[string]interface{})
	reservation, _ := payload["reservation"].(map[string]interface{})
	reservationJSON := "{}"
	if reservation != nil {
		b, _ := json.Marshal(reservation)
		reservationJSON = string(b)
	}

	_, err := db.Exec(`INSERT INTO poi (
		id, name, canonical_name, alias, city, district, address,
		lat, lng, category, age_range, indoor, price_type, recommended_duration,
		transport, transport_hint, parking_tip,
		stroller_friendly, restroom, food, shade, parking, rainy_day_ok,
		summary, recommend_reason, notice, cover_image, gallery, tags,
		source_count, review_count, avg_rating, status, created_at, updated_at,
		open_time, ticket_info, phone, booking_url, booking_qr_code, reservation_type, reservation
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
		getString(payload, "open_time"),
		getString(payload, "ticket_info"),
		getString(payload, "phone"),
		getString(payload, "booking_url"),
		getString(payload, "booking_qr_code"),
		getString(payload, "reservation_type"),
		reservationJSON,
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
	if v, ok := payload["open_time"]; ok {
		setClauses = append(setClauses, "open_time = ?")
		args = append(args, v)
	}
	if v, ok := payload["ticket_info"]; ok {
		setClauses = append(setClauses, "ticket_info = ?")
		args = append(args, v)
	}
	if v, ok := payload["phone"]; ok {
		setClauses = append(setClauses, "phone = ?")
		args = append(args, v)
	}
	if v, ok := payload["booking_url"]; ok {
		setClauses = append(setClauses, "booking_url = ?")
		args = append(args, v)
	}
	if v, ok := payload["booking_qr_code"]; ok {
		setClauses = append(setClauses, "booking_qr_code = ?")
		args = append(args, v)
	}
	if v, ok := payload["reservation_type"]; ok {
		setClauses = append(setClauses, "reservation_type = ?")
		args = append(args, v)
	}
	if r, ok := payload["reservation"].(map[string]interface{}); ok {
		b, _ := json.Marshal(r)
		setClauses = append(setClauses, "reservation = ?")
		args = append(args, string(b))
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

// 名称相似度计算（Levenshtein 距离）
func normalizeName(s string) string {
	s = strings.ToLower(s)
	replacer := strings.NewReplacer(
		"(", "", ")", "", "（", "", "）", "",
		",", "", "，", "", ".", "", "。", "",
		":", "", "：", "", "/", "", "\\", "", "-", "", " ", "",
	)
	return replacer.Replace(s)
}

func levenshteinDistance(a, b string) int {
	// 使用 rune 切片以正确处理中文字符
	ra := []rune(a)
	rb := []rune(b)
	la, lb := len(ra), len(rb)
	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}
	dp := make([]int, lb+1)
	for j := 0; j <= lb; j++ {
		dp[j] = j
	}
	for i := 1; i <= la; i++ {
		prev := dp[0]
		dp[0] = i
		for j := 1; j <= lb; j++ {
			temp := dp[j]
			if ra[i-1] == rb[j-1] {
				dp[j] = prev
			} else {
				dp[j] = min(prev, dp[j], dp[j-1]) + 1
			}
			prev = temp
		}
	}
	return dp[lb]
}

func min(a, b, c int) int {
	if a < b {
		if a < c {
			return a
		}
		return c
	}
	if b < c {
		return b
	}
	return c
}

func calcNameSimilarity(a, b string) float64 {
	left := normalizeName(a)
	right := normalizeName(b)
	if left == "" || right == "" {
		return 0
	}
	if left == right {
		return 1
	}
	dist := levenshteinDistance(left, right)
	maxLen := len([]rune(left))
	if rLen := len([]rune(right)); rLen > maxLen {
		maxLen = rLen
	}
	if maxLen == 0 {
		return 0
	}
	return 1 - float64(dist)/float64(maxLen)
}

func mergeAlias(existing []string, newName string) []string {
	seen := make(map[string]bool)
	result := make([]string, 0)
	for _, s := range existing {
		if s != "" && !seen[s] {
			seen[s] = true
			result = append(result, s)
		}
	}
	if newName != "" && !seen[newName] {
		result = append(result, newName)
	}
	return result
}
