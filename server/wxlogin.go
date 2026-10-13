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

var (
	wxAppID     string
	wxAppSecret string
)

type WxLoginRequest struct {
	Code string `json:"code"`
}

type WxLoginResponse struct {
	Status  string      `json:"status"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

type WxCode2SessionResp struct {
	OpenID     string `json:"openid"`
	SessionKey string `json:"session_key"`
	UnionID    string `json:"unionid"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

func initWxLogin() {
	wxAppID = os.Getenv("WX_APP_ID")
	wxAppSecret = os.Getenv("WX_APP_SECRET")

	if wxAppID == "" || wxAppSecret == "" {
		log.Println("[wx-login] WX_APP_ID 或 WX_APP_SECRET 未配置，微信登录不可用")
		return
	}
	log.Printf("[wx-login] 已加载配置 (appid=%s)", wxAppID)
}

func handleWxLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, WxLoginResponse{Status: "error", Message: "Method not allowed"})
		return
	}

	if wxAppID == "" || wxAppSecret == "" {
		writeJSON(w, http.StatusInternalServerError, WxLoginResponse{Status: "error", Message: "微信登录未配置"})
		return
	}

	var req WxLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, WxLoginResponse{Status: "error", Message: "Invalid request body"})
		return
	}

	req.Code = strings.TrimSpace(req.Code)
	if req.Code == "" {
		writeJSON(w, http.StatusBadRequest, WxLoginResponse{Status: "error", Message: "code is required"})
		return
	}

	url := fmt.Sprintf(
		"https://api.weixin.qq.com/sns/jscode2session?appid=%s&secret=%s&js_code=%s&grant_type=authorization_code",
		wxAppID, wxAppSecret, req.Code,
	)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		log.Printf("[wx-login] code2session 请求失败: %v", err)
		writeJSON(w, http.StatusBadGateway, WxLoginResponse{Status: "error", Message: "微信服务不可用"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var wxResp WxCode2SessionResp
	if err := json.Unmarshal(body, &wxResp); err != nil {
		log.Printf("[wx-login] 解析响应失败: %v", err)
		writeJSON(w, http.StatusBadGateway, WxLoginResponse{Status: "error", Message: "微信响应解析失败"})
		return
	}

	if wxResp.ErrCode != 0 {
		log.Printf("[wx-login] code2session 错误: %d %s", wxResp.ErrCode, wxResp.ErrMsg)
		writeJSON(w, http.StatusBadGateway, WxLoginResponse{
			Status:  "error",
			Message: fmt.Sprintf("微信登录失败: %s", wxResp.ErrMsg),
		})
		return
	}

	log.Printf("[wx-login] 登录成功 openid=%s", wxResp.OpenID[:8]+"...")

	writeJSON(w, http.StatusOK, WxLoginResponse{
		Status: "ok",
		Data: map[string]string{
			"openid":      wxResp.OpenID,
			"session_key": wxResp.SessionKey,
		},
	})
}
