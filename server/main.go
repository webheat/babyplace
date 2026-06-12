package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type ChatRequest struct {
	Message   string `json:"message"`
	SessionID string `json:"session_id,omitempty"`
}

type ChatResponse struct {
	Status  string      `json:"status"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

type AstrBotRequest struct {
	Username  string `json:"username"`
	Message   string `json:"message"`
	SessionID string `json:"session_id"`
}

type AstrBotResponse struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
	Data    struct {
		SessionID string `json:"session_id"`
		MessageID string `json:"message_id"`
		Reply     string `json:"reply"`
	} `json:"data"`
}

var (
	astrbotBaseURL string
	astrbotAPIKey  string
	astrbotTimeout time.Duration
)

func main() {
	// load .env from parent directory
	_ = godotenv.Load("../.env")
	_ = godotenv.Load(".env")

	astrbotBaseURL = strings.TrimRight(os.Getenv("ASTBOT_BASE_URL"), "/")
	astrbotAPIKey = os.Getenv("ASTBOT_API_KEY")
	timeoutSec := 120

	if astrbotBaseURL == "" {
		log.Fatal("ASTBOT_BASE_URL is required")
	}
	if astrbotAPIKey == "" {
		log.Fatal("ASTBOT_API_KEY is required")
	}
	if v := os.Getenv("ASTBOT_TIMEOUT"); v != "" {
		fmt.Sscanf(v, "%d", &timeoutSec)
	}
	astrbotTimeout = time.Duration(timeoutSec) * time.Second

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// 小红书模块初始化
	initXHS()

	http.HandleFunc("/api/chat", corsMiddleware(handleChat))
	http.HandleFunc("/api/xhs/status", corsMiddleware(handleXHSStatus))
	http.HandleFunc("/api/xhs/auth", corsMiddleware(handleXHSAuth))
	http.HandleFunc("/api/xhs/callback", corsMiddleware(handleXHSCallback))
	http.HandleFunc("/api/xhs/publish", corsMiddleware(handleXHSPublish))
	http.HandleFunc("/health", handleHealth)

	log.Printf("Babyplace chat server starting on :%s", port)
	log.Printf("AstrBot endpoint: %s", astrbotBaseURL)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, ChatResponse{Status: "ok"})
}

func handleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, ChatResponse{Status: "error", Message: "Method not allowed"})
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "Invalid request body"})
		return
	}

	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "message is required"})
		return
	}

	if req.SessionID == "" {
		req.SessionID = fmt.Sprintf("mp_%d", time.Now().UnixMilli())
	}

	// call AstrBot sync API
	astrbotReq := AstrBotRequest{
		Username:  "miniprogram_" + req.SessionID,
		Message:   req.Message,
		SessionID: req.SessionID,
	}

	body, _ := json.Marshal(astrbotReq)
	url := astrbotBaseURL + "/api/v1/chat/sync"

	httpReq, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+astrbotAPIKey)

	client := &http.Client{Timeout: astrbotTimeout}
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("AstrBot request failed: %v", err)
		writeJSON(w, http.StatusBadGateway, ChatResponse{Status: "error", Message: "AI service unavailable"})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	var astrbotResp AstrBotResponse
	if err := json.Unmarshal(respBody, &astrbotResp); err != nil {
		log.Printf("AstrBot response parse failed: %v", err)
		writeJSON(w, http.StatusBadGateway, ChatResponse{Status: "error", Message: "Invalid AI response"})
		return
	}

	if astrbotResp.Status != "ok" {
		writeJSON(w, http.StatusBadGateway, ChatResponse{Status: "error", Message: astrbotResp.Message})
		return
	}

	writeJSON(w, http.StatusOK, ChatResponse{
		Status: "ok",
		Data: map[string]string{
			"session_id": astrbotResp.Data.SessionID,
			"reply":      astrbotResp.Data.Reply,
		},
	})
}

func writeJSON(w http.ResponseWriter, code int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(data)
}
