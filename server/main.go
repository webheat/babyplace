package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
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

type OpenClawRequest struct {
	Message    string `json:"message"`
	AgentID    string `json:"agent_id,omitempty"`
	SessionKey string `json:"session_key,omitempty"`
	Model      string `json:"model,omitempty"`
	Timeout    int    `json:"timeout,omitempty"`
}

type OpenClawReply struct {
	Reply      string `json:"reply"`
	AgentID    string `json:"agent_id"`
	SessionKey string `json:"session_key,omitempty"`
	Model      string `json:"model,omitempty"`
	DurationMs int64  `json:"duration_ms"`
}

var (
	astrbotBaseURL string
	astrbotAPIKey  string
	astrbotTimeout time.Duration
	openclawBin    string
)

func main() {
	// load .env from parent directory
	_ = godotenv.Load("../.env")
	_ = godotenv.Load(".env")

	// 初始化 SQLite 数据库（POI、评价等）
	if err := initDB(); err != nil {
		log.Fatalf("[db] init failed: %v", err)
	}

	astrbotBaseURL = strings.TrimRight(os.Getenv("ASTBOT_BASE_URL"), "/")
	astrbotAPIKey = os.Getenv("ASTBOT_API_KEY")
	timeoutSec := 120

	if astrbotBaseURL == "" {
		log.Println("[warn] ASTBOT_BASE_URL not set, chat disabled")
	}
	if astrbotAPIKey == "" {
		log.Println("[warn] ASTBOT_API_KEY not set, chat disabled")
	}
	if v := os.Getenv("ASTBOT_TIMEOUT"); v != "" {
		fmt.Sscanf(v, "%d", &timeoutSec)
	}
	astrbotTimeout = time.Duration(timeoutSec) * time.Second

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// 模块初始化
	initXHS()
	initVideo()
	initWxLogin()
	initAmap()
	initRoute()
	initDify()
	initMptext()
	initLLM()

	// 启动定时文章抓取
	startArticleCrawler()

	// OpenClaw CLI path
	openclawBin = os.Getenv("OPENCLAW_BIN")
	if openclawBin == "" {
		openclawBin = "openclaw"
	}

	// babyplace-admin（兼容原 uniCloud HTTP 云函数 API）
	http.HandleFunc("/babyplace-admin", corsMiddleware(handleBabyplaceAdmin))

	http.HandleFunc("/api/chat", corsMiddleware(handleChat))
	http.HandleFunc("/api/openclaw/chat", corsMiddleware(handleOpenClawChat))
	http.HandleFunc("/api/client-log", corsMiddleware(handleClientLog))
	http.HandleFunc("/api/dify/chat", corsMiddleware(handleDifyChat))
	http.HandleFunc("/api/amap/search", corsMiddleware(handleAmapSearch))
	http.HandleFunc("/api/amap/nearby", corsMiddleware(handleAmapNearby))
	http.HandleFunc("/api/xhs/status", corsMiddleware(handleXHSStatus))
	http.HandleFunc("/api/xhs/auth", corsMiddleware(handleXHSAuth))
	http.HandleFunc("/api/xhs/callback", corsMiddleware(handleXHSCallback))
	http.HandleFunc("/api/xhs/publish", corsMiddleware(handleXHSPublish))
	http.HandleFunc("/api/video/upload", corsMiddleware(handleVideoUpload))
	http.HandleFunc("/api/video/enhance", corsMiddleware(handleVideoEnhance))
	http.HandleFunc("/api/video/render", corsMiddleware(handleVideoRender))
	http.HandleFunc("/api/video/render/", corsMiddleware(handleVideoRenderStatus))
	http.HandleFunc("/api/wx-login", corsMiddleware(handleWxLogin))
	http.HandleFunc("/health", handleHealth)

	log.Printf("Babyplace server starting on :%s", port)
	log.Printf("Admin endpoint: POST /babyplace-admin")
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

func handleOpenClawChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, ChatResponse{Status: "error", Message: "Method not allowed"})
		return
	}

	var req OpenClawRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "Invalid request body"})
		return
	}

	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "message is required"})
		return
	}

	// defaults
	if req.AgentID == "" {
		req.AgentID = "main"
	}
	if req.Model == "" {
		req.Model = "deepseek-v4-pro"
	}
	if req.Timeout <= 0 {
		req.Timeout = 300
	}

	// build command args
	args := []string{
		"agent",
		"--agent", req.AgentID,
		"--message", req.Message,
		"--json",
		"--timeout", fmt.Sprintf("%d", req.Timeout),
	}
	if req.SessionKey != "" {
		args = append(args, "--session-id", req.SessionKey)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(req.Timeout)*time.Second)
	defer cancel()

	start := time.Now()
	cmd := exec.CommandContext(ctx, openclawBin, args...)
	stdout, err := cmd.Output()
	durationMs := time.Since(start).Milliseconds()

	// openclaw may exit non-zero on gateway fallback but still produce valid JSON
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			log.Printf("OpenClaw exit code %d, stderr: %s", exitErr.ExitCode(), string(exitErr.Stderr))
		} else {
			log.Printf("OpenClaw exec failed: %v", err)
			writeJSON(w, http.StatusBadGateway, ChatResponse{Status: "error", Message: "OpenClaw CLI execution failed"})
			return
		}
	}

	if len(stdout) == 0 {
		log.Printf("OpenClaw produced no output")
		writeJSON(w, http.StatusBadGateway, ChatResponse{Status: "error", Message: "OpenClaw CLI produced no output"})
		return
	}

	// parse openclaw JSON output
	var ocOutput struct {
		Payloads []struct {
			Text string `json:"text"`
		} `json:"payloads"`
		Meta struct {
			AgentMeta struct {
				SessionId string `json:"sessionId"`
				Model     string `json:"model"`
			} `json:"agentMeta"`
			DurationMs int64 `json:"durationMs"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(stdout, &ocOutput); err != nil {
		log.Printf("OpenClaw response parse failed: %v, raw: %s", err, string(stdout))
		writeJSON(w, http.StatusBadGateway, ChatResponse{Status: "error", Message: "Invalid OpenClaw response"})
		return
	}

	reply := ""
	if len(ocOutput.Payloads) > 0 {
		reply = ocOutput.Payloads[0].Text
	}

	sessionKey := ocOutput.Meta.AgentMeta.SessionId
	if sessionKey == "" {
		sessionKey = req.SessionKey
	}
	model := ocOutput.Meta.AgentMeta.Model
	if model == "" {
		model = req.Model
	}
	dur := ocOutput.Meta.DurationMs
	if dur == 0 {
		dur = durationMs
	}

	writeJSON(w, http.StatusOK, ChatResponse{
		Status: "ok",
		Data: OpenClawReply{
			Reply:      reply,
			AgentID:    req.AgentID,
			SessionKey: sessionKey,
			Model:      model,
			DurationMs: dur,
		},
	})
}

func handleClientLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, ChatResponse{Status: "error", Message: "Method not allowed"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	defer r.Body.Close()

	var raw map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "Invalid request body"})
		return
	}

	event, _ := raw["event"].(string)
	source, _ := raw["source"].(string)
	if event == "" {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "event is required"})
		return
	}
	if source == "" {
		source = "client"
		raw["source"] = source
	}

	body, _ := json.Marshal(raw)
	message := string(body)
	if len(message) > 4096 {
		message = message[:4096] + "...(truncated)"
	}
	log.Printf("[client-log] %s", message)

	writeJSON(w, http.StatusOK, ChatResponse{Status: "ok"})
}

func writeJSON(w http.ResponseWriter, code int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(data)
}
