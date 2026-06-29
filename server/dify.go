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
)

var (
	difyAPIURL string
	difyAPIKey string
)

type DifyRequest struct {
	Message        string `json:"message"`
	ConversationID string `json:"conversation_id,omitempty"`
	User           string `json:"user,omitempty"`
}

type DifyChatRequest struct {
	Inputs         map[string]interface{} `json:"inputs"`
	Query          string                 `json:"query"`
	ResponseMode   string                 `json:"response_mode"`
	ConversationID string                 `json:"conversation_id,omitempty"`
	User           string                 `json:"user"`
}

type DifyChatResponse struct {
	Answer         string `json:"answer"`
	ConversationID string `json:"conversation_id"`
	MessageID      string `json:"message_id"`
}

type DifyReply struct {
	Reply          string `json:"reply"`
	ConversationID string `json:"conversation_id,omitempty"`
}

func initDify() {
	difyAPIURL = os.Getenv("DIFY_API_URL")
	difyAPIKey = os.Getenv("DIFY_API_KEY")

	if difyAPIURL == "" {
		difyAPIURL = "http://lanes.ymxt.top:3000"
	}
	if difyAPIKey == "" {
		difyAPIKey = "app-aMB5cKJpDqNxR3tV7yW8eU2hL4fG9bZ1"
	}

	difyAPIURL = strings.TrimRight(difyAPIURL, "/")
	log.Printf("Dify endpoint: %s", difyAPIURL)
}

func handleDifyChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, ChatResponse{Status: "error", Message: "Method not allowed"})
		return
	}

	var req DifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "Invalid request body"})
		return
	}

	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		writeJSON(w, http.StatusBadRequest, ChatResponse{Status: "error", Message: "message is required"})
		return
	}

	if req.User == "" {
		req.User = "miniprogram_user"
	}

	difyReq := DifyChatRequest{
		Inputs:         map[string]interface{}{},
		Query:          req.Message,
		ResponseMode:   "blocking",
		ConversationID: req.ConversationID,
		User:           req.User,
	}

	body, _ := json.Marshal(difyReq)
	url := difyAPIURL + "/v1/chat-messages"

	httpReq, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+difyAPIKey)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("Dify request failed: %v", err)
		writeJSON(w, http.StatusBadGateway, ChatResponse{Status: "error", Message: "Dify service unavailable"})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		log.Printf("Dify returned %d: %s", resp.StatusCode, string(respBody))
		writeJSON(w, http.StatusBadGateway, ChatResponse{
			Status:  "error",
			Message: fmt.Sprintf("Dify error (HTTP %d)", resp.StatusCode),
		})
		return
	}

	var difyResp DifyChatResponse
	if err := json.Unmarshal(respBody, &difyResp); err != nil {
		log.Printf("Dify response parse failed: %v", err)
		writeJSON(w, http.StatusBadGateway, ChatResponse{Status: "error", Message: "Invalid Dify response"})
		return
	}

	writeJSON(w, http.StatusOK, ChatResponse{
		Status: "ok",
		Data: DifyReply{
			Reply:          difyResp.Answer,
			ConversationID: difyResp.ConversationID,
		},
	})
}
