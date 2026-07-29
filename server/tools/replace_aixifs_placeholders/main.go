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
	"regexp"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// This script replaces numeric aixifs placeholder images (img/N.jpg) with real Amap photos.
// Run: go run server/tools/replace_aixifs_placeholders/main.go

var (
	amapKey    = os.Getenv("AMAP_KEY")
	picDir     = "/opt/babyplace/pic"
	dbPath     = os.Getenv("DB_PATH")
	httpClient = &http.Client{Timeout: 15 * time.Second}
	numPHRe   = regexp.MustCompile(`/img/(\d+)\.jpg$`)
)

// ==================== types ====================

type amapSearchResponse struct {
	Status   string `json:"status"`
	Info     string `json:"info"`
	Infocode string `json:"infocode"`
	Count    string `json:"count"`
	Pois     []struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Photos  []struct {
			URL string `json:"url"`
		} `json:"photos"`
		Location string `json:"location"`
	} `json:"pois"`
}

type poiRow struct {
	ID, Name, City, CoverImage string
}

type resultEntry struct {
	POI       poiRow
	NewImage  string
	Updated   bool
	Err       string
}

// ==================== DB ====================

func openDB() (*sql.DB, error) {
	if dbPath == "" {
		dbPath = "data/babyplace.db"
	}
	return sql.Open("sqlite", dbPath)
}

func loadNumericPlaceholderPOIs(db *sql.DB) ([]poiRow, error) {
	rows, err := db.Query(`
		SELECT id, name, city, cover_image
		FROM poi
		WHERE cover_image LIKE 'https://byupload.aixifs.com/img/%'
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
		// Filter to only numeric placeholders in Go
		if numPHRe.MatchString(p.CoverImage) {
			pois = append(pois, p)
		}
	}
	return pois, rows.Err()
}

// ==================== Amap ====================

func amapGet(url string) (*amapSearchResponse, error) {
	resp, err := httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var r amapSearchResponse
	if err := json.Unmarshal(body, &r); err != nil {
		return nil, fmt.Errorf("parse (%s): %w", truncate(body, 200), err)
	}
	if r.Status != "1" {
		return nil, fmt.Errorf("amap %s (infocode=%s): %s", r.Info, r.Infocode, truncate(body, 200))
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
			if strings.Contains(msg, "CUQPS_HAS_EXCEEDED_THE_LIMIT") ||
				strings.Contains(msg, "OVER_QUERY_LIMIT") {
				wait := time.Duration(3+attempt*3) * time.Second
				log.Printf("  rate-limited, waiting %v...", wait)
				time.Sleep(wait)
				continue
			}
			return ""
		}

		for _, poi := range r.Pois {
			for _, ph := range poi.Photos {
				u := strings.TrimSpace(ph.URL)
				if u == "" || numPHRe.MatchString(u) {
					continue
				}
				return u
			}
		}
		return ""
	}
	return ""
}

// ==================== image download ====================

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

// ==================== processing ====================

func processOne(db *sql.DB, p poiRow, mu *sync.Mutex, results *[]resultEntry) {
	entry := resultEntry{POI: p}

	newURL := searchAmapPhoto(p.Name, p.City)
	if newURL == "" {
		log.Printf("[skip] no real photo from Amap: %s (%s)", p.Name, p.City)
		*results = append(*results, entry)
		return
	}

	localPath := filepath.Join(picDir, p.ID)
	fp, err := downloadImage(newURL, localPath)
	if err != nil {
		log.Printf("[warn] download failed %s: %v", p.Name, err)
		*results = append(*results, resultEntry{POI: p, NewImage: newURL, Err: err.Error()})
		return
	}

	_, dbErr := db.Exec(
		"UPDATE poi SET cover_image = ?, updated_at = ? WHERE id = ?",
		fp, time.Now().Unix(), p.ID)
	if dbErr != nil {
		log.Printf("[warn] db update failed %s: %v", p.Name, dbErr)
		*results = append(*results, resultEntry{POI: p, NewImage: fp, Err: dbErr.Error()})
	} else {
		log.Printf("[ok] %s → %s", p.Name, fp)
		*results = append(*results, resultEntry{POI: p, NewImage: fp, Updated: true})
	}
}

// ==================== utils ====================

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

// ==================== main ====================

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

	pois, err := loadNumericPlaceholderPOIs(db)
	if err != nil {
		log.Fatalf("load pois: %v", err)
	}
	if len(pois) == 0 {
		log.Println("No numeric placeholder images found. Nothing to do.")
		return
	}
	log.Printf("POIs with numeric aixifs placeholders: %d", len(pois))

	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		results []resultEntry
	)

	for _, p := range pois {
		wg.Add(1)
		go func(p poiRow) {
			defer wg.Done()
			processOne(db, p, &mu, &results)
			time.Sleep(1200 * time.Millisecond)
		}(p)
	}
	wg.Wait()

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
