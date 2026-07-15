package main

import (
	"log"
	"math"
)

// recommend.home 推荐引擎（支持分页，featured 优先）
func handleRecommendHome(params map[string]interface{}) AdminResponse {
	lat := getFloat(params, "lat", math.NaN())
	lng := getFloat(params, "lng", math.NaN())
	radius := getInt(params, "radius", 5000)
	page := getInt(params, "page", 1)
	limit := getInt(params, "limit", 20)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 20
	}
	offset := (page - 1) * limit

	// 查询所有 published 的 POI（内存排序后分页）
	rows, err := db.Query("SELECT " + poiColumns + " FROM poi WHERE status = 'published' LIMIT 500")
	if err != nil {
		log.Printf("[recommend.home] query error: %v", err)
		return fail(500, "query failed")
	}
	defer rows.Close()

	allPOIs := make([]POI, 0)
	for rows.Next() {
		p, err := poiFromRow(rows)
		if err != nil {
			continue
		}
		allPOIs = append(allPOIs, *p)
	}

	// 排序：featured 优先级 > 评分 > 更新时间
	// featuredOrder: top=-1, new=0, hot=1, pick=2, season=3, 无=99
	featuredOrder := map[string]int{"top": -1, "new": 0, "hot": 1, "pick": 2, "season": 3}
	for i := 1; i < len(allPOIs); i++ {
		for j := i; j > 0; j-- {
			a, b := allPOIs[j], allPOIs[j-1]
			aFeat := 99
			bFeat := 99
			if v, ok := featuredOrder[a.Featured]; ok {
				aFeat = v
			}
			if v, ok := featuredOrder[b.Featured]; ok {
				bFeat = v
			}
			// 优先按 featured 排序
			if aFeat != bFeat {
				if aFeat < bFeat {
					allPOIs[j], allPOIs[j-1] = allPOIs[j-1], allPOIs[j]
				}
				continue
			}
			// 同 featured 内按评分+评价数排序
			if a.AvgRating > b.AvgRating || (a.AvgRating == b.AvgRating && a.ReviewCount > b.ReviewCount) {
				allPOIs[j], allPOIs[j-1] = allPOIs[j-1], allPOIs[j]
			}
		}
	}

	total := len(allPOIs)

	// 分页截取
	end := offset + limit
	if end > total {
		end = total
	}
	var items []POI
	if offset < total {
		items = allPOIs[offset:end]
	} else {
		items = make([]POI, 0)
	}

	// Nearby（仅第一页返回）
	var nearby []POI
	if page == 1 && !math.IsNaN(lat) && !math.IsNaN(lng) {
		type poiDist struct {
			POI
			dist float64
		}
		var withDist []poiDist
		for _, p := range allPOIs {
			d := haversineDistance(lat, lng, p.Location.Lat, p.Location.Lng)
			if d <= float64(radius) {
				withDist = append(withDist, poiDist{POI: p, dist: d})
			}
		}
		for i := 1; i < len(withDist); i++ {
			for j := i; j > 0 && withDist[j].dist < withDist[j-1].dist; j-- {
				withDist[j], withDist[j-1] = withDist[j-1], withDist[j]
			}
		}
		nearby = make([]POI, 0, 6)
		for i, wd := range withDist {
			if i >= 6 {
				break
			}
			nearby = append(nearby, wd.POI)
		}
	}

	return ok(map[string]interface{}{
		"items":    items,
		"total":    total,
		"page":     page,
		"limit":    limit,
		"hasMore":  end < total,
		"nearby":   nearby,
		"radius":   radius,
	}, "ok")
}

// 按评分和评价数排序（降序）
func sortByRatingAndReviews(pois []POI) {
	for i := 1; i < len(pois); i++ {
		for j := i; j > 0; j-- {
			a, b := pois[j], pois[j-1]
			if a.AvgRating > b.AvgRating || (a.AvgRating == b.AvgRating && a.ReviewCount > b.ReviewCount) {
				pois[j], pois[j-1] = pois[j-1], pois[j]
			} else {
				break
			}
		}
	}
}

// 按更新时间排序（降序）
func sortByUpdatedAt(pois []POI) {
	for i := 1; i < len(pois); i++ {
		for j := i; j > 0 && pois[j].UpdatedAt > pois[j-1].UpdatedAt; j-- {
			pois[j], pois[j-1] = pois[j-1], pois[j]
		}
	}
}
