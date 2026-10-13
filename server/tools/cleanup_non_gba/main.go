package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// This script archives (soft-deletes) POIs that are NOT in the Greater Bay Area.
// It verifies each POI's city via AMap, then marks non-GBA POIs as status='archived'.
//
// Run: go run server/tools/cleanup_non_gba/main.go
// Or:  go run server/tools/cleanup_non_gba/main.go --dry-run
// Or:  go run server/tools/cleanup_non_gba/main.go --delete   (hard delete)

var (
	amapKey    = os.Getenv("AMAP_KEY")
	dbPath     = os.Getenv("DB_PATH")
	httpClient = &http.Client{Timeout: 15 * time.Second}

	// Greater Bay Area cities
	gbaCities = map[string]bool{
		"广州市": true, "深圳市": true, "佛山市": true, "东莞市": true,
		"惠州市": true, "珠海市": true, "中山市": true, "江门市": true, "肇庆市": true,
	}
)

type poiRow struct {
	ID, Name, City, Address string
	Lat, Lng                float64
	Status                  string
}

func openDB() (*sql.DB, error) {
	if dbPath == "" {
		dbPath = "data/babyplace.db"
	}
	return sql.Open("sqlite", dbPath)
}

func loadNonGBAPOIs(db *sql.DB) ([]poiRow, error) {
	// Load POIs where city is NOT in GBA and status is published
	placeholders := make([]string, 0, len(gbaCities))
	args := make([]interface{}, 0, len(gbaCities))
	for city := range gbaCities {
		placeholders = append(placeholders, "?")
		args = append(args, city)
	}
	query := fmt.Sprintf(
		"SELECT id, name, city, address, lat, lng, status FROM poi "+
			"WHERE status = 'published' AND (city IS NULL OR city = '' OR city NOT IN (%s))",
		strings.Join(placeholders, ","),
	)
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pois []poiRow
	for rows.Next() {
		var p poiRow
		if err := rows.Scan(&p.ID, &p.Name, &p.City, &p.Address, &p.Lat, &p.Lng, &p.Status); err != nil {
			return nil, err
		}
		pois = append(pois, p)
	}
	return pois, rows.Err()
}

func verifyCityViaAmap(name string) string {
	if amapKey == "" {
		return ""
	}
	url := fmt.Sprintf(
		"https://restapi.amap.com/v3/place/text?key=%s&keywords=%s&offset=1&page=1",
		amapKey, urlEncode(name))
	resp, err := httpClient.Get(url)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Status string `json:"status"`
		Pois   []struct {
			Cityname string `json:"cityname"`
		} `json:"pois"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return ""
	}
	if result.Status != "1" || len(result.Pois) == 0 {
		return ""
	}
	return result.Pois[0].Cityname
}

func processOne(db *sql.DB, p poiRow, dryRun, hardDelete bool, mu *sync.Mutex, results *[]resultEntry, wg *sync.WaitGroup) {
	defer wg.Done()
	entry := resultEntry{POI: p}

	// Verify city via AMap if we have a name (parallel-safe, read-only)
	amapCity := ""
	if p.Name != "" {
		amapCity = verifyCityViaAmap(p.Name)
	}

	cityToCheck := p.City
	if cityToCheck == "" {
		cityToCheck = amapCity
	}

	isGBA := gbaCities[cityToCheck]

	if isGBA {
		entry.Action = "keep"
		entry.Reason = fmt.Sprintf("GBA city: %s", cityToCheck)
	} else {
		// Serialize DB writes to avoid SQLITE_BUSY
		mu.Lock()
		if hardDelete {
			if !dryRun {
				_, err := db.Exec("DELETE FROM poi WHERE id = ?", p.ID)
				if err != nil {
					entry.Err = err.Error()
					entry.Action = "error"
				} else {
					entry.Action = "deleted"
					entry.Reason = fmt.Sprintf("non-GBA city: %s (amap: %s)", p.City, amapCity)
				}
			} else {
				entry.Action = "would-delete"
				entry.Reason = fmt.Sprintf("non-GBA city: %s (amap: %s)", p.City, amapCity)
			}
		} else {
			if !dryRun {
				_, err := db.Exec("UPDATE poi SET status = 'archived', updated_at = ? WHERE id = ?", time.Now().Unix(), p.ID)
				if err != nil {
					entry.Err = err.Error()
					entry.Action = "error"
				} else {
					entry.Action = "archived"
					entry.Reason = fmt.Sprintf("non-GBA city: %s (amap: %s)", p.City, amapCity)
				}
			} else {
				entry.Action = "would-archive"
				entry.Reason = fmt.Sprintf("non-GBA city: %s (amap: %s)", p.City, amapCity)
			}
		}
		mu.Unlock()
	}

	mu.Lock()
	*results = append(*results, entry)
	mu.Unlock()
}

type resultEntry struct {
	POI    poiRow
	Action string // keep | archived | would-archive | deleted | would-delete | error
	Reason string
	Err    string
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

	dryRun := false
	hardDelete := false
	for _, arg := range os.Args[1:] {
		switch arg {
		case "--dry-run":
			dryRun = true
		case "--delete":
			hardDelete = true
		}
	}

	if dryRun {
		log.Println("=== DRY-RUN mode ===")
	}
	if hardDelete {
		log.Println("=== HARD DELETE mode ===")
	} else {
		log.Println("=== ARCHIVE mode (status='archived') ===")
	}

	if err := os.MkdirAll("/opt/babyplace/pic", 0755); err != nil {
		log.Fatalf("cannot create pic dir: %v", err)
	}

	db, err := openDB()
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	pois, err := loadNonGBAPOIs(db)
	if err != nil {
		log.Fatalf("load pois: %v", err)
	}
	if len(pois) == 0 {
		log.Println("No non-GBA POIs found. Nothing to do.")
		return
	}
	log.Printf("Non-GBA POIs to process: %d", len(pois))

	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		results []resultEntry
		sem     = make(chan struct{}, 8) // 8 parallel workers
	)

	for _, p := range pois {
		wg.Add(1)
		sem <- struct{}{}
		go func(p poiRow) {
			defer func() { <-sem }()
			processOne(db, p, dryRun, hardDelete, &mu, &results, &wg)
		}(p)
	}
	wg.Wait()

	// Summary
	kept, archived, deleted, wouldArchive, wouldDelete, errors := 0, 0, 0, 0, 0, 0
	for _, r := range results {
		switch r.Action {
		case "keep":
			kept++
		case "archived":
			archived++
		case "deleted":
			deleted++
		case "would-archive":
			wouldArchive++
		case "would-delete":
			wouldDelete++
		case "error":
			errors++
		}
	}

	log.Printf("=== DONE ===")
	log.Printf("  kept: %d  |  archived: %d  |  deleted: %d  |  errors: %d", kept, archived, deleted, errors)
	if dryRun {
		log.Printf("  (would-archive: %d  |  would-delete: %d)", wouldArchive, wouldDelete)
	}

	for _, r := range results {
		if r.Action == "archived" || r.Action == "deleted" || r.Action == "would-archive" || r.Action == "would-delete" {
			log.Printf("  [%s] %s (%s) — %s", r.Action, r.POI.Name, r.POI.City, r.Reason)
		}
		if r.Err != "" {
			log.Printf("  [ERROR] %s (%s) — %s", r.POI.Name, r.POI.City, r.Err)
		}
	}
}
