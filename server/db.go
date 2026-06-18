package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

var (
	db   *sql.DB
	dbMu sync.Mutex
)

// POI 数据结构（对应前端 poi-snapshot.json）
type POI struct {
	ID                 string   `json:"_id"`
	Name               string   `json:"name"`
	CanonicalName      string   `json:"canonical_name"`
	Alias              []string `json:"alias"`
	City               string   `json:"city"`
	District           string   `json:"district"`
	Address            string   `json:"address"`
	Location           Location `json:"location"`
	Category           string   `json:"category"`
	AgeRange           []string `json:"age_range"`
	Indoor             bool     `json:"indoor"`
	PriceType          string   `json:"price_type"`
	RecommendedDuration string  `json:"recommended_duration"`
	Transport          []string `json:"transport"`
	TransportHint      string   `json:"transport_hint"`
	ParkingTip         string   `json:"parking_tip"`
	Facilities         Facilities `json:"facilities"`
	Summary            string   `json:"summary"`
	RecommendReason    string   `json:"recommend_reason"`
	Notice             string   `json:"notice"`
	CoverImage         string   `json:"cover_image"`
	Gallery            []string `json:"gallery"`
	Tags               []string `json:"tags"`
	SourceCount        int      `json:"source_count"`
	ReviewCount        int      `json:"review_count"`
	AvgRating          float64  `json:"avg_rating"`
	Status             string   `json:"status"`
	CreatedAt          int64    `json:"created_at"`
	UpdatedAt          int64    `json:"updated_at"`
}

type Location struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type Facilities struct {
	StrollerFriendly bool `json:"stroller_friendly"`
	Restroom         bool `json:"restroom"`
	Food             bool `json:"food"`
	Shade            bool `json:"shade"`
	Parking          bool `json:"parking"`
	RainyDayOk       bool `json:"rainy_day_ok"`
}

type Review struct {
	ID        string   `json:"_id"`
	POIID     string   `json:"poi_id"`
	UserID    string   `json:"user_id"`
	Nickname  string   `json:"nickname"`
	Avatar    string   `json:"avatar"`
	Rating    int      `json:"rating"`
	Comment   string   `json:"comment"`
	VisitDate int64    `json:"visit_date"`
	Tags      []string `json:"tags"`
	Images    []string `json:"images"`
	Status    string   `json:"status"`
	CreatedAt int64    `json:"created_at"`
	UpdatedAt int64    `json:"updated_at"`
}

type Article struct {
	ID                string                 `json:"_id"`
	Title             string                 `json:"title"`
	SourceAccount     string                 `json:"source_account"`
	SourceAccountID   string                 `json:"source_account_id"`
	PublishTime       int64                  `json:"publish_time"`
	URL               string                 `json:"url"`
	CoverImage        string                 `json:"cover_image"`
	ContentText       string                 `json:"content_text"`
	ContentHTML       string                 `json:"content_html"`
	Images            []string               `json:"images"`
	ExtractedPOINames []string               `json:"extracted_poi_names"`
	ParseResult       map[string]interface{} `json:"parse_result"`
	Status            string                 `json:"status"`
	ParseConfidence   float64                `json:"parse_confidence"`
	CreatedAt         int64                  `json:"created_at"`
	UpdatedAt         int64                  `json:"updated_at"`
}

type ContentSource struct {
	ID              string   `json:"_id"`
	POIID           string   `json:"poi_id"`
	ArticleID       string   `json:"article_id"`
	SourceType      string   `json:"source_type"`
	QuotedText      string   `json:"quoted_text"`
	SupportFields   []string `json:"support_fields"`
	ConfidenceScore float64  `json:"confidence_score"`
	IsPrimary       bool     `json:"is_primary"`
	Status          string   `json:"status"`
	CreatedAt       int64    `json:"created_at"`
	UpdatedAt       int64    `json:"updated_at"`
}

func generateID() string {
	now := time.Now().UnixMilli()
	r := rand.Int63n(0xFFFFFF)
	return fmt.Sprintf("%08x%08x%08x", now/1000, now%1000*1000+r, rand.Int63n(0xFFFFFF))
}

func nowMillis() int64 {
	return time.Now().UnixMilli()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func intToBool(i int) bool {
	return i != 0
}

func jsonMarshal(v interface{}) string {
	if v == nil {
		return "[]"
	}
	b, _ := json.Marshal(v)
	return string(b)
}

func jsonUnmarshalArray(s string) []string {
	var arr []string
	if s == "" {
		return arr
	}
	json.Unmarshal([]byte(s), &arr)
	return arr
}

func jsonUnmarshalMap(s string) map[string]interface{} {
	var m map[string]interface{}
	if s == "" {
		return m
	}
	json.Unmarshal([]byte(s), &m)
	return m
}

func initDB() error {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		exePath, _ := os.Getwd()
		dbPath = filepath.Join(exePath, "data", "babyplace.db")
	}

	// 确保 data 目录存在
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return fmt.Errorf("create data dir: %w", err)
	}

	var err error
	db, err = sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}

	if err := createTables(); err != nil {
		return fmt.Errorf("create tables: %w", err)
	}

	if err := seedData(); err != nil {
		log.Printf("[db] seed warning: %v", err)
	}

	log.Printf("[db] SQLite initialized at %s", dbPath)
	return nil
}

