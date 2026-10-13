package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// This script replaces known default/placeholder images with real Amap photos.
// Targets:
//   1. Amap default: http://store.is.autonavi.com/showpic/a00c545711f6bea1ab03c2336b5ef659
//   2. aixifs numeric defaults: https://byupload.aixifs.com/img/<number>.jpg
//
// Run: go run tools/fetch_poi_images/replace_defaults/main.go

var (
	amapKey    = os.Getenv("AMAP_KEY")
	picDir     = "/opt/babyplace/pic"
	dbPath     = os.Getenv("DB_PATH")
	httpClient = &http.Client{Timeout: 15 * time.Second}
)

// Known default image hashes/URLs to skip (these are placeholders, not real photos)
var defaultHashes = map[string]bool{
	"a00c545711f6bea1ab03c2336b5ef659": true, // Amap default
}

type amapResponse struct {
	Status   string `json:"status"`
	Info     string `json:"info"`
	Infocode string `json:"infocode"`
	Count    string `json:"count"`
	Pois     []struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Photos []struct {
			URL string `json:"url"`
		} `json:"photos"`
		Location string `json:"location"`
	} `json:"pois"`
}

type poiRow struct {
	ID, Name, City, CoverImage string
}

func openDB() (*sql.DB, error) {
	if dbPath == "" {
		dbPath = "data/babyplace.db"
	}
	return sql.Open("sqlite", dbPath)
}

