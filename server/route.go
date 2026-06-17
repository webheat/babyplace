package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"strings"
	"time"
)

var routeAmapKey string

func initRoute() {
	routeAmapKey = os.Getenv("AMAP_KEY")
	if routeAmapKey == "" {
		routeAmapKey = "abcef158da87a62e42e1fb968ed33dd4"
	}
}

// route.drive - 高德驾车路线规划
func handleRouteDrive(params map[string]interface{}) AdminResponse {
	originLat := getFloat(params, "originLat", math.NaN())
	originLng := getFloat(params, "originLng", math.NaN())
	destLat := getFloat(params, "destLat", math.NaN())
	destLng := getFloat(params, "destLng", math.NaN())
	style := getString(params, "style")
	if style == "" {
		style = "0"
	}

	if math.IsNaN(originLat) || math.IsNaN(originLng) {
		return fail(400, "origin coordinates are invalid")
	}
	if math.IsNaN(destLat) || math.IsNaN(destLng) {
		return fail(400, "destination coordinates are invalid")
	}

	if routeAmapKey == "" {
		initRoute()
	}

	url := fmt.Sprintf(
		"https://restapi.amap.com/v3/direction/driving?origin=%f,%f&destination=%f,%f&strategy=%s&extensions=all&output=json&key=%s",
		originLng, originLat, destLng, destLat, style, routeAmapKey,
	)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		log.Printf("[route.drive] amap request failed: %v", err)
		return fail(502, "amap request failed")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var amapResp struct {
		Status string `json:"status"`
		Info   string `json:"info"`
		Route  struct {
			Paths []struct {
				Distance string `json:"distance"`
				Duration string `json:"duration"`
				Steps    []struct {
					Instruction string `json:"instruction"`
					Polyline    string `json:"polyline"`
				} `json:"steps"`
			} `json:"paths"`
		} `json:"route"`
	}
	if err := json.Unmarshal(body, &amapResp); err != nil {
		log.Printf("[route.drive] parse failed: %v", err)
		return fail(502, "amap response parse failed")
	}

	if amapResp.Status != "1" {
		return fail(502, strings.TrimSpace(amapResp.Info))
	}

	var path struct {
		Distance string `json:"distance"`
		Duration string `json:"duration"`
		Steps    []struct {
			Instruction string `json:"instruction"`
			Polyline    string `json:"polyline"`
		} `json:"steps"`
	}
	if len(amapResp.Route.Paths) > 0 {
		path = amapResp.Route.Paths[0]
	}

	distance := toNumberFromString(path.Distance)
	duration := toNumberFromString(path.Duration)

	points := make([]map[string]float64, 0)
	for _, step := range path.Steps {
		for _, pair := range strings.Split(step.Polyline, ";") {
			parts := strings.Split(pair, ",")
			if len(parts) != 2 {
				continue
			}
			lng := toNumberFromString(parts[0])
			lat := toNumberFromString(parts[1])
			if lat != 0 && lng != 0 {
				points = append(points, map[string]float64{"latitude": lat, "longitude": lng})
			}
		}
	}
	if len(points) == 0 {
		points = []map[string]float64{
			{"latitude": originLat, "longitude": originLng},
			{"latitude": destLat, "longitude": destLng},
		}
	}

	instructions := make([]string, 0)
	for _, step := range path.Steps {
		if s := strings.TrimSpace(step.Instruction); s != "" {
			instructions = append(instructions, s)
		}
	}

	return ok(map[string]interface{}{
		"distance":     distance,
		"distanceText": formatRouteDistance(distance),
		"duration":     duration,
		"durationText": formatRouteDuration(duration),
		"polyline":     points,
		"instructions": instructions,
	}, "ok")
}

func toNumberFromString(s string) float64 {
	var f float64
	fmt.Sscanf(strings.TrimSpace(s), "%f", &f)
	return f
}

func formatRouteDistance(distance float64) string {
	if distance == 0 {
		return ""
	}
	if distance >= 1000 {
		if distance >= 10000 {
			return fmt.Sprintf("%.0f 公里", distance/1000)
		}
		return fmt.Sprintf("%.1f 公里", distance/1000)
	}
	return fmt.Sprintf("%.0f 米", distance)
}

func formatRouteDuration(duration float64) string {
	if duration == 0 {
		return ""
	}
	minutes := duration / 60
	if minutes > 180 {
		minutes = math.Round(minutes)
	} else {
		minutes = math.Round(minutes)
	}
	if minutes >= 60 {
		hours := int(minutes) / 60
		remain := int(minutes) % 60
		if remain > 0 {
			return fmt.Sprintf("%d小时%d分钟", hours, remain)
		}
		return fmt.Sprintf("%d小时", hours)
	}
	m := int(math.Max(1, minutes))
	return fmt.Sprintf("%d 分钟", m)
}
