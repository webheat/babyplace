package main

import (
	"log"
	"strings"
)

const seedSecret = "babyplace2026"

func checkSeedAuth(params map[string]interface{}) bool {
	secret := getString(params, "secret")
	return secret == seedSecret
}

// seed.insertBatch
func handleSeedInsertBatch(params map[string]interface{}) AdminResponse {
	if !checkSeedAuth(params) {
		return fail(401, "unauthorized")
	}

	collection := getString(params, "collection")
	data, _ := params["data"].([]interface{})
	if len(data) == 0 {
		return fail(400, "data is required")
	}

	succeeded := 0
	failed := 0

	for _, item := range data {
		m, ok := item.(map[string]interface{})
		if !ok {
			failed++
			continue
		}

		var err error
		switch collection {
		case "babyplace-poi":
			err = insertSeedPoi(m)
		case "babyplace-article":
			err = insertSeedArticle(m)
		case "babyplace-content-source":
			err = insertSeedSource(m)
		case "babyplace-user-review":
			err = insertSeedReview(m)
		default:
			return fail(400, "invalid collection: "+collection)
		}

		if err != nil {
			log.Printf("[seed.insert] error: %v", err)
			failed++
		} else {
			succeeded++
		}
	}

	return ok(map[string]interface{}{
		"total":     len(data),
		"succeeded": succeeded,
		"failed":    failed,
	}, "ok")
}

// seed.clearCollections
func handleSeedClearCollections(params map[string]interface{}) AdminResponse {
	if !checkSeedAuth(params) {
		return fail(401, "unauthorized")
	}

	collections, _ := params["collections"].([]interface{})
	allowed := map[string]string{
		"babyplace-poi":             "poi",
		"babyplace-article":         "article",
		"babyplace-content-source":  "content_source",
		"babyplace-user-review":     "review",
	}

	results := make([]map[string]interface{}, 0)
	for _, c := range collections {
		name, _ := c.(string)
		table, ok := allowed[name]
		if !ok {
			continue
		}
		result, err := db.Exec("DELETE FROM " + table)
		if err != nil {
			log.Printf("[seed.clear] %s error: %v", name, err)
			continue
		}
		deleted, _ := result.RowsAffected()
		results = append(results, map[string]interface{}{
			"collection": name,
			"deleted":    deleted,
		})
	}

	return ok(map[string]interface{}{"list": results}, "cleared")
}

// seed.upsertPoiBatch
func handleSeedUpsertPoiBatch(params map[string]interface{}) AdminResponse {
	if !checkSeedAuth(params) {
		return fail(401, "unauthorized")
	}

	data, _ := params["data"].([]interface{})
	if len(data) == 0 {
		return fail(400, "data is required")
	}

	succeeded := 0
	failed := 0

	for _, item := range data {
		m, ok := item.(map[string]interface{})
		if !ok {
			failed++
			continue
		}

		name := getString(m, "name")
		if name == "" {
			failed++
			continue
		}

		// 查找已有 POI（按 name 或 canonical_name）
		id := findExistingPOI(m)
		if id != "" {
			// 更新
			updateSeedPoi(id, m)
			succeeded++
		} else {
			// 创建
			insertSeedPoi(m)
			succeeded++
		}
	}

	return ok(map[string]interface{}{
		"total":     len(data),
		"succeeded": succeeded,
		"failed":    failed,
	}, "ok")
}

// seed.listPoiByNames
func handleSeedListPoiByNames(params map[string]interface{}) AdminResponse {
	if !checkSeedAuth(params) {
		return fail(401, "unauthorized")
	}

	names, _ := params["names"].([]interface{})
	if len(names) == 0 {
		return fail(400, "names is required")
	}

	results := make([]POI, 0)
	for _, n := range names {
		name, _ := n.(string)
		if name == "" {
			continue
		}
		row := db.QueryRow("SELECT "+poiColumns+" FROM poi WHERE name = ? OR canonical_name = ? LIMIT 1", name, name)
		p, err := poiFromRow(row)
		if err != nil {
			continue
		}
		results = append(results, *p)
	}

	return ok(map[string]interface{}{
		"list":  results,
		"total": len(results),
	}, "ok")
}