func loadDefaultImagePOIs(db *sql.DB) ([]poiRow, error) {
	// Load POIs with known default/placeholder images
	rows, err := db.Query(`
		SELECT id, name, city, cover_image
		FROM poi
		WHERE cover_image = 'http://store.is.autonavi.com/showpic/a00c545711f6bea1ab03c2336b5ef659'
		   OR cover_image LIKE 'https://byupload.aixifs.com/img/%'
		ORDER BY sort_order DESC, created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pois []poiRow
	for rows.Next() {
		var p poiRow
		if err := rows.Scan(&p.ID, &p.Name, &p.City, &p.CoverImage); err != nil {
			return nil, err
		}
		pois = append(pois, p)
	}
	return pois, rows.Err()
}

func amapGet(url string) (*amapResponse, error) {
	resp, err := httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var r amapResponse
	if err := json.Unmarshal(body, &r); err != nil {
		return nil, fmt.Errorf("parse: %w", err)
	}
	if r.Status != "1" {
		return nil, fmt.Errorf("amap %s (infocode=%s)", r.Info, r.Infocode)
	}
	return &r, nil
}

func searchAmapPhoto(name, city string) string {
	types := "110000|110100|110200|110300|110400|190000|190400"

	for attempt := 0; attempt < 2; attempt++ {
		cityParam := ""
		if city != "" {
			cityParam = "&city=" + urlEncode(city) + "&citylimit=true"
		}
		url := fmt.Sprintf(
			"https://restapi.amap.com/v3/place/text?key=%s&keywords=%s%s&offset=5&page=1&types=%s",
			amapKey, urlEncode(name), cityParam, types)

		r, err := amapGet(url)
		if err != nil {
			msg := err.Error()
			if strings.Contains(msg, "CUQPS_HAS_EXCEEDED_THE_LIMIT") {
				wait := time.Duration(4+attempt*4) * time.Second
				log.Printf("  rate-limited, waiting %v...", wait)
				time.Sleep(wait)
				continue
			}
			return ""
		}

		// Pick first photo that is NOT a known default
		for _, poi := range r.Pois {
			for _, ph := range poi.Photos {
				u := strings.TrimSpace(ph.URL)
				if u == "" {
					continue
				}
				// Skip known default/placeholder images
				if isDefaultImage(u) {
					continue
				}
				return u
			}
		}
		return ""
	}
	return ""
}

func isDefaultImage(url string) bool {
	// Check for known default hash
	for h := range defaultHashes {
		if strings.Contains(url, h) {
			return true
		}
	}
	// aixifs numeric defaults: img/1.jpg, img/2.jpg, etc.
	if strings.Contains(url, "byupload.aixifs.com/img/") {
		// Extract filename
		parts := strings.Split(url, "/")
		if len(parts) > 0 {
			fname := parts[len(parts)-1]
			// Check if it's just a number like "1.jpg", "3.jpg", etc.
			name := strings.TrimSuffix(fname, ".jpg")
			name = strings.TrimSuffix(name, ".png")
			if name != "" {
				var n int
				if _, err := fmt.Sscanf(name, "%d", &n); err == nil {
					return true
				}
			}
		}
	}
	return false
}

func downloadImage(urlStr, destBase string) (string, error) {
	resp, err := httpClient.Get(urlStr)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	ext := ".jpg"
	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "png") {
		ext = ".png"
	} else if strings.Contains(ct, "webp") {
		ext = ".webp"
	}
	final := destBase + ext
	if err := os.WriteFile(final, data, 0644); err != nil {
		return "", err
	}
	log.Printf("  saved %s (%d bytes)", final, len(data))
	return final, nil
}

func main() {
	log.SetFlags(log.Ltime)

	if amapKey == "" {
		log.Fatal("AMAP_KEY env var required")
	}
	if err := os.MkdirAll(picDir, 0755); err != nil {
		log.Fatalf("cannot create %s: %v", picDir, err)
	}

	db, err := openDB()
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	pois, err := loadDefaultImagePOIs(db)
	if err != nil {
		log.Fatalf("load pois: %v", err)
	}
	if len(pois) == 0 {
		log.Println("No POIs with default/placeholder images found. Nothing to do.")
		return
	}
	log.Printf("Found %d POIs with default/placeholder images", len(pois))

	results := make([]struct {
		POI       poiRow
		NewImage  string
		Updated   bool
		Err       string
	}, 0, len(pois))

	for i, p := range pois {
		log.Printf("[%d/%d] %s (%s)  current=%s", i+1, len(pois), p.Name, p.City, p.CoverImage)

		// Delay to respect rate limit
		if i > 0 {
			time.Sleep(2000 * time.Millisecond)
		}

		newURL := searchAmapPhoto(p.Name, p.City)
		if newURL == "" {
			log.Printf("[skip] no real photo from Amap: %s", p.Name)
			results = append(results, struct {
				POI       poiRow
				NewImage  string
				Updated   bool
				Err       string
			}{POI: p, Err: "no photo from Amap"})
			continue
		}

		// Download
		localPath := filepath.Join(picDir, p.ID)
		fp, err := downloadImage(newURL, localPath)
		if err != nil {
			log.Printf("[warn] download failed %s: %v", p.Name, err)
			results = append(results, struct {
				POI       poiRow
				NewImage  string
				Updated   bool
				Err       string
			}{POI: p, NewImage: newURL, Err: err.Error()})
			continue
		}

		// Update DB
		_, dbErr := db.Exec(
			"UPDATE poi SET cover_image = ?, updated_at = ? WHERE id = ?",
			fp, time.Now().Unix(), p.ID)
		if dbErr != nil {
			log.Printf("[warn] db update failed %s: %v", p.Name, dbErr)
			results = append(results, struct {
				POI       poiRow
				NewImage  string
				Updated   bool
				Err       string
			}{POI: p, NewImage: fp, Err: dbErr.Error()})
		} else {
			log.Printf("[ok] %s → %s", p.Name, fp)
			results = append(results, struct {
				POI       poiRow
				NewImage  string
				Updated   bool
				Err       string
			}{POI: p, NewImage: fp, Updated: true})
		}
	}

	ok, fail := 0, 0
	for _, r := range results {
		if r.Updated {
			ok++
		} else {
			fail++
		}
	}
	log.Printf("=== DONE === ok=%d  fail=%d  total=%d", ok, fail, len(results))

	for _, r := range results {
		if !r.Updated {
			fmt.Printf("  FAIL  %s (%s)  err=%s\n", r.POI.Name, r.POI.City, r.Err)
		}
	}
}

func urlEncode(s string) string {
	var out strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			out.WriteRune(r)
		default:
			fmt.Fprintf(&out, "%%%02X", r)
		}
	}
	return out.String()
}
