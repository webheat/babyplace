package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

var amapKey string

type AmapPoiRequest struct {
	Keywords string `json:"keywords"`
	City     string `json:"city,omitempty"`
	Types    string `json:"types,omitempty"`
	Page     int    `json:"page,omitempty"`
	PageSize int    `json:"page_size,omitempty"`
}

type AmapPoiResult struct {
	Status string                   `json:"status"`
	Count  string                   `json:"count"`
	Pois   []map[string]interface{} `json:"pois"`
}

func initAmap() {
	amapKey = os.Getenv("AMAP_KEY")
	if amapKey == "" {
		amapKey = "abcef158da87a62e42e1fb968ed33dd4"
	}
	log.Printf("Amap key: %s...", amapKey[:8])
}

func doAmapRequest(url string) (ChatResponse, int) {
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Get(url)
	if err != nil {
		log.Printf("Amap request failed: %v", err)
		return ChatResponse{Status: "error", Message: "Amap service unavailable"}, http.StatusBadGateway
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result AmapPoiResult
	if err := json.Unmarshal(body, &result); err != nil {
		log.Printf("Amap parse failed: %v", err)
		return ChatResponse{Status: "error", Message: "Invalid Amap response"}, http.StatusBadGateway
	}

	if result.Status != "1" {
		return ChatResponse{Status: "error", Message: "Amap search failed"}, http.StatusBadGateway
	}

	return ChatResponse{
		Status: "ok",
		Data: map[string]interface{}{
			"total": result.Count,
			"pois":  result.Pois,
		},
	}, http.StatusOK
}

func handleAmapSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, ChatResponse{Status: "error", Message: "Method not allowed"})
		return
	}

	var req AmapPoiRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "Invalid request body"})
		return
	}

	req.Keywords = strings.TrimSpace(req.Keywords)
	if req.Keywords == "" {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "keywords is required"})
		return
	}

	if req.PageSize <= 0 {
		req.PageSize = 10
	}
	if req.Page <= 0 {
		req.Page = 1
	}

	params := fmt.Sprintf("key=%s&keywords=%s&offset=%d&page=%d",
		amapKey, req.Keywords, req.PageSize, req.Page)
	if req.City != "" {
		params += "&city=" + req.City + "&citylimit=true"
	}
	if req.Types != "" {
		params += "&types=" + req.Types
	}

	url := "https://restapi.amap.com/v3/place/text?" + params
	resp, code := doAmapRequest(url)
	writeJSON(w, code, resp)
}

func handleAmapNearby(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, ChatResponse{Status: "error", Message: "Method not allowed"})
		return
	}

	var req struct {
		Location string `json:"location"`
		Keywords string `json:"keywords,omitempty"`
		Types    string `json:"types,omitempty"`
		Radius   int    `json:"radius,omitempty"`
		PageSize int    `json:"page_size,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "Invalid request body"})
		return
	}

	if req.Location == "" {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "location is required (lng,lat)"})
		return
	}
	if req.Radius <= 0 {
		req.Radius = 3000
	}
	if req.PageSize <= 0 {
		req.PageSize = 10
	}

	params := fmt.Sprintf("key=%s&location=%s&radius=%d&offset=%d",
		amapKey, req.Location, req.Radius, req.PageSize)
	if req.Keywords != "" {
		params += "&keywords=" + req.Keywords
	}
	if req.Types != "" {
		params += "&types=" + req.Types
	}

	url := "https://restapi.amap.com/v3/place/around?" + params
	resp, code := doAmapRequest(url)
	writeJSON(w, code, resp)
}