func createTables() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS poi (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			canonical_name TEXT,
			alias TEXT DEFAULT '[]',
			city TEXT,
			district TEXT,
			address TEXT,
			lat REAL DEFAULT 0,
			lng REAL DEFAULT 0,
			category TEXT DEFAULT 'mixed',
			age_range TEXT DEFAULT '[]',
			indoor INTEGER DEFAULT 0,
			price_type TEXT DEFAULT 'free',
			recommended_duration TEXT DEFAULT '2h',
			transport TEXT DEFAULT '[]',
			transport_hint TEXT,
			parking_tip TEXT,
			stroller_friendly INTEGER DEFAULT 0,
			restroom INTEGER DEFAULT 0,
			food INTEGER DEFAULT 0,
			shade INTEGER DEFAULT 0,
			parking INTEGER DEFAULT 0,
			rainy_day_ok INTEGER DEFAULT 0,
			summary TEXT,
			recommend_reason TEXT,
			notice TEXT,
			cover_image TEXT,
			gallery TEXT DEFAULT '[]',
			tags TEXT DEFAULT '[]',
			source_count INTEGER DEFAULT 0,
			review_count INTEGER DEFAULT 0,
			avg_rating REAL DEFAULT 0,
			status TEXT DEFAULT 'published',
			created_at INTEGER,
			updated_at INTEGER
		)`,
		`CREATE TABLE IF NOT EXISTS review (
			id TEXT PRIMARY KEY,
			poi_id TEXT NOT NULL,
			user_id TEXT,
			nickname TEXT,
			avatar TEXT,
			rating INTEGER DEFAULT 5,
			comment TEXT,
			visit_date INTEGER,
			tags TEXT DEFAULT '[]',
			images TEXT DEFAULT '[]',
			status TEXT DEFAULT 'approved',
			created_at INTEGER,
			updated_at INTEGER
		)`,
		`CREATE TABLE IF NOT EXISTS article (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			source_account TEXT,
			source_account_id TEXT,
			publish_time INTEGER,
			url TEXT,
			cover_image TEXT,
			content_text TEXT,
			content_html TEXT,
			images TEXT DEFAULT '[]',
			extracted_poi_names TEXT DEFAULT '[]',
			parse_result TEXT DEFAULT '{}',
			status TEXT DEFAULT 'parsed',
			parse_confidence REAL DEFAULT 0,
			created_at INTEGER,
			updated_at INTEGER
		)`,
		`CREATE TABLE IF NOT EXISTS content_source (
			id TEXT PRIMARY KEY,
			poi_id TEXT,
			article_id TEXT,
			source_type TEXT DEFAULT 'article',
			quoted_text TEXT,
			support_fields TEXT DEFAULT '[]',
			confidence_score REAL DEFAULT 0,
			is_primary INTEGER DEFAULT 0,
			status TEXT DEFAULT 'active',
			created_at INTEGER,
			updated_at INTEGER
		)`,
		`CREATE INDEX IF NOT EXISTS idx_review_poi ON review(poi_id)`,
		`CREATE INDEX IF NOT EXISTS idx_poi_status ON poi(status)`,
		`CREATE INDEX IF NOT EXISTS idx_poi_city ON poi(city)`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			return fmt.Errorf("exec %q: %w", q[:40], err)
		}
	}
	return nil
}

func seedData() error {
	// 检查是否已有数据
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM poi").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		log.Printf("[db] POI table already has %d records, skip seed", count)
		return nil
	}

	// 读取 snapshot 文件
	snapshotPaths := []string{
		"../src/data/poi-snapshot.json",
		"src/data/poi-snapshot.json",
		"poi-snapshot.json",
	}

	var data []byte
	var err error
	for _, p := range snapshotPaths {
		data, err = os.ReadFile(p)
		if err == nil {
			log.Printf("[db] loading seed from %s", p)
			break
		}
	}
	if data == nil {
		return fmt.Errorf("poi-snapshot.json not found in any expected path")
	}

	var pois []POI
	if err := json.Unmarshal(data, &pois); err != nil {
		return fmt.Errorf("parse snapshot: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO poi (
		id, name, canonical_name, alias, city, district, address,
		lat, lng, category, age_range, indoor, price_type, recommended_duration,
		transport, transport_hint, parking_tip,
		stroller_friendly, restroom, food, shade, parking, rainy_day_ok,
		summary, recommend_reason, notice, cover_image, gallery, tags,
		source_count, review_count, avg_rating, status, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, p := range pois {
		f := p.Facilities
		_, err := stmt.Exec(
			p.ID, p.Name, p.CanonicalName, jsonMarshal(p.Alias),
			p.City, p.District, p.Address,
			p.Location.Lat, p.Location.Lng,
			p.Category, jsonMarshal(p.AgeRange), boolToInt(p.Indoor), p.PriceType, p.RecommendedDuration,
			jsonMarshal(p.Transport), p.TransportHint, p.ParkingTip,
			boolToInt(f.StrollerFriendly), boolToInt(f.Restroom), boolToInt(f.Food),
			boolToInt(f.Shade), boolToInt(f.Parking), boolToInt(f.RainyDayOk),
			p.Summary, p.RecommendReason, p.Notice, p.CoverImage,
			jsonMarshal(p.Gallery), jsonMarshal(p.Tags),
			p.SourceCount, p.ReviewCount, p.AvgRating, p.Status,
			p.CreatedAt, p.UpdatedAt,
		)
		if err != nil {
			log.Printf("[db] seed skip %s: %v", p.Name, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	log.Printf("[db] seeded %d POIs", len(pois))
	return nil
}

func poiFromRow(row interface {
	Scan(dest ...interface{}) error
}) (*POI, error) {
	var p POI
	var alias, ageRange, transport, gallery, tags string
	var indoor, strollerFriendly, restroom, food, shade, parking, rainyDayOk int

	err := row.Scan(
		&p.ID, &p.Name, &p.CanonicalName, &alias,
		&p.City, &p.District, &p.Address,
		&p.Location.Lat, &p.Location.Lng,
		&p.Category, &ageRange, &indoor, &p.PriceType, &p.RecommendedDuration,
		&transport, &p.TransportHint, &p.ParkingTip,
		&strollerFriendly, &restroom, &food, &shade, &parking, &rainyDayOk,
		&p.Summary, &p.RecommendReason, &p.Notice, &p.CoverImage,
		&gallery, &tags,
		&p.SourceCount, &p.ReviewCount, &p.AvgRating, &p.Status,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	p.Alias = jsonUnmarshalArray(alias)
	p.AgeRange = jsonUnmarshalArray(ageRange)
	p.Transport = jsonUnmarshalArray(transport)
	p.Gallery = jsonUnmarshalArray(gallery)
	p.Tags = jsonUnmarshalArray(tags)
	p.Indoor = intToBool(indoor)
	p.Facilities = Facilities{
		StrollerFriendly: intToBool(strollerFriendly),
		Restroom:         intToBool(restroom),
		Food:             intToBool(food),
		Shade:            intToBool(shade),
		Parking:          intToBool(parking),
		RainyDayOk:       intToBool(rainyDayOk),
	}

	return &p, nil
}

func reviewFromRow(row interface {
	Scan(dest ...interface{}) error
}) (*Review, error) {
	var r Review
	var tags, images string

	err := row.Scan(
		&r.ID, &r.POIID, &r.UserID, &r.Nickname, &r.Avatar,
		&r.Rating, &r.Comment, &r.VisitDate,
		&tags, &images, &r.Status,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	r.Tags = jsonUnmarshalArray(tags)
	r.Images = jsonUnmarshalArray(images)
	return &r, nil
}

func articleFromRow(row interface {
	Scan(dest ...interface{}) error
}) (*Article, error) {
	var a Article
	var images, extractedPOINames, parseResult string

	err := row.Scan(
		&a.ID, &a.Title, &a.SourceAccount, &a.SourceAccountID,
		&a.PublishTime, &a.URL, &a.CoverImage,
		&a.ContentText, &a.ContentHTML,
		&images, &extractedPOINames, &parseResult,
		&a.Status, &a.ParseConfidence,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	a.Images = jsonUnmarshalArray(images)
	a.ExtractedPOINames = jsonUnmarshalArray(extractedPOINames)
	a.ParseResult = jsonUnmarshalMap(parseResult)
	return &a, nil
}

func sourceFromRow(row interface {
	Scan(dest ...interface{}) error
}) (*ContentSource, error) {
	var s ContentSource
	var supportFields string
	var isPrimary int

	err := row.Scan(
		&s.ID, &s.POIID, &s.ArticleID, &s.SourceType,
		&s.QuotedText, &supportFields, &s.ConfidenceScore,
		&isPrimary, &s.Status,
		&s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	s.SupportFields = jsonUnmarshalArray(supportFields)
	s.IsPrimary = intToBool(isPrimary)
	return &s, nil
}
