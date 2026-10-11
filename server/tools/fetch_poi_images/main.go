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
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// ==================== config ====================

var (
	amapKey    = os.Getenv("AMAP_KEY")
	picDir     = "/opt/babyplace/pic"
	dbPath     = os.Getenv("DB_PATH")
	httpClient = &http.Client{Timeout: 15 * time.Second}
)

// Known POI name → correct AMap photo URL overrides.
// Used when AMap search may return a different POI or wrong photo.
// Key: POI name (exact match), Value: AMap photo URL to download.
var knownOverrides = map[string]string{
	"广州近代史博物馆": "http://store.is.autonavi.com/showpic/e871bfbc8defac9dbe44a7e1685fbac3",
}

// ==================== types ====================

type amapResponse struct {
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
	ID, Name, City, Address string
	Lat, Lng                float64
	CoverImage              string
}

type resultEntry struct {
	POI       poiRow
	AmapURL   string
	LocalPath string
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

// ==================== Amap ====================

// searchWithRetry does a place/text search with retries and exponential back-off.
func searchWithRetry(name, city string) (*amapResponse, error) {
	types := "110000|110100|110101|110200|110202|110203|110300|110400|110401|110402|190000|190100|190400|190403"

	for attempt := 0; attempt < 3; attempt++ {
		cityParam := ""
		if city != "" {
			cityParam = "&city=" + urlEncode(city) + "&citylimit=true"
		}
		url := fmt.Sprintf(
			"https://restapi.amap.com/v3/place/text?key=%s&keywords=%s%s&offset=3&page=1&types=%s",
			amapKey, urlEncode(name), cityParam, types)

		r, err := amapGet(url)
		if err == nil {
			return r, nil
		}

		msg := err.Error()
		if strings.Contains(msg, "CUQPS_HAS_EXCEEDED_THE_LIMIT") ||
			strings.Contains(msg, "OVER_QUERY_LIMIT") ||
			strings.Contains(msg, "DAILY_QUERY_OVER_LIMIT") {
			wait := time.Duration(3*(1<<attempt)) * time.Second // 3s, 6s, 12s
			log.Printf("  rate-limited (attempt %d), waiting %v...", attempt+1, wait)
			time.Sleep(wait)
			continue
		}
		// non-retryable error
		return nil, err
	}
	return nil, fmt.Errorf("amap: max retries exceeded for %s", name)
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
		return nil, fmt.Errorf("parse (%s): %w", truncate(body, 200), err)
	}
	if r.Status != "1" {
		return nil, fmt.Errorf("amap %s (infocode=%s): %s", r.Info, r.Infocode, truncate(body, 200))
	}
	return &r, nil
}

func pickFirstPhoto(name, city string) string {
	r, err := searchWithRetry(name, city)
	if err != nil {
		log.Printf("  search failed %s: %v", name, err)
		return ""
	}
	for _, poi := range r.Pois {
		for _, ph := range poi.Photos {
			u := strings.TrimSpace(ph.URL)
			if u != "" {
				return u
			}
		}
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

var sem = make(chan struct{}, 1) // concurrency=1: sequential to respect rate limit

func processOne(db *sql.DB, p poiRow, mu *sync.Mutex, results *[]resultEntry, wg *sync.WaitGroup) {
	defer wg.Done()
	sem <- struct{}{}
	defer func() { <-sem }()

	entry := resultEntry{POI: p}

	// polite delay between Amap API calls
	time.Sleep(1200 * time.Millisecond)

	// Check for known override first
	entry.AmapURL = knownOverrides[p.Name]
	if entry.AmapURL == "" {
		entry.AmapURL = pickFirstPhoto(p.Name, p.City)
	}
	if entry.AmapURL == "" {
		log.Printf("[skip] no photo: %s (%s)", p.Name, p.City)
		mu.Lock()
		*results = append(*results, entry)
		mu.Unlock()
		return
	}

	localPath := filepath.Join(picDir, p.ID)
	fp, err := downloadImage(entry.AmapURL, localPath)
	if err != nil {
		log.Printf("[warn] download failed %s: %v", p.Name, err)
		entry.Err = err.Error()
		mu.Lock()
		*results = append(*results, entry)
		mu.Unlock()
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

	mu.Lock()
	*results = append(*results, entry)
	mu.Unlock()
}

// ==================== utilities ====================

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

	pois, err := loadPOIsNeedingImage(db)
	if err != nil {
		log.Fatalf("load pois: %v", err)
	}
	if len(pois) == 0 {
		log.Println("All POIs already have cover images. Nothing to do.")
		return
	}
	log.Printf("POIs needing cover image: %d  (sequential, ~1.2s/req, est. %.1f min)",
		len(pois), float64(len(pois))*1.2/60)

	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		results []resultEntry
	)

	for _, p := range pois {
		wg.Add(1)
		go processOne(db, p, &mu, &results, &wg)
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