func insertSeedPoi(m map[string]interface{}) error {
	now := nowMillis()
	id := getString(m, "_id")
	if id == "" {
		id = generateID()
	}

	location, _ := m["location"].(map[string]interface{})
	lat := 0.0
	lng := 0.0
	if location != nil {
		lat = getFloat(location, "lat", 0)
		lng = getFloat(location, "lng", 0)
	}

	facilities, _ := m["facilities"].(map[string]interface{})

	_, err := db.Exec(`INSERT OR IGNORE INTO poi (
		id, name, canonical_name, alias, city, district, address,
		lat, lng, category, age_range, indoor, price_type, recommended_duration,
		transport, transport_hint, parking_tip,
		stroller_friendly, restroom, food, shade, parking, rainy_day_ok,
		summary, recommend_reason, notice, cover_image, gallery, tags,
		source_count, review_count, avg_rating, status, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id,
		getString(m, "name"),
		getStringDefault(m, "canonical_name", getString(m, "name")),
		jsonMarshal(toStringArray(m["alias"])),
		getStringDefault(m, "city", "广州"),
		getStringDefault(m, "district", ""),
		getString(m, "address"),
		lat, lng,
		getStringDefault(m, "category", "mixed"),
		jsonMarshal(toStringArray(m["age_range"])),
		boolToInt(getBool(m, "indoor")),
		getStringDefault(m, "price_type", "free"),
		getStringDefault(m, "recommended_duration", "2h"),
		jsonMarshal(toStringArray(m["transport"])),
		getString(m, "transport_hint"),
		getString(m, "parking_tip"),
		boolToInt(getFacilityBool(facilities, "stroller_friendly")),
		boolToInt(getFacilityBool(facilities, "restroom")),
		boolToInt(getFacilityBool(facilities, "food")),
		boolToInt(getFacilityBool(facilities, "shade")),
		boolToInt(getFacilityBool(facilities, "parking")),
		boolToInt(getFacilityBool(facilities, "rainy_day_ok")),
		getString(m, "summary"),
		getString(m, "recommend_reason"),
		getString(m, "notice"),
		getString(m, "cover_image"),
		jsonMarshal(toStringArray(m["gallery"])),
		jsonMarshal(toStringArray(m["tags"])),
		getInt(m, "source_count", 0),
		getInt(m, "review_count", 0),
		getFloat(m, "avg_rating", 0),
		getStringDefault(m, "status", "published"),
		now, now,
	)
	return err
}

func insertSeedArticle(m map[string]interface{}) error {
	now := nowMillis()
	id := getString(m, "_id")
	if id == "" {
		id = generateID()
	}
	_, err := db.Exec(`INSERT OR IGNORE INTO article (
		id, title, source_account, source_account_id, publish_time,
		url, cover_image, content_text, content_html, images, extracted_poi_names,
		parse_result, status, parse_confidence, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id,
		getString(m, "title"),
		getString(m, "source_account"),
		getString(m, "source_account_id"),
		now,
		getString(m, "url"),
		getString(m, "cover_image"),
		getString(m, "content_text"),
		getString(m, "content_html"),
		jsonMarshal(toStringArray(m["images"])),
		jsonMarshal(toStringArray(m["extracted_poi_names"])),
		"{}",
		getStringDefault(m, "status", "parsed"),
		getFloat(m, "parse_confidence", 0.8),
		now, now,
	)
	return err
}

func insertSeedSource(m map[string]interface{}) error {
	now := nowMillis()
	id := getString(m, "_id")
	if id == "" {
		id = generateID()
	}
	_, err := db.Exec(`INSERT OR IGNORE INTO content_source (
		id, poi_id, article_id, source_type, quoted_text,
		support_fields, confidence_score, is_primary, status, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id,
		getString(m, "poi_id"),
		getString(m, "article_id"),
		getStringDefault(m, "source_type", "article"),
		getString(m, "quoted_text"),
		jsonMarshal(toStringArray(m["support_fields"])),
		getFloat(m, "confidence_score", 0.8),
		boolToInt(getBool(m, "is_primary")),
		getStringDefault(m, "status", "active"),
		now, now,
	)
	return err
}

func insertSeedReview(m map[string]interface{}) error {
	now := nowMillis()
	id := getString(m, "_id")
	if id == "" {
		id = generateID()
	}
	_, err := db.Exec(`INSERT OR IGNORE INTO review (
		id, poi_id, user_id, nickname, avatar, rating, comment,
		visit_date, tags, images, status, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id,
		getString(m, "poi_id"),
		getString(m, "user_id"),
		getStringDefault(m, "nickname", "体验用户"),
		getString(m, "avatar"),
		getInt(m, "rating", 5),
		getString(m, "comment"),
		now,
		jsonMarshal(toStringArray(m["tags"])),
		jsonMarshal(toStringArray(m["images"])),
		getStringDefault(m, "status", "approved"),
		now, now,
	)
	return err
}

func findExistingPOI(m map[string]interface{}) string {
	names := []string{}
	if v := getString(m, "name"); v != "" {
		names = append(names, v)
	}
	if v := getString(m, "canonical_name"); v != "" {
		names = append(names, v)
	}
	if id := getString(m, "_id"); id != "" {
		var existing string
		db.QueryRow("SELECT id FROM poi WHERE id = ?", id).Scan(&existing)
		if existing != "" {
			return existing
		}
	}

	for _, name := range names {
		var id string
		db.QueryRow("SELECT id FROM poi WHERE name = ? OR canonical_name = ? LIMIT 1", name, name).Scan(&id)
		if id != "" {
			return id
		}
		// 检查 alias
		db.QueryRow("SELECT id FROM poi WHERE alias LIKE ? LIMIT 1", "%"+strings.ReplaceAll(name, "%", "\\%")+"%").Scan(&id)
		if id != "" {
			return id
		}
	}
	return ""
}

func updateSeedPoi(id string, m map[string]interface{}) {
	location, _ := m["location"].(map[string]interface{})
	facilities, _ := m["facilities"].(map[string]interface{})

	db.Exec(`UPDATE poi SET
		name = COALESCE(NULLIF(?, ''), name),
		city = COALESCE(NULLIF(?, ''), city),
		district = COALESCE(NULLIF(?, ''), district),
		address = COALESCE(NULLIF(?, ''), address),
		lat = CASE WHEN ? != 0 THEN ? ELSE lat END,
		lng = CASE WHEN ? != 0 THEN ? ELSE lng END,
		summary = COALESCE(NULLIF(?, ''), summary),
		status = COALESCE(NULLIF(?, ''), status),
		updated_at = ?
	WHERE id = ?`,
		getString(m, "name"),
		getString(m, "city"),
		getString(m, "district"),
		getString(m, "address"),
		getFloat(location, "lat", 0), getFloat(location, "lat", 0),
		getFloat(location, "lng", 0), getFloat(location, "lng", 0),
		getString(m, "summary"),
		getString(m, "status"),
		nowMillis(),
		id,
	)
	_ = facilities // TODO: update facilities
}
