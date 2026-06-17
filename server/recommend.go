package main

import (
	"log"
	"math"
)

// recommend.home 推荐引擎
func handleRecommendHome(params map[string]interface{}) AdminResponse {
	lat := getFloat(params, "lat", math.NaN())
	lng := getFloat(params, "lng", math.NaN())
	radius := getInt(params, "radius", 5000)
	if radius < 500 {
		radius = 500
	}
	if radius > 20000 {
		radius = 20000
	}

	rows, err := db.Query("SELECT " + poiColumns + " FROM poi WHERE status = 'published' LIMIT 200")
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

	// Featured: 按评分 + 评价数排序
	featured := make([]POI, len(allPOIs))
	copy(featured, allPOIs)
	sortByRatingAndReviews(featured)
	if len(featured) > 6 {
		featured = featured[:6]
	}

	// Latest: 按更新时间排序
	latest := make([]POI, len(allPOIs))
	copy(latest, allPOIs)
	sortByUpdatedAt(latest)
	if len(latest) > 6 {
		latest = latest[:6]
	}

	// Nearby: 按距离排序（如果有坐标）
	nearby := make([]POI, 0)
	if !math.IsNaN(lat) && !math.IsNaN(lng) {
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
		// 按距离排序
		for i := 1; i < len(withDist); i++ {
			for j := i; j > 0 && withDist[j].dist < withDist[j-1].dist; j-- {
				withDist[j], withDist[j-1] = withDist[j-1], withDist[j]
			}
		}
		for _, wd := range withDist {
			nearby = append(nearby, wd.POI)
		}
		if len(nearby) > 6 {
			nearby = nearby[:6]
		}
	}

	return ok(map[string]interface{}{
		"featured": featured,
		"latest":   latest,
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
