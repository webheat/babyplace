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

// This script retries POIs that failed in the first pass.
// Sequential processing to respect Amap rate limits.
// Run with: go run tools/fetch_poi_images/retry/main.go

var (
	amapKey    = os.Getenv("AMAP_KEY")
	picDir     = "/opt/babyplace/pic"
	dbPath     = os.Getenv("DB_PATH")
	httpClient = &http.Client{Timeout: 15 * time.Second}
)

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
	ID, Name, City, Address string
	Lat, Lng                float64
	CoverImage              string
}

func openDB() (*sql.DB, error) {
	if dbPath == "" {
		dbPath = "data/babyplace.db"
	}
	return sql.Open("sqlite", dbPath)
}

func loadPOIsNeedingImage(db *sql.DB) ([]poiRow, error) {
	rows, err := db.Query(`
		SELECT id, name, city, address, lat, lng, cover_image
		FROM poi
		WHERE cover_image IS NULL OR trim(cover_image) = ''
		ORDER BY sort_order DESC, created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pois []poiRow
	for rows.Next() {
		var p poiRow
		if err := rows.Scan(&p.ID, &p.Name, &p.City, &p.Address,
			&p.Lat, &p.Lng, &p.CoverImage); err != nil {
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

// searchWithBackoff: up to 2 retries with exponential back-off on rate limit
func searchWithBackoff(name, city, types string) (*amapResponse, error) {
	for attempt := 0; attempt < 2; attempt++ {
		cityParam := ""
		if city != "" {
			cityParam = "&city=" + urlEncode(city) + "&citylimit=true"
		}
		typesParam := ""
		if types != "" {
			typesParam = "&types=" + types
		}

		url := fmt.Sprintf(
			"https://restapi.amap.com/v3/place/text?key=%s&keywords=%s%s%s&offset=5&page=1",
			amapKey, urlEncode(name), cityParam, typesParam)

		r, err := amapGet(url)
		if err == nil {
			return r, nil
		}

		msg := err.Error()
		if strings.Contains(msg, "CUQPS_HAS_EXCEEDED_THE_LIMIT") ||
			strings.Contains(msg, "OVER_QUERY_LIMIT") {
			wait := time.Duration(4+attempt*4) * time.Second
			log.Printf("  rate-limited, waiting %v...", wait)
			time.Sleep(wait)
			continue
		}
		// non-retryable error
		return r, err
	}
	return nil, fmt.Errorf("amap: max retries exceeded for %s", name)
}

func searchPhoto(name, city string) string {
	strategies := []struct {
		keywords string
		city     string
		types    string
	}{
		{name, city, ""},
		{name, "", ""},
		{name, city, "110000|110100|110101|110200|110300|110400|190000|190400"},
	}

	for _, s := range strategies {
		r, err := searchWithBackoff(s.keywords, s.city, s.types)
		if err != nil {
			log.Printf("  strategy %s: %v", s.keywords, err)
			continue
		}
		for _, poi := range r.Pois {
			for _, ph := range poi.Photos {
				u := strings.TrimSpace(ph.URL)
				if u != "" {
					return u
				}
			}
		}
	}
	return ""
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

type resultEntry struct {
	POI       poiRow
	AmapURL   string
	LocalPath string
	Updated   bool
	Err       string
}

func processOne(db *sql.DB, p poiRow, results *[]resultEntry) {
	entry := resultEntry{POI: p}

	url := searchPhoto(p.Name, p.City)
	if url == "" {
		log.Printf("[skip] no photo: %s (%s)", p.Name, p.City)
		*results = append(*results, entry)
		return
	}

	entry.AmapURL = url

	localPath := filepath.Join(picDir, p.ID)
	fp, err := downloadImage(url, localPath)
	if err != nil {
		log.Printf("[warn] download failed %s: %v", p.Name, err)
		entry.Err = err.Error()
		*results = append(*results, entry)
		return
	}

	_, dbErr := db.Exec(
		"UPDATE poi SET cover_image = ?, updated_at = ? WHERE id = ?",
		fp, time.Now().Unix(), p.ID)
	if dbErr != nil {
		log.Printf("[warn] db update failed %s: %v", p.Name, dbErr)
		entry.Err = dbErr.Error()
	} else {
		entry.LocalPath = fp
		entry.Updated = true
		log.Printf("[ok] %s → %s", p.Name, fp)
	}

	*results = append(*results, entry)
}

func truncate(b []byte, n int) string {
	s := string(b)
	if len(s) > n {
		return s[:n] + "..."
	}
	return s
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

	pois, err := loadPOIsNeedingImage(db)
	if err != nil {
		log.Fatalf("load pois: %v", err)
	}
	if len(pois) == 0 {
		log.Println("All POIs already have cover images. Nothing to do.")
		return
	}
	log.Printf("Retrying %d POIs (sequential, ~2s/req, est. %.1f min)",
		len(pois), float64(len(pois))*2.0/60)

	results := make([]resultEntry, 0, len(pois))

	for i, p := range pois {
		log.Printf("[%d/%d] %s (%s)", i+1, len(pois), p.Name, p.City)
		processOne(db, p, &results)

		// Delay between POIs to avoid rate limit
		if i < len(pois)-1 {
			time.Sleep(2000 * time.Millisecond)
		}
	}

	ok, fail := 0, 0
	for _, r := range results {
		if r.Updated { ok++ } else { fail++ }
	}
	log.Printf("=== DONE === ok=%d  fail=%d  total=%d", ok, fail, len(results))

	for _, r := range results {
		if !r.Updated {
			fmt.Printf("  FAIL  %s (%s)  err=%s\n", r.POI.Name, r.POI.City, r.Err)
		}
	}
}
